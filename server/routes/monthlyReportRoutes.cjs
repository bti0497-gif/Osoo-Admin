'use strict';

/**
 * monthlyReportRoutes.cjs
 *
 * GET  /api/monthly-report/sites?year=&month=          현장 목록
 * GET  /api/monthly-report/data?year=&month=&siteId=   단일 현장 데이터 (미리보기용)
 * POST /api/monthly-report/export                      Excel 생성 + 다운로드
 *   body: { year, month, siteIds: [...], templatePath }
 */

const express = require('express');
const path    = require('path');
const fs      = require('fs');
const XLSX    = require('xlsx');

const {
  getReportSiteList,
  getMonthlyReportData,
  transformToReportData,
} = require('../services/monthlyReportService.cjs');

const router = express.Router();

// ── 1. 현장 목록 ─────────────────────────────────────────────────────
router.get('/api/monthly-report/sites', async (req, res) => {
  const year  = parseInt(req.query.year,  10);
  const month = parseInt(req.query.month, 10);
  if (!year || !month) return res.status(400).json({ success: false, message: 'year, month 필요' });

  try {
    const sites = await getReportSiteList(year, month);
    return res.json({ success: true, sites });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ── 2. 단일 현장 데이터 (미리보기) ───────────────────────────────────
router.get('/api/monthly-report/data', async (req, res) => {
  const year   = parseInt(req.query.year,  10);
  const month  = parseInt(req.query.month, 10);
  const siteId = String(req.query.siteId || '').trim();
  const siteName = String(req.query.siteName || '').trim();
  if (!year || !month || !siteId) return res.status(400).json({ success: false, message: 'year, month, siteId 필요' });

  try {
    const raw  = await getMonthlyReportData(year, month, siteId);
    const data = transformToReportData(year, month, siteName || siteId, raw);
    return res.json({ success: true, data });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ── 3. Excel 내보내기 ─────────────────────────────────────────────────
router.post('/api/monthly-report/export', async (req, res) => {
  const { year, month, sites, templatePath } = req.body || {};
  // sites: [{ siteId, siteName }]

  if (!year || !month || !Array.isArray(sites) || sites.length === 0) {
    return res.status(400).json({ success: false, message: 'year, month, sites 필요' });
  }
  if (!templatePath || !fs.existsSync(templatePath)) {
    return res.status(400).json({ success: false, message: `템플릿 파일 없음: ${templatePath}` });
  }

  try {
    // 템플릿 읽기
    const wb = XLSX.readFile(templatePath, { cellStyles: true, cellNF: true });
    const templateSheetName = wb.SheetNames[0];
    const templateWS = wb.Sheets[templateSheetName];

    // Named Range 맵 구성 { name -> { sheet, startCol, startRow, endRow } }
    const namedRanges = buildNamedRangeMap(wb);

    // 각 현장 데이터 조회 후 시트 생성
    for (let i = 0; i < sites.length; i++) {
      const { siteId, siteName } = sites[i];

      const raw  = await getMonthlyReportData(year, month, siteId);
      const data = transformToReportData(year, month, siteName, raw);

      // 첫 현장은 기존 시트 재사용, 이후는 시트 복사
      let ws;
      let sheetName;
      if (i === 0) {
        ws        = cloneSheet(templateWS);
        sheetName = sanitizeSheetName(siteName);
        // 기존 시트 이름 교체
        wb.SheetNames[0] = sheetName;
        delete wb.Sheets[templateSheetName];
        wb.Sheets[sheetName] = ws;
      } else {
        ws        = cloneSheet(templateWS);
        sheetName = sanitizeSheetName(siteName);
        wb.SheetNames.push(sheetName);
        wb.Sheets[sheetName] = ws;
      }

      bindReportData(ws, namedRanges, data, year, month);
    }

    // 버퍼로 변환 후 전송
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx', cellStyles: true });
    const fileName = `월운영일지_${year}년${String(month).padStart(2, '0')}월.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`);
    return res.end(buf);
  } catch (err) {
    console.error('[monthlyReport] export 오류:', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ── 헬퍼 ─────────────────────────────────────────────────────────────

/**
 * Named Range 목록에서 { name -> { col, row, endRow } } 맵 생성
 * 범위 형식: sheets1!$A$5:$A$35  또는  sheets1!$A$1
 */
function buildNamedRangeMap(wb) {
  const map = {};
  if (!wb.Workbook || !wb.Workbook.Names) return map;

  for (const n of wb.Workbook.Names) {
    if (n.Name.startsWith('_xlnm.')) continue;
    // Ref 예: sheets1!$A$5:$A$35
    const ref = n.Ref || '';
    const cellRef = ref.replace(/^[^!]+!/, ''); // 시트명 제거
    const decoded = XLSX.utils.decode_range(cellRef.replace(/\$/g, ''));
    map[n.Name] = decoded; // { s: {c, r}, e: {c, r} }
  }
  return map;
}

/**
 * 워크시트에 데이터 바인딩
 */
function bindReportData(ws, namedRanges, data, year, month) {
  const nr = namedRanges;

  // ── 현장명 (A1) ─────────────────────────────────────────────
  setCellValue(ws, nr['현장명'], `${data.siteName} ${year}년 ${month}월 운영일지`);

  // ── 일별 데이터 ───────────────────────────────────────────────
  const dateRange   = nr['날짜'];
  const 유입Range   = nr['유입'];
  const 방류Range   = nr['방류'];
  const 슬러지Range = nr['슬러지'];
  const 포도당Range = nr['포도당'];
  const 중탄산Range = nr['중탄산'];
  const 응집제Range = nr['응집제'];

  data.dailyRows.forEach((row, i) => {
    // 날짜: Excel 날짜 시리얼로 변환
    setRangeCell(ws, dateRange,   i, XLSX.SSF.parse_date_code ? dateToSerial(row.date) : row.date);
    setRangeCell(ws, 유입Range,   i, row.유입);
    setRangeCell(ws, 방류Range,   i, row.방류);
    setRangeCell(ws, 슬러지Range, i, row.슬러지);
    setRangeCell(ws, 포도당Range, i, row.포도당);
    setRangeCell(ws, 중탄산Range, i, row.중탄산);
    setRangeCell(ws, 응집제Range, i, row.응집제);
  });

  // ── 약품 집계 ──────────────────────────────────────────────────
  const med = data.medicine;

  setCellValue(ws, nr['포도당이월'], med.포도당.이월);
  setCellValue(ws, nr['포도당입고'], med.포도당.입고);
  setCellValue(ws, nr['포도당사용'], med.포도당.사용);

  setCellValue(ws, nr['중탄산이월'], med.중탄산.이월);
  setCellValue(ws, nr['중탄산입고'], med.중탄산.입고);
  setCellValue(ws, nr['중탄산사용'], med.중탄산.사용);

  setCellValue(ws, nr['응집제이월'], med.응집제.이월);
  setCellValue(ws, nr['응집제입고'], med.응집제.입고);
  setCellValue(ws, nr['응집제사용'], med.응집제.사용);
}

/** Named Range의 첫 셀에 값 설정 */
function setCellValue(ws, range, value) {
  if (!range) return;
  const addr = XLSX.utils.encode_cell({ c: range.s.c, r: range.s.r });
  if (!ws[addr]) ws[addr] = {};
  ws[addr].v = value ?? '';
  ws[addr].t = typeof value === 'number' ? 'n' : 's';
}

/** Named Range의 i번째 행 셀에 값 설정 */
function setRangeCell(ws, range, i, value) {
  if (!range) return;
  const r = range.s.r + i;
  if (r > range.e.r) return; // 범위 초과 무시
  const addr = XLSX.utils.encode_cell({ c: range.s.c, r });
  if (!ws[addr]) ws[addr] = {};
  if (value === null || value === undefined) {
    ws[addr].v = '';
    ws[addr].t = 's';
  } else {
    ws[addr].v = value;
    ws[addr].t = 'n';
  }
}

/** YYYY-MM-DD → Excel 날짜 시리얼 */
function dateToSerial(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return Math.floor((date - new Date(Date.UTC(1899, 11, 30))) / 86400000);
}

/** 워크시트 깊은 복사 */
function cloneSheet(ws) {
  return JSON.parse(JSON.stringify(ws));
}

/** Excel 시트 이름 제한: 31자, 특수문자 제거 */
function sanitizeSheetName(name) {
  return String(name || 'Sheet')
    .replace(/[:\\\/\?\*\[\]]/g, '')
    .slice(0, 31);
}

module.exports = router;
