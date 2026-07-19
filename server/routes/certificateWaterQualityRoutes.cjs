/**
 * BigQuery 성적서 수질데이터 (water_quality) 조회 라우트
 */
const express = require('express');
const { queryWaterQualityData, getSiteList } = require('../services/certificateWaterQualityService.cjs');

const router = express.Router();

/**
 * GET /api/certificates/water-quality
 * 월별/현장별 수질데이터 조회
 * Query params:
 *   - year: YYYY (필수)
 *   - month: MM (필수)
 *   - siteName: 현장명 (선택, 'all' 또는 미지정시 전체)
 */
router.get('/api/certificates/water-quality', async (req, res) => {
  try {
    const { year, month, siteName } = req.query;

    if (!year || !month) {
      return res.status(400).json({
        success: false,
        error: 'year와 month 파라미터는 필수입니다.',
      });
    }

    const yearNum = parseInt(year, 10);
    const monthNum = parseInt(month, 10);

    if (isNaN(yearNum) || isNaN(monthNum) || monthNum < 1 || monthNum > 12) {
      return res.status(400).json({
        success: false,
        error: '유효하지 않은 year 또는 month 값입니다.',
      });
    }

    const data = await queryWaterQualityData(yearNum, monthNum, siteName);

    res.json({
      success: true,
      count: data.length,
      year: yearNum,
      month: monthNum,
      siteName: siteName || 'all',
      data,
    });
  } catch (err) {
    console.error('[certificateWaterQualityRoutes] 조회 실패:', err.message);
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

/**
 * GET /api/certificates/water-quality/sites
 * 수질데이터에 있는 현장 목록 조회
 */
router.get('/api/certificates/water-quality/sites', async (req, res) => {
  try {
    const sites = await getSiteList();

    res.json({
      success: true,
      count: sites.length,
      sites,
    });
  } catch (err) {
    console.error('[certificateWaterQualityRoutes] 현장 목록 조회 실패:', err.message);
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

/**
 * 엑셀 데이터 Batch Insert API
 * POST /api/certificates/water-quality/batch-insert
 */
router.post('/api/certificates/water-quality/batch-insert', async (req, res) => {
  try {
    const { rows, replaceFiveItems } = req.body || {};
    
    if (!rows || !Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'rows 배열이 필요합니다.'
      });
    }

    // BigQuery에 배치 삽입
    const { insertRows } = require('../services/certificateWaterQualityService.cjs');
    
    const result = await insertRows(rows, { replaceFiveItems: Boolean(replaceFiveItems) });
    
    res.json({
      success: true,
      inserted: result.inserted || 0,
      skipped: result.skipped || 0,
      replacedFiveItems: Boolean(result.replacedFiveItems),
      warnings: Array.isArray(result.warnings) ? result.warnings : [],
      message: (result.skipped || 0) > 0
        ? `${result.inserted || 0}행 삽입, ${result.skipped || 0}행 제외`
        : `${result.inserted || 0}행이 BigQuery에 삽입되었습니다.`
    });
  } catch (err) {
    console.error('[batch-insert] 삽입 실패:', err.message);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

module.exports = router;
