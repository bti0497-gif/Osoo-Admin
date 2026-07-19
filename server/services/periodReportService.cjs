'use strict';

/**
 * periodReportService.cjs
 * ─────────────────────────────────────────────────────────
 * 기간 데이터 조회 엑셀 바인딩 서비스
 *
 * BigQuery 테이블:
 *   - daily_log_system.flow_readings   (유입유량계 / 방류유량계)
 *   - daily_log_system.water_quality   (BOD, T-N, T-P, SS, 총대장균군)
 */

const { getBigQueryClient, DATASET_ID } = require('./bigQueryClientService.cjs');

/**
 * 특정 현장의 기간 유량 데이터 조회
 * @param {string} siteName
 * @param {string} startDate  YYYY-MM-DD
 * @param {string} endDate    YYYY-MM-DD
 * @returns {Promise<Array<{date: string, type: string, calculated_flow: number}>>}
 */
async function getFlowData(siteName, startDate, endDate) {
  const bq = getBigQueryClient();
  if (!bq) throw new Error('BigQuery 클라이언트 초기화 실패');

  const query = `
    SELECT date, type, calculated_flow
    FROM \`${DATASET_ID}.flow_readings\`
    WHERE site_name = @siteName
      AND date BETWEEN @startDate AND @endDate
      AND type IN ('유입유량계', '방류유량계')
      AND calculated_flow IS NOT NULL
    ORDER BY date ASC
  `;

  const [rows] = await bq.query({
    query,
    params: { siteName, startDate, endDate },
  });

  return rows.map(r => ({
    date: bqDateToStr(r.date),
    type: r.type,
    calculated_flow: r.calculated_flow,
  }));
}

/**
 * 특정 현장의 기간 수질 데이터 조회
 * @param {string} siteName
 * @param {string} startDate  YYYY-MM-DD
 * @param {string} endDate    YYYY-MM-DD
 * @returns {Promise<Array>}
 */
async function getWaterQualityData(siteName, startDate, endDate) {
  const bq = getBigQueryClient();
  if (!bq) throw new Error('BigQuery 클라이언트 초기화 실패');

  const query = `
    SELECT report_date, bod, tn, tp, ss, total_coliform
    FROM \`${DATASET_ID}.water_quality\`
    WHERE site_name = @siteName
      AND report_date BETWEEN @startDate AND @endDate
      AND category = 'excel_5items'
      AND (
        bod IS NOT NULL
        OR tn IS NOT NULL
        OR tp IS NOT NULL
        OR ss IS NOT NULL
        OR total_coliform IS NOT NULL
      )
    ORDER BY report_date ASC
  `;

  const [rows] = await bq.query({
    query,
    params: { siteName, startDate, endDate },
  });

  return rows.map(r => ({
    report_date: bqDateToStr(r.report_date),
    bod: r.bod,
    tn: r.tn,
    tp: r.tp,
    ss: r.ss,
    total_coliform: r.total_coliform,
  }));
}

/**
 * BigQuery DATE 객체를 YYYY-MM-DD 문자열로 변환
 */
function bqDateToStr(d) {
  if (!d) return null;
  if (typeof d === 'string') return d;
  if (d.value) return d.value;
  return String(d);
}

module.exports = {
  getFlowData,
  getWaterQualityData,
  bqDateToStr,
};
