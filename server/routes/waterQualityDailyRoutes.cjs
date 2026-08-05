'use strict';

/**
 * waterQualityDailyRoutes.cjs
 * ─────────────────────────────────────────────────────────
 * 현장별 월간 일일 수질 분석 (암모니아성질소, 질산성질소, 인산염인, 알칼리도) 조회 API
 *
 * BigQuery 테이블: daily_log_system.qntech_water_quality
 * 1단 헤더: 키트 항목 (nh3_n, no3_n, po4_p, alkalinity)
 * 2단 헤더: 분석 장소 (유량조정조 ➔ 무산소조 ➔ 포기조 ➔ 침전조 ➔ 방류조)
 */

const express = require('express');
const { BigQuery } = require('@google-cloud/bigquery');
const path = require('path');
const { decodeUserContextHeader } = require('../utils/httpUserHeaders.cjs');

const router = express.Router();

const getBigQueryClient = () => {
  const keyFile = path.join(__dirname, '../config/work-jindan-194620a46d59.json');
  return new BigQuery({
    projectId: 'work-jindan',
    keyFilename: keyFile,
  });
};

const DATASET_ID = 'daily_log_system';
const TABLE_ID = 'qntech_water_quality';
const LOCATION = 'asia-northeast3';

const STANDARD_LOCATIONS = ['유량조정조', '무산소조', '포기조', '침전조', '방류조'];
const STANDARD_ITEMS = [
  { key: 'nh3_n', label: '암모니아성질소(NH3-N)', color: '#2563eb', bg: '#dbeafe' },
  { key: 'no3_n', label: '질산성질소(NO3-N)', color: '#059669', bg: '#d1fae5' },
  { key: 'po4_p', label: '인산염인(PO4-P)', color: '#d97706', bg: '#fef3c7' },
  { key: 'alkalinity', label: '알칼리도(ALK)', color: '#7c3aed', bg: '#ede9fe' },
];

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

function bqDateToStr(d) {
  if (!d) return null;
  if (typeof d === 'string') return d.slice(0, 10);
  if (d && typeof d === 'object' && d.value) return String(d.value).slice(0, 10);
  if (d instanceof Date) {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  return String(d).slice(0, 10);
}

/**
 * GET /api/water-quality/daily-query
 * Query params:
 *   - year: YYYY (필수)
 *   - month: MM (필수)
 *   - siteName: 현장명 (필수)
 */
router.get('/api/water-quality/daily-query', async (req, res) => {
  if (!ensureAdmin(req, res)) return;

  try {
    const { year, month, siteName } = req.query;

    if (!year || !month || !siteName || siteName === 'all' || siteName === '') {
      return res.status(400).json({
        success: false,
        message: '연도, 월, 현장명을 모두 지정해야 합니다.',
      });
    }

    const yearNum = parseInt(year, 10);
    const monthNum = parseInt(month, 10);
    if (isNaN(yearNum) || isNaN(monthNum) || monthNum < 1 || monthNum > 12) {
      return res.status(400).json({ success: false, message: '올바른 연도와 월을 선택해 주세요.' });
    }

    const startDate = `${yearNum}-${String(monthNum).padStart(2, '0')}-01`;
    const lastDay = new Date(yearNum, monthNum, 0).getDate();
    const endDate = `${yearNum}-${String(monthNum).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    const bq = getBigQueryClient();

    const query = `
      SELECT
        date,
        site_name,
        location,
        item_code,
        item_name,
        result_numeric,
        result_value
      FROM \`work-jindan.${DATASET_ID}.${TABLE_ID}\`
      WHERE site_name = @siteName
        AND date BETWEEN @startDate AND @endDate
      ORDER BY date ASC, location ASC
    `;

    const [rows] = await bq.query({
      query,
      params: { siteName, startDate, endDate },
      location: LOCATION,
    });

    // 장소 수집 및 정렬
    const locationSet = new Set(STANDARD_LOCATIONS);
    const dateMap = new Map(); // key: date

    for (const r of rows) {
      const dateStr = bqDateToStr(r.date);
      const loc = String(r.location || '').trim();
      const code = String(r.item_code || '').trim().toLowerCase();
      const val = r.result_numeric !== null && r.result_numeric !== undefined ? Number(r.result_numeric) : (r.result_value !== null ? parseFloat(r.result_value) : null);

      if (!dateStr || !loc) continue;

      if (loc) locationSet.add(loc);

      if (!dateMap.has(dateStr)) {
        dateMap.set(dateStr, {
          date: dateStr,
          measurements: {},
        });
      }

      const rowObj = dateMap.get(dateStr);
      if (!rowObj.measurements[loc]) {
        rowObj.measurements[loc] = {};
      }

      if (code && !isNaN(val) && val !== null) {
        if (code.includes('nh3') || code.includes('암모니아')) {
          rowObj.measurements[loc].nh3_n = val;
        } else if (code.includes('no3') || code.includes('질산')) {
          rowObj.measurements[loc].no3_n = val;
        } else if (code.includes('po4') || code.includes('인산')) {
          rowObj.measurements[loc].po4_p = val;
        } else if (code.includes('alkalinity') || code.includes('알칼리') || code.includes('alk')) {
          rowObj.measurements[loc].alkalinity = val;
        } else {
          rowObj.measurements[loc][code] = val;
        }
      }
    }

    const locations = Array.from(locationSet).sort((a, b) => {
      const idxA = STANDARD_LOCATIONS.indexOf(a);
      const idxB = STANDARD_LOCATIONS.indexOf(b);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return a.localeCompare(b, 'ko');
    });

    const pivotedRows = Array.from(dateMap.values());

    return res.json({
      success: true,
      count: pivotedRows.length,
      year: yearNum,
      month: monthNum,
      siteName,
      locations,
      items: STANDARD_ITEMS,
      rows: pivotedRows,
    });
  } catch (err) {
    console.error('[waterQualityDailyRoutes] Daily query error:', err);
    return res.status(500).json({
      success: false,
      message: `일일 수질데이터 조회 실패: ${err.message}`,
    });
  }
});

module.exports = router;
