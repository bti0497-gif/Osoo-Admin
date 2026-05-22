/**
 * Water Quality Data Handler (Main Process)
 * 
 * 웹앱에서 수신된 데이터를 BigQuery와 Google Drive에 업로드하고,
 * 별도의 실시간 프로그레스 창(Transfer Progress Window)을 표출하여 사용자 경험을 향상시킵니다.
 */

const { ipcMain, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

// 구글 서비스 래퍼 로드
const googleServices = require('./google-services.cjs');

// 환경 변수 파일 로드 (electron 폴더 기준 상위 디렉토리)
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

let progressWindow = null;

/**
 * IPC 핸들러 등록
 */
function registerWaterQualityHandlers() {
  console.log('[WaterQuality] ========== IPC 핸들러 등록 ==========');
  
  // 1. 프로그레스 창 닫기 핸들러
  ipcMain.on('close-progress-window', () => {
    if (progressWindow && !progressWindow.isDestroyed()) {
      console.log('[WaterQuality] 프로그레스 창 닫기 요청 수신');
      progressWindow.destroy();
      progressWindow = null;
    }
  });

  // 2. 수질성적서 웹앱 데이터 수신 핸들러
  ipcMain.on('water-quality-message', async (event, message) => {
    console.log('[WaterQuality] ========== 메시지 수신 ==========');
    console.log('[WaterQuality] 메시지 타입:', message?.type);
    console.log('[WaterQuality] Payload 존재:', !!message?.payload);
    
    if (!message || !message.payload) {
      console.error('[WaterQuality] ❌ 메시지 또는 payload가 없습니다!');
      return;
    }

    const { type, payload } = message;
    
    if (type !== 'WATER_QUALITY_BATCH_COMPLETE' && type !== 'WATER_QUALITY_SINGLE_COMPLETE') {
      console.warn('[WaterQuality] 처리되지 않은 메시지 타입:', type);
      return;
    }

    console.log('[WaterQuality] ✅ 처리 시작:', type);

    // 데이터 추출 (BATCH vs SINGLE)
    const validRecords = payload.validRecords || (payload.record ? [payload.record] : []);
    const images = payload.images || (payload.image ? [payload.image] : []);
    const sourcePdfName = payload.source_pdf_name || message.payload.source_pdf_name || null;

    console.log(`[WaterQuality] 분석 결과 수신 - 데이터: ${validRecords.length}건, 이미지: ${images.length}개`);
    
    const totalSteps = validRecords.length + images.length;
    let completedSteps = 0;

    // 부모 윈도우 찾기
    const parentWindow = BrowserWindow.getAllWindows().find(w => {
      return !w.isDestroyed() && w.isVisible() && w !== progressWindow;
    });

    // 전송 현황 프로그레스 창 생성
    if (progressWindow && !progressWindow.isDestroyed()) {
      progressWindow.destroy();
    }

    progressWindow = new BrowserWindow({
      width: 580,
      height: 520,
      parent: parentWindow || undefined,
      modal: true,
      show: false,
      resizable: false,
      frame: false, // 슬릭한 무테 창 디자인
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, 'preload.cjs'),
      },
    });

    // progress.html 로드
    progressWindow.loadFile(path.join(__dirname, 'progress.html'));

    // 창이 준비되면 오픈
    progressWindow.once('ready-to-show', () => {
      progressWindow.show();
      
      // 조금 대기 후 초기 상태 전송 (HTML 바인딩 시간 보장)
      setTimeout(async () => {
        if (progressWindow && !progressWindow.isDestroyed()) {
          progressWindow.webContents.send('transfer-status', {
            stage: 'starting',
            current: 0,
            total: totalSteps,
            validRecordsCount: validRecords.length,
            imagesCount: images.length,
            log: '클라우드 전송 파이프라인을 구축하는 중...'
          });
        }

        const results = {
          bigquery: null,
          drive: null,
        };

        // 1단계: BigQuery 벌크 INSERT
        if (validRecords.length > 0) {
          try {
            console.log('[WaterQuality] BigQuery 전송 시작...');
            if (progressWindow && !progressWindow.isDestroyed()) {
              progressWindow.webContents.send('transfer-status', {
                stage: 'bigquery',
                current: completedSteps,
                total: totalSteps,
                log: `BigQuery에 분석 데이터 ${validRecords.length}건을 Bulk Insert 처리 중...`
              });
            }

            results.bigquery = await googleServices.insertToBigQuery(validRecords, sourcePdfName);
            completedSteps += validRecords.length;

            if (progressWindow && !progressWindow.isDestroyed()) {
              progressWindow.webContents.send('transfer-status', {
                stage: 'bigquery_complete',
                current: completedSteps,
                total: totalSteps,
                log: `BigQuery 전송 완료! (성공: ${results.bigquery.inserted}건, 실패: ${results.bigquery.failed}건)`
              });
            }

            // BigQuery DML 싱크 딜레이 대기 (4초)
            if (results.bigquery.inserted > 0) {
              console.log('[WaterQuality] BigQuery DML 데이터 동기화를 위해 대기합니다 (4s)...');
              await new Promise(r => setTimeout(r, 4000));
            }
          } catch (bqErr) {
            console.error('[WaterQuality] BigQuery 전송 에러:', bqErr.message);
            results.bigquery = { success: false, error: bqErr.message, inserted: 0, failed: validRecords.length };
            completedSteps += validRecords.length;
          }
        }

        // 2단계: Google Drive 이미지 개별 업로드
        if (images.length > 0) {
          try {
            console.log('[WaterQuality] Google Drive 업로드 시작...');
            if (progressWindow && !progressWindow.isDestroyed()) {
              progressWindow.webContents.send('transfer-status', {
                stage: 'drive',
                current: completedSteps,
                total: totalSteps,
                log: `구글 드라이브 지정 폴더에 이미지 ${images.length}장 업로드 시작...`
              });
            }

            const baseCompleted = completedSteps;
            results.drive = await googleServices.uploadImagesToDrive(images, (index, total, res) => {
              const currentStep = baseCompleted + index;
              if (progressWindow && !progressWindow.isDestroyed()) {
                progressWindow.webContents.send('transfer-status', {
                  stage: 'drive_progress',
                  current: currentStep,
                  total: totalSteps,
                  log: `이미지 업로드 중 [${index}/${total}]: ${res.filename} (${res.success ? '성공' : '실패'})`
                });
              }
            });

            completedSteps += images.length;
          } catch (driveErr) {
            console.error('[WaterQuality] Google Drive 업로드 에러:', driveErr.message);
            results.drive = { success: false, error: driveErr.message, uploaded: 0, failed: images.length };
            completedSteps += images.length;
          }
        }

        // 3단계: 완료 응답 및 최종 상태 렌더링
        console.log('[WaterQuality] ========== 전송 프로세스 완료 ==========');
        if (progressWindow && !progressWindow.isDestroyed()) {
          progressWindow.webContents.send('transfer-status', {
            stage: 'completed',
            current: totalSteps,
            total: totalSteps,
            log: '모든 데이터 및 성적서 사본 전송이 완료되었습니다!',
            results
          });
        }

        // 웹앱 렌더러로도 완료 이벤트 송출
        event.sender.send('upload-complete', results);
        event.sender.send('water-quality-response', { 
          status: 'success', 
          results,
          message: '일렉트론 환경에서 모든 전송이 완료되었습니다!' 
        });

      }, 1000);
    });
  });

  console.log('[WaterQuality] ✅ IPC handlers 등록 완료');
}

module.exports = { registerWaterQualityHandlers };
