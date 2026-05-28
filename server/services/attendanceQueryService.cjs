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
      id,
      site_id,
      site_name,
      member_id,
      member_name,
      date,
      login_time,
      logout_time,
      location_matched,
      remote_session_detected,
      auto_logout
    FROM \`${DATASET_ID}.attendance\`
    WHERE date = @date
  `;

  const params = { date };

  if (siteId) {
    query += ` AND site_id = @siteId`;
    params.siteId = siteId;
  }

  query += ` ORDER BY site_name, member_name`;

  const [rows] = await bq.query({
    query,
    params,
  });

  // TIMESTAMP 객체를 ISO 문자열로 변환
  return rows.map((row) => ({
    ...row,
    login_time: row.login_time ? new Date(row.login_time).toISOString() : null,
    logout_time: row.logout_time ? new Date(row.logout_time).toISOString() : null,
  }));
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
      site_id,
      site_name,
      member_id,
      member_name,
      date,
      login_time,
      logout_time,
      location_matched,
      remote_session_detected
    FROM \`${DATASET_ID}.attendance\`
    WHERE date BETWEEN @startDate AND @endDate
  `;

  const params = { startDate, endDate };

  if (siteId) {
    query += ` AND site_id = @siteId`;
    params.siteId = siteId;
  }

  query += ` ORDER BY date, site_name, member_name`;

  const [rows] = await bq.query({ query, params });
  // TIMESTAMP 객체를 ISO 문자열로 변환
  return rows.map((row) => ({
    ...row,
    login_time: row.login_time ? new Date(row.login_time).toISOString() : null,
    logout_time: row.logout_time ? new Date(row.logout_time).toISOString() : null,
  }));
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
  const endDate = `${yearMonth}-31`;

  let query = `
    SELECT 
      site_id,
      site_name,
      member_id,
      member_name,
      date,
      login_time,
      logout_time,
      location_matched,
      remote_session_detected
    FROM \`${DATASET_ID}.attendance\`
    WHERE date BETWEEN @startDate AND @endDate
  `;

  const params = { startDate, endDate };

  if (siteId) {
    query += ` AND site_id = @siteId`;
    params.siteId = siteId;
  }

  query += ` ORDER BY date, site_name, member_name`;

  const [rows] = await bq.query({ query, params });
  // TIMESTAMP 객체를 ISO 문자열로 변환
  return rows.map((row) => ({
    ...row,
    login_time: row.login_time ? new Date(row.login_time).toISOString() : null,
    logout_time: row.logout_time ? new Date(row.logout_time).toISOString() : null,
  }));
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
