'use strict';

/**
 * attendanceQueryService.cjs
 * ─────────────────────────────────────────────────────────────────────
 * BigQuery 출결 데이터 조회 서비스
 * 중앙관리자용 - 전국 현장관리자 출결현황 조회
 */

const { getBigQueryClient, DATASET_ID } = require('./bigQueryClientService.cjs');

/**
 * 일별 출결 현황 조회
 * @param {string} date - YYYY-MM-DD 형식
 * @param {string|null} siteId - 특정 현장 ID (null이면 전국)
 * @returns {Promise<Array>}
 */
async function getDailyAttendance(date, siteId = null) {
  const bq = getBigQueryClient();
  if (!bq) throw new Error('BigQuery 클라이언트 초기화 실패');

  let query = `
    SELECT
      ANY_VALUE(t.id) AS id,
      t.site_id,
      ANY_VALUE(t.site_name) AS site_name,
      t.member_id,
      ANY_VALUE(t.member_name) AS member_name,
      t.date,
      FORMAT_TIME('%H:%M:%S', MIN(t.login_time)) AS login_time,
      FORMAT_TIME('%H:%M:%S', IF(COUNTIF(t.logout_time IS NULL) > 0, NULL, MAX(t.logout_time))) AS logout_time,
      LOGICAL_AND(COALESCE(t.location_matched, TRUE)) AS location_matched,
      LOGICAL_OR(COALESCE(t.remote_session_detected, FALSE)) AS remote_session_detected,
      MAX(t.remote_session_type) AS remote_session_type,
      MAX(t.remote_session_evidence) AS remote_session_evidence,
      LOGICAL_OR(COALESCE(t.auto_logout, FALSE) OR (t.logout_time IS NOT NULL AND EXTRACT(HOUR FROM t.logout_time) = 20 AND EXTRACT(MINUTE FROM t.logout_time) = 0)) AS auto_logout,
      MAX(t.uploaded_at) AS uploaded_at
    FROM \`${DATASET_ID}.attendance\` AS t
    WHERE t.date = @date
  `;

  const params = { date };
  if (siteId) { query += ` AND t.site_id = @siteId`; params.siteId = siteId; }
  query += ` GROUP BY t.date, t.site_id, t.member_id ORDER BY site_name, member_name`;

  const [rows] = await bq.query({ query, params });
  return rows.map(normalizeRow);
}

/**
 * 주간 출결 현황 조회
 * @param {string} startDate - YYYY-MM-DD
 * @param {string} endDate - YYYY-MM-DD
 * @param {string|null} siteId
 */
async function getWeeklyAttendance(startDate, endDate, siteId = null) {
  const bq = getBigQueryClient();
  if (!bq) throw new Error('BigQuery 클라이언트 초기화 실패');

  let query = `
    SELECT
      ANY_VALUE(t.id) AS id,
      t.site_id,
      ANY_VALUE(t.site_name) AS site_name,
      t.member_id,
      ANY_VALUE(t.member_name) AS member_name,
      t.date,
      FORMAT_TIME('%H:%M:%S', MIN(t.login_time)) AS login_time,
      FORMAT_TIME('%H:%M:%S', IF(COUNTIF(t.logout_time IS NULL) > 0, NULL, MAX(t.logout_time))) AS logout_time,
      LOGICAL_AND(COALESCE(t.location_matched, TRUE)) AS location_matched,
      LOGICAL_OR(COALESCE(t.remote_session_detected, FALSE)) AS remote_session_detected,
      MAX(t.remote_session_type) AS remote_session_type,
      MAX(t.remote_session_evidence) AS remote_session_evidence,
      LOGICAL_OR(COALESCE(t.auto_logout, FALSE) OR (t.logout_time IS NOT NULL AND EXTRACT(HOUR FROM t.logout_time) = 20 AND EXTRACT(MINUTE FROM t.logout_time) = 0)) AS auto_logout,
      MAX(t.uploaded_at) AS uploaded_at
    FROM \`${DATASET_ID}.attendance\` AS t
    WHERE t.date BETWEEN @startDate AND @endDate
  `;

  const params = { startDate, endDate };
  if (siteId) { query += ` AND t.site_id = @siteId`; params.siteId = siteId; }
  query += ` GROUP BY t.date, t.site_id, t.member_id ORDER BY t.date DESC, MIN(t.login_time) DESC`;

  const [rows] = await bq.query({ query, params });
  return rows.map(normalizeRow);
}

/**
 * 월별 출결 현황 조회
 * @param {string} yearMonth - YYYY-MM
 * @param {string|null} siteId
 */
async function getMonthlyAttendance(yearMonth, siteId = null) {
  const bq = getBigQueryClient();
  if (!bq) throw new Error('BigQuery 클라이언트 초기화 실패');

  const startDate = `${yearMonth}-01`;
  const lastDay = new Date(new Date(`${yearMonth}-01`).getFullYear(), new Date(`${yearMonth}-01`).getMonth() + 1, 0).getDate();
  const endDate = `${yearMonth}-${String(lastDay).padStart(2, '0')}`;

  let query = `
    SELECT
      ANY_VALUE(t.id) AS id,
      t.site_id,
      ANY_VALUE(t.site_name) AS site_name,
      t.member_id,
      ANY_VALUE(t.member_name) AS member_name,
      t.date,
      FORMAT_TIME('%H:%M:%S', MIN(t.login_time)) AS login_time,
      FORMAT_TIME('%H:%M:%S', IF(COUNTIF(t.logout_time IS NULL) > 0, NULL, MAX(t.logout_time))) AS logout_time,
      LOGICAL_AND(COALESCE(t.location_matched, TRUE)) AS location_matched,
      LOGICAL_OR(COALESCE(t.remote_session_detected, FALSE)) AS remote_session_detected,
      MAX(t.remote_session_type) AS remote_session_type,
      MAX(t.remote_session_evidence) AS remote_session_evidence,
      LOGICAL_OR(COALESCE(t.auto_logout, FALSE) OR (t.logout_time IS NOT NULL AND EXTRACT(HOUR FROM t.logout_time) = 20 AND EXTRACT(MINUTE FROM t.logout_time) = 0)) AS auto_logout,
      MAX(t.uploaded_at) AS uploaded_at
    FROM \`${DATASET_ID}.attendance\` AS t
    WHERE t.date BETWEEN @startDate AND @endDate
  `;

  const params = { startDate, endDate };
  if (siteId) { query += ` AND t.site_id = @siteId`; params.siteId = siteId; }
  query += ` GROUP BY t.date, t.site_id, t.member_id ORDER BY t.date DESC, MIN(t.login_time) DESC`;

  const [rows] = await bq.query({ query, params });
  return rows.map(normalizeRow);
}

/**
 * 전체 현장 목록 조회 (출결 데이터 기반)
 */
async function getSiteList() {
  const bq = getBigQueryClient();
  if (!bq) throw new Error('BigQuery 클라이언트 초기화 실패');

  const query = `
    SELECT DISTINCT
      site_id,
      site_name
    FROM \`${DATASET_ID}.attendance\`
    WHERE site_id IS NOT NULL
    ORDER BY site_name
  `;

  const [rows] = await bq.query({ query });
  return rows;
}

/**
 * 일별 출결 현황 조회 (마스터 현장 목록 100% 아우터 조인)
 * @param {string} date - YYYY-MM-DD 형식
 * @param {string|null} siteId - 특정 현장 ID (null이면 전국)
 * @returns {Promise<Array>}
 */
async function getDailyAttendanceWithMasterSites(date, siteId = null) {
  const bqRows = await getDailyAttendance(date, siteId);
  
  let masterSites = [];
  try {
    const { getSites } = require('./sitesSheetsService.cjs');
    masterSites = await getSites();
  } catch (e) {
    console.warn('[attendanceQueryService] getSites 불러오기 실패, BigQuery 데이터만 표시:', e.message);
    return bqRows;
  }

  // 활성 현장만 추리기 ('오수처리장', '양북임시휴게소' 등 시스템 현장 제외)
  const activeMasterSites = (masterSites || [])
    .filter((s) => (s.is_active === 1 || s.is_active === '1' || s.is_active === true) && s.site_name !== '오수처리장' && s.site_name !== '양북임시휴게소')
    .map((s) => ({
      id: String(s.id || s.site_id || '').trim(),
      site_name: String(s.site_name || '').trim(),
      manager_name: String(s.manager_name || '').trim(),
    }))
    .filter((s) => s.site_name !== '');

  // 특정 siteId 검색 시 마스터 현장 필터링
  const targetMasterSites = siteId && siteId !== 'all'
    ? activeMasterSites.filter((s) => s.id === String(siteId) || s.site_name === String(siteId))
    : activeMasterSites;

  // BigQuery 출결 기록 매핑
  const bqBySiteMap = new Map();
  for (const row of bqRows) {
    const keyId = String(row.site_id || '').trim();
    const keyName = String(row.site_name || '').trim();
    if (keyId) {
      if (!bqBySiteMap.has(keyId)) bqBySiteMap.set(keyId, []);
      bqBySiteMap.get(keyId).push(row);
    }
    if (keyName && keyName !== keyId) {
      if (!bqBySiteMap.has(keyName)) bqBySiteMap.set(keyName, []);
      bqBySiteMap.get(keyName).push(row);
    }
  }

  const result = [];
  const processedBqKeys = new Set();

  for (const master of targetMasterSites) {
    const matchedRows = bqBySiteMap.get(master.id) || bqBySiteMap.get(master.site_name) || [];
    if (matchedRows.length > 0) {
      for (const row of matchedRows) {
        result.push(row);
      }
      processedBqKeys.add(master.id);
      processedBqKeys.add(master.site_name);
    } else {
      // 출결 기록 없음 -> 빈칸 / 기록없음 객체 생성
      result.push({
        id: `no-rec-${master.id}-${date}`,
        site_id: master.id,
        site_name: master.site_name,
        member_id: null,
        member_name: master.manager_name || '-',
        date: date,
        login_time: null,
        logout_time: null,
        location_matched: true,
        remote_session_detected: false,
        remote_session_type: null,
        remote_session_evidence: null,
        auto_logout: false,
        status: 'no_record',
      });
    }
  }

  // 혹시 마스터 목록에는 없지만 BigQuery에 기록이 남은 현장도 추가
  for (const row of bqRows) {
    const keyId = String(row.site_id || '').trim();
    const keyName = String(row.site_name || '').trim();
    if (!processedBqKeys.has(keyId) && !processedBqKeys.has(keyName)) {
      result.push(row);
    }
  }

  // 가나다 한국어 사전순 정렬 (현장명 기준)
  return result.sort((a, b) => (a.site_name || '').localeCompare(b.site_name || '', 'ko'));
}

module.exports = {
  getDailyAttendance,
  getDailyAttendanceWithMasterSites,
  getWeeklyAttendance,
  getMonthlyAttendance,
  getSiteList,
};

/**
 * BigQuery 값 정리 - { value: '...' } 객체 평탄화
 */
function normalizeRow(row) {
  const norm = {};
  for (const [k, v] of Object.entries(row)) {
    norm[k] = (v !== null && typeof v === 'object' && 'value' in v) ? v.value : v;
  }
  return norm;
}
