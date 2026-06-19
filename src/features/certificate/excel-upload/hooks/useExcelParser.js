import { useState, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { matchSiteName } from '../../hooks/useSiteMaster';

/**
 * 단일 워크시트를 파싱하여 행 배열 반환
 */
function parseSheet(worksheet) {
  const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

  // 헤더 행 찾기: 첫 10행 내 '현장명', '채취일', 'MLSS', '날짜', '분석기간', '시료명' 포함 행
  let headerRowIndex = 0;
  for (let i = 0; i < Math.min(10, jsonData.length); i++) {
    const row = jsonData[i];
    if (row && row.some(cell => /현장명|채취일|MLSS|날짜|분析기간|분석기간|시료명/.test(String(cell)))) {
      headerRowIndex = i;
      break;
    }
  }

  const headers = jsonData[headerRowIndex] || [];
  const rows = jsonData.slice(headerRowIndex + 1);

  return rows.map((row, index) => {
    const obj = { _rowIndex: index + headerRowIndex + 2 };
    headers.forEach((header, i) => {
      if (header) obj[String(header).trim()] = row[i];
    });
    return obj;
  }).filter(row => Object.keys(row).length > 1);
}

export function useExcelParser() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [sheetNames, setSheetNames] = useState([]);
  const [selectedSheet, setSelectedSheet] = useState('');

  /**
   * 파일의 모든 시트를 파싱하여 합산 반환
   * 시트가 하나면 그 시트만, 여러 개면 전부 파싱해서 합칩니다.
   */
  const parseExcel = useCallback(async (file) => {
    setLoading(true);
    setError(null);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: 'array' });
      const sheets = workbook.SheetNames;
      setSheetNames(sheets);

      // 시트가 하나면 그것만, 여러 개면 전부 파싱
      const targetSheets = sheets.length === 1
        ? sheets
        : sheets; // 전체 시트 파싱

      const allRows = [];
      for (const sheetName of targetSheets) {
        const rows = parseSheet(workbook.Sheets[sheetName]);
        // 각 행에 어느 시트에서 왔는지 표시
        rows.forEach(r => { r._sheet = sheetName; });
        allRows.push(...rows);
      }

      // selectedSheet는 UI 표시용으로 첫 시트
      setSelectedSheet(sheets[0]);
      setData(allRows);
      setLoading(false);

      return { success: true, data: allRows, sheetNames: sheets };
    } catch (err) {
      setError(err.message);
      setLoading(false);
      return { success: false, error: err.message };
    }
  }, []);

  const filterValidRows = useCallback((rows) => {
    // 유효한 측정값이 있는 행만 필터링
    return rows.filter(row => {
      // MLSS 모드 (6월)
      const mlss = row['MLSS'] || row['mlss'];
      if (mlss !== undefined && mlss !== null && String(mlss).trim() !== '' && String(mlss).trim() !== '-') {
        return true;
      }
      // 5항목 모드 (5월 등)
      const ss = row['SS'] || row['ss'];
      const bod = row['BOD'] || row['bod'];
      if ((ss !== undefined && String(ss).trim() !== '' && String(ss).trim() !== '-') ||
          (bod !== undefined && String(bod).trim() !== '' && String(bod).trim() !== '-')) {
        return true;
      }
      return false;
    });
  }, []);

  const transformToBigQueryFormat = useCallback((rows, siteMaster = []) => {
    const toNum = (v) => {
      if (v === undefined || v === null || String(v).trim() === '' || String(v).trim() === '-') return null;
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };

    const currentYear = new Date().getFullYear();

    return rows.map(row => {
      // 시료명에서 현장명 추출: "고창 휴게소 (서울방향) 폭기조" → "고창 휴게소"
      const 시료명 = String(row['시료명'] || row['C'] || '');
      const siteMatch = 시료명.match(/^([^（(]+)/);
      const rawSiteName = siteMatch ? siteMatch[1].trim() : 시료명;
      const matched = matchSiteName(rawSiteName, siteMaster);

      // 분석기간에서 날짜 추출: "6/9-6/11" → "YYYY-06-09"
      const 분석기간 = String(row['분석기간'] || row['A'] || '');
      const dateMatch = 분석기간.match(/(\d{1,2})\/(\d{1,2})/);
      const report_date = dateMatch
        ? `${currentYear}-${String(dateMatch[1]).padStart(2, '0')}-${String(dateMatch[2]).padStart(2, '0')}`
        : null;

      const mlssVal = row['MLSS'] || row['mlss'] || row['D'];
      const ssVal   = row['SS'] || row['D'];
      const bodVal  = row['BOD'] || row['E'];
      const tnVal   = row['T-N'] || row['T-N (전극)'] || row['F'];
      const tpVal   = row['T-P'] || row['T-P (자동분석기)'] || row['G'];
      const cfVal   = row['총대장균'] || row['총대장균 (자동분석기)'] || row['총대장균(필름)'] || row['H'];

      const mlss = toNum(mlssVal);

      const base = {
        site_id:                matched.site_id,
        site_name:              matched.site_name,
        site_name_raw:          matched.site_name_raw,
        report_date,
        manual_review_required: matched.manual_review_required ? 1 : 0,
      };

      // MLSS 전용 행
      if (mlss !== null) {
        return { ...base, mlss, ss: null, bod: null, tn: null, tp: null, total_coliform: null, source_type: 'excel_mlss' };
      }

      // 5항목 행
      return {
        ...base,
        ss: toNum(ssVal),
        bod: toNum(bodVal),
        tn: toNum(tnVal),
        tp: toNum(tpVal),
        total_coliform: toNum(cfVal),
        mlss: null,
        source_type: 'excel_5items',
      };
    });
  }, []);

  const reset = useCallback(() => {
    setData([]);
    setError(null);
    setSheetNames([]);
    setSelectedSheet('');
  }, []);

  return {
    data,
    loading,
    error,
    sheetNames,
    selectedSheet,
    setSelectedSheet,
    parseExcel,
    filterValidRows,
    transformToBigQueryFormat,
    reset,
  };
}
