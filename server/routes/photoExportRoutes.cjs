'use strict';

/**
 * photoExportRoutes.cjs
 * =====================================================================
 * 현장 사진 일괄 다운로드 API 라우트
 * GET  /api/photos/monthly-summary
 * POST /api/photos/batch-download
 */

const express = require('express');
const { getMonthlyPhotoSummary, executeBatchDownload } = require('../services/photoExportService.cjs');
const { decodeUserContextHeader } = require('../utils/httpUserHeaders.cjs');

const router = express.Router();

function resolveUserRole(req) {
  return decodeUserContextHeader(
    req.headers['x-user-role']
    || req.body?._user?.role
    || req.query?._role
    || ''
  ).trim().toLowerCase();
}

function ensureAdmin(req, res) {
  const role = resolveUserRole(req);
  if (role === 'admin' || role === 'group_admin' || role === 'central_admin' || role === 'super_admin') return true;
  res.status(403).json({ success: false, message: '관리자 권한이 필요합니다.' });
  return false;
}

function getAppDataPath(req) {
  return process.env.APP_DATA_PATH || req.app.get('appDataPath') || '';
}

/**
 * 현장별 월간 사진 현황 요약 조회
 */
router.get('/api/photos/monthly-summary', async (req, res) => {
  if (!ensureAdmin(req, res)) return;

  const siteName = String(req.query.siteName || '').trim();
  const year = parseInt(req.query.year, 10);
  const month = parseInt(req.query.month, 10);

  if (!siteName || !year || !month) {
    return res.status(400).json({ success: false, message: 'siteName, year, month 매개변수가 필요합니다.' });
  }

  try {
    const appDataPath = getAppDataPath(req);
    const summary = await getMonthlyPhotoSummary({ siteName, year, month, appDataPath });
    return res.json({ success: true, summary });
  } catch (err) {
    console.error('[photoExportRoutes] summary 오류:', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * 선택된 항목 사진들을 로컬 폴더에 서브폴더 구조로 일괄 저장
 */
router.post('/api/photos/batch-download', async (req, res) => {
  if (!ensureAdmin(req, res)) return;

  const { siteName, year, month, selectedCategories, targetDirectory } = req.body || {};

  if (!siteName || !year || !month) {
    return res.status(400).json({ success: false, message: 'siteName, year, month 매개변수가 필요합니다.' });
  }

  try {
    const appDataPath = getAppDataPath(req);
    const result = await executeBatchDownload({
      siteName: String(siteName).trim(),
      year: Number(year),
      month: Number(month),
      selectedCategories: Array.isArray(selectedCategories) ? selectedCategories : [],
      targetDirectory: targetDirectory ? String(targetDirectory).trim() : null,
      appDataPath,
    });

    return res.json(result);
  } catch (err) {
    console.error('[photoExportRoutes] batch-download 오류:', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
