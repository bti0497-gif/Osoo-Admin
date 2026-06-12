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
      id, site_id, site_name, member_id, member_name, date,
      FORMAT_TIME('%H:%M:%S', login_time) AS login_time,
      FORMAT_TIME('%H:%M:%S', logout_time) AS logout_time,
      location_matched, remote_session_detected,
      remote_session_type, remote_session_evidence,
      auto_logout, uploaded_at
    FROM \`${DATASET_ID}.attendance\`
    WHERE date = @date
  `;

  const params = { date };
  if (siteId) { query += ` AND site_id = @siteId`; params.siteId = siteId; }
  query += ` ORDER BY site_name, member_name`;

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
      id, site_id, site_name, member_id, member_name, date,
      FORMAT_TIME('%H:%M:%S', login_time) AS login_time,
      FORMAT_TIME('%H:%M:%S', logout_time) AS logout_time,
      location_matched, remote_session_detected,
      remote_session_type, remote_session_evidence,
      auto_logout, uploaded_at
    FROM \`${DATASET_ID}.attendance\`
    WHERE date BETWEEN @startDate AND @endDate
  `;

  const params = { startDate, endDate };
  if (siteId) { query += ` AND site_id = @siteId`; params.siteId = siteId; }
  query += ` ORDER BY date DESC, login_time DESC`;

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
      id, site_id, site_name, member_id, member_name, date,
      FORMAT_TIME('%H:%M:%S', login_time) AS login_time,
      FORMAT_TIME('%H:%M:%S', logout_time) AS logout_time,
      location_matched, remote_session_detected,
      remote_session_type, remote_session_evidence,
      auto_logout, uploaded_at
    FROM \`${DATASET_ID}.attendance\`
    WHERE date BETWEEN @startDate AND @endDate
  `;

  const params = { startDate, endDate };
  if (siteId) { query += ` AND site_id = @siteId`; params.siteId = siteId; }
  query += ` ORDER BY date DESC, login_time DESC`;

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
