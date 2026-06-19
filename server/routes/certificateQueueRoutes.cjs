/**
 * 성적서 업로드 큐 및 순차 동기화 API
 * - 로컬 SQLite에 먼저 저장
 * - 순차적으로 BigQuery + Drive 동기화
 * - 자동 재시도 (최대 3회)
 */

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const os = require('os');
const { addToQueue, getPendingItems, updateStatus, getFailedItems } = require('../config/database.cjs');
const { upsertCertificateRowToBigQuery } = require('./certificateRoutes.cjs');
const { uploadImageToDrive } = require('../services/driveService.cjs');

/**
 * Base64 이미지를 임시 파일로 저장
 */
function saveBase64Image(base64Data, fileName) {
  try {
    const tempDir = os.tmpdir();
    const tempPath = path.join(tempDir, `upload_${Date.now()}_${fileName}.jpg`);
    const buffer = Buffer.from(base64Data, 'base64');
    fs.writeFileSync(tempPath, buffer);
    return tempPath;
  } catch (error) {
    console.error('[saveBase64Image] 실패:', error);
    return null;
  }
}

/**
 * POST /api/certificates/queue/add
 * 로컬 큐에 업로드 항목 추가 (즉시 응답)
 * - Base64 이미지를 임시 파일로 저장
 */
router.post('/queue/add', async (req, res) => {
  try {
    const { fileName, imageBase64, extractedData, sourcePdfName } = req.body;
    
    if (!fileName || !extractedData) {
      return res.status(400).json({ success: false, message: '필수 데이터 누락' });
    }
    
    // Base64 이미지를 임시 파일로 저장
    let filePath = null;
    if (imageBase64) {
      filePath = saveBase64Image(imageBase64, fileName);
    }
    
    const id = addToQueue({
      fileName,
      filePath,
      extractedData,
      sourcePdfName
    });
    
    res.json({
      success: true,
      id,
      message: '업로드 큐에 추가되었습니다. 백그라운드에서 동기화됩니다.'
    });
  } catch (error) {
    console.error('[Queue Add Error]', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * POST /api/certificates/queue/sync
 * 대기 중인 항목 순차 동기화 (BigQuery → Drive)
 * - 한 번에 하나씩 처리
 * - 각 요청 사이 1초 지연 (Rate Limiting 방지)
 */
router.post('/queue/sync', async (req, res) => {
  try {
    const limit = req.body.limit || 5; // 한 번에 최대 5개
    const pendingItems = getPendingItems(limit);
    
    if (pendingItems.length === 0) {
      return res.json({ success: true, message: '동기화할 항목이 없습니다.', processed: 0 });
    }
    
    const results = [];
    const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
    
    for (const item of pendingItems) {
      const result = {
        id: item.id,
        fileName: item.file_name,
        bq: { success: false, error: null },
        drive: { success: false, error: null }
      };
      
      // 1. BigQuery 동기화 (실패 시 재시도 카운트 증가)
      if (item.bq_status === 'pending' || (item.bq_status === 'failed' && item.bq_retry_count < 3)) {
        try {
          await delay(500); // 요청 간 0.5초 지연
          
          const bqResult = await upsertCertificateRowToBigQuery(
            item.extracted_data,
            item.id
          );
          
          if (bqResult.inserted) {
            updateStatus(item.id, 'bq', 'completed');
            result.bq.success = true;
          } else {
            const errorMsg = bqResult.reason || 'Unknown error';
            updateStatus(item.id, 'bq', 'failed', errorMsg);
            result.bq.error = errorMsg;
          }
        } catch (error) {
          updateStatus(item.id, 'bq', 'failed', error.message);
          result.bq.error = error.message;
        }
      }
      
      // 2. Drive 동기화
      if ((item.drive_status === 'pending' || (item.drive_status === 'failed' && item.drive_retry_count < 3)) 
          && item.file_path) {
        try {
          await delay(500); // 요청 간 0.5초 지연
          
          const driveResult = await uploadImageToDrive(
            item.file_path,
            item.file_name,
            item.extracted_data.category || '성적서'
          );
          
          if (driveResult.success) {
            updateStatus(item.id, 'drive', 'completed');
            result.drive.success = true;
            result.drive.fileId = driveResult.fileId;
          } else {
            updateStatus(item.id, 'drive', 'failed', driveResult.error);
            result.drive.error = driveResult.error;
          }
        } catch (error) {
          updateStatus(item.id, 'drive', 'failed', error.message);
          result.drive.error = error.message;
        }
      }
      
      results.push(result);
    }
    
    // 실패한 항목 확인
    const failedItems = results.filter(r => !r.bq.success || !r.drive.success);
    
    res.json({
      success: true,
      processed: results.length,
      failed: failedItems.length,
      results
    });
  } catch (error) {
    console.error('[Queue Sync Error]', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/certificates/queue/status
 * 현재 큐 상태 조회
 */
router.get('/queue/status', (req, res) => {
  try {
    const db = require('../config/database.cjs').getDb();
    
    const stats = db.prepare(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN bq_status = 'pending' OR drive_status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN bq_status = 'completed' AND drive_status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN (bq_retry_count >= 3 OR drive_retry_count >= 3) AND (bq_status = 'failed' OR drive_status = 'failed') THEN 1 ELSE 0 END) as failed
      FROM certificate_upload_queue
    `).get();
    
    res.json({ success: true, stats });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/certificates/queue/failed
 * 3회 재시도 후 실패한 항목 목록 (사용자 알림용)
 */
router.get('/queue/failed', (req, res) => {
  try {
    const failedItems = getFailedItems();
    res.json({
      success: true,
      count: failedItems.length,
      items: failedItems.map(item => ({
        id: item.id,
        fileName: item.file_name,
        bqStatus: item.bq_status,
        bqError: item.bq_error,
        driveStatus: item.drive_status,
        driveError: item.drive_error,
        retryCount: Math.max(item.bq_retry_count, item.drive_retry_count),
        createdAt: item.created_at
      }))
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * POST /api/certificates/queue/retry/:id
 * 특정 항목 수동 재시도
 */
router.post('/queue/retry/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const db = require('../config/database.cjs').getDb();
    
    // 재시도 카운트 초기화
    db.prepare(`
      UPDATE certificate_upload_queue
      SET bq_retry_count = 0, drive_retry_count = 0,
          bq_status = 'pending', drive_status = 'pending',
          bq_error = NULL, drive_error = NULL
      WHERE id = ?
    `).run(id);
    
    res.json({ success: true, message: '재시도 대기열에 추가되었습니다.' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = () => router;
