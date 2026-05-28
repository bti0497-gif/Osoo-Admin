'use strict';

/**
 * attendanceRoutes.cjs
 * ─────────────────────────────────────────────────────────────────────
 * 출결 현황 조회 API 라우트
 * GET /api/attendance - 출결 현황 조회 (일별/주간/월별)
 * GET /api/attendance/sites - 현장 목록 조회 (Google Sheets 기반)
 *
 * 요청 헤더: x-user-role, x-user-name (프론트엔드 apiClient가 주입)
 */

const express = require('express');
const router = express.Router();
const {
  getDailyAttendance,
  getWeeklyAttendance,
  getMonthlyAttendance,
} = require('../services/attendanceQueryService.cjs');
const { getSites } = require('../services/sitesSheetsService.cjs');

// GET /api/attendance - 출결 현황 조회
// Query params: date, period=daily|weekly|monthly, siteId (optional)
router.get('/api/attendance', async (req, res) => {
  try {
    const { date, period = 'daily', siteId } = req.query;

    if (!date) {
      return res.status(400).json({ error: 'date 파라미터가 필요합니다 (YYYY-MM-DD)' });
    }

    let data;

    switch (period) {
      case 'daily':
        data = await getDailyAttendance(date, siteId || null);
        break;
      case 'weekly': {
        // date를 기준으로 해당 주의 시작(월)과 끝(일) 계산
        const d = new Date(date);
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1); // 월요일 기준
        const start = new Date(d.setDate(diff));
        const end = new Date(d.setDate(diff + 6));
        const startStr = start.toISOString().split('T')[0];
        const endStr = end.toISOString().split('T')[0];
        data = await getWeeklyAttendance(startStr, endStr, siteId || null);
        break;
      }
      case 'monthly': {
        const yearMonth = date.substring(0, 7); // YYYY-MM
        data = await getMonthlyAttendance(yearMonth, siteId || null);
        break;
      }
      default:
        return res.status(400).json({ error: '유효하지 않은 period 값입니다 (daily|weekly|monthly)' });
    }

    res.json({
      success: true,
      period,
      date,
      siteId: siteId || null,
      count: data.length,
      data,
    });
  } catch (err) {
    console.error('[attendanceRoutes] 조회 실패:', err.message);
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

// GET /api/attendance/sites - Google Sheets 기반 현장 목록
router.get('/api/attendance/sites', async (req, res) => {
  try {
    const sites = await getSites();
    // Google Sheets 데이터 형식을 클라이언트가 기대하는 형식으로 변환
    const formattedSites = sites.map((site) => ({
      site_id: site.id,
      site_name: site.site_name,
    }));
    res.json({
      success: true,
      count: formattedSites.length,
      data: formattedSites,
    });
  } catch (err) {
    console.error('[attendanceRoutes] 현장 목록 조회 실패:', err.message);
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

module.exports = router;
