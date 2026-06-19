const express = require('express');
const multer = require('multer');
const JSZip = require('jszip');
const path = require('path');
const fs = require('fs');
const { drive, getOrCreateFolder, uploadBufferToFolder, getOrCreateFolderPath, findFileInFolder } = require('../services/driveService.cjs');
const { isSheetsConfigured: isSitesSheetsConfigured, getSites: getSitesFromSheets } = require('../services/sitesSheetsService.cjs');
const { decodeUserContextHeader } = require('../utils/httpUserHeaders.cjs');
const { getBigQueryClient, DATASET_ID } = require('../services/bigQueryClientService.cjs');
const { syncCertificateCacheForSiteMonth } = require('../services/certificateCacheSyncService.cjs');

const router = express.Router();

const CERTIFICATE_ROOT_FOLDER_ID =
  String(process.env.CERTIFICATE_DRIVE_FOLDER_ID || '1Po-gd-OKlaeGyL-Ppjc6_wKgSLEM4iX4').trim();
console.log('[Certificates] Drive Folder ID:', CERTIFICATE_ROOT_FOLDER_ID.substring(0, 10) + '...');
console.log('[Certificates] Drive service:', drive ? 'available' : 'null');
const CERTIFICATE_PREFIX_RE = /^(성적서|mlss)-(\d{8})(\.[^.]+)?$/i;
const MANUAL_CERT_FILE_RE = /^(성적서|기타_성적서|mlss|ss)[_-](\d{8})[_-](.+)\.(jpg|jpeg|png|webp|pdf)$/i;
const zipUploadProgressMap = new Map();

async function hasBigQueryColumn(bq, tableName, columnName) {
  try {
    const [metadata] = await bq.dataset(DATASET_ID).table(tableName).getMetadata();
    return (metadata?.schema?.fields || []).some((field) => field.name === columnName);
  } catch (err) {
    console.warn(`[BigQuery] ${tableName}.${columnName} 컬럼 확인 실패:`, err.message);
    return false;
  }
}

function toDisplayDate(yyyymmdd) {
  if (!/^\d{8}$/.test(String(yyyymmdd || ''))) return '';
  const y = yyyymmdd.slice(0, 4);
  const m = yyyymmdd.slice(4, 6);
  const d = yyyymmdd.slice(6, 8);
  return `${y}-${m}-${d}`;
}

function parseCertMeta(fileName) {
  const normalized = String(fileName || '').trim();
  const m = normalized.match(CERTIFICATE_PREFIX_RE);
  if (!m) return null;
  const category = m[1].toLowerCase();
  const stamp = m[2];
  return {
    category,
    stamp,
    issuedAt: toDisplayDate(stamp),
    sampledAt: toDisplayDate(stamp),
  };
}

async function listFolders(parentId) {
  const res = await drive.files.list({
    q: [
      "mimeType='application/vnd.google-apps.folder'",
      `'${String(parentId)}' in parents`,
      'trashed=false',
    ].join(' and '),
    fields: 'files(id, name)',
    spaces: 'drive',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    pageSize: 200,
  });
  return res.data.files || [];
}

async function listFiles(parentId) {
  const res = await drive.files.list({
    q: [
      "mimeType!='application/vnd.google-apps.folder'",
      `'${String(parentId)}' in parents`,
      'trashed=false',
    ].join(' and '),
    fields: 'files(id, name, mimeType, modifiedTime, size)',
    spaces: 'drive',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    pageSize: 500,
  });
  return res.data.files || [];
}

function normalizeYear(value) {
  const y = String(value || '').trim();
  return /^\d{4}$/.test(y) ? y : '';
}

function normalizeMonth(value) {
  const m = String(value || '').trim();
  return /^(0[1-9]|1[0-2])$/.test(m) ? m : '';
}

async function resolveMonthFolders({ year, month }) {
  console.log('[Certificates] resolveMonthFolders input:', { year, month });
  const rootFolders = await listFolders(CERTIFICATE_ROOT_FOLDER_ID);
  console.log('[Certificates] Root folders count:', rootFolders.length, 'names:', rootFolders.map(f => f.name).join(', '));
  const certRoot = rootFolders.find((f) => String(f.name || '').trim() === '성적서');
  console.log('[Certificates] 성적서 폴더:', certRoot ? 'found' : 'not found');
  const searchRoots = [CERTIFICATE_ROOT_FOLDER_ID, certRoot?.id].filter(Boolean);
  const monthFolders = [];
  const seen = new Set();

  for (const rootId of searchRoots) {
    const yearFolders = await listFolders(rootId);
    console.log('[Certificates] Year folders in root:', yearFolders.length, 'names:', yearFolders.map(f => f.name).join(', '));
    if (!year && !month) {
      for (const yf of yearFolders) {
        const months = await listFolders(yf.id);
        for (const mf of months) {
          const key = `${yf.name}|${mf.name}|${mf.id}`;
          if (seen.has(key)) continue;
          seen.add(key);
          monthFolders.push({ year: yf.name, month: mf.name, folderId: mf.id });
        }
      }
      continue;
    }

    const yearFolder = yearFolders.find((f) => f.name === year);
    console.log('[Certificates] Looking for year folder:', year, 'found:', yearFolder ? 'yes' : 'no');
    if (!yearFolder) continue;
    const months = await listFolders(yearFolder.id);
    console.log('[Certificates] Month folders in year:', months.length, 'names:', months.map(f => f.name).join(', '));
    if (!month) {
      for (const mf of months) {
        const key = `${year}|${mf.name}|${mf.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        monthFolders.push({ year, month: mf.name, folderId: mf.id });
      }
      continue;
    }

    // 월 매칭: 0패딩 유무 관계없이 매칭 (04 ↔ 4)
    const normalizedQueryMonth = String(Number(month)); // "04" → "4"
    const monthFolder = months.find((f) => {
      const folderMonth = String(f.name || '');
      return folderMonth === month || folderMonth === normalizedQueryMonth;
    });
    if (!monthFolder) continue;
    const key = `${year}|${month}|${monthFolder.id}`;
    if (!seen.has(key)) {
      seen.add(key);
      monthFolders.push({ year, month, folderId: monthFolder.id });
    }
  }

  return monthFolders;
}

function escapeRegex(text) {
  return String(text || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeSiteNameKey(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[()\-_/]/g, '')
    .replace(/휴게소/g, '')
    .replace(/방향/g, '')
    .replace(/상행|하행/g, '');
}

function normalizeDateLike(value) {
  const raw = String(value || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  if (/^\d{8}$/.test(raw)) {
    return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
  }
  return '';
}

function normalizeBigQueryDateValue(value) {
  if (value && typeof value === 'object') {
    if (typeof value.value === 'string') {
      return normalizeDateLike(value.value);
    }
    if (typeof value.valueOf === 'function') {
      const v = value.valueOf();
      const normalized = normalizeDateLike(v);
      if (normalized) return normalized;
    }
  }
  return normalizeDateLike(value);
}

function resolveReportDate(raw = {}) {
  return normalizeDateLike(
    raw.report_date
    || raw.date
    || raw.sampled_at
    || raw?.record?.report_date
    || raw?.record?.date
    || raw?.extractedData?.record?.report_date
    || raw?.data?.report_date
  );
}

function resolveSiteNameFromRecord(raw = {}) {
  return String(
    raw.site_name
    || raw?.record?.site_name
    || raw?.extractedData?.record?.site_name
    || ''
  ).trim();
}

function pickReportDateForImageLink({ fileReportDate, parsedSiteName, normalizedSiteName, jsonRecords = [] }) {
  const fromFile = normalizeDateLike(fileReportDate);
  const targetKey = normalizeSiteNameKey(normalizedSiteName || parsedSiteName || '');
  if (!targetKey) return fromFile;

  const candidate = (jsonRecords || []).find((row) => {
    const rowSite = resolveSiteNameFromRecord(row);
    return normalizeSiteNameKey(rowSite) === targetKey;
  });
  const fromJson = candidate ? resolveReportDate(candidate) : '';
  return fromJson || fromFile;
}

function getCompactDate(yyyyMmDd) {
  const normalized = normalizeDateLike(yyyyMmDd);
  return normalized ? normalized.replace(/-/g, '') : '';
}

function normalizeForFileSegment(value) {
  return String(value || '')
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '_')
    .replace(/\s+/g, '');
}

function levenshteinDistance(a, b) {
  const aa = String(a || '');
  const bb = String(b || '');
  if (aa === bb) return 0;
  if (!aa.length) return bb.length;
  if (!bb.length) return aa.length;

  const prev = Array(bb.length + 1).fill(0);
  const curr = Array(bb.length + 1).fill(0);
  for (let j = 0; j <= bb.length; j += 1) prev[j] = j;

  for (let i = 1; i <= aa.length; i += 1) {
    curr[0] = i;
    for (let j = 1; j <= bb.length; j += 1) {
      const cost = aa[i - 1] === bb[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + cost
      );
    }
    for (let j = 0; j <= bb.length; j += 1) prev[j] = curr[j];
  }
  return prev[bb.length];
}

function stringSimilarity(a, b) {
  const aa = normalizeSiteNameKey(a);
  const bb = normalizeSiteNameKey(b);
  if (!aa || !bb) return 0;
  if (aa === bb) return 1;
  if (aa.includes(bb) || bb.includes(aa)) return 0.92;
  const dist = levenshteinDistance(aa, bb);
  const maxLen = Math.max(aa.length, bb.length, 1);
  return 1 - (dist / maxLen);
}

function buildAliasCandidates(siteName) {
  const raw = String(siteName || '').trim();
  if (!raw) return [];

  const aliases = new Set([raw]);
  aliases.add(raw.replace(/\s+/g, ''));
  aliases.add(raw.replace(/휴게소/g, '').trim());
  aliases.add(raw.replace(/방향/g, '').trim());
  aliases.add(raw.replace(/휴게소/g, '').replace(/방향/g, '').trim());
  aliases.add(raw.replace(/[()]/g, '').trim());
  aliases.add(raw.replace(/[()]/g, '').replace(/\s+/g, '').trim());

  const parenthesized = raw.match(/^(.*)\((.*)\)\s*$/);
  if (parenthesized) {
    const base = String(parenthesized[1] || '').trim();
    const dir = String(parenthesized[2] || '').trim();
    if (base && dir) {
      aliases.add(`${base}(${dir})`);
      aliases.add(`${base}${dir}`);
      aliases.add(`${base} ${dir}`);
      aliases.add(`${base}휴게소(${dir})`);
      aliases.add(`${base}휴게소${dir}`);
      aliases.add(`${base}(${dir.replace(/방향/g, '')})`);
      aliases.add(`${base}${dir.replace(/방향/g, '')}`);
    }
  }

  return Array.from(aliases)
    .map((item) => String(item || '').trim())
    .filter(Boolean);
}

async function loadSiteMaster() {
  const sheetActive = isSitesSheetsConfigured();
  if (sheetActive) {
    const sites = await getSitesFromSheets();
    const activeSites = (sites || []).filter((site) => site && site.is_active !== 0);
    if (activeSites.length > 0) {
      return activeSites.map((site) => {
        const officialName = String(site.site_name || '').trim();
        return {
          site_id: String(site.id || '').trim(),
          official_name: officialName,
          aliases: buildAliasCandidates(officialName),
          normalized_key: normalizeSiteNameKey(officialName),
        };
      }).filter((item) => item.site_id && item.official_name);
    }
  }

  return [];
}

function findBestSiteMatch(rawSiteName, siteMaster = []) {
  const raw = String(rawSiteName || '').trim();
  if (!raw || !Array.isArray(siteMaster) || siteMaster.length === 0) {
    return {
      site_id: null,
      site_name: null,
      site_name_raw: raw || null,
      site_match_confidence: null,
      manual_review_required: true,
      matched: false,
    };
  }

  let best = null;
  let bestScore = 0;
  for (const site of siteMaster) {
    const aliasPool = [site.official_name, ...(site.aliases || [])];
    for (const alias of aliasPool) {
      const score = stringSimilarity(raw, alias);
      if (score > bestScore) {
        bestScore = score;
        best = site;
      }
    }
  }

  // OCR·약칭 등 약간 어긋난 현장명도 시트 별칭과 맞추기 위해 하한을 낮춤 (업서트 폴백이 추가 안전망)
  if (!best || bestScore < 0.5) {
    return {
      site_id: null,
      site_name: raw || null,
      site_name_raw: raw || null,
      site_match_confidence: Number(bestScore.toFixed(4)),
      manual_review_required: true,
      matched: false,
    };
  }

  return {
    site_id: best.site_id,
    site_name: best.official_name,
    site_name_raw: raw,
    site_match_confidence: Number(bestScore.toFixed(4)),
    manual_review_required: bestScore < 0.8,
    matched: true,
  };
}

function resolveUserRole(req) {
  return decodeUserContextHeader(
    req.headers['x-user-role']
    || req.body?._user?.role
    || req.query?._role
    || ''
  ).trim().toLowerCase();
}

function resolveUserSiteName(req) {
  return decodeUserContextHeader(
    req.headers['x-user-site']
    || req.body?._user?.site_name1
    || req.body?._user?.site
    || req.query?._site
    || ''
  ).trim();
}

function resolveUserManagedSiteNames(req) {
  const raw = decodeUserContextHeader(
    req.headers['x-user-sites']
    || req.body?._user?.managed_sites
    || req.query?._sites
    || ''
  ).trim();
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.map((v) => String(v || '').trim()).filter(Boolean);
    }
  } catch (_) {
    // noop
  }
  return raw
    .split(',')
    .map((v) => String(v || '').trim())
    .filter(Boolean);
}

function resolveUserName(req) {
  return decodeUserContextHeader(
    req.headers['x-user-name']
    || req.body?._user?.name
    || req.query?._name
    || ''
  ).trim();
}

async function getDirectionalPairSiteNamesFromSheets(baseSiteName) {
  const raw = String(baseSiteName || '').trim();
  if (!raw) return [];
  const seeds = raw.split(',').map((v) => String(v || '').trim()).filter(Boolean);
  const out = new Set(seeds);
  const baseNames = new Set();

  for (const seed of seeds) {
    const m = seed.match(/^(.+?)\(([^)]+)\)$/);
    if (m) {
      const b = String(m[1] || '').trim();
      if (b) baseNames.add(b);
    } else {
      baseNames.add(seed);
    }
  }
  if (baseNames.size === 0 || !isSitesSheetsConfigured()) return Array.from(out);

  const rows = await getSitesFromSheets();
  for (const row of rows || []) {
    const name = String(row?.site_name || '').trim();
    if (!name) continue;
    const mm = name.match(/^(.+?)\(([^)]+)\)$/);
    if (mm) {
      const rowBase = String(mm[1] || '').trim();
      if (baseNames.has(rowBase)) {
        out.add(name);
      }
      continue;
    }
    if (baseNames.has(name)) {
      out.add(name);
    }
  }
  return Array.from(out);
}

async function getManagedSiteNamesByManagerName(userName) {
  const name = String(userName || '').trim();
  if (!name) return [];
  if (!isSitesSheetsConfigured()) return [];
  const rows = await getSitesFromSheets();
  return rows.map((r) => String(r?.site_name || '').trim()).filter(Boolean);
}

function ensureAdmin(req, res) {
  const role = resolveUserRole(req);
  if (role === 'admin' || role === 'group_admin' || role === 'central_admin' || role === 'super_admin') return true;
  res.status(403).json({ success: false, message: '관리자 권한이 필요합니다.' });
  return false;
}

function parseManualCertificateFileName(fileName) {
  const normalized = String(fileName || '').trim();
  const match = normalized.match(MANUAL_CERT_FILE_RE);
  if (!match) return null;
  return {
    prefix: String(match[1] || '').toLowerCase(),
    yyyymmdd: String(match[2] || ''),
    site_name_raw: String(match[3] || '').trim(),
    ext: String(match[4] || '').toLowerCase(),
  };
}

function parseJsonObject(text) {
  if (!text) return {};
  try {
    const parsed = JSON.parse(String(text));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_) {
    return {};
  }
}

/** JSON 본문에 들어 있을 수 있는 현장명 후보 (OCR 원문 등) */
function collectSiteNameHintsFromPayloadJson(jsonStr) {
  const p = parseJsonObject(jsonStr);
  const out = [];
  const push = (v) => {
    const s = String(v || '').trim();
    if (s) out.push(s);
  };
  push(p.site_name);
  push(p.site_name_raw);
  if (p.meta && typeof p.meta === 'object') {
    push(p.meta.site_name);
    push(p.meta.site_name_raw);
  }
  return out;
}

/** DB 행(컬럼 + payload) vs 파일명에서 온 현장 문자열 유사도 */
function rowSiteSimilarityScore(row, siteRawFromFile, officialFromMatch) {
  const needles = [];
  const r = String(siteRawFromFile || '').trim();
  const o = String(officialFromMatch || '').trim();
  if (r) needles.push(r);
  if (o && o !== r) needles.push(o);
  if (!needles.length) return 0;

  const hay = new Set();
  if (row.site_name) hay.add(String(row.site_name).trim());
  if (row.site_name_raw) hay.add(String(row.site_name_raw).trim());
  for (const s of collectSiteNameHintsFromPayloadJson(row.source_payload_json)) {
    hay.add(s);
  }

  let best = 0;
  for (const h of hay) {
    if (!h) continue;
    for (const n of needles) {
      best = Math.max(best, stringSimilarity(h, n));
      if (normalizeSiteNameKey(h) && normalizeSiteNameKey(h) === normalizeSiteNameKey(n)) {
        best = Math.max(best, 0.97);
      }
    }
  }
  return best;
}

async function upsertCertificateFileMeta({
  reportDate,
  siteId,
  siteName,
  siteNameRawFromFile,
  category,
  driveFileId,
  driveWebViewLink,
  uploadedFileName,
  originalFileName,
}) {
  const bq = getBigQueryClient();
  if (!bq) {
    throw new Error('BigQuery 연결이 필요합니다. (certificate 파일 메타 동기화)');
  }

  const rawForFuzzy = String(siteNameRawFromFile ?? siteName ?? '').trim();
  const officialForFuzzy = String(siteName ?? '').trim();
  const [metadata] = await bq.dataset(DATASET_ID).table('water_quality').getMetadata();
  const fields = new Set((metadata.schema?.fields || []).map((field) => String(field.name || '')));

  const [candidates] = await bq.query({
    query: `
      SELECT
        id,
        ${fields.has('site_id') ? 'site_id,' : 'CAST(NULL AS STRING) AS site_id,'}
        site_name,
        site_name_raw,
        ${fields.has('source_payload_json') ? 'source_payload_json' : 'CAST(NULL AS STRING) AS source_payload_json'}
      FROM \`${DATASET_ID}.water_quality\`
      WHERE report_date = @reportDate
      ORDER BY uploaded_at DESC
      LIMIT 200
    `,
    params: { reportDate },
    types: { reportDate: 'DATE' },
  });

  const rows = Array.isArray(candidates) ? candidates : [];
  if (!rows.length) return 0;

  const exact = rows.filter((r) => {
    if (siteId && String(r.site_id || '') === String(siteId)) return true;
    if (siteName && String(r.site_name || '') === String(siteName)) return true;
    return false;
  });
  let targets = exact;

  if (!targets.length) {
    const FUZZY_MIN = 0.42;
    const AMBIGUITY_GAP = 0.06;
    const SINGLE_ROW_MIN = 0.32;
    const scored = rows.map((row) => ({
      row,
      score: rowSiteSimilarityScore(row, rawForFuzzy, officialForFuzzy),
    }));
    scored.sort((a, b) => b.score - a.score);
    const top = scored[0];
    const second = scored[1];
    if (top && top.score >= FUZZY_MIN && (!second || top.score - second.score >= AMBIGUITY_GAP)) {
      targets = [top.row];
    } else if (rows.length === 1 && top && top.score >= SINGLE_ROW_MIN) {
      targets = [top.row];
    } else {
      targets = [];
    }
  }

  if (!targets.length) return 0;

  const optionalUpdates = [];
  const targetIds = targets.map((target) => String(target.id || '')).filter(Boolean);
  const params = { reportDate, targetIds };
  const types = { reportDate: 'DATE', targetIds: ['STRING'] };

  if (fields.has('certificate_category')) {
    optionalUpdates.push('certificate_category = @category');
    params.category = category || null;
    types.category = 'STRING';
  }
  if (fields.has('certificate_file_name')) {
    optionalUpdates.push('certificate_file_name = @uploadedFileName');
    params.uploadedFileName = uploadedFileName || null;
    types.uploadedFileName = 'STRING';
  }
  if (fields.has('certificate_original_file_name')) {
    optionalUpdates.push('certificate_original_file_name = @originalFileName');
    params.originalFileName = originalFileName || null;
    types.originalFileName = 'STRING';
  }
  if (fields.has('drive_file_id')) {
    optionalUpdates.push('drive_file_id = @driveFileId');
    params.driveFileId = driveFileId || null;
    types.driveFileId = 'STRING';
  }
  if (fields.has('drive_web_view_link')) {
    optionalUpdates.push('drive_web_view_link = @driveWebViewLink');
    params.driveWebViewLink = driveWebViewLink || null;
    types.driveWebViewLink = 'STRING';
  }
  if (fields.has('updated_at')) {
    optionalUpdates.push('updated_at = @updatedAt');
    params.updatedAt = new Date().toISOString();
    types.updatedAt = 'TIMESTAMP';
  }

  if (optionalUpdates.length > 0 && targetIds.length > 0) {
    try {
      await bq.query({
        query: `
          UPDATE \`${DATASET_ID}.water_quality\`
          SET ${optionalUpdates.join(', ')}
          WHERE report_date = @reportDate
            AND id IN UNNEST(@targetIds)
        `,
        params,
        types,
      });
    } catch (err) {
      if (String(err.message || '').includes('streaming buffer')) {
        console.warn('[upsertCertificateFileMeta] metadata update skipped because rows are still in streaming buffer:', err.message);
      } else {
        throw err;
      }
    }
  }

  return targets.length;
}

/**
 * 성적서 카테고리 결정 (파일명 접두어 기준)
 * generateBasename 로직과 동일하게 유지
 */
function resolveCategory(row) {
  const isNum = (v) => v != null && v !== '';
  const hasOthers = isNum(row.bod) || isNum(row.tn) || isNum(row.tp) || isNum(row.total_coliform);
  const hasMlss = isNum(row.mlss);
  const hasSsOnly = isNum(row.ss) && !hasMlss && !hasOthers;
  if (!hasOthers && hasMlss) return 'mlss';
  if (!hasOthers && !hasMlss && hasSsOnly) return 'ss';
  if (!hasOthers && !hasMlss && !hasSsOnly) return '기타_성적서';
  return '성적서';
}

/**
 * drive_file_name 생성: {category}_{YYYYMMDD}_{site_name}.jpg
 */
function buildDriveFileName(row, reportDate) {
  const category = resolveCategory(row);
  const dateCompact = (reportDate || '').replace(/-/g, '');
  const siteNorm = String(row.site_name || '').replace(/[\/\\?%*:|"<>\s]/g, '_').trim();
  return `${category}_${dateCompact}_${siteNorm}.jpg`;
}

/**
 * 행 ID 생성: UUID v4
 */
function buildRowId() {
  return require('crypto').randomUUID();
}

async function upsertCertificateRowToBigQuery(row, uniqueIndex) {
  const bq = getBigQueryClient();
  if (!bq) throw new Error('BigQuery 연결이 필요합니다.');

  const reportDate = normalizeDateLike(row.report_date || row.date || row.sampled_at);
  if (!reportDate) {
    console.log('[upsertCertificateRowToBigQuery] invalid_date:', row.report_date);
    return { inserted: false, reason: 'invalid_date', isDuplicate: false };
  }
  const nowIso = new Date().toISOString().replace('T', ' ').replace('Z', ' UTC');
  const rowId = buildRowId();
  const driveFileName = buildDriveFileName(row, reportDate);
  const category = resolveCategory(row);
  let isDuplicate = false; // 중복 여부 플래그

  console.log('[upsertCertificateRowToBigQuery] upsert:', {
    reportDate, siteName: row.site_name, category, driveFileName,
  });

  // insertRows API로 빠르게 추가 (스트리밍 방식 - DML보다 빠름)
  // 중복 방지는 조회 시 uploaded_at 기준 최신 1건 사용
  const dataset = bq.dataset(DATASET_ID);
  const table = dataset.table('water_quality');
  try {
    await table.insert([{
      id: rowId,
      uploaded_at: nowIso,
      report_date: reportDate,
      category,
      site_name: row.site_name || null,
      site_name_raw: row.site_name_raw || null,
      bod: toNullableNumber(row.bod),
      ss: toNullableNumber(row.ss),
      tn: toNullableNumber(row.tn),
      tp: toNullableNumber(row.tp),
      mlss: toNullableNumber(row.mlss),
      total_coliform: toNullableNumber(row.total_coliform),
      drive_file_name: driveFileName,
      source_pdf_name: row.source_pdf_name || null,
    }]);
  } catch (insErr) {
    console.error('[upsertCertificateRowToBigQuery] insertRows error:', insErr.message);
    // 중복 에러 체크 (BigQuery는 중복 키 에러시 특정 메시지 패턴)
    const errorMessage = insErr.message || '';
    if (errorMessage.includes('duplicate') || errorMessage.includes('already exists')) {
      isDuplicate = true;
      return { inserted: false, isDuplicate: true, reason: 'duplicate', category, driveFileName };
    }
    throw insErr;
  }

  return { inserted: true, isDuplicate, category, driveFileName };
}

function toBaseName(filePath) {
  const normalized = String(filePath || '').replace(/\\/g, '/');
  const chunks = normalized.split('/').filter(Boolean);
  return chunks[chunks.length - 1] || '';
}

/**
 * 측정항목 목록을 문자열로 변환 (예: "BOD,SS,TN,TP,총대장균군" 또는 "MLSS")
 */
function buildItemsString(row) {
  const items = [];
  if (row.bod != null) items.push('BOD');
  if (row.ss != null) items.push('SS');
  if (row.tn != null) items.push('TN');
  if (row.tp != null) items.push('TP');
  if (row.total_coliform != null) items.push('총대장균군');
  if (row.mlss != null) items.push('MLSS');
  return items.join(',');
}

/**
 * 측정결과 값들을 문자열로 변환 (예: "12.5,8.2,15.3,0.8,1200" 또는 "2850")
 */
function buildResultsString(row) {
  const results = [];
  if (row.bod != null) results.push(String(row.bod));
  if (row.ss != null) results.push(String(row.ss));
  if (row.tn != null) results.push(String(row.tn));
  if (row.tp != null) results.push(String(row.tp));
  if (row.total_coliform != null) results.push(String(row.total_coliform));
  if (row.mlss != null) results.push(String(row.mlss));
  return results.join(',');
}

function isJsonFileName(fileName) {
  return /\.json$/i.test(String(fileName || '').trim());
}

function isMasterJsonFile(fileName) {
  return String(fileName || '').trim().toLowerCase() === 'all_pages_data.json';
}

/** 페이지/래퍼 객체를 INSERT에서 바로 쓸 수 있게 record·data·extracted를 한 객체로 합침 */
function mergeRowForCertificateImport(row) {
  if (!row || typeof row !== 'object') return null;
  const base = { ...row };
  if (typeof row.extractedData === 'string') {
    try {
      const parsed = JSON.parse(row.extractedData);
      if (parsed && typeof parsed === 'object') {
        base.extractedData = parsed;
      }
    } catch (_) {
      // ignore malformed extractedData string
    }
  }
  if (typeof row.record === 'string') {
    try {
      const parsed = JSON.parse(row.record);
      if (parsed && typeof parsed === 'object') {
        base.record = parsed;
      }
    } catch (_) {
      // ignore malformed record string
    }
  }
  if (row.extractedData && typeof row.extractedData === 'object') {
    Object.assign(base, row.extractedData);
    if (row.extractedData.record && typeof row.extractedData.record === 'object') {
      Object.assign(base, row.extractedData.record);
    }
    if (row.extractedData.source && typeof row.extractedData.source === 'object') {
      if (base.source_pdf_name == null && row.extractedData.source.source_pdf_name != null) {
        base.source_pdf_name = row.extractedData.source.source_pdf_name;
      }
      if (base.source_page_index == null && row.extractedData.source.page_index != null) {
        base.source_page_index = row.extractedData.source.page_index;
      }
    }
    if (row.extractedData.meta && typeof row.extractedData.meta === 'object') {
      if (base.ai_confidence == null && row.extractedData.meta.confidence != null) {
        base.ai_confidence = row.extractedData.meta.confidence;
      }
      if (base.site_match_confidence == null && row.extractedData.meta.site_match_confidence != null) {
        base.site_match_confidence = row.extractedData.meta.site_match_confidence;
      }
      if (base.manual_review_required == null && row.extractedData.meta.manual_review_required != null) {
        base.manual_review_required = row.extractedData.meta.manual_review_required;
      }
      if (base.warnings == null && Array.isArray(row.extractedData.meta.warnings)) {
        base.warnings = row.extractedData.meta.warnings;
      }
    }
  }
  if (row.record && typeof row.record === 'object') {
    Object.assign(base, row.record);
  }
  if (row.data && typeof row.data === 'object' && !Array.isArray(row.data)) {
    Object.assign(base, row.data);
  }
  if (row.extracted && typeof row.extracted === 'object') {
    Object.assign(base, row.extracted);
  }
  if (base.source_page_index == null && base.page_index != null) {
    base.source_page_index = base.page_index;
  }
  if (base.source_pdf_name == null && base.pdf_name != null) {
    base.source_pdf_name = base.pdf_name;
  }
  return base;
}

/**
 * AI Studio batch_export 등: 최상위 배열, records[], pages[] 만 다건으로 인식했었음.
 * 단일 객체에 record만 있거나 pages[]에 페이지별 데이터가 있으면 1건만 들어가던 문제 보완.
 */
function normalizeIncomingJsonRecords(payload) {
  if (payload == null) return [];
  let incoming;
  if (Array.isArray(payload)) {
    incoming = payload;
  } else if (typeof payload === 'object') {
    if (Array.isArray(payload.records)) incoming = payload.records;
    else if (Array.isArray(payload.pages)) incoming = payload.pages;
    else if (Array.isArray(payload.data)) incoming = payload.data;
    else if (Array.isArray(payload.items)) incoming = payload.items;
    else if (Array.isArray(payload.results)) incoming = payload.results;
    else if (Array.isArray(payload.outputs)) incoming = payload.outputs;
    else if (Array.isArray(payload.predictions)) incoming = payload.predictions;
    else incoming = [payload];
  } else {
    return [];
  }
  return incoming
    .filter((row) => row && typeof row === 'object')
    .map((row) => mergeRowForCertificateImport(row))
    .filter(Boolean);
}

function isAllowedManualMedia(fileName) {
  return /\.(jpg|jpeg|png|webp|pdf)$/i.test(String(fileName || '').trim());
}

function normalizeAiImportPayload(body = {}) {
  const extracted = body.extractedData && typeof body.extractedData === 'object'
    ? body.extractedData
    : null;
  const source = body.source && typeof body.source === 'object'
    ? body.source
    : (extracted?.source || {});
  const include = typeof body.include === 'boolean'
    ? body.include
    : (typeof extracted?.include === 'boolean' ? extracted.include : true);
  const reason = String(body.reason || extracted?.reason || 'ok');
  const rawRecord = body.record && typeof body.record === 'object'
    ? body.record
    : (extracted?.record && typeof extracted.record === 'object' ? extracted.record : {});
  const meta = body.meta && typeof body.meta === 'object'
    ? body.meta
    : (extracted?.meta && typeof extracted.meta === 'object' ? extracted.meta : {});

  return {
    include,
    reason,
    source: {
      source_pdf_name: source.source_pdf_name || body.source_pdf_name || null,
      page_index: source.page_index ?? body.page_index ?? null,
    },
    record: {
      report_date: rawRecord.report_date || null,
      site_id: rawRecord.site_id || null,
      site_name: rawRecord.site_name || null,
      site_name_raw: rawRecord.site_name_raw || null,
      ss: rawRecord.ss ?? null,
      bod: rawRecord.bod ?? null,
      tn: rawRecord.tn ?? null,
      tp: rawRecord.tp ?? null,
      total_coliform: rawRecord.total_coliform ?? null,
      mlss: rawRecord.mlss ?? null,
      do: rawRecord.do ?? null,
      ph: rawRecord.ph ?? null,
    },
    meta: {
      confidence: meta.confidence ?? null,
      warnings: Array.isArray(meta.warnings) ? meta.warnings : [],
      site_match_confidence: meta.site_match_confidence ?? null,
      manual_review_required: Boolean(meta.manual_review_required),
    },
  };
}

function toNullableNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function setZipUploadProgress(taskId, patch = {}) {
  const key = String(taskId || '').trim();
  if (!key) return;
  const prev = zipUploadProgressMap.get(key) || {};
  zipUploadProgressMap.set(key, {
    ...prev,
    ...patch,
    updatedAt: Date.now(),
  });
}

module.exports = function () {
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } });

  router.get('/api/certificates/manual-upload-zip-progress', async (req, res) => {
    try {
      if (!ensureAdmin(req, res)) return;
      const taskId = String(req.query.taskId || '').trim();
      if (!taskId) {
        return res.status(400).json({ success: false, message: 'taskId가 필요합니다.' });
      }
      const progress = zipUploadProgressMap.get(taskId);
      if (!progress) {
        return res.status(404).json({ success: false, message: '진행 상태를 찾을 수 없습니다.' });
      }
      return res.json({ success: true, progress });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  });

  router.get('/api/certificates/site-normalization', async (req, res) => {
    try {
      if (!isSitesSheetsConfigured()) {
        return res.status(400).json({
          success: false,
          message: 'Google Sheets이 설정되지 않았습니다. (GOOGLE_MEMBERS_SHEET_ID)',
        });
      }

      const sites = await getSitesFromSheets();
      const activeSites = (sites || []).filter((site) => site && site.is_active !== 0);
      const siteMaster = activeSites.map((site) => {
        const officialName = String(site.site_name || '').trim();
        const aliases = buildAliasCandidates(officialName);
        return {
          site_id: String(site.id || '').trim(),
          official_name: officialName,
          aliases,
          normalized_key: normalizeSiteNameKey(officialName),
          regex: aliases.length
            ? aliases.map((alias) => escapeRegex(alias)).join('|')
            : escapeRegex(officialName),
        };
      }).filter((item) => item.site_id && item.official_name);

      const combinedRegex = siteMaster.map((item) => `(?:${item.regex})`).join('|');
      return res.json({
        success: true,
        count: siteMaster.length,
        siteMaster,
        combinedRegex,
      });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  });

  router.post('/api/certificates/import-from-ai', async (req, res) => {
    try {
      const normalized = normalizeAiImportPayload(req.body || {});
      const { include, record } = normalized;

      if (!include) {
        return res.json({
          success: true,
          accepted: false,
          skipped: true,
          reason: normalized.reason || 'excluded_by_ai',
          received: normalized,
        });
      }

      if (!record.report_date || !/^\d{4}-\d{2}-\d{2}$/.test(String(record.report_date))) {
        return res.status(400).json({
          success: false,
          message: 'report_date(YYYY-MM-DD)가 필요합니다.',
          received: normalized,
        });
      }

      if (!record.site_name && !record.site_id) {
        return res.status(400).json({
          success: false,
          message: 'site_name 또는 site_id 중 하나는 필요합니다.',
          received: normalized,
        });
      }

      const siteMaster = await loadSiteMaster();
      const aiSiteName = record.site_name ? String(record.site_name) : null;
      const matched = aiSiteName ? findBestSiteMatch(aiSiteName, siteMaster) : { site_id: null, site_name: null, site_match_confidence: null, manual_review_required: false };
      const resolvedSiteId = record.site_id ? String(record.site_id) : (matched.site_id || null);
      const resolvedSiteName = matched.site_name || aiSiteName;

      await upsertCertificateRowToBigQuery({
        site_id: resolvedSiteId,
        site_name: resolvedSiteName,
        site_name_raw: aiSiteName,
        report_date: String(record.report_date),
        ss: record.ss,
        bod: record.bod,
        tn: record.tn,
        tp: record.tp,
        total_coliform: record.total_coliform,
        mlss: record.mlss,
        do: record.do,
        ph: record.ph,
        source_pdf_name: normalized.source.source_pdf_name ? String(normalized.source.source_pdf_name) : null,
        source_page_index: normalized.source.page_index != null ? Number(normalized.source.page_index) : null,
        ai_confidence: normalized.meta.confidence,
        site_match_confidence: matched.site_match_confidence ?? normalized.meta.site_match_confidence,
        manual_review_required: (matched.manual_review_required || normalized.meta.manual_review_required) ? 1 : 0,
        warnings_json: JSON.stringify(normalized.meta.warnings || []),
        source_payload_json: JSON.stringify(req.body || {}),
      }, 0);
      return res.json({
        success: true,
        accepted: true,
        message: 'AI 추출 결과를 정상 수신/저장했습니다.',
        id: null,
        manual_review_required: matched.manual_review_required || false,
        site_name_raw: aiSiteName,
        site_name: resolvedSiteName,
        received: normalized,
      });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  });

  router.post('/api/certificates/manual-import-json', async (req, res) => {
    try {
      if (!ensureAdmin(req, res)) return;
      const siteMaster = await loadSiteMaster();
      const body = req.body;
      const incomingRecords = Array.isArray(body)
        ? body
        : (Array.isArray(body?.records) ? body.records : [body]);
      const records = incomingRecords.filter((row) => row && typeof row === 'object');
      if (records.length === 0) {
        return res.status(400).json({ success: false, message: '업로드할 JSON 레코드가 없습니다.' });
      }

      const warnings = [];
      let inserted = 0;
      for (let index = 0; index < records.length; index += 1) {
        const raw = records[index];
        const reportDate = resolveReportDate(raw);
        if (!reportDate) {
          warnings.push(`index ${index}: report_date 형식이 올바르지 않아 제외되었습니다.`);
          continue;
        }

        const matchedById = raw.site_id
          ? siteMaster.find((site) => String(site.site_id) === String(raw.site_id))
          : null;
        const matched = matchedById
          ? {
              site_id: matchedById.site_id,
              site_name: matchedById.official_name,
              site_name_raw: String(raw.site_name || raw.site_name_raw || matchedById.official_name || '').trim() || null,
              site_match_confidence: 1,
              manual_review_required: false,
            }
          : findBestSiteMatch(raw.site_name || raw.site_name_raw || '', siteMaster);
        const rowWarnings = Array.isArray(raw.warnings)
          ? raw.warnings
          : (Array.isArray(raw.meta?.warnings) ? raw.meta.warnings : []);
        const manualReview = Boolean(raw.manual_review_required || raw.meta?.manual_review_required || matched.manual_review_required);

        try {
          await upsertCertificateRowToBigQuery({
            site_id: matched.site_id ? String(matched.site_id) : null,
            site_name: matched.site_name ? String(matched.site_name) : null,
            site_name_raw: matched.site_name_raw ? String(matched.site_name_raw) : null,
            report_date: reportDate,
            ss: raw.ss,
            bod: raw.bod,
            tn: raw.tn,
            tp: raw.tp,
            total_coliform: raw.total_coliform,
            mlss: raw.mlss,
            do: raw.do,
            ph: raw.ph,
            source_pdf_name: raw.source_pdf_name ? String(raw.source_pdf_name) : null,
            source_page_index: raw.source_page_index != null ? Number(raw.source_page_index) : null,
            ai_confidence: raw.ai_confidence ?? raw.meta?.confidence ?? null,
            site_match_confidence: raw.site_match_confidence ?? raw.meta?.site_match_confidence ?? matched.site_match_confidence,
            manual_review_required: manualReview,
            warnings_json: JSON.stringify(rowWarnings),
            source_payload_json: JSON.stringify(raw),
          }, index);
          inserted += 1;
        } catch (rowErr) {
          warnings.push(`index ${index}: BigQuery 저장 실패 (${rowErr.message})`);
        }
      }

      return res.json({
        success: true,
        inserted,
        skipped: records.length - inserted,
        warnings,
      });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  });

  // 성적서 목록은 BigQuery/Drive를 단일 진실원본으로 사용한다. (로컬 SQLite 미사용)

  router.get('/api/certificates', async (req, res) => {
    try {
      const role = resolveUserRole(req);
      const requestedSiteName = String(req.query.siteName || '').trim();
      const userSiteName = resolveUserSiteName(req);
      const userName = resolveUserName(req);
      let siteNameFilters = requestedSiteName ? [requestedSiteName] : [];
      if (role === 'user') {
        const allowedFromHeader = await getDirectionalPairSiteNamesFromSheets(userSiteName);
        const allowedFromManager = await getManagedSiteNamesByManagerName(userName);
        const allowedSites = Array.from(new Set([...allowedFromHeader, ...allowedFromManager]));
        if (allowedSites.length === 0) {
          return res.status(403).json({ success: false, message: '현장 정보가 없어 성적서를 조회할 수 없습니다.' });
        }
        if (requestedSiteName && !allowedSites.includes(requestedSiteName)) {
          return res.status(403).json({ success: false, message: '타 현장 성적서는 조회할 수 없습니다.' });
        }
        siteNameFilters = requestedSiteName ? [requestedSiteName] : allowedSites;
      }
      const year = normalizeYear(req.query.year);
      const month = normalizeMonth(req.query.month);
      // 디버깅: 요청 파라미터 로깅
      console.log('[Certificates] Query params:', { year, month, requestedSiteName, siteNameFilters: siteNameFilters.length });
      const normalizedSiteFilterKeys = new Set(
        siteNameFilters.map((name) => normalizeSiteNameKey(name)).filter(Boolean)
      );
      let items = [];
      const bq = getBigQueryClient();
      console.log('[Certificates] BigQuery client:', bq ? 'initialized' : 'null');
      if (bq) {
        const where = [
          "drive_file_name IS NOT NULL",
        ];
        const params = {};
        const hasSingleSiteFilter = siteNameFilters.length === 1;
        if (hasSingleSiteFilter) {
          where.push('site_name = @siteName');
          params.siteName = siteNameFilters[0];
        }
        if (year) {
          where.push('EXTRACT(YEAR FROM report_date) = @yearNum');
          params.yearNum = Number(year);
        }
        if (month) {
          where.push('EXTRACT(MONTH FROM report_date) = @monthNum');
          params.monthNum = Number(month);
        }

        const query = `
          SELECT
            id AS local_id,
            report_date,
            site_name,
            drive_file_name AS file_name,
            category,
            CAST(NULL AS STRING) AS drive_file_id
          FROM \`${DATASET_ID}.water_quality\`
          WHERE ${where.join(' AND ')}
          ORDER BY report_date DESC
          LIMIT 1000
        `;
        console.log('[Certificates] BigQuery query:', query);
        console.log('[Certificates] BigQuery params:', params);
        let rows = [];
        try {
          [rows] = await bq.query({ query, params });
          console.log('[Certificates] BigQuery rows:', rows?.length || 0);
        // 디버깅: 첫 번째 row 데이터 확인
        if (rows?.length > 0) {
          console.log('[Certificates] First row sample:', JSON.stringify(rows[0], null, 2).substring(0, 200));
        }
        } catch (bqErr) {
          console.error('[Certificates] BigQuery query error:', bqErr.message);
          rows = [];
        }
        items = (rows || [])
          .filter((row) => {
            if (hasSingleSiteFilter || normalizedSiteFilterKeys.size === 0) return true;
            const key = normalizeSiteNameKey(row?.site_name || '');
            return key && normalizedSiteFilterKeys.has(key);
          })
          .map((row) => {
            const reportDate = normalizeBigQueryDateValue(row.report_date);
            const rawFileId = String(row.drive_file_id || '');
            const fileId = rawFileId.includes('%') ? decodeURIComponent(rawFileId) : rawFileId;
            const id = fileId || String(row.local_id || '');
            return {
              id,
              fileName: row.file_name || '',
              siteName: row.site_name || '',
              sampledAt: reportDate,
              issuedAt: reportDate,
              category: row.category || '',
              downloadUrl: fileId ? `/api/certificates/files/${encodeURIComponent(fileId)}?name=${encodeURIComponent(row.file_name || 'certificate.jpg')}` : null,
            };
          })
          .filter(Boolean); // null 제거
        console.log('[Certificates] After map items:', items.length);
      }

      // 사용자 의도: 성적서 JPG 목록은 Drive 기준으로 보여야 한다.
      if (drive && CERTIFICATE_ROOT_FOLDER_ID) {
        const folders = await resolveMonthFolders({ year, month });
        // 디버깅: Drive 폴더 탐색 결과
        console.log('[Certificates] Drive folders found:', folders?.length || 0, folders?.map(f => `${f.year}/${f.month}`).join(', ') || 'none');
        const driveItems = [];

        for (const folder of folders) {
          const files = await listFiles(folder.folderId);
          console.log(`[Certificates] Drive folder ${folder.year}/${folder.month}: ${files.length} files`);
          for (const file of files) {
            // 성적서 목록은 결과 파일만 노출 (ZIP/기타 산출물 제외)
            if (!isAllowedManualMedia(file.name)) {
              continue;
            }
            const parsed = parseManualCertificateFileName(file.name);
            let siteName = '공통';
            let reportDate = '';
            let category = '';
            if (parsed) {
              siteName = parsed.site_name_raw || '공통';
              reportDate = normalizeDateLike(parsed.yyyymmdd);
              category = parsed.prefix || '';
            } else {
              const legacy = parseCertMeta(file.name);
              if (legacy) {
                reportDate = legacy.issuedAt || '';
                category = legacy.category || '';
              }
            }

            if (normalizedSiteFilterKeys.size > 0 && parsed) {
              const fileSiteKey = normalizeSiteNameKey(parsed.site_name_raw || '');
              if (!fileSiteKey || !normalizedSiteFilterKeys.has(fileSiteKey)) {
                continue;
              }
            }
            if (normalizedSiteFilterKeys.size > 0 && !parsed) {
              const legacyKey = normalizeSiteNameKey(siteName || '');
              if (!legacyKey || !normalizedSiteFilterKeys.has(legacyKey)) {
                continue;
              }
            }
            if (requestedSiteName && !parsed && !String(siteName || '').includes(requestedSiteName)) {
              continue;
            }

            driveItems.push({
              id: file.id,
              fileName: file.name,
              siteName,
              sampledAt: reportDate,
              issuedAt: reportDate,
              category,
              year: folder.year,
              month: folder.month,
              downloadUrl: `/api/certificates/files/${encodeURIComponent(file.id)}?name=${encodeURIComponent(file.name)}`,
            });
          }
        }

        console.log(`[Certificates] driveItems: ${driveItems.length}, BigQuery items: ${items.length}`);
        const byId = new Map();
        [...driveItems, ...items].forEach((item) => {
          if (!item || !item.id) return;
          byId.set(String(item.id), item);
        });
        items = Array.from(byId.values())
          .filter((item) => isAllowedManualMedia(item.fileName || ''));
        console.log(`[Certificates] After final filter: ${items.length}`);
      }

      items.sort((a, b) => {
        if (a.issuedAt !== b.issuedAt) return String(b.issuedAt).localeCompare(String(a.issuedAt));
        return String(a.fileName).localeCompare(String(b.fileName), 'ko');
      });

      // 디버깅: 최종 반환 결과
      console.log('[Certificates] Total items returned:', items.length);
      res.json({ success: true, items });
    } catch (err) {
      console.error('[Certificates] Error:', err.message);
      res.status(500).json({ success: false, message: err.message });
    }
  });

  router.post('/api/certificates/sync-cache', async (req, res) => {
    try {
      // 디버깅: req.body 확인
      console.log('[Certificates] sync-cache req.body:', req.body);
      const role = resolveUserRole(req);
      const userSiteName = resolveUserSiteName(req);
      const userName = resolveUserName(req);
      const requestedSiteName = String(req.body?.siteName || '').trim();
      const rawYear = req.body?.year;
      const rawMonth = req.body?.month;
      const year = normalizeYear(rawYear);
      const month = normalizeMonth(rawMonth);

      console.log('[Certificates] sync-cache parsed:', { rawYear, rawMonth, year, month, hasYear: !!year, hasMonth: !!month });

      if (!year || !month) {
        return res.status(400).json({ success: false, message: 'year/month 값이 필요합니다.' });
      }

      // 중앙관리자 앱은 로컬 SQLite를 사용하지 않음 - sync-cache는 현장관리자 앱용
      // BigQuery/Drive를 직접 조회하므로 캐시 동기화 불필요
      console.log('[Certificates] sync-cache: 중앙관리자 앱은 로컬 캐시를 사용하지 않습니다.');

      return res.json({
        success: true,
        message: '중앙관리자 앱은 로컬 캐시를 사용하지 않습니다.',
        year,
        month,
        syncedCount: 0,
      });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  });

  router.get('/api/certificates/:id/download', async (req, res) => {
    // URL 인코딩된 파일 ID를 디코딩
    const rawId = String(req.params.id || '').trim();
    const id = decodeURIComponent(rawId);
    if (!id) return res.status(400).json({ success: false, message: '성적서 ID가 필요합니다.' });

    return res.json({
      success: true,
      downloadUrl: `/api/certificates/files/${encodeURIComponent(id)}`,
    });
  });

  router.get('/api/certificates/files/:id', async (req, res) => {
    try {
      // URL 인코딩된 파일 ID를 디코딩 (BigQuery에 인코딩된 상태로 저장되어 있을 수 있음)
      const rawId = String(req.params.id || '').trim();
      const id = decodeURIComponent(rawId);
      if (!id) return res.status(400).send('잘못된 요청입니다.');

      const meta = await drive.files.get({
        fileId: id,
        fields: 'id,name,mimeType,size',
        supportsAllDrives: true,
      });
      const fileName = String(req.query.name || meta.data.name || 'certificate');
      const safeFileName = fileName.replace(/["\r\n]/g, '_');

      const media = await drive.files.get(
        { fileId: id, alt: 'media', supportsAllDrives: true },
        { responseType: 'stream' }
      );

      res.setHeader('Content-Type', meta.data.mimeType || 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(safeFileName)}`);
      media.data.on('error', () => {
        if (!res.headersSent) res.status(500).end();
      });
      media.data.pipe(res);
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  router.post('/api/certificates/upload', upload.single('certificatePdf'), async (req, res) => {
    try {
      if (!drive || !CERTIFICATE_ROOT_FOLDER_ID) {
        return res.status(400).json({ success: false, message: 'Drive 설정이 필요합니다.' });
      }
      if (!req.file) {
        return res.status(400).json({ success: false, message: '업로드 파일이 없습니다.' });
      }

      const now = new Date();
      const year = String(now.getFullYear());
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const yearFolder = await getOrCreateFolder(CERTIFICATE_ROOT_FOLDER_ID, year);
      const monthFolder = await getOrCreateFolder(yearFolder.id, month);

      const uploadRes = await drive.files.create({
        resource: { name: req.file.originalname, parents: [monthFolder.id] },
        media: { mimeType: req.file.mimetype || 'application/pdf', body: require('stream').Readable.from(req.file.buffer) },
        fields: 'id,name,webViewLink',
        supportsAllDrives: true,
      });

      res.json({ success: true, item: uploadRes.data });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  router.post('/api/certificates/manual-upload-file', upload.array('files', 300), async (req, res) => {
    try {
      console.log('[manual-upload-file] headers:', req.headers['x-user-role'], req.headers['x-user-name']);
      console.log('[manual-upload-file] body._user:', req.body?._user);
      if (!ensureAdmin(req, res)) return;
      if (!drive || !CERTIFICATE_ROOT_FOLDER_ID) {
        return res.status(400).json({ success: false, message: 'Drive 설정이 필요합니다.' });
      }
      const files = Array.isArray(req.files) ? req.files : [];
      if (files.length === 0) {
        return res.status(400).json({ success: false, message: '업로드 파일이 없습니다.' });
      }

      const siteMaster = await loadSiteMaster();
      const certFolder = await getOrCreateFolder(CERTIFICATE_ROOT_FOLDER_ID, '성적서');
      const items = [];
      const errors = [];

      for (const file of files) {
        try {
          const decodedName = Buffer.from(file.originalname, 'latin1').toString('utf8');
          const parsed = parseManualCertificateFileName(decodedName);
          if (!parsed) {
            errors.push({
              file: file.originalname,
              message: '파일명 형식이 올바르지 않습니다. (성적서_yyyymmdd_현장명.jpg 또는 mlss_yyyymmdd_현장명.jpg)',
            });
            continue;
          }
          const reportDate = normalizeDateLike(parsed.yyyymmdd);
          if (!reportDate) {
            errors.push({
              file: file.originalname,
              message: '파일명 날짜(yyyymmdd)가 올바르지 않습니다.',
            });
            continue;
          }

          const year = parsed.yyyymmdd.slice(0, 4);
          const month = parsed.yyyymmdd.slice(4, 6);
          const yearFolder = await getOrCreateFolder(certFolder.id, year);
          const monthFolder = await getOrCreateFolder(yearFolder.id, month);

          const matched = findBestSiteMatch(parsed.site_name_raw, siteMaster);
          const safeSiteName = normalizeForFileSegment(matched.site_name || parsed.site_name_raw);
          const finalFileName = `${parsed.prefix}_${getCompactDate(reportDate)}_${safeSiteName}.${parsed.ext}`;
          const uploaded = await uploadBufferToFolder({
            folderId: monthFolder.id,
            fileName: finalFileName,
            buffer: file.buffer,
            mimeType: file.mimetype || 'application/octet-stream',
          });
          const linkedRows = await upsertCertificateFileMeta({
            reportDate,
            siteId: matched.site_id,
            siteName: matched.site_name || parsed.site_name_raw,
            siteNameRawFromFile: parsed.site_name_raw,
            category: parsed.prefix,
            driveFileId: uploaded.id,
            driveWebViewLink: uploaded.webViewLink || null,
            uploadedFileName: finalFileName,
            originalFileName: file.originalname,
          });

          items.push({
            original_file_name: file.originalname,
            uploaded_file_name: finalFileName,
            category: parsed.prefix,
            report_date: reportDate,
            year,
            month,
            site_id: matched.site_id,
            site_name: matched.site_name || parsed.site_name_raw,
            site_name_raw: parsed.site_name_raw,
            site_match_confidence: matched.site_match_confidence,
            manual_review_required: Boolean(matched.manual_review_required),
            drive_file_id: uploaded.id,
            drive_web_view_link: uploaded.webViewLink || null,
            linked_row_count: linkedRows,
          });
        } catch (fileErr) {
          errors.push({
            file: file.originalname,
            message: fileErr.message,
          });
        }
      }

      return res.json({
        success: true,
        uploaded_count: items.length,
        failed_count: errors.length,
        items,
        errors,
      });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  });

  router.post('/api/certificates/manual-upload-zip', upload.single('bundleZip'), async (req, res) => {
    try {
      if (!ensureAdmin(req, res)) return;
      if (!drive || !CERTIFICATE_ROOT_FOLDER_ID) {
        return res.status(400).json({ success: false, message: 'Drive 설정이 필요합니다.' });
      }
      if (!req.file) {
        return res.status(400).json({ success: false, message: 'ZIP 파일이 필요합니다. (bundleZip)' });
      }
      if (!/\.zip$/i.test(String(req.file.originalname || ''))) {
        return res.status(400).json({ success: false, message: 'zip 형식 파일만 업로드할 수 있습니다.' });
      }

      const uploadTaskId = String(req.body?.uploadTaskId || '').trim();
      setZipUploadProgress(uploadTaskId, {
        status: 'processing',
        stage: 'zip_received',
        message: '압축 파일을 해석 중입니다...',
        fileName: req.file.originalname,
      });
      console.log(`[Certificate ZIP] 처리 시작: ${req.file.originalname} (${req.file.size || 0} bytes)`);

      const siteMaster = await loadSiteMaster();
      const certFolder = await getOrCreateFolder(CERTIFICATE_ROOT_FOLDER_ID, '성적서');
      const zip = await JSZip.loadAsync(req.file.buffer);
      const entries = Object.keys(zip.files || {})
        .map((key) => zip.files[key])
        .filter((entry) => entry && !entry.dir);

      const allJsonRecords = [];
      const jsonErrors = [];
      const ignoredJsonFiles = [];
      const fileEntries = [];
      const masterJsonEntry = entries.find((entry) => isMasterJsonFile(toBaseName(entry.name))) || null;

      if (!masterJsonEntry) {
        console.warn(`[Certificate ZIP] all_pages_data.json 누락: ${req.file.originalname}`);
        return res.status(400).json({
          success: false,
          message: 'all_pages_data.json 파일이 필요합니다.',
        });
      }

      try {
        const text = await masterJsonEntry.async('text');
        const parsed = JSON.parse(text);
        const records = normalizeIncomingJsonRecords(parsed);
        allJsonRecords.push(...records);
      } catch (jsonErr) {
        jsonErrors.push({
          file: masterJsonEntry.name,
          message: `JSON 파싱 실패: ${jsonErr.message}`,
        });
      }

      for (const entry of entries) {
        const baseName = toBaseName(entry.name);
        if (isJsonFileName(baseName)) {
          if (entry.name !== masterJsonEntry.name) {
            ignoredJsonFiles.push(entry.name);
          }
          continue;
        }

        if (isAllowedManualMedia(baseName)) {
          fileEntries.push({ entry, baseName });
        }
      }

      console.log(
        `[Certificate ZIP] 파싱 완료: jsonRecords=${allJsonRecords.length}, mediaFiles=${fileEntries.length}, ignoredJson=${ignoredJsonFiles.length}`
      );
      setZipUploadProgress(uploadTaskId, {
        stage: 'parsed',
        message: `압축 해석 완료 (JSON ${allJsonRecords.length}건, 이미지 ${fileEntries.length}개)`,
        jsonTotal: allJsonRecords.length,
        fileTotal: fileEntries.length,
      });

      const importWarnings = [];
      let inserted = 0;
      for (let index = 0; index < allJsonRecords.length; index += 1) {
        const raw = allJsonRecords[index];
        const reportDate = resolveReportDate(raw);
        if (!reportDate) {
          importWarnings.push(
            `json index ${index}: report_date 형식이 올바르지 않아 제외되었습니다. `
            + `keys=${Object.keys(raw || {}).slice(0, 12).join(',')}, `
            + `recordKeys=${Object.keys(raw?.record || {}).slice(0, 12).join(',')}`
          );
          continue;
        }

        const matchedById = raw.site_id
          ? siteMaster.find((site) => String(site.site_id) === String(raw.site_id))
          : null;
        const matched = matchedById
          ? {
              site_id: matchedById.site_id,
              site_name: matchedById.official_name,
              site_name_raw: String(raw.site_name || raw.site_name_raw || matchedById.official_name || '').trim() || null,
              site_match_confidence: 1,
              manual_review_required: false,
            }
          : findBestSiteMatch(raw.site_name || raw.site_name_raw || '', siteMaster);
        const rowWarnings = Array.isArray(raw.warnings)
          ? raw.warnings
          : (Array.isArray(raw.meta?.warnings) ? raw.meta.warnings : []);
        const manualReview = Boolean(raw.manual_review_required || raw.meta?.manual_review_required || matched.manual_review_required);

        try {
          await upsertCertificateRowToBigQuery({
            site_id: matched.site_id ? String(matched.site_id) : null,
            site_name: matched.site_name ? String(matched.site_name) : null,
            site_name_raw: matched.site_name_raw ? String(matched.site_name_raw) : null,
            report_date: reportDate,
            ss: raw.ss,
            bod: raw.bod,
            tn: raw.tn,
            tp: raw.tp,
            total_coliform: raw.total_coliform,
            mlss: raw.mlss,
            do: raw.do,
            ph: raw.ph,
            source_pdf_name: raw.source_pdf_name ? String(raw.source_pdf_name) : null,
            source_page_index: raw.source_page_index != null ? Number(raw.source_page_index) : null,
            ai_confidence: raw.ai_confidence ?? raw.meta?.confidence ?? null,
            site_match_confidence: raw.site_match_confidence ?? raw.meta?.site_match_confidence ?? matched.site_match_confidence,
            manual_review_required: manualReview,
            warnings_json: JSON.stringify(rowWarnings),
            source_payload_json: JSON.stringify(raw),
          }, index);
          inserted += 1;
        } catch (rowErr) {
          importWarnings.push(`json index ${index}: BigQuery 저장 실패 (${rowErr.message})`);
        }
        setZipUploadProgress(uploadTaskId, {
          stage: 'json_processing',
          message: `JSON 처리 중... (${index + 1}/${allJsonRecords.length})`,
          jsonProcessed: index + 1,
          jsonInserted: inserted,
        });
      }

      const uploadedItems = [];
      const uploadErrors = [];
      for (const fileObj of fileEntries) {
        const originalName = fileObj.baseName;
        try {
          const parsed = parseManualCertificateFileName(originalName);
          if (!parsed) {
            uploadErrors.push({
              file: originalName,
              message: '파일명 형식이 올바르지 않습니다. (성적서_yyyymmdd_현장명.jpg 또는 mlss_yyyymmdd_현장명.jpg)',
            });
            continue;
          }
          const reportDate = normalizeDateLike(parsed.yyyymmdd);
          if (!reportDate) {
            uploadErrors.push({
              file: originalName,
              message: '파일명 날짜(yyyymmdd)가 올바르지 않습니다.',
            });
            continue;
          }

          const year = parsed.yyyymmdd.slice(0, 4);
          const month = parsed.yyyymmdd.slice(4, 6);
          const yearFolder = await getOrCreateFolder(certFolder.id, year);
          const monthFolder = await getOrCreateFolder(yearFolder.id, month);

          const matched = findBestSiteMatch(parsed.site_name_raw, siteMaster);
          const effectiveReportDate = pickReportDateForImageLink({
            fileReportDate: reportDate,
            parsedSiteName: parsed.site_name_raw,
            normalizedSiteName: matched.site_name,
            jsonRecords: allJsonRecords,
          });
          const safeSiteName = normalizeForFileSegment(matched.site_name || parsed.site_name_raw);
          const finalFileName = `${parsed.prefix}_${getCompactDate(effectiveReportDate || reportDate)}_${safeSiteName}.${parsed.ext}`;
          const fileBuffer = await fileObj.entry.async('nodebuffer');
          const uploaded = await uploadBufferToFolder({
            folderId: monthFolder.id,
            fileName: finalFileName,
            buffer: fileBuffer,
            mimeType: parsed.ext === 'pdf' ? 'application/pdf' : 'image/jpeg',
          });
          const linkedRows = await upsertCertificateFileMeta({
            reportDate: effectiveReportDate || reportDate,
            siteId: matched.site_id,
            siteName: matched.site_name || parsed.site_name_raw,
            siteNameRawFromFile: parsed.site_name_raw,
            category: parsed.prefix,
            driveFileId: uploaded.id,
            driveWebViewLink: uploaded.webViewLink || null,
            uploadedFileName: finalFileName,
            originalFileName: originalName,
          });

          uploadedItems.push({
            original_file_name: originalName,
            uploaded_file_name: finalFileName,
            category: parsed.prefix,
            report_date: effectiveReportDate || reportDate,
            year,
            month,
            site_id: matched.site_id,
            site_name: matched.site_name || parsed.site_name_raw,
            site_name_raw: parsed.site_name_raw,
            site_match_confidence: matched.site_match_confidence,
            manual_review_required: Boolean(matched.manual_review_required),
            drive_file_id: uploaded.id,
            drive_web_view_link: uploaded.webViewLink || null,
            linked_row_count: linkedRows,
          });
        } catch (fileErr) {
          uploadErrors.push({
            file: originalName,
            message: fileErr.message,
          });
        }
        setZipUploadProgress(uploadTaskId, {
          stage: 'image_uploading',
          message: `이미지 업로드 중... (${uploadedItems.length + uploadErrors.length}/${fileEntries.length})`,
          fileProcessed: uploadedItems.length + uploadErrors.length,
          fileUploaded: uploadedItems.length,
        });
      }

      setZipUploadProgress(uploadTaskId, {
        stage: 'finalizing',
        message: '저장 결과를 확인 중입니다...',
        jsonProcessed: allJsonRecords.length,
        jsonInserted: inserted,
        fileProcessed: fileEntries.length,
        fileUploaded: uploadedItems.length,
      });

      const hasProcessableJson = allJsonRecords.length > 0;
      const hasProcessableFiles = fileEntries.length > 0;
      const hardFailureReasons = [];
      if (!hasProcessableJson && !hasProcessableFiles) {
        hardFailureReasons.push('ZIP에서 처리 가능한 JSON/이미지 파일을 찾지 못했습니다. (all_pages_data.json, jpg/png/webp/pdf)');
      }
      if (hasProcessableJson && inserted === 0) {
        hardFailureReasons.push('JSON 레코드 저장이 0건입니다. warnings/errors를 확인해 주세요.');
      }
      if (hasProcessableFiles && uploadedItems.length === 0) {
        hardFailureReasons.push('이미지/파일 업로드가 0건입니다. 파일명 형식과 Drive 권한을 확인해 주세요.');
      }

      if (hardFailureReasons.length > 0) {
        if (importWarnings.length > 0) {
          console.warn(`[Certificate ZIP] JSON 경고 샘플: ${importWarnings.slice(0, 5).join(' | ')}`);
        }
        console.warn(
          `[Certificate ZIP] 처리 실패: inserted=${inserted}/${allJsonRecords.length}, uploaded=${uploadedItems.length}/${fileEntries.length}`
        );
        setZipUploadProgress(uploadTaskId, {
          status: 'failed',
          stage: 'failed',
          message: hardFailureReasons.join(' '),
          jsonInserted: inserted,
          jsonTotal: allJsonRecords.length,
          fileUploaded: uploadedItems.length,
          fileTotal: fileEntries.length,
        });
        return res.status(400).json({
          success: false,
          message: hardFailureReasons.join(' '),
          zip_file_name: req.file.originalname,
          json: {
            source: masterJsonEntry ? 'all_pages_data.json' : 'all-json-files',
            total_records: allJsonRecords.length,
            inserted,
            skipped: allJsonRecords.length - inserted,
            warnings: importWarnings,
            errors: jsonErrors,
            ignored_files: ignoredJsonFiles,
          },
          files: {
            total_files: fileEntries.length,
            uploaded_count: uploadedItems.length,
            failed_count: uploadErrors.length,
            items: uploadedItems,
            errors: uploadErrors,
          },
        });
      }

      console.log(
        `[Certificate ZIP] 처리 완료: inserted=${inserted}/${allJsonRecords.length}, uploaded=${uploadedItems.length}/${fileEntries.length}, jsonWarnings=${importWarnings.length}, jsonErrors=${jsonErrors.length}, fileErrors=${uploadErrors.length}`
      );
      if (importWarnings.length > 0) {
        console.warn(`[Certificate ZIP] JSON 경고 샘플: ${importWarnings.slice(0, 5).join(' | ')}`);
      }
      setZipUploadProgress(uploadTaskId, {
        status: 'completed',
        stage: 'completed',
        message: `처리 완료 (JSON ${inserted}/${allJsonRecords.length}, 이미지 ${uploadedItems.length}/${fileEntries.length})`,
        jsonInserted: inserted,
        jsonTotal: allJsonRecords.length,
        fileUploaded: uploadedItems.length,
        fileTotal: fileEntries.length,
      });

      return res.json({
        success: true,
        partial_success: (inserted < allJsonRecords.length) || (uploadedItems.length < fileEntries.length),
        zip_file_name: req.file.originalname,
        json: {
          source: masterJsonEntry ? 'all_pages_data.json' : 'all-json-files',
          total_records: allJsonRecords.length,
          inserted,
          skipped: allJsonRecords.length - inserted,
          warnings: importWarnings,
          errors: jsonErrors,
          ignored_files: ignoredJsonFiles,
        },
        files: {
          total_files: fileEntries.length,
          uploaded_count: uploadedItems.length,
          failed_count: uploadErrors.length,
          items: uploadedItems,
          errors: uploadErrors,
        },
      });
    } catch (err) {
      console.error(`[Certificate ZIP] 예외 발생: ${err.message}`);
      const uploadTaskId = String(req.body?.uploadTaskId || '').trim();
      setZipUploadProgress(uploadTaskId, {
        status: 'failed',
        stage: 'failed',
        message: err.message,
      });
      return res.status(500).json({ success: false, message: err.message });
    }
  });

  // ════════════════════════════════════════════════════════════════════════════
  // PDF 병합 다운로드 API - 핵심 기능 ⚠️ 수정 시 주의 ⚠️
  // 별도 모듈(server/utils/pdfMerger.cjs)로 분리되어 관리됩니다
  // 수정 필요 시 해당 모듈을 참조하세요
  // ════════════════════════════════════════════════════════════════════════════
  router.post('/api/certificates/merge-download', async (req, res) => {
    try {
      console.log('[merge-download] 요청 받음:', req.body);
      
      // form 데이터 처리 (JSON 또는 문자열)
      let fileIds = req.body?.fileIds;
      const fileName = req.body?.fileName;
      
      // fileIds가 문자열이면 JSON 파싱
      if (typeof fileIds === 'string') {
        try {
          fileIds = JSON.parse(fileIds);
        } catch (e) {
          console.log('[Certificates] fileIds 파싱 실패:', fileIds);
        }
      }
      
      if (!Array.isArray(fileIds) || fileIds.length === 0) {
        return res.status(400).json({ 
          success: false, 
          message: '병합할 파일 ID가 필요합니다.', 
          debug: { received: req.body?.fileIds } 
        });
      }

      console.log('[merge-download] pdfMerger 로드 시도...');
      // 별도 모듈에서 PDF 병합 수행
      const { mergeDriveFilesToPdf } = require('../utils/pdfMerger.cjs');
      console.log('[merge-download] pdfMerger 로드 성공, 병합 시작...');
      const result = await mergeDriveFilesToPdf(drive, fileIds, fileName);
      console.log('[merge-download] 병합 완료, 파일 크기:', result.buffer.length);

      // 바이너리로 직접 전송
      const downloadFileName = fileName || `성적서_병합_${new Date().toISOString().slice(0, 10)}.pdf`;
      
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(downloadFileName)}"`);
      res.setHeader('Content-Length', result.buffer.length);
      
      return res.send(result.buffer);
    } catch (err) {
      console.error('[merge-download] 오류:', err);
      return res.status(500).json({ success: false, message: err.message });
    }
  });

  // ════════════════════════════════════════════════════════════════════════════
  // 성적서 대량 삭제 API (년월 기준)
  // ════════════════════════════════════════════════════════════════════════════
  router.post('/api/certificates/bulk-delete-by-period', async (req, res) => {
    try {
      if (!ensureAdmin(req, res)) return;
      
      const { year, month, siteName } = req.body;
      if (!year || !month) {
        return res.status(400).json({ success: false, message: '년도와 월이 필요합니다.' });
      }

      const bq = getBigQueryClient();
      if (!bq) {
        return res.status(500).json({ success: false, message: 'BigQuery 연결 필요' });
      }

      // 1. BigQuery에서 해당 기간 데이터 조회 (drive_file_id 목록 확보)
      const [rows] = await bq.query({
        query: `
          SELECT drive_file_name
          FROM \`${DATASET_ID}.water_quality\`
          WHERE EXTRACT(YEAR FROM report_date) = @year
            AND EXTRACT(MONTH FROM report_date) = @month
            ${siteName && siteName !== 'ALL' ? "AND site_name = @siteName" : ""}
        `,
        params: { year: Number(year), month: Number(month), ...(siteName && siteName !== 'ALL' ? { siteName } : {}) },
      });

      const fileIds = rows.map(r => r.drive_file_id).filter(Boolean);
      const deletedFiles = [];
      const failedFiles = [];

      // 2. Google Drive에서 파일 삭제
      for (const fileId of fileIds) {
        try {
          await drive.files.delete({ fileId });
          deletedFiles.push(fileId);
        } catch (delErr) {
          console.warn(`[Bulk Delete] Drive 파일 삭제 실패: ${fileId}`, delErr.message);
          failedFiles.push({ fileId, error: delErr.message });
        }
      }

      // 3. BigQuery에서 메타데이터 삭제
      await bq.query({
        query: `
          DELETE FROM \`${DATASET_ID}.water_quality\`
          WHERE EXTRACT(YEAR FROM report_date) = @year
            AND EXTRACT(MONTH FROM report_date) = @month
            ${siteName && siteName !== 'ALL' ? "AND site_name = @siteName" : ""}
        `,
        params: { year: Number(year), month: Number(month), ...(siteName && siteName !== 'ALL' ? { siteName } : {}) },
      });

      return res.json({
        success: true,
        deleted: {
          driveFiles: deletedFiles.length,
          bigQueryRows: rows.length,
          fileIds: deletedFiles,
        },
        failed: failedFiles,
      });
    } catch (err) {
      console.error('[Bulk Delete by Period] 오류:', err);
      return res.status(500).json({ success: false, message: err.message });
    }
  });

  // ════════════════════════════════════════════════════════════════════════════
  // 성적서 선택 삭제 API (체크한 항목만)
  // ════════════════════════════════════════════════════════════════════════════
  router.post('/api/certificates/bulk-delete-by-ids', async (req, res) => {
    try {
      if (!ensureAdmin(req, res)) return;
      
      const { fileIds } = req.body;
      if (!Array.isArray(fileIds) || fileIds.length === 0) {
        return res.status(400).json({ success: false, message: '삭제할 파일 ID 목록이 필요합니다.' });
      }

      const bq = getBigQueryClient();
      const deletedFiles = [];
      const failedFiles = [];

      // 1. Google Drive에서 파일 삭제
      for (const fileId of fileIds) {
        try {
          await drive.files.delete({ fileId });
          deletedFiles.push(fileId);
        } catch (delErr) {
          console.warn(`[Bulk Delete] Drive 파일 삭제 실패: ${fileId}`, delErr.message);
          failedFiles.push({ fileId, error: delErr.message });
        }
      }

      // 2. BigQuery에서 메타데이터 삭제 (drive_file_id 기준)
      if (bq && deletedFiles.length > 0 && await hasBigQueryColumn(bq, 'water_quality', 'drive_file_id')) {
        const placeholders = deletedFiles.map((_, i) => `@id${i}`).join(',');
        const params = {};
        deletedFiles.forEach((id, i) => { params[`id${i}`] = id; });
        
        await bq.query({
          query: `
            DELETE FROM \`${DATASET_ID}.water_quality\`
            WHERE drive_file_id IN (${placeholders})
          `,
          params,
        });
      }

      return res.json({
        success: true,
        deleted: {
          driveFiles: deletedFiles.length,
          fileIds: deletedFiles,
        },
        failed: failedFiles,
      });
    } catch (err) {
      console.error('[Bulk Delete by IDs] 오류:', err);
      return res.status(500).json({ success: false, message: err.message });
    }
  });

  // ════════════════════════════════════════════════════════════════════════════
  // 성적서 대량 삭제 API (년월 기준)
  // ════════════════════════════════════════════════════════════════════════════
  router.post('/api/certificates/bulk-delete-by-period', async (req, res) => {
    try {
      if (!ensureAdmin(req, res)) return;
      
      const { year, month, siteName } = req.body;
      if (!year || !month) {
        return res.status(400).json({ success: false, message: '년도와 월이 필요합니다.' });
      }

      const bq = getBigQueryClient();
      if (!bq) {
        return res.status(500).json({ success: false, message: 'BigQuery 연결 필요' });
      }

      const [rows] = await bq.query({
        query: `
          SELECT drive_file_name
          FROM \`${DATASET_ID}.water_quality\`
          WHERE EXTRACT(YEAR FROM report_date) = @year
            AND EXTRACT(MONTH FROM report_date) = @month
            ${siteName && siteName !== 'ALL' ? "AND site_name = @siteName" : ""}
        `,
        params: { year: Number(year), month: Number(month), ...(siteName && siteName !== 'ALL' ? { siteName } : {}) },
      });

      const fileIds = rows.map(r => r.drive_file_id).filter(Boolean);
      const deletedFiles = [];
      const failedFiles = [];

      for (const fileId of fileIds) {
        try {
          await drive.files.delete({ fileId });
          deletedFiles.push(fileId);
        } catch (delErr) {
          console.warn(`[Bulk Delete] Drive 파일 삭제 실패: ${fileId}`, delErr.message);
          failedFiles.push({ fileId, error: delErr.message });
        }
      }

      await bq.query({
        query: `
          DELETE FROM \`${DATASET_ID}.water_quality\`
          WHERE EXTRACT(YEAR FROM report_date) = @year
            AND EXTRACT(MONTH FROM report_date) = @month
            ${siteName && siteName !== 'ALL' ? "AND site_name = @siteName" : ""}
        `,
        params: { year: Number(year), month: Number(month), ...(siteName && siteName !== 'ALL' ? { siteName } : {}) },
      });

      return res.json({
        success: true,
        deleted: { driveFiles: deletedFiles.length, bigQueryRows: rows.length, fileIds: deletedFiles },
        failed: failedFiles,
      });
    } catch (err) {
      console.error('[Bulk Delete by Period] 오류:', err);
      return res.status(500).json({ success: false, message: err.message });
    }
  });

  // ════════════════════════════════════════════════════════════════════════════
  // 성적서 선택 삭제 API (체크한 항목만)
  // ════════════════════════════════════════════════════════════════════════════
  router.post('/api/certificates/bulk-delete-by-ids', async (req, res) => {
    try {
      if (!ensureAdmin(req, res)) return;
      
      const { fileIds } = req.body;
      if (!Array.isArray(fileIds) || fileIds.length === 0) {
        return res.status(400).json({ success: false, message: '삭제할 파일 ID 목록이 필요합니다.' });
      }

      const bq = getBigQueryClient();
      const deletedFiles = [];
      const failedFiles = [];

      for (const fileId of fileIds) {
        try {
          await drive.files.delete({ fileId });
          deletedFiles.push(fileId);
        } catch (delErr) {
          console.warn(`[Bulk Delete] Drive 파일 삭제 실패: ${fileId}`, delErr.message);
          failedFiles.push({ fileId, error: delErr.message });
        }
      }

      if (bq && deletedFiles.length > 0 && await hasBigQueryColumn(bq, 'water_quality', 'drive_file_id')) {
        const placeholders = deletedFiles.map((_, i) => `@id${i}`).join(',');
        const params = {};
        deletedFiles.forEach((id, i) => { params[`id${i}`] = id; });
        
        await bq.query({
          query: `DELETE FROM \`${DATASET_ID}.water_quality\` WHERE drive_file_id IN (${placeholders})`,
          params,
        });
      }

      return res.json({
        success: true,
        deleted: { driveFiles: deletedFiles.length, fileIds: deletedFiles },
        failed: failedFiles,
      });
    } catch (err) {
      console.error('[Bulk Delete by IDs] 오류:', err);
      return res.status(500).json({ success: false, message: err.message });
    }
  });

  // ════════════════════════════════════════════════════════════════════════════
  // 성적서 단건 삭제 API (프로그레시브 삭제용)
  // ════════════════════════════════════════════════════════════════════════════
  router.post('/api/certificates/delete-one', async (req, res) => {
    try {
      if (!ensureAdmin(req, res)) return;
      
      const { fileId, index, total } = req.body;
      if (!fileId) {
        return res.status(400).json({ success: false, message: '파일 ID가 필요합니다.' });
      }

      const bq = getBigQueryClient();
      
      // 1. Google Drive에서 파일 삭제
      try {
        await drive.files.delete({ fileId });
      } catch (delErr) {
        console.warn(`[Delete One] Drive 파일 삭제 실패: ${fileId}`, delErr.message);
        return res.json({
          success: false,
          fileId,
          index,
          total,
          error: delErr.message,
        });
      }

      // 2. BigQuery에서 메타데이터 삭제
      if (bq && await hasBigQueryColumn(bq, 'water_quality', 'drive_file_id')) {
        await bq.query({
          query: `DELETE FROM \`${DATASET_ID}.water_quality\` WHERE drive_file_id = @fileId`,
          params: { fileId },
        });
      }

      return res.json({
        success: true,
        fileId,
        index,
        total,
        progress: Math.round(((index + 1) / total) * 100),
      });
    } catch (err) {
      console.error('[Delete One] 오류:', err);
      return res.status(500).json({ success: false, message: err.message });
    }
  });

  // ════════════════════════════════════════════════════════════════════════════
  // PDF 병합 다운로드 관련 로직은 server/utils/pdfMerger.cjs 모듈에서 관리됩니다
  // 이 파일(certificateRoutes.cjs)의 merge-download 핸들러만 참조합니다
  // ════════════════════════════════════════════════════════════════════════════

  // ── 수질 성적서 목록 조회 (체크박스 리스트뷰용) ──────────────────────────────
  router.get('/api/certificates/water-quality-list', async (req, res) => {
    try {
      const bq = getBigQueryClient();
      if (!bq) return res.status(500).json({ success: false, message: 'BigQuery 연결 필요' });

      const { year, month, siteName } = req.query;
      const conditions = [];
      const params = {};
      const types = {};

      if (year && month) {
        const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
        const endMonth = Number(month) === 12 ? `${Number(year) + 1}-01-01` : `${year}-${String(Number(month) + 1).padStart(2, '0')}-01`;
        conditions.push('report_date >= @startDate AND report_date < @endDate');
        params.startDate = startDate;
        params.endDate = endMonth;
        types.startDate = 'STRING';
        types.endDate = 'STRING';
      }
      if (siteName && siteName !== 'all') {
        conditions.push('site_name = @siteName');
        params.siteName = siteName;
        types.siteName = 'STRING';
      }
      const whereClause = conditions.length > 0 ? conditions.join(' AND ') : '1=1';

      // 스키마 확인하여 선택적 필드 결정
      let driveFileIdField = "CAST(NULL AS STRING) AS drive_file_id";
      let driveWebViewLinkField = "CAST(NULL AS STRING) AS drive_web_view_link";
      try {
        const [metadata] = await bq.dataset(DATASET_ID).table('water_quality').getMetadata();
        const fields = new Set((metadata.schema?.fields || []).map((field) => String(field.name || '')));
        if (fields.has('drive_file_id')) driveFileIdField = 'drive_file_id';
        if (fields.has('drive_web_view_link')) driveWebViewLinkField = 'drive_web_view_link';
      } catch (schemaErr) {
        console.warn('[water-quality-list] 스키마 확인 실패 (무시):', schemaErr.message);
      }

      const [rows] = await bq.query({
        query: `
          SELECT id, uploaded_at, report_date, category, site_name, drive_file_name, source_pdf_name,
                 ${driveFileIdField}, ${driveWebViewLinkField}
          FROM (
            SELECT *,
              ROW_NUMBER() OVER (PARTITION BY report_date, site_name ORDER BY uploaded_at DESC) AS rn
            FROM \`${DATASET_ID}.water_quality\`
            WHERE ${whereClause}
          )
          WHERE rn = 1
          ORDER BY report_date DESC, site_name
        `,
        params,
        types,
      });

      return res.json({ success: true, rows });
    } catch (err) {
      console.error('[water-quality-list]', err.message);
      return res.status(500).json({ success: false, message: err.message });
    }
  });

  // ── 수질 성적서 삭제 (id 배열) ─────────────────────────────────────────────
  router.delete('/api/certificates/water-quality-rows', async (req, res) => {
    try {
      if (!ensureAdmin(req, res)) return;
      const { ids } = req.body || {};
      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ success: false, message: 'ids 배열이 필요합니다.' });
      }
      const bq = getBigQueryClient();
      if (!bq) return res.status(500).json({ success: false, message: 'BigQuery 연결 필요' });

      const placeholders = ids.map((_, i) => `@id${i}`).join(', ');
      const params = Object.fromEntries(ids.map((id, i) => [`id${i}`, id]));
      const types = Object.fromEntries(ids.map((_, i) => [`id${i}`, 'STRING']));

      await bq.query({
        query: `DELETE FROM \`${DATASET_ID}.water_quality\` WHERE id IN (${placeholders})`,
        params,
        types,
      });

      return res.json({ success: true, deleted: ids.length });
    } catch (err) {
      console.error('[water-quality-delete]', err.message);
      if (err.message?.includes('streaming buffer')) {
        return res.status(409).json({
          success: false,
          streamingBuffer: true,
          message: '최근 업로드된 데이터는 잠시 후 삭제 가능합니다. (BigQuery 스트리밍 버퍼 대기 중)',
        });
      }
      return res.status(500).json({ success: false, message: err.message });
    }
  });

  // ── 수질 성적서 PDF 다운로드 (drive_file_name 기준 이미지 → PDF 병합) ──────
  router.post('/api/certificates/water-quality-download-pdf', async (req, res) => {
    try {
      if (!ensureAdmin(req, res)) return;
      const { drive_file_names, pdf_file_name } = req.body || {};
      if (!Array.isArray(drive_file_names) || drive_file_names.length === 0) {
        return res.status(400).json({ success: false, message: 'drive_file_names 배열이 필요합니다.' });
      }
      if (!drive || !CERTIFICATE_ROOT_FOLDER_ID) {
        return res.status(400).json({ success: false, message: 'Drive 설정이 필요합니다.' });
      }

      const { mergeDriveFilesToPdf } = require('../utils/pdfMerger.cjs');
      const { findFileInFolder, getOrCreateFolderPath } = require('../services/driveService.cjs');

      // 파일명으로 Drive 파일 ID 조회 (폴더 구조: 성적서/{year}/{month}/{fileName})
      const fileIds = [];
      const notFound = [];

      for (const fileName of drive_file_names) {
        const parts = fileName.replace(/\.[^.]+$/, '').split('_');
        const dateSegment = parts[1] || '';
        const year = dateSegment.slice(0, 4);
        const month = dateSegment.slice(4, 6);

        console.log('[water-quality-download-pdf] 파일 탐색:', { fileName, year, month });

        try {
          const folder = await getOrCreateFolderPath(CERTIFICATE_ROOT_FOLDER_ID, ['성적서', year, month]);
          const found = await findFileInFolder(folder.id, fileName);
          console.log('[water-quality-download-pdf] 탐색 결과:', { fileName, found: found?.id || null });
          if (found) {
            fileIds.push(found.id);
          } else {
            notFound.push(fileName);
          }
        } catch (e) {
          console.error('[water-quality-download-pdf] 폴더 탐색 실패:', { fileName, err: e.message });
          notFound.push(fileName);
        }
      }

      if (fileIds.length === 0) {
        return res.status(404).json({ success: false, message: 'Drive에서 파일을 찾을 수 없습니다.', notFound });
      }

      const pdfName = pdf_file_name || (drive_file_names.length === 1
        ? drive_file_names[0].replace(/\.[^.]+$/, '') + '.pdf'
        : `성적서_${drive_file_names.length}건.pdf`);

      const pdfResult = await mergeDriveFilesToPdf(drive, fileIds, pdfName);
      const pdfBuffer = Buffer.isBuffer(pdfResult) ? pdfResult : Buffer.from(pdfResult.buffer);

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(pdfName)}`);
      res.setHeader('Content-Length', pdfBuffer.length);
      if (notFound.length > 0) {
        res.setHeader('X-Not-Found-Files', JSON.stringify(notFound));
      }
      return res.end(pdfBuffer);
    } catch (err) {
      console.error('[water-quality-download-pdf]', err.message);
      return res.status(500).json({ success: false, message: err.message });
    }
  });

  // ── 수질 성적서 이미지 개별 다운로드 (drive_file_name 기준) ───────────────────
  router.post('/api/certificates/water-quality-download-image', async (req, res) => {
    try {
      if (!ensureAdmin(req, res)) return;
      const { drive_file_name } = req.body || {};
      if (!drive_file_name) {
        return res.status(400).json({ success: false, message: 'drive_file_name이 필요합니다.' });
      }
      if (!drive || !CERTIFICATE_ROOT_FOLDER_ID) {
        return res.status(400).json({ success: false, message: 'Drive 설정이 필요합니다.' });
      }

      // 파일명에서 년도/월 추출 (예: mlss_20260210_xxx.jpg → 2026, 02)
      const parts = drive_file_name.replace(/\.[^.]+$/, '').split('_');
      const dateSegment = parts[1] || '';
      const year = dateSegment.slice(0, 4);
      const month = dateSegment.slice(4, 6);

      console.log('[water-quality-download-image] 파일 검색:', { drive_file_name, year, month });

      // 성적서/년/월 폴더 경로로 파일 검색
      const folder = await getOrCreateFolderPath(CERTIFICATE_ROOT_FOLDER_ID, ['성적서', year, month]);
      const file = await findFileInFolder(folder.id, drive_file_name);

      if (!file) {
        console.warn('[water-quality-download-image] 파일을 찾을 수 없음:', drive_file_name);
        return res.status(404).json({ success: false, message: 'Drive에서 파일을 찾을 수 없습니다.' });
      }

      console.log('[water-quality-download-image] 파일 찾음:', file.id);

      // 이미지 다운로드
      const imageRes = await drive.files.get({
        fileId: file.id,
        alt: 'media',
      }, { responseType: 'arraybuffer' });

      const buffer = Buffer.from(imageRes.data);
      const ext = drive_file_name.toLowerCase().endsWith('.png') ? 'png' : 'jpeg';

      res.set('Content-Type', `image/${ext}`);
      // 한글/특수문자 파일명을 RFC5987 형식으로 인코딩
      const encodedFileName = encodeURIComponent(drive_file_name).replace(/['()]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
      res.set('Content-Disposition', `attachment; filename*=UTF-8''${encodedFileName}`);
      return res.send(buffer);
    } catch (err) {
      console.error('[water-quality-download-image] 에러 상세:', err);
      console.error('[water-quality-download-image] 스택:', err.stack);
      return res.status(500).json({ success: false, message: err.message, stack: err.stack });
    }
  });

  return router;
};
