import { useState, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { matchSiteName } from '../../hooks/useSiteMaster';

/**
 * 엑셀 날짜 파싱 헬퍼
 * 예: "1/20~1/21" -> 첫 날 "1/20" 추출 후 YYYY-MM-DD 포맷 변환
 */
export function parseReportDate(dateStr, baseYear = null) {
  if (dateStr === undefined || dateStr === null || dateStr === '') return null;

  if (dateStr instanceof Date && !Number.isNaN(dateStr.getTime())) {
    return `${dateStr.getFullYear()}-${String(dateStr.getMonth() + 1).padStart(2, '0')}-${String(dateStr.getDate()).padStart(2, '0')}`;
  }

  const numericDate = Number(dateStr);
  if (Number.isFinite(numericDate) && numericDate > 20000) {
    const parsed = XLSX.SSF.parse_date_code(numericDate);
    if (parsed && parsed.y && parsed.m && parsed.d) {
      return `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
    }
  }

  const str = String(dateStr).trim();
  if (!str || str === '-') return null;

  const parsedBaseYear = Number(baseYear);
  const currentYear = Number.isFinite(parsedBaseYear) && parsedBaseYear >= 2000 && parsedBaseYear <= 2999
    ? parsedBaseYear
    : new Date().getFullYear();

  const toIsoDate = (year, month, day) => {
    const y = Number(year);
    const m = Number(month);
    const d = Number(day);
    if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return null;
    if (m < 1 || m > 12 || d < 1 || d > 31) return null;
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  };

  // 분석기간 범위 표기(예: 6/4-6/10, 6/17-)는 시작일만 사용한다.
  let candidate = str;
  const rangeByTilde = str.split(/[~∼～]/)[0].trim();
  if (rangeByTilde) candidate = rangeByTilde;

  const rangeByDash = candidate.match(/^(\d{1,2}[./]\d{1,2})\s*-\s*(\d{1,2}[./]\d{1,2})?$/);
  if (rangeByDash) {
    candidate = rangeByDash[1];
  }

  const rangeByTrailingDash = candidate.match(/^(\d{1,2}[./]\d{1,2})\s*-\s*$/);
  if (rangeByTrailingDash) {
    candidate = rangeByTrailingDash[1];
  }

  // 한글 날짜 표기와 다양한 구분자를 통일하고, 첫 번째 날짜 토큰을 우선 해석한다.
  const normalized = String(candidate)
    .replace(/[–—−]/g, '-')
    .replace(/년/g, '-')
    .replace(/월/g, '-')
    .replace(/일/g, '')
    .replace(/[()[\]{},]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // 포맷 1: YYYY-MM-DD 또는 YYYY/MM/DD 또는 YYYY.MM.DD
  const dateMatch1 = normalized.match(/(?:^|\D)(\d{4})[-./](\d{1,2})[-./](\d{1,2})(?:\D|$)/);
  if (dateMatch1) {
    return toIsoDate(dateMatch1[1], dateMatch1[2], dateMatch1[3]);
  }

  // 포맷 2: YY-MM-DD 또는 YY/MM/DD 또는 YY.MM.DD (예: 26.01.20)
  const dateMatch2 = normalized.match(/(?:^|\D)(\d{2})[-./](\d{1,2})[-./](\d{1,2})(?:\D|$)/);
  if (dateMatch2) {
    const yr = parseInt(dateMatch2[1], 10);
    const fullYr = 2000 + yr;
    const iso = toIsoDate(fullYr, dateMatch2[2], dateMatch2[3]);
    if (iso) return iso;
  }

  // 포맷 3: MM-DD 또는 MM/DD 또는 MM.DD (연도 생략 시 현재 연도 부여)
  const dateMatch3 = normalized.match(/(?:^|\D)(\d{1,2})[-./](\d{1,2})(?:\D|$)/);
  if (dateMatch3) {
    return toIsoDate(currentYear, dateMatch3[1], dateMatch3[2]);
  }

  // 포맷 4: 한글 표기 (예: 6월 17일, 6월17)
  const dateMatch4 = str.match(/(\d{1,2})\s*월\s*(\d{1,2})\s*일?/);
  if (dateMatch4) {
    return toIsoDate(currentYear, dateMatch4[1], dateMatch4[2]);
  }

  return null;
}

function isLikelyAnalysisPeriod(value) {
  if (value instanceof Date) return true;

  const numericValue = Number(value);
  if (Number.isFinite(numericValue) && numericValue > 20000) return true;

  const text = String(value || '').trim();
  if (!text || text === '-' || text === '분석기간') return false;
  if (/^\d{1,2}월$/.test(text)) return false;

  return /(\d{4}[-./]\d{1,2}[-./]\d{1,2})|(\d{1,2}[-./]\d{1,2})|(\d{1,2}\s*월\s*\d{1,2}\s*일?)/.test(text);
}

function isAnalysisPeriodHeader(value) {
  return String(value || '').trim() === '분석기간';
}

function extractSheetYear(worksheet) {
  if (!worksheet) return null;

  const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1:A1');
  const lastCol = range.e.c;
  const headerCellAddr = XLSX.utils.encode_cell({ r: 0, c: lastCol });
  const headerCellVal = worksheet[headerCellAddr]?.v;

  const text = String(headerCellVal ?? '').trim();
  if (!text) return null;

  const y4 = text.match(/(20\d{2})/);
  if (y4) return Number(y4[1]);

  const y2 = text.match(/(^|\D)(\d{2})(\D|$)/);
  if (y2) {
    return 2000 + Number(y2[2]);
  }

  return null;
}

/**
 * 첫번째 행(칼럼 헤더)은 무시하고 두번째 행부터 데이터 배열 반환
 * 실제 셀 데이터가 기록된 끝 행 번호까지 !ref 범위를 동적으로 강제 보정하여 파싱 누락 방지
 */
function parseSheet(worksheet) {
  if (!worksheet) return [];

  let maxRow = 0;
  const keys = Object.keys(worksheet);
  for (const key of keys) {
    if (key.startsWith('!')) continue;
    const rowNum = parseInt(key.replace(/^[A-Z]+/, ''), 10);
    if (!isNaN(rowNum) && rowNum > maxRow) {
      maxRow = rowNum;
    }
  }
  if (maxRow > 0) {
    // A열부터 Z열까지 넉넉하게 잡아서 실제 데이터가 입력된 끝 행까지 범위를 수동 확장
    worksheet['!ref'] = `A1:Z${maxRow}`;
  }

  const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
  // 첫 행은 헤더이므로 생략하고 두 번째 행부터의 데이터 배열만 필터링하여 반환
  return jsonData.slice(1).filter(row => row && row.length > 0);
}

function parseSampleDateFromReceipt(receiptNo) {
  const match = String(receiptNo || '').match(/(\d{2})(\d{2})(\d{2})/);
  if (!match) return null;
  return `20${match[1]}-${match[2]}-${match[3]}`;
}

export function useExcelParser() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [sheetNames, setSheetNames] = useState([]);
  const [selectedSheet, setSelectedSheet] = useState('');

  const filterValidRows = useCallback((rows) => {
    return rows.filter(row => {
      // 1. MLSS 시트 행 검사
      if (row._sheetType === 'mlss') {
        const mlss = row[3]; // 인덱스 3: MLSS
        return mlss !== undefined && mlss !== null && String(mlss).trim() !== '' && String(mlss).trim() !== '-';
      }
      
      // 2. 5개항목 시트 행 검사 (SS, BOD, T-N, T-P 중 하나라도 있으면 유효)
      const ss = row[3];  // 인덱스 3: SS
      const bod = row[4]; // 인덱스 4: BOD
      const tn = row[5];  // 인덱스 5: T-N
      const tp = row[6];  // 인덱스 6: T-P
      
      if ((ss !== undefined && String(ss).trim() !== '' && String(ss).trim() !== '-') ||
          (bod !== undefined && String(bod).trim() !== '' && String(bod).trim() !== '-') ||
          (tn !== undefined && String(tn).trim() !== '' && String(tn).trim() !== '-') ||
          (tp !== undefined && String(tp).trim() !== '' && String(tp).trim() !== '-')) {
        return true;
      }
      return false;
    });
  }, []);

  /**
   * 파일의 모든 시트를 파싱하여 유효 시트만 합산 반환
   */
  const parseExcel = useCallback(async (file) => {
    setLoading(true);
    setError(null);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: 'array' });
      const sheets = workbook.SheetNames;
      setSheetNames(sheets);

      const allRows = [];
      for (const sheetName of sheets) {
        const normalizedSheetName = sheetName.toLowerCase().replace(/\s+/g, '');
        let sheetType = null;

        // 시트 이름 매칭 검사
        if (normalizedSheetName.includes('mlss')) {
          sheetType = 'mlss';
        } else if (normalizedSheetName.includes('5개항목')) {
          sheetType = '5items';
        }

        // 감지된 시트만 처리
        if (sheetType) {
          const worksheet = workbook.Sheets[sheetName];
          const sheetYear = extractSheetYear(worksheet);
          const rows = parseSheet(worksheet);

          // 분석기간 셀이 빈 행은 직전 분석기간을 승계한다.
          let lastAnalysisPeriod = null;
          for (const row of rows) {
            if (isAnalysisPeriodHeader(row[0])) {
              // 새 차수 시작 헤더에서는 이전 차수 날짜 승계를 끊는다.
              lastAnalysisPeriod = null;
              row._analysisPeriod = null;
              continue;
            }

            if (isLikelyAnalysisPeriod(row[0])) {
              lastAnalysisPeriod = row[0];
            }

            // 월 헤더/텍스트/빈 셀은 날짜가 아니므로 직전 날짜를 그대로 사용한다.
            row._analysisPeriod = isLikelyAnalysisPeriod(row[0])
              ? row[0]
              : lastAnalysisPeriod;
          }
          
          // 각 행에 시트 메타데이터 부여
          rows.forEach((r, idx) => {
            r._sheet = sheetName;
            r._sheetType = sheetType;
            r._sheetYear = sheetYear;
            r._sourceRowOrder = idx + 2;
          });

          // 유효 데이터 행이 있는 시트만 전송 데이터에 합산
          const validRowsInSheet = filterValidRows(rows);
          if (validRowsInSheet.length > 0) {
            allRows.push(...validRowsInSheet);
          }
        }
      }

      setSelectedSheet(sheets[0] || '');
      setData(allRows);
      setLoading(false);

      return { success: true, data: allRows, sheetNames: sheets };
    } catch (err) {
      setError(err.message);
      setLoading(false);
      return { success: false, error: err.message };
    }
  }, [filterValidRows]);

  const transformToBigQueryFormat = useCallback((rows, siteMaster = []) => {
    const toNum = (v) => {
      if (v === undefined || v === null || String(v).trim() === '' || String(v).trim() === '-') return null;
      // 콤마 및 모든 공백(천단위 스페이스 구분 등) 제거
      const cleanVal = String(v).replace(/,/g, '').replace(/\s+/g, '');
      const n = Number(cleanVal);
      return Number.isFinite(n) ? n : null;
    };

    return rows.map(row => {
      // 인덱스 2: 시료명(현장명)
      const 시료명 = String(row[2] ?? '');
      const matched = matchSiteName(시료명, siteMaster);

      // 인덱스 0: 분석기간(날짜)
      const 분석기간 = row._analysisPeriod ?? row[0];
      const report_date = parseReportDate(분석기간, row._sheetYear);
      const sample_date = parseSampleDateFromReceipt(row[1]) || report_date;

      const base = {
        site_id:                matched.site_id,
        site_name:              matched.site_name,
        site_name_raw:          matched.site_name_raw,
        report_date,
        sample_date,
        source_row_order:       row._sourceRowOrder || null,
        manual_review_required: matched.manual_review_required ? 1 : 0,
      };

      if (row._sheetType === 'mlss') {
        // 인덱스 3: MLSS
        const mlssVal = row[3];
        return {
          ...base,
          mlss: toNum(mlssVal),
          ss: null,
          bod: null,
          tn: null,
          tp: null,
          total_coliform: null,
          source_type: 'excel_mlss',
        };
      }

      // 5개항목 시트 파싱 (고정 인덱스 사용, 널 병합 연산자로 0 값의 누락 방지)
      const ssVal = row[3];  // 인덱스 3: SS
      const bodVal = row[4]; // 인덱스 4: BOD
      const tnVal = row[5];  // 인덱스 5: T-N
      const tpVal = row[6];  // 인덱스 6: T-P
      const cfVal = row[7];  // 인덱스 7: 총대장균군

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

  /**
   * 빅쿼리 기존 행과 비교하여 100% 동일한 완전 중복 행 필터링
   */
  const filterDuplicateRows = useCallback((parsedRows, existingRows = []) => {
    const toStr = (v) => (v === null || v === undefined) ? '' : String(v).trim();

    return parsedRows.filter(row => {
      const isDuplicate = existingRows.some(ex => {
        const dateMatch = toStr(row.report_date) === toStr(ex.report_date);
        const sampleDateMatch = toStr(row.sample_date) === toStr(ex.sample_date);
        const siteMatch = toStr(row.site_name) === toStr(ex.site_name);

        if (!dateMatch || !sampleDateMatch || !siteMatch) return false;

        // 모든 수치가 동일한지 체크
        const mlssMatch = toStr(row.mlss) === toStr(ex.mlss);
        const ssMatch = toStr(row.ss) === toStr(ex.ss);
        const bodMatch = toStr(row.bod) === toStr(ex.bod);
        const tnMatch = toStr(row.tn) === toStr(ex.tn);
        const tpMatch = toStr(row.tp) === toStr(ex.tp);
        const coliformMatch = toStr(row.total_coliform) === toStr(ex.total_coliform);

        return mlssMatch && ssMatch && bodMatch && tnMatch && tpMatch && coliformMatch;
      });

      return !isDuplicate;
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
    filterDuplicateRows,
    reset,
  };
}
