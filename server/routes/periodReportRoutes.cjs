'use strict';

/**
 * periodReportRoutes.cjs
 * ─────────────────────────────────────────────────────────
 * POST /api/gyeonggi/period-report/export
 *   body: { startDate, endDate, siteNames: [...] }
 *
 * - 양식 파일: templates/gyeonggi/기간 데이타 조회.xlsx
 * - 현장마다 시트 복제 + Named Range 기반 바인딩
 * - 연도 걸침 → 연도별 2개 파일 → ZIP 응답
 */

const express = require('express');
const path    = require('path');
const fs      = require('fs');
const JSZip   = require('jszip');

const { getFlowData, getWaterQualityData } = require('../services/periodReportService.cjs');
const { decodeUserContextHeader } = require('../utils/httpUserHeaders.cjs');

const router = express.Router();

const TEMPLATES_DIR = path.join(__dirname, '..', '..', 'templates', 'gyeonggi');
const TEMPLATE_NAME = '기간 데이타 조회.xlsx';

function resolveUserRole(req) {
  return decodeUserContextHeader(
    req.headers['x-user-role']
    || req.body?._user?.role
    || req.query?._role
    || ''
  ).trim().toLowerCase();
}

function ensureAdmin(req, res) {
  const role = resolveUserRole(req);
  if (role === 'admin' || role === 'group_admin' || role === 'central_admin' || role === 'super_admin') return true;
  res.status(403).json({ success: false, message: '관리자 권한이 필요합니다.' });
  return false;
}

// ── API 엔드포인트 ──────────────────────────────────────────────────

router.post('/api/gyeonggi/period-report/export', async (req, res) => {
  const { startDate, endDate, siteNames } = req.body || {};

  if (!ensureAdmin(req, res)) return;

  if (!startDate || !endDate || !Array.isArray(siteNames) || siteNames.length === 0) {
    return res.status(400).json({ success: false, message: 'startDate, endDate, siteNames 필요' });
  }

  if (!isValidIsoDate(startDate) || !isValidIsoDate(endDate)) {
    return res.status(400).json({ success: false, message: '조회 기간은 YYYY-MM-DD 형식이어야 합니다.' });
  }

  if (startDate > endDate) {
    return res.status(400).json({ success: false, message: '시작일은 종료일보다 늦을 수 없습니다.' });
  }

  const normalizedSiteNames = Array.from(new Set(
    siteNames
      .map((siteName) => String(siteName || '').trim())
      .filter(Boolean)
  ));

  if (normalizedSiteNames.length === 0) {
    return res.status(400).json({ success: false, message: '출력할 현장명이 비어 있습니다.' });
  }

  const templatePath = path.join(TEMPLATES_DIR, TEMPLATE_NAME);
  if (!fs.existsSync(templatePath)) {
    return res.status(400).json({
      success: false,
      message: `양식 파일이 없습니다. 먼저 '엑셀 양식 등록'으로 '${TEMPLATE_NAME}' 파일을 업로드해 주세요.`,
    });
  }

  try {
    const yearRanges = splitDateRangeByYear(startDate, endDate);
    const fileLabelPrefix = buildExportFileLabel(normalizedSiteNames);
    const dateLabel = `${startDate}_${endDate}`;

    if (yearRanges.length === 1) {
      const [{ year, rangeStart, rangeEnd }] = yearRanges;
      const buf = await buildExcelForYear(templatePath, year, rangeStart, rangeEnd, normalizedSiteNames);
      const fileName = `${fileLabelPrefix}_기간데이타조회_${dateLabel}_${year}.xlsx`;

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`);
      return res.end(buf);
    }

    const zip = new JSZip();
    for (const { year, rangeStart, rangeEnd } of yearRanges) {
      const buf = await buildExcelForYear(templatePath, year, rangeStart, rangeEnd, normalizedSiteNames);
      zip.file(`${fileLabelPrefix}_기간데이타조회_${dateLabel}_${year}.xlsx`, buf);
    }

    const zipName = `${fileLabelPrefix}_기간데이타조회_${dateLabel}_${yearRanges[0].year}-${yearRanges[yearRanges.length - 1].year}.zip`;
    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 9 } });

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(zipName)}`);
    return res.end(zipBuffer);
  } catch (err) {
    console.error('[periodReport] export 오류:', err);
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: err.message });
    }
  }
});

// ── 핵심 빌드 함수 ─────────────────────────────────────────────────

/**
 * 특정 연도에 대한 엑셀 파일 생성 (Buffer 반환)
 */
async function buildExcelForYear(templatePath, year, startDate, endDate, siteNames) {
  const templateBuffer = fs.readFileSync(templatePath);
  const zip = await JSZip.loadAsync(templateBuffer);
  let workbookXml = await zip.file('xl/workbook.xml').async('string');
  let workbookRelsXml = await zip.file('xl/_rels/workbook.xml.rels').async('string');
  let contentTypesXml = await zip.file('[Content_Types].xml').async('string');

  workbookXml = ensureWorkbookRecalculation(workbookXml);
  removeCalcChainArtifacts(zip, contentTypesXml, workbookRelsXml);
  contentTypesXml = removeCalcChainContentType(contentTypesXml);
  workbookRelsXml = removeCalcChainRelationship(workbookRelsXml);

  const sheetPaths = resolveSheetPaths(workbookXml, workbookRelsXml);
  const templateSheetName = Object.keys(sheetPaths)[0];
  const templateSheetPath = sheetPaths[templateSheetName];
  if (!templateSheetName || !templateSheetPath) {
    throw new Error('기간 데이터 조회 양식에 시트가 없습니다.');
  }

  const templateSheetXmlRaw = await zip.file(templateSheetPath).async('string');
  const templateSheetXml = enforceAverageOneDecimalInSheetXml(templateSheetXmlRaw);
  const templateSheetFileName = path.posix.basename(templateSheetPath);
  const templateSheetDir = path.posix.dirname(templateSheetPath);
  const templateSheetRelsPath = `${templateSheetDir}/_rels/${templateSheetFileName}.rels`;
  const templateSheetRelsXml = zip.file(templateSheetRelsPath)
    ? await zip.file(templateSheetRelsPath).async('string')
    : null;
  const namedRanges = parseDefinedRangeEntriesFromXml(workbookXml);
  const usedSheetNames = new Set();
  let maxSheetId = getMaxMatchNumber(workbookXml, /sheetId="(\d+)"/g);
  let maxRId = getMaxMatchNumber(workbookRelsXml, /Id="rId(\d+)"/g);
  let maxSheetFileNumber = getMaxSheetFileNumber(Object.keys(zip.files));

  for (let i = 0; i < siteNames.length; i++) {
    const siteName = siteNames[i];
    const sheetName = makeUniqueSheetName(siteName, usedSheetNames);
    usedSheetNames.add(sheetName);

    console.log(`[periodReport] ${siteName} (${year}) 데이터 조회 중...`);

    const [flowRows, wqRows] = await Promise.all([
      getFlowData(siteName, startDate, endDate),
      getWaterQualityData(siteName, startDate, endDate),
    ]);

    console.log(`[periodReport] ${siteName}: 유량 ${flowRows.length}건, 수질 ${wqRows.length}건`);

    const updates = buildCellUpdates(year, namedRanges, flowRows, wqRows);
    const sheetXml = applyCellUpdatesToSheetXml(templateSheetXml, updates);

    if (i === 0) {
      zip.file(templateSheetPath, sheetXml);
      workbookXml = renameSheetInWorkbookXml(workbookXml, templateSheetName, sheetName);
      workbookXml = replaceSheetReferencesInWorkbookXml(workbookXml, templateSheetName, sheetName);
      continue;
    }

    const newSheetFileName = `sheet${++maxSheetFileNumber}.xml`;
    const newSheetPath = `${templateSheetDir}/${newSheetFileName}`;
    const newSheetId = ++maxSheetId;
    const newRId = `rId${++maxRId}`;

    zip.file(newSheetPath, sheetXml);

    if (templateSheetRelsXml) {
      const newSheetRelsPath = `${templateSheetDir}/_rels/${newSheetFileName}.rels`;
      zip.file(newSheetRelsPath, templateSheetRelsXml);
    }

    workbookXml = workbookXml.replace(
      '</sheets>',
      `<sheet name="${escapeXmlAttr(sheetName)}" sheetId="${newSheetId}" r:id="${newRId}"/></sheets>`
    );
    workbookRelsXml = workbookRelsXml.replace(
      '</Relationships>',
      `<Relationship Id="${newRId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/${newSheetFileName}"/></Relationships>`
    );
    contentTypesXml = contentTypesXml.replace(
      '</Types>',
      `<Override PartName="/xl/worksheets/${newSheetFileName}" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`
    );
  }

  zip.file('xl/workbook.xml', workbookXml);
  zip.file('xl/_rels/workbook.xml.rels', workbookRelsXml);
  zip.file('[Content_Types].xml', contentTypesXml);

  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 9 } });
}

function buildCellUpdates(year, namedRanges, flowRows, wqRows) {
  const updates = {};
  updates.C2 = `${year}년`;
  updates.C42 = `${year}년`;
  bindFlowData(updates, namedRanges, flowRows);
  bindWaterQualityData(updates, namedRanges, wqRows);
  return updates;
}

// ── 유량 바인딩 ─────────────────────────────────────────────────────

function bindFlowData(updates, namedRanges, flowRows) {
  for (const row of flowRows) {
    if (!row.date) continue;
    const month = parseInt(row.date.slice(5, 7), 10);
    const day   = parseInt(row.date.slice(8, 10), 10);

    let rangeName;
    if (row.type === '유입유량계') {
      rangeName = `유입${month}월`;
    } else if (row.type === '방류유량계') {
      rangeName = `방류${month}월`;
    } else {
      continue;
    }

    const range = namedRanges[rangeName];
    if (!range) continue;

    setRangeCell(updates, range, day - 1, row.calculated_flow);
  }
}

// ── 수질 바인딩 ─────────────────────────────────────────────────────

function bindWaterQualityData(updates, namedRanges, wqRows) {
  // 월별로 그룹핑
  const byMonth = {};
  for (const row of wqRows) {
    if (!row.report_date) continue;
    const month = parseInt(row.report_date.slice(5, 7), 10);
    if (!byMonth[month]) byMonth[month] = [];
    byMonth[month].push(row);
  }

  // 각 월의 1회차/2회차 바인딩
  for (const [monthStr, rows] of Object.entries(byMonth)) {
    const month = parseInt(monthStr, 10);

    // 1회차
    if (rows.length >= 1) {
      const rangeName = `수${month}월1회`;
      const range = namedRanges[rangeName];
      if (range) {
        bindWqToRange(updates, range, rows[0]);
      }
    }

    // 2회차
    if (rows.length >= 2) {
      const rangeName = `수${month}월2회`;
      const range = namedRanges[rangeName];
      if (range) {
        bindWqToRange(updates, range, rows[1]);
      }
    }
  }
}

/**
 * 수질 5대항목을 Named Range에 바인딩
 * offset 0: BOD, 1: T-N, 2: T-P, 3: SS, 4: 대장균
 */
function bindWqToRange(updates, range, row) {
  setRangeCell(updates, range, 0, formatFixedOneDecimal(row.bod));
  setRangeCell(updates, range, 1, row.tn);
  setRangeCell(updates, range, 2, row.tp);
  setRangeCell(updates, range, 3, formatFixedOneDecimal(row.ss));
  setRangeCell(updates, range, 4, formatTotalColiform(row.total_coliform));
}

// ── 헬퍼 함수 ───────────────────────────────────────────────────────

function parseDefinedRangeEntriesFromXml(workbookXml) {
  const map = {};
  const regex = /<definedName\s+name="([^"]+)"[^>]*>([^<]+)<\/definedName>/g;
  let match;

  while ((match = regex.exec(workbookXml)) !== null) {
    const name = match[1];
    if (name.startsWith('_xlnm.')) continue;

    const range = parseRangeReference(match[2]);
    if (range) {
      map[name] = range;
    }
  }

  return map;
}

function parseRangeReference(rangeRef) {
  const match = String(rangeRef || '').match(/^(?:'((?:[^']|'')+)'|([^!]+))!\$?([A-Z]+)\$?(\d+)(?::\$?([A-Z]+)\$?(\d+))?$/);
  if (!match) return null;

  return {
    sheetName: (match[1] || match[2] || '').replace(/''/g, "'"),
    startColumn: match[3],
    startRow: Number(match[4]),
    endColumn: match[5] || match[3],
    endRow: Number(match[6] || match[4]),
  };
}

/** Named Range의 i번째 행 셀에 값 설정 */
function setRangeCell(updates, range, i, value) {
  if (!range) return;
  if (value === null || value === undefined) {
    return;
  }

  const address = getRangeCellAddress(range, i);
  if (!address) return;
  updates[address] = value;
}

function getRangeCellAddress(range, offset) {
  const startCol = colLetterToNumber(range.startColumn);
  const endCol = colLetterToNumber(range.endColumn);
  const isVertical = startCol === endCol;

  if (isVertical) {
    const row = range.startRow + offset;
    if (range.startRow !== range.endRow && row > range.endRow) return null;
    return `${range.startColumn}${row}`;
  }

  const col = startCol + offset;
  if (range.startColumn !== range.endColumn && col > endCol) return null;
  return `${colNumberToLetter(col)}${range.startRow}`;
}

function colLetterToNumber(letters) {
  let value = 0;
  for (const char of letters) {
    value = (value * 26) + (char.charCodeAt(0) - 64);
  }
  return value;
}

function colNumberToLetter(number) {
  let value = number;
  let result = '';
  while (value > 0) {
    const remainder = (value - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    value = Math.floor((value - 1) / 26);
  }
  return result;
}

function applyCellUpdatesToSheetXml(sheetXml, updates) {
  let nextXml = sheetXml;
  for (const [address, value] of Object.entries(updates)) {
    nextXml = setCellInSheetXml(nextXml, address, value);
  }
  return nextXml;
}

function setCellInSheetXml(sheetXml, address, value) {
  const match = address.match(/^([A-Z]+)(\d+)$/);
  if (!match) return sheetXml;

  const rowNumber = match[2];
  const stringValue = value === undefined || value === null ? '' : String(value);
  const numericValue = stringValue !== '' ? Number(stringValue) : Number.NaN;
  const isNumeric = stringValue !== '' && Number.isFinite(numericValue);

  const cellRegex = new RegExp(`(<c\\s[^>]*r="${address}"[^>]*?)(?:\\/>|>([\\s\\S]*?)<\\/c>)`, 'i');
  const cellMatch = cellRegex.exec(sheetXml);

  if (cellMatch) {
    let openTag = cellMatch[1].replace(/\s+t="[^"]*"/g, '');
    if (isNumeric) {
      return sheetXml.replace(cellMatch[0], `${openTag}><v>${numericValue}</v></c>`);
    }

    return sheetXml.replace(cellMatch[0], `${openTag} t="inlineStr"><is><t>${escapeXmlText(stringValue)}</t></is></c>`);
  }

  const rowRegex = new RegExp(`(<row\\s[^>]*r="${rowNumber}"[^>]*?>)([\\s\\S]*?)(<\\/row>)`, 'i');
  const rowMatch = rowRegex.exec(sheetXml);
  if (!rowMatch) return sheetXml;

  const newCellXml = isNumeric
    ? `<c r="${address}"><v>${numericValue}</v></c>`
    : `<c r="${address}" t="inlineStr"><is><t>${escapeXmlText(stringValue)}</t></is></c>`;
  return sheetXml.replace(rowMatch[0], `${rowMatch[1]}${rowMatch[2]}${newCellXml}${rowMatch[3]}`);
}

function resolveSheetPaths(workbookXml, relsXml) {
  const nameToRelId = {};
  const sheetRegex = /<sheet\s+name="([^"]+)"[^>]*r:id="([^"]+)"[^>]*\/?>/g;
  let match;
  while ((match = sheetRegex.exec(workbookXml)) !== null) {
    nameToRelId[match[1]] = match[2];
  }

  const relIdToTarget = {};
  const relRegex = /<Relationship\s[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"[^>]*>/g;
  while ((match = relRegex.exec(relsXml)) !== null) {
    relIdToTarget[match[1]] = match[2];
  }

  const paths = {};
  for (const [sheetName, relId] of Object.entries(nameToRelId)) {
    const target = relIdToTarget[relId];
    if (!target) continue;
    paths[sheetName] = target.startsWith('/') ? target.slice(1) : `xl/${target}`;
  }
  return paths;
}

function renameSheetInWorkbookXml(workbookXml, oldName, newName) {
  return workbookXml.replace(`name="${escapeXmlAttr(oldName)}"`, `name="${escapeXmlAttr(newName)}"`);
}

function replaceSheetReferencesInWorkbookXml(workbookXml, oldName, newName) {
  const quotedOld = `'${oldName.replace(/'/g, "''")}'!`;
  const unquotedOld = `${oldName}!`;
  const quotedNew = `${quoteSheetNameForFormula(newName)}!`;
  return workbookXml.split(quotedOld).join(quotedNew).split(unquotedOld).join(quotedNew);
}

function quoteSheetNameForFormula(sheetName) {
  return `'${String(sheetName || '').replace(/'/g, "''")}'`;
}

function escapeXmlText(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeXmlAttr(value) {
  return escapeXmlText(value).replace(/"/g, '&quot;');
}

function formatTotalColiform(value) {
  if (value === null || value === undefined || value === '') return value;
  const numericValue = Number(value);
  if (Number.isFinite(numericValue) && numericValue === 0) {
    return '불검출';
  }
  return value;
}

function formatFixedOneDecimal(value) {
  if (value === null || value === undefined || value === '') return value;
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return value;
  return numericValue.toFixed(1);
}

function enforceAverageOneDecimalInSheetXml(sheetXml) {
  return String(sheetXml || '').replace(/(<f[^>]*>)([^<]*AVERAGE\([^<]*\))(<\/f>)/gi, (full, openTag, formula, closeTag) => {
    if (/^\s*ROUND\s*\(\s*AVERAGE\s*\(/i.test(formula)) {
      return full;
    }
    return `${openTag}ROUND(${formula},1)${closeTag}`;
  });
}

function ensureWorkbookRecalculation(workbookXml) {
  const calcPrRegex = /<calcPr\b[^>]*\/?>(?:<\/calcPr>)?/i;
  const forcedCalcPr = '<calcPr calcId="191029" calcMode="auto" fullCalcOnLoad="1" forceFullCalc="1" calcOnSave="1"/>';

  if (calcPrRegex.test(workbookXml)) {
    return workbookXml.replace(calcPrRegex, forcedCalcPr);
  }

  return workbookXml.replace('</workbook>', `${forcedCalcPr}</workbook>`);
}

function removeCalcChainArtifacts(zip, contentTypesXml, workbookRelsXml) {
  if (zip.file('xl/calcChain.xml')) {
    zip.remove('xl/calcChain.xml');
  }

  const calcChainRelsMatch = workbookRelsXml.match(/<Relationship\s[^>]*Target="calcChain\.xml"[^>]*\/?>/i);
  if (calcChainRelsMatch) {
    const relIdMatch = calcChainRelsMatch[0].match(/Id="([^"]+)"/i);
    const relId = relIdMatch ? relIdMatch[1] : null;
    if (relId && zip.file(`xl/_rels/${relId}.rels`)) {
      zip.remove(`xl/_rels/${relId}.rels`);
    }
  }
}

function removeCalcChainContentType(contentTypesXml) {
  return contentTypesXml.replace(/<Override\s+PartName="\/xl\/calcChain\.xml"[^>]*\/>/i, '');
}

function removeCalcChainRelationship(workbookRelsXml) {
  return workbookRelsXml.replace(/<Relationship\s[^>]*Type="http:\/\/schemas\.openxmlformats\.org\/officeDocument\/2006\/relationships\/calcChain"[^>]*\/>/i, '');
}

function getMaxMatchNumber(text, regex) {
  let max = 0;
  let match;
  while ((match = regex.exec(text)) !== null) {
    max = Math.max(max, Number(match[1]) || 0);
  }
  return max;
}

function getMaxSheetFileNumber(filePaths) {
  return filePaths.reduce((max, filePath) => {
    const match = /^xl\/worksheets\/sheet(\d+)\.xml$/i.exec(filePath);
    if (!match) return max;
    return Math.max(max, Number(match[1]) || 0);
  }, 0);
}

/** Excel 시트 이름 제한: 31자, 특수문자 제거 */
function sanitizeSheetName(name) {
  return String(name || 'Sheet')
    .replace(/[:\\\/?*[\]]/g, '')
    .trim()
    .slice(0, 31) || 'Sheet';
}

function makeUniqueSheetName(name, usedSheetNames) {
  const baseName = sanitizeSheetName(name);
  if (!usedSheetNames.has(baseName)) return baseName;

  let index = 2;
  while (index < 1000) {
    const suffix = `_${index}`;
    const candidate = `${baseName.slice(0, Math.max(0, 31 - suffix.length))}${suffix}`;
    if (!usedSheetNames.has(candidate)) return candidate;
    index += 1;
  }

  throw new Error(`시트명을 생성할 수 없습니다: ${name}`);
}

function buildExportFileLabel(siteNames) {
  const firstSiteName = sanitizeFileName(siteNames[0] || '현장');
  const extraCount = Math.max(0, siteNames.length - 1);
  return extraCount > 0 ? `${firstSiteName} 외 ${extraCount}건` : firstSiteName;
}

function sanitizeFileName(name) {
  return String(name || '현장')
    .replace(/[<>:"/\\|?*]/g, '')
    .trim() || '현장';
}

function isValidIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function splitDateRangeByYear(startDate, endDate) {
  const startYear = parseInt(startDate.slice(0, 4), 10);
  const endYear = parseInt(endDate.slice(0, 4), 10);
  const ranges = [];

  for (let year = startYear; year <= endYear; year += 1) {
    ranges.push({
      year,
      rangeStart: year === startYear ? startDate : `${year}-01-01`,
      rangeEnd: year === endYear ? endDate : `${year}-12-31`,
    });
  }

  return ranges;
}

module.exports = router;
