'use strict';

const path = require('path');
const fs = require('fs');
const { google } = require('googleapis');
require('dotenv').config({ path: path.join(__dirname, '../../.env.local') });

const KEY_FILE = path.join(__dirname, '../config/google-key.json');
const SHEET_NAME = 'Wastewater_Site_Settlement_Vendors';
const HEADERS = ['site_id', 'site_name', 'sludge_vendor_id_1', 'sludge_vendor_id_2', 'medicine_vendor_id', 'water_vendor_id', 'kit_vendor_id'];
const configured = () => fs.existsSync(KEY_FILE) && Boolean(String(process.env.GOOGLE_MEMBERS_SHEET_ID || '').trim());
const sheets = google.sheets({
  version: 'v4',
  auth: new google.auth.GoogleAuth({ keyFile: KEY_FILE, scopes: ['https://www.googleapis.com/auth/spreadsheets'] }),
});

async function ensureSheet() {
  if (!configured()) throw new Error('Google Sheets 설정을 찾을 수 없습니다.');
  const spreadsheetId = String(process.env.GOOGLE_MEMBERS_SHEET_ID).trim();
  const workbook = await sheets.spreadsheets.get({ spreadsheetId, fields: 'sheets.properties' });
  const hasSheet = (workbook.data.sheets || []).some((sheet) => sheet.properties?.title === SHEET_NAME);
  if (!hasSheet) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: [{ addSheet: { properties: { title: SHEET_NAME } } }] },
    });
  }
  const header = (await sheets.spreadsheets.values.get({ spreadsheetId, range: `${SHEET_NAME}!A1:G1` })).data.values?.[0] || [];
  if (header.join('|') !== HEADERS.join('|')) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${SHEET_NAME}!A1:G1`,
      valueInputOption: 'RAW',
      requestBody: { values: [HEADERS] },
    });
  }
}

function rowToMapping(row) {
  return {
    site_id: row[0] || '',
    site_name: row[1] || '',
    sludge_vendor_id_1: row[2] || '',
    sludge_vendor_id_2: row[3] || '',
    medicine_vendor_id: row[4] || '',
    water_vendor_id: row[5] || '',
    kit_vendor_id: row[6] || '',
  };
}

async function getSiteSettlementVendors() {
  await ensureSheet();
  const spreadsheetId = String(process.env.GOOGLE_MEMBERS_SHEET_ID).trim();
  const rows = (await sheets.spreadsheets.values.get({ spreadsheetId, range: `${SHEET_NAME}!A2:G` })).data.values || [];
  return rows.filter((row) => row[0]).map(rowToMapping);
}

async function seedSiteSettlementVendors(sites) {
  await ensureSheet();
  const existing = await getSiteSettlementVendors();
  const knownSiteIds = new Set(existing.map((mapping) => mapping.site_id));
  const newRows = (Array.isArray(sites) ? sites : [])
    .map((site) => ({ site_id: String(site.site_id || site.id || '').trim(), site_name: String(site.site_name || '').trim() }))
    .filter((site) => site.site_id && site.site_name && !knownSiteIds.has(site.site_id))
    .map((site) => [site.site_id, site.site_name, '', '', '', '', '']);
  if (newRows.length) {
    await sheets.spreadsheets.values.append({
      spreadsheetId: String(process.env.GOOGLE_MEMBERS_SHEET_ID).trim(),
      range: `${SHEET_NAME}!A:G`,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: newRows },
    });
  }
  return getSiteSettlementVendors();
}

async function upsertSiteSettlementVendors(mapping) {
  await ensureSheet();
  const siteId = String(mapping?.site_id || '').trim();
  const siteName = String(mapping?.site_name || '').trim();
  if (!siteId || !siteName) throw new Error('현장 정보가 필요합니다.');
  const spreadsheetId = String(process.env.GOOGLE_MEMBERS_SHEET_ID).trim();
  const columns = (await sheets.spreadsheets.values.get({ spreadsheetId, range: `${SHEET_NAME}!A2:A` })).data.values || [];
  const row = [siteId, siteName, mapping.sludge_vendor_id_1 || '', mapping.sludge_vendor_id_2 || '', mapping.medicine_vendor_id || '', mapping.water_vendor_id || '', mapping.kit_vendor_id || ''];
  const index = columns.findIndex((value) => value[0] === siteId);
  if (index < 0) {
    await sheets.spreadsheets.values.append({ spreadsheetId, range: `${SHEET_NAME}!A:G`, valueInputOption: 'RAW', insertDataOption: 'INSERT_ROWS', requestBody: { values: [row] } });
  } else {
    await sheets.spreadsheets.values.update({ spreadsheetId, range: `${SHEET_NAME}!A${index + 2}:G${index + 2}`, valueInputOption: 'RAW', requestBody: { values: [row] } });
  }
  return rowToMapping(row);
}

module.exports = { getSiteSettlementVendors, seedSiteSettlementVendors, upsertSiteSettlementVendors };
