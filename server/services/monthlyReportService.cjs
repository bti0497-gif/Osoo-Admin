'use strict';

/**
 * monthlyReportService.cjs
 * ─────────────────────────────────────────────────────────
 * 월운영일지 Excel 바인딩용 BigQuery 데이터 조회
 *
 * - flow_readings: 유입유량계, 방류유량계, 슬러지
 * - medicine_logs: 포도당, 중탄산나트륨, 팩(PAC)
 * - 이월량: 전월 말일의 current_inventory
 */

const { getBigQueryClient, DATASET_ID } = require('./bigQueryClientService.cjs');

const MEDICINE_NAMES = {
  포도당: '포도당',
  중탄산: '중탄산나트륨',
  응집제: '팩(PAC)',
};

const { getSites } = require('./sitesSheetsService.cjs');

async function getReportSiteList(year, month) {
  const bq = getBigQueryClient();
  if (!bq) throw new Error('BigQuery 클라이언트 초기화 실패');

  // BigQuery 실제 운용 테이블(flow_readings, attendance, medicine_logs)에서
  // 실제 앱이 설치되어 운영 중인 현장 목록을 통합 조회 (미입력 일자/미로그인 상태 포함)
  const query = `
    SELECT DISTINCT CAST(site_id AS STRING) AS site_id, site_name
    FROM (
      SELECT CAST(site_id AS STRING) AS site_id, site_name FROM \`${DATASET_ID}.flow_readings\` WHERE site_name IS NOT NULL AND TRIM(site_name) != ''
      UNION ALL
      SELECT CAST(site_id AS STRING) AS site_id, site_name FROM \`${DATASET_ID}.attendance\` WHERE site_name IS NOT NULL AND TRIM(site_name) != ''
      UNION ALL
      SELECT CAST(site_id AS STRING) AS site_id, site_name FROM \`${DATASET_ID}.medicine_logs\` WHERE site_name IS NOT NULL AND TRIM(site_name) != ''
    )
    WHERE site_name IS NOT NULL AND TRIM(site_name) != ''
    ORDER BY site_name
  `;

  const [rows] = await bq.query({ query });
  return rows;
}

/**
 * 특정 현장의 월 데이터 조회
 * @param {number} year
 * @param {number} month
 * @param {string} siteId
 * @returns {Promise<{dailyRows: Array, medicineRows: Array, prevInventory: Object}>}
 */
async function getMonthlyReportData(year, month, siteId) {
  const bq = getBigQueryClient();
  if (!bq) throw new Error('BigQuery 클라이언트 초기화 실패');

  const startDate  = `${year}-${String(month).padStart(2, '0')}-01`;
  const nextMonth  = month === 12 ? 1 : month + 1;
  const nextYear   = month === 12 ? year + 1 : year;
  const endDate    = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;

  // 전월 말일 (이월량 계산)
  const prevMonth      = month === 1 ? 12 : month - 1;
  const prevYear       = month === 1 ? year - 1 : year;
  const prevMonthStart = `${prevYear}-${String(prevMonth).padStart(2, '0')}-01`;

  // ── 1. 일별 유량 (유입, 방류, 슬러지) ──
  const flowQuery = `
    SELECT
      date,
      type,
      calculated_flow,
      sludge_export
    FROM \`${DATASET_ID}.flow_readings\`
    WHERE site_id = @siteId
      AND date >= @startDate
      AND date < @endDate
      AND type IN ('유입유량계', '방류유량계', '슬러지')
    ORDER BY date, type
  `;

  // ── 2. 일별 약품 사용량 ──
  const medicineQuery = `
    SELECT
      date,
      medicine_name,
      usage_amount,
      purchase_amount,
      current_inventory
    FROM \`${DATASET_ID}.medicine_logs\`
    WHERE site_id = @siteId
      AND date >= @startDate
      AND date < @endDate
      AND medicine_name IN ('포도당', '중탄산나트륨', '팩(PAC)')
    ORDER BY date, medicine_name
  `;

  // ── 3. 이월량: 전월의 마지막 current_inventory ──
  const prevInventoryQuery = `
    SELECT
      medicine_name,
      current_inventory
    FROM (
      SELECT
        medicine_name,
        current_inventory,
        ROW_NUMBER() OVER (PARTITION BY medicine_name ORDER BY date DESC, uploaded_at DESC) AS rn
      FROM \`${DATASET_ID}.medicine_logs\`
      WHERE site_id = @siteId
        AND date >= @prevMonthStart
        AND date < @startDate
        AND medicine_name IN ('포도당', '중탄산나트륨', '팩(PAC)')
    )
    WHERE rn = 1
  `;

  const params = { siteId, startDate, endDate, prevMonthStart };

  const [flowRows, medicineRows, prevInvRows] = await Promise.all([
    bq.query({ query: flowQuery, params }).then(([r]) => r),
    bq.query({ query: medicineQuery, params }).then(([r]) => r),
    bq.query({ query: prevInventoryQuery, params }).then(([r]) => r),
  ]);

  // 이월량 맵 { '포도당': 값, '중탄산나트륨': 값, '팩(PAC)': 값 }
  const prevInventory = {};
  for (const row of prevInvRows) {
    prevInventory[row.medicine_name] = row.current_inventory ?? 0;
  }

  return { flowRows, medicineRows, prevInventory };
}

/**
 * 조회 결과를 Excel 바인딩에 필요한 구조로 변환
 * @param {number} year
 * @param {number} month
 * @param {string} siteName
 * @param {{flowRows, medicineRows, prevInventory}} rawData
 * @returns {{
 *   siteName: string,
 *   yearMonth: string,
 *   dailyRows: Array<{date, 유입, 방류, 슬러지, 포도당, 중탄산, 응집제}>,
 *   medicine: {
 *     포도당:  {이월, 입고, 사용},
 *     중탄산:  {이월, 입고, 사용},
 *     응집제:  {이월, 입고, 사용},
 *   }
 * }}
 */
function transformToReportData(year, month, siteName, { flowRows, medicineRows, prevInventory }) {
  const daysInMonth = new Date(year, month, 0).getDate();

  // 일별 맵 초기화
  const dailyMap = {};
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    dailyMap[dateStr] = { date: dateStr, 유입: null, 방류: null, 슬러지: null, 포도당: null, 중탄산: null, 응집제: null };
  }

  // 유량 채우기
  for (const row of flowRows) {
    const dateStr = toDateStr(row.date);
    if (!dailyMap[dateStr]) continue;
    if (row.type === '유입유량계') dailyMap[dateStr].유입 = row.calculated_flow ?? null;
    if (row.type === '방류유량계') dailyMap[dateStr].방류 = row.calculated_flow ?? null;
    if (row.type === '슬러지')    dailyMap[dateStr].슬러지 = (row.sludge_export ? row.sludge_export : row.calculated_flow) ?? null;
  }

  // 약품 채우기
  const medicineSummary = {
    포도당: { 이월: prevInventory['포도당']      ?? 0, 입고: 0, 사용: 0 },
    중탄산: { 이월: prevInventory['중탄산나트륨'] ?? 0, 입고: 0, 사용: 0 },
    응집제: { 이월: prevInventory['팩(PAC)']     ?? 0, 입고: 0, 사용: 0 },
  };

  const medicineKey = { '포도당': '포도당', '중탄산나트륨': '중탄산', '팩(PAC)': '응집제' };

  for (const row of medicineRows) {
    const dateStr = toDateStr(row.date);
    const key = medicineKey[row.medicine_name];
    if (!key) continue;

    if (dailyMap[dateStr]) {
      dailyMap[dateStr][key] = row.usage_amount ?? null;
    }

    // 월 합계
    medicineSummary[key].사용 += row.usage_amount  ?? 0;
    medicineSummary[key].입고 += row.purchase_amount ?? 0;
  }

  const dailyRows = Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date));

  return {
    siteName,
    yearMonth: `${year}년 ${month}월`,
    dailyRows,
    medicine: medicineSummary,
  };
}

/** BigQuery DATE 또는 Date 객체를 YYYY-MM-DD 문자열로 */
function toDateStr(val) {
  if (!val) return '';
  if (typeof val === 'string') return val.slice(0, 10);
  if (val instanceof Date) {
    return val.toISOString().slice(0, 10);
  }
  // BigQuery DATE 객체 { value: 'YYYY-MM-DD' }
  if (val && typeof val === 'object' && val.value) return String(val.value).slice(0, 10);
  return String(val).slice(0, 10);
}

module.exports = {
  getReportSiteList,
  getMonthlyReportData,
  transformToReportData,
  MEDICINE_NAMES,
};
