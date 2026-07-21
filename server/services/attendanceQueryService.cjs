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

module.exports = {
  getDailyAttendance,
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
