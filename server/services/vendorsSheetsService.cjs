'use strict';
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../../.env.local') });
const { google } = require('googleapis');

const KEY_FILE = path.join(__dirname, '../config/google-key.json');
const SHEET_NAME = 'Wastewater_Vendors';
const HEADERS = ['vendor_id', 'company_name', 'short_name', 'category', 'contact_person', 'phone', 'notes', 'is_active'];
const auth = new google.auth.GoogleAuth({ keyFile: KEY_FILE, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
const sheets = google.sheets({ version: 'v4', auth });
const configured = () => fs.existsSync(KEY_FILE) && Boolean(process.env.GOOGLE_MEMBERS_SHEET_ID);
const sheetId = () => String(process.env.GOOGLE_MEMBERS_SHEET_ID || '').trim();
const rowToVendor = (r) => ({ vendor_id: r[0] || '', id: r[0] || '', company_name: r[1] || '', short_name: r[2] || '', category: r[3] || '기타', contact_person: r[4] || '', phone: r[5] || '', notes: r[6] || '', is_active: r[7] !== '0' });
const vendorToRow = (v) => [v.vendor_id || v.id, v.company_name, v.short_name, v.category, v.contact_person, v.phone, v.notes, v.is_active === false ? '0' : '1'].map(x => x == null ? '' : String(x));
async function ensureHeader() {
  const id = sheetId();
  const book = await sheets.spreadsheets.get({ spreadsheetId: id, fields: 'sheets.properties' });
  if (!(book.data.sheets || []).some(s => s.properties?.title === SHEET_NAME)) await sheets.spreadsheets.batchUpdate({ spreadsheetId: id, requestBody: { requests: [{ addSheet: { properties: { title: SHEET_NAME } } }] } });
  const existing = (await sheets.spreadsheets.values.get({ spreadsheetId: id, range: `${SHEET_NAME}!A1:H1` })).data.values?.[0] || [];
  if (existing[0] !== 'vendor_id') await sheets.spreadsheets.values.update({ spreadsheetId: id, range: `${SHEET_NAME}!A1`, valueInputOption: 'RAW', requestBody: { values: [HEADERS] } });
}
async function getVendors() { if (!configured()) return []; await ensureHeader(); const rows = (await sheets.spreadsheets.values.get({ spreadsheetId: sheetId(), range: `${SHEET_NAME}!A2:H` })).data.values || []; return rows.filter(r => r[0] && r[7] !== '0').map(rowToVendor); }
async function upsertVendor(vendor) { if (!configured()) throw new Error('Google Sheets가 설정되지 않았습니다.'); await ensureHeader(); const id = vendor.vendor_id || vendor.id || `vendor_${Date.now()}`; const vendorWithId = { ...vendor, vendor_id: id, id }; const col = (await sheets.spreadsheets.values.get({ spreadsheetId: sheetId(), range: `${SHEET_NAME}!A2:A` })).data.values || []; const index = col.findIndex(r => r[0] === id); if (index < 0) await sheets.spreadsheets.values.append({ spreadsheetId: sheetId(), range: `${SHEET_NAME}!A:H`, valueInputOption: 'RAW', insertDataOption: 'INSERT_ROWS', requestBody: { values: [vendorToRow(vendorWithId)] } }); else { const row = index + 2; await sheets.spreadsheets.values.update({ spreadsheetId: sheetId(), range: `${SHEET_NAME}!A${row}:H${row}`, valueInputOption: 'RAW', requestBody: { values: [vendorToRow(vendorWithId)] } }); } return vendorWithId; }
async function deleteVendor(id) { if (!configured()) throw new Error('Google Sheets가 설정되지 않았습니다.'); await ensureHeader(); const col = (await sheets.spreadsheets.values.get({ spreadsheetId: sheetId(), range: `${SHEET_NAME}!A2:A` })).data.values || []; const index = col.findIndex(r => r[0] === String(id)); if (index < 0) throw new Error('삭제할 거래처를 찾을 수 없습니다.'); await sheets.spreadsheets.values.update({ spreadsheetId: sheetId(), range: `${SHEET_NAME}!H${index + 2}`, valueInputOption: 'RAW', requestBody: { values: [['0']] } }); }
module.exports = { getVendors, upsertVendor, deleteVendor };
