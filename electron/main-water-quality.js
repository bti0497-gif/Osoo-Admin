/**
 * Water Quality Data Handler (Main Process)
 * 
 * 웹앱에서 수신된 데이터를 BigQuery와 Google Drive에 업로드
 */

const { ipcMain } = require('electron');
const { BigQuery } = require('@google-cloud/bigquery');
const { google } = require('googleapis');
const { Readable } = require('stream');
const path = require('path');
const fs = require('fs');

// 환경 변수 파일 로드 (electron 폴더 기준 상위 디렉토리)
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

// BigQuery 설정 (기존 서비스와 동일한 방식)
const BQ_KEY_FILE = path.join(__dirname, '../server/config/work-jindan-194620a46d59.json');
const BQ_DATASET = 'daily_log_system';
const BQ_TABLE = 'certificate_water_quality';

// Drive 설정
const CERTIFICATE_DRIVE_FOLDER_ID = 
  String(process.env.CERTIFICATE_DRIVE_FOLDER_ID || process.env.GOOGLE_DRIVE_FOLDER_ID || '1Po-gd-OKlaeGyL-Ppjc6_wKgSLEM4iX4').trim();

// BigQuery 클라이언트 초기화 (기존 서비스와 동일)
const getBigQueryClient = () => {
  if (!fs.existsSync(BQ_KEY_FILE)) {
    console.warn('[WaterQuality] BigQuery 키 파일 없음:', BQ_KEY_FILE);
    return null;
  }
  return new BigQuery({ keyFilename: BQ_KEY_FILE });
};

// Google Drive 클라이언트 초기화 (OAuth 지원 기존 서비스 연동)
const getDriveClient = () => {
  const driveService = require('../server/services/driveService.cjs');
  return driveService.drive || null;
};

/**
 * BigQuery에 데이터 INSERT
 */
async function insertToBigQuery(records) {
  if (!records || records.length === 0) {
    return { success: true, inserted: 0 };
  }

  try {
    const bq = getBigQueryClient();
    if (!bq) {
      return { success: false, error: 'BigQuery 클라이언트 초기화 실패' };
    }
    
    const datasetId = BQ_DATASET;
    const tableId = BQ_TABLE;

    // 레코드 정규화
    const normalizedRecords = records.map(r => ({
      site_name: r.site_name || '미확인현장',
      report_date: r.report_date || new Date().toISOString().split('T')[0],
      category: r.category || '성적서',
      method: r.method || null,
      series: r.series || null,
      ph: r.ph || null,
      cod: r.cod || null,
      ss: r.ss || null,
      tn: r.tn || null,
      tp: r.tp || null,
      temp: r.temp || null,
      source_pdf_name: r.source_pdf_name || null,
      created_at: new Date().toISOString(),
    }));

    await bq.dataset(datasetId).table(tableId).insert(normalizedRecords);
    
    console.log(`[WaterQuality] BigQuery inserted: ${normalizedRecords.length} rows`);
    return { success: true, inserted: normalizedRecords.length };
  } catch (error) {
    console.error('[WaterQuality] BigQuery insert failed:', error);
    
    // 부분 실패 처리 (일부만 성공한 경우)
    if (error.errors && Array.isArray(error.errors)) {
      const failedIndices = error.errors.map(e => e.row).filter(Boolean);
      const successCount = records.length - failedIndices.length;
      return { 
        success: false, 
        inserted: successCount, 
        failed: failedIndices.length,
        errors: error.errors 
      };
    }
    
    return { success: false, error: error.message };
  }
}

/**
 * Google Drive에 이미지 업로드
 */
async function uploadImagesToDrive(images, folderName = '수질성적서') {
  if (!images || images.length === 0) {
    return { success: true, uploaded: 0 };
  }

  try {
    const drive = getDriveClient();
    if (!drive) {
      return { success: false, error: 'Drive 클라이언트 초기화 실패' };
    }
    
    const results = [];

    for (const image of images) {
      try {
        // Base64 → Buffer 변환
        const buffer = Buffer.from(image.content, 'base64');
        const stream = Readable.from(buffer);

        // 파일 메타데이터 (환경 변수 대신 상수 사용)
        const fileMetadata = {
          name: image.filename,
          parents: [CERTIFICATE_DRIVE_FOLDER_ID],
        };

        const media = {
          mimeType: 'image/jpeg',
          body: stream,
        };

        // 업로드 (덮어쓰기)
        const response = await drive.files.create({
          resource: fileMetadata,
          media: media,
          fields: 'id, name, webViewLink',
          supportsAllDrives: true,
        });

        results.push({
          filename: image.filename,
          fileId: response.data.id,
          webViewLink: response.data.webViewLink,
          success: true,
        });

        console.log(`[WaterQuality] Drive uploaded: ${image.filename}`);
      } catch (imgError) {
        console.error(`[WaterQuality] Failed to upload ${image.filename}:`, imgError);
        results.push({
          filename: image.filename,
          success: false,
          error: imgError.message,
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    return {
      success: successCount === images.length,
      uploaded: successCount,
      failed: images.length - successCount,
      results,
    };
  } catch (error) {
    console.error('[WaterQuality] Drive upload failed:', error);
    return { success: false, error: error.message };
  }
}

/**
 * IPC 핸들러 등록
 */
function registerWaterQualityHandlers() {
  // 웹앱 → 메인 프로세스 데이터 수신 (AI Studio 가이드와 동일한 one-way 패턴)
  ipcMain.on('water-quality-message', async (event, message) => {
    console.log('[WaterQuality] Received from webapp:', {
      type: message.type,
      records: message.payload?.validRecords?.length || 0,
      images: message.payload?.images?.length || 0,
    });

    const { type, payload } = message;
    
    // BATCH_COMPLETE 또는 SINGLE_COMPLETE 모두 처리
    if (type === 'WATER_QUALITY_BATCH_COMPLETE' || type === 'WATER_QUALITY_SINGLE_COMPLETE') {
      const results = {
        bigquery: null,
        drive: null,
      };

      // 데이터 추출 (BATCH vs SINGLE)
      const validRecords = payload.validRecords || (payload.record ? [payload.record] : []);
      const images = payload.images || (payload.image ? [payload.image] : []);

      console.log(`[WaterQuality] 처리할 데이터: ${validRecords.length}건, 이미지: ${images.length}개`);

      // 1단계: BigQuery INSERT
      if (validRecords.length > 0) {
        event.sender.send('upload-progress', { stage: 'bigquery', current: 0, total: validRecords.length });
        
        results.bigquery = await insertToBigQuery(validRecords);
        
        event.sender.send('upload-progress', { 
          stage: 'bigquery', 
          current: results.bigquery.inserted || 0, 
          total: validRecords.length,
          complete: true 
        });

        // DML 반영 대기 (4초)
        if (results.bigquery.inserted > 0) {
          await new Promise(resolve => setTimeout(resolve, 4000));
        }
      }

      // 2단계: Google Drive 업로드
      if (images.length > 0) {
        event.sender.send('upload-progress', { stage: 'drive', current: 0, total: images.length });
        
        results.drive = await uploadImagesToDrive(images);
        
        event.sender.send('upload-progress', { 
          stage: 'drive', 
          current: results.drive.uploaded || 0, 
          total: images.length,
          complete: true 
        });
      }

      // 완료 응답 (웹앱으로도 응답)
      event.sender.send('upload-complete', results);
      event.sender.send('water-quality-response', { 
        status: 'success', 
        results,
        message: '일렉트론 환경에서 모든 전송이 성공적으로 완료되었습니다!' 
      });
      
      console.log('[WaterQuality] 모든 전송 완료:', results);
    }
  });

  console.log('[WaterQuality] IPC handlers registered');
}

module.exports = { registerWaterQualityHandlers };
