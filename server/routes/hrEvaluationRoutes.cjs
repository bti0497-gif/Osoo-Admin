'use strict';

/**
 * hrEvaluationRoutes.cjs
 * ─────────────────────────────────────────────────────────────────────
 * 인사고과 API 라우트
 * - GET  /api/hr-evaluation/data          : 일별 기록, 월별/연간 평가, 설정, 사유글 조회
 * - POST /api/hr-evaluation/sync-batch    : 백그라운드 큐 배치 저장 (BigQuery + 로컬 캐시)
 * - POST /api/hr-evaluation/apology-upload: 시말서 스캔본 Google Drive 업로드
 */

const express = require('express');
const router = express.Router();
const {
  getHrEvaluationData,
  syncHrBatchToBigQuery,
  uploadApologyScanToDrive,
} = require('../services/hrEvaluationService.cjs');

// GET /api/hr-evaluation/data
router.get('/api/hr-evaluation/data', async (req, res) => {
  try {
    const year = Number(req.query.year) || new Date().getFullYear();
    const month = Number(req.query.month) || (new Date().getMonth() + 1);

    const data = await getHrEvaluationData({ year, month });
    return res.json({ ok: true, data });
  } catch (err) {
    console.error('[hrEvaluationRoutes] GET /api/hr-evaluation/data 실패:', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/hr-evaluation/sync-batch
router.post('/api/hr-evaluation/sync-batch', async (req, res) => {
  try {
    const payload = req.body || {};
    const result = await syncHrBatchToBigQuery(payload);
    return res.json({ ok: true, result });
  } catch (err) {
    console.error('[hrEvaluationRoutes] POST /api/hr-evaluation/sync-batch 실패:', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/hr-evaluation/apology-upload
router.post('/api/hr-evaluation/apology-upload', async (req, res) => {
  try {
    const payload = req.body || {};
    const result = await uploadApologyScanToDrive(payload);
    return res.json({ ok: true, result });
  } catch (err) {
    console.error('[hrEvaluationRoutes] POST /api/hr-evaluation/apology-upload 실패:', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

function hrEvaluationRoutes() {
  return router;
}

hrEvaluationRoutes.router = router;
module.exports = hrEvaluationRoutes;
