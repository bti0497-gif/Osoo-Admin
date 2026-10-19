'use strict';

/**
 * centralManagersSheetsService.cjs
 * ─────────────────────────────────────────────────────────────────────
 * 구글 스프레드시트 중앙관리자별 담당 현장 매핑 서비스
 *
 * 시트명: Wastewater_Central_Managers
 * 1행 헤더:
 *   A: id | B: name | C: role | D: site_1 | E: site_2 | ... | R: site_15 (이후 열 자유 확장 가능)
 *
 * - 최고관리자(admin)는 전체 현장을 관장하며,
 * - 중앙관리자(group_admin / central_admin / 중앙관리자)는 D열(site_1)부터 오른쪽 끝까지
 *   입력된 현장명(또는 site_id) 목록을 담당 현장(managed_sites)으로 부여받는다.
 */

const path = require('path');
const fs = require('fs');
const { google } = require('googleapis');
require('dotenv').config({ path: path.join(__dirname, '../../.env.local') });

const KEY_FILE = path.join(__dirname, '../config/google-key.json');
const SHEET_NAME = 'Wastewater_Central_Managers';
const DEFAULT_SITE_COLUMN_COUNT = 15;
const BASE_HEADERS = ['id', 'name', 'role'];
const SITE_HEADERS = Array.from({ length: DEFAULT_SITE_COLUMN_COUNT }, (_, idx) => `site_${idx + 1}`);
const HEADER_ROW = [...BASE_HEADERS, ...SITE_HEADERS];

const auth = new google.auth.GoogleAuth({
  keyFile: KEY_FILE,
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

const sheets = google.sheets({ version: 'v4', auth });

function getSheetId() {
  const id = String(process.env.GOOGLE_MEMBERS_SHEET_ID || '').trim();
  if (!id) throw new Error('GOOGLE_MEMBERS_SHEET_ID 환경변수가 설정되지 않았습니다.');
  return id;
}

function isSheetsConfigured() {
  return Boolean(fs.existsSync(KEY_FILE) && String(process.env.GOOGLE_MEMBERS_SHEET_ID || '').trim());
}

function normalizeRole(rawRole, rawName = '') {
  const name = String(rawName || '').trim().toLowerCase();
  const role = String(rawRole || '').trim();
  const lower = role.toLowerCase();
  if (name === 'admin' || lower === 'admin' || lower === 'super_admin' || role === '최고관리자') {
    return 'admin';
  }
  if (lower === 'group_admin' || lower === 'central_admin' || role === '중앙관리자') {
    return 'group_admin';
  }
  return role || 'user';
}

/**
 * 시트 탭(Wastewater_Central_Managers) 및 1행 칼럼 헤더 보장
 */
async function ensureCentralManagersSheet() {
  if (!isSheetsConfigured()) {
    throw new Error('Google Sheets가 설정되지 않았습니다.');
  }
  const spreadsheetId = getSheetId();
  const workbook = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: 'sheets.properties',
  });

  const existingSheet = (workbook.data.sheets || []).find(
    (s) => s.properties?.title === SHEET_NAME
  );

  if (!existingSheet) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            addSheet: {
              properties: {
                title: SHEET_NAME,
                gridProperties: {
                  rowCount: 100,
                  columnCount: Math.max(26, HEADER_ROW.length + 5),
                  frozenRowCount: 1,
                },
              },
            },
          },
        ],
      },
    });
  }

  const headerRes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${SHEET_NAME}!1:1`,
  });
  const currentHeader = (headerRes.data.values || [])[0] || [];

  // 헤더가 비어있거나 기본 3열(id, name, role)이 맞지 않으면 헤더 작성
  if (
    currentHeader[0] !== 'id' ||
    currentHeader[1] !== 'name' ||
    currentHeader[2] !== 'role' ||
    currentHeader.length < HEADER_ROW.length
  ) {
    const mergedHeader = [...HEADER_ROW];
    for (let i = HEADER_ROW.length; i < currentHeader.length; i++) {
      mergedHeader[i] = currentHeader[i] || `site_${i - BASE_HEADERS.length + 1}`;
    }
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${SHEET_NAME}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [mergedHeader] },
    });
  }
}

/**
 * 시트의 행을 파싱하여 중앙관리자별 담당 현장 배열 반환
 * D열(index 3)부터 끝까지 비어있지 않은 모든 셀 값을 담당 현장으로 수집
 */
function rowToCentralManager(row = []) {
  const id = String(row[0] || '').trim();
  const name = String(row[1] || '').trim();
  const role = normalizeRole(row[2], name);
  const assignedSites = row
    .slice(3)
    .map((cell) => String(cell || '').trim())
    .filter(Boolean);

  return {
    id,
    name,
    role,
    assignedSites,
  };
}

/**
 * 전체 중앙관리자 담당 현장 매핑 조회
 */
async function getCentralManagers() {
  if (!isSheetsConfigured()) return [];
  await ensureCentralManagersSheet();
  const spreadsheetId = getSheetId();

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${SHEET_NAME}!A2:AZ`,
  });

  const rows = res.data.values || [];
  return rows
    .filter((row) => String(row[0] || '').trim() || String(row[1] || '').trim())
    .map(rowToCentralManager);
}

/**
 * Wastewater_Member 시트에 등록된 관리자(admin, group_admin, 중앙관리자) 계정을
 * Wastewater_Central_Managers 시트에 기본 행으로 동기화 (이미 있는 행의 담당 현장은 그대로 보존)
 */
async function syncCentralManagerRowsFromMembers(members = []) {
  await ensureCentralManagersSheet();
  const existing = await getCentralManagers();
  const existingByName = new Set(existing.map((m) => m.name));
  const existingById = new Set(existing.map((m) => m.id).filter(Boolean));

  const adminMembers = (Array.isArray(members) ? members : []).filter((m) => {
    const normRole = normalizeRole(m.role, m.name);
    return normRole === 'admin' || normRole === 'group_admin';
  });

  const newRows = [];
  for (const m of adminMembers) {
    const id = String(m.id || '').trim();
    const name = String(m.name || '').trim();
    if (!name) continue;
    if ((id && existingById.has(id)) || existingByName.has(name)) continue;

    const normRole = normalizeRole(m.role, name);
    newRows.push([id, name, normRole]);
  }

  if (newRows.length > 0) {
    const spreadsheetId = getSheetId();
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${SHEET_NAME}!A:C`,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: newRows },
    });
  }

  return getCentralManagers();
}

/**
 * 특정 관리자의 담당 현장 목록 조회 (admin인 경우 ['*'] 반환)
 */
async function getAssignedSitesForManager(userId, userName) {
  const normId = String(userId || '').trim().toLowerCase();
  const normName = String(userName || '').trim().toLowerCase();

  if (normId === 'admin' || normName === 'admin') {
    return ['*'];
  }

  try {
    const managers = await getCentralManagers();
    const found = managers.find(
      (m) =>
        (m.id && String(m.id).trim().toLowerCase() === normId) ||
        (m.name && String(m.name).trim().toLowerCase() === normName)
    );

    if (!found) {
      return [];
    }

    if (found.role === 'admin') {
      return ['*'];
    }

    return Array.isArray(found.assignedSites) ? found.assignedSites : [];
  } catch (err) {
    console.warn('[centralManagersSheetsService] getAssignedSitesForManager 오류:', err.message);
    return [];
  }
}

module.exports = {
  SHEET_NAME,
  HEADER_ROW,
  normalizeRole,
  isSheetsConfigured,
  ensureCentralManagersSheet,
  getCentralManagers,
  syncCentralManagerRowsFromMembers,
  getAssignedSitesForManager,
};
