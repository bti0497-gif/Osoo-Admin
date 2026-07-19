'use strict';

/**
 * gyeonggiMonthlyReportRoutes.cjs
 *
 * GET  /api/gyeonggi/monthly-report/sites?year=&month=
 * POST /api/gyeonggi/monthly-report/export
 *   body: { year, month, sites: [{ siteId, siteName }] }
 *
 * 템플릿: templates/gyeonggi/월운영보고서.xlsx
 * - Named Range 기반 바인딩
 * - 선택한 현장 수만큼 시트 복제
 */

const express = require('express');
const path = require('path');
const fs = require('fs');
const JSZip = require('jszip');

const {
  getReportSiteList,
  getMonthlyReportData,
  transformToReportData,
} = require('../services/monthlyReportService.cjs');
const { decodeUserContextHeader } = require('../utils/httpUserHeaders.cjs');

const router = express.Router();

const TEMPLATE_PATH = path.join(__dirname, '..', '..', 'templates', 'gyeonggi', '월운영보고서.xlsx');

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

router.get('/api/gyeonggi/monthly-report/sites', async (req, res) => {
  if (!ensureAdmin(req, res)) return;

  const year = parseInt(req.query.year, 10);
  const month = parseInt(req.query.month, 10);
  if (!year || !month) {
    return res.status(400).json({ success: false, message: 'year, month 필요' });
  }

  try {
    const sites = await getReportSiteList(year, month);
    return res.json({ success: true, sites });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/api/gyeonggi/monthly-report/export', async (req, res) => {
  if (!ensureAdmin(req, res)) return;

  const { year, month, sites } = req.body || {};
  if (!year || !month || !Array.isArray(sites) || sites.length === 0) {
    return res.status(400).json({ success: false, message: 'year, month, sites 필요' });
  }

  if (!fs.existsSync(TEMPLATE_PATH)) {
    return res.status(400).json({
      success: false,
      message: '월운영보고서 양식이 없습니다. 먼저 양식관리에서 월운영보고서.xlsx를 업로드해 주세요.',
    });
  }

  try {
    const buf = await buildMonthlyReportWorkbook(Number(year), Number(month), sites);
    const fileName = `월운영보고서_${year}년${String(month).padStart(2, '0')}월.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`);
    return res.end(buf);
  } catch (err) {
    console.error('[gyeonggiMonthlyReport] export 오류:', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

async function buildMonthlyReportWorkbook(year, month, sites) {
  const templateBuffer = fs.readFileSync(TEMPLATE_PATH);
  const zip = await JSZip.loadAsync(templateBuffer);
  let workbookXml = await zip.file('xl/workbook.xml').async('string');
  let workbookRelsXml = await zip.file('xl/_rels/workbook.xml.rels').async('string');
  let contentTypesXml = await zip.file('[Content_Types].xml').async('string');

  workbookXml = ensureWorkbookRecalculation(workbookXml);
  removeCalcChainArtifacts(zip);
  contentTypesXml = removeCalcChainContentType(contentTypesXml);
  workbookRelsXml = removeCalcChainRelationship(workbookRelsXml);

  const sheetPaths = resolveSheetPaths(workbookXml, workbookRelsXml);
  const templateSheetName = Object.keys(sheetPaths)[0];
  const templateSheetPath = sheetPaths[templateSheetName];
  if (!templateSheetName || !templateSheetPath) {
    throw new Error('월운영보고서 양식에 시트가 없습니다.');
  }

  const templateSheetXml = await zip.file(templateSheetPath).async('string');
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

  for (let i = 0; i < sites.length; i += 1) {
    const siteId = String(sites[i]?.siteId || '').trim();
    const siteName = String(sites[i]?.siteName || siteId).trim();
    if (!siteId) continue;

    const sheetName = makeUniqueSheetName(siteName, usedSheetNames);
    usedSheetNames.add(sheetName);

    const raw = await getMonthlyReportData(year, month, siteId);
    const data = transformToReportData(year, month, siteName, raw);
    const updates = buildCellUpdates(namedRanges, data, year, month);
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

function getNamedRange(namedRanges, names) {
  for (const name of names) {
    if (namedRanges[name]) return namedRanges[name];
  }
  return null;
}

function buildCellUpdates(namedRanges, data, year, month) {
  const updates = {};
  const titleRange = getNamedRange(namedRanges, ['현장명년도월', '현장명']);
  if (titleRange) {
    setRangeFirstCell(updates, titleRange, `${data.siteName} ${year}년 ${month}월 월운영보고서`);
  }

  const dateRange = getNamedRange(namedRanges, ['날짜']);
  const inflowRange = getNamedRange(namedRanges, ['유입량', '유입']);
  const outflowRange = getNamedRange(namedRanges, ['방류량', '방류']);
  const sludgeRange = getNamedRange(namedRanges, ['슬러지']);
  const glucoseRange = getNamedRange(namedRanges, ['포도당']);
  const bicarbonateRange = getNamedRange(namedRanges, ['중탄산']);
  const coagulantRange = getNamedRange(namedRanges, ['응집제']);

  for (let i = 0; i < data.dailyRows.length; i += 1) {
    const row = data.dailyRows[i];
    setRangeCell(updates, dateRange, i, dateToSerial(row.date));
    setRangeCell(updates, inflowRange, i, row.유입);
    setRangeCell(updates, outflowRange, i, row.방류);
    setRangeCell(updates, sludgeRange, i, row.슬러지);
    setRangeCell(updates, glucoseRange, i, row.포도당);
    setRangeCell(updates, bicarbonateRange, i, row.중탄산);
    setRangeCell(updates, coagulantRange, i, row.응집제);
  }

  setRangeFirstCell(updates, getNamedRange(namedRanges, ['포도당이월']), data.medicine.포도당.이월);
  setRangeFirstCell(updates, getNamedRange(namedRanges, ['포도당입고']), data.medicine.포도당.입고);
  setRangeFirstCell(updates, getNamedRange(namedRanges, ['중탄산이월']), data.medicine.중탄산.이월);
  setRangeFirstCell(updates, getNamedRange(namedRanges, ['중탄산입고']), data.medicine.중탄산.입고);
  setRangeFirstCell(updates, getNamedRange(namedRanges, ['응집제이월']), data.medicine.응집제.이월);
  setRangeFirstCell(updates, getNamedRange(namedRanges, ['응집제입고']), data.medicine.응집제.입고);

  return updates;
}

function setRangeFirstCell(updates, range, value) {
  if (!range) return;
  const address = `${range.startColumn}${range.startRow}`;
  updates[address] = value;
}

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

function setRangeCell(updates, range, i, value) {
  if (!range) return;
  if (value === null || value === undefined) return;
  const address = getRangeCellAddress(range, i);
  if (!address) return;
  updates[address] = value;
}

function dateToSerial(dateStr) {
  const [y, m, d] = String(dateStr || '').split('-').map(Number);
  if (!y || !m || !d) return '';
  const date = new Date(Date.UTC(y, m - 1, d));
  return Math.floor((date - new Date(Date.UTC(1899, 11, 30))) / 86400000);
}

function getRangeCellAddress(range, offset) {
  const startCol = colLetterToNumber(range.startColumn);
  const endCol = colLetterToNumber(range.endColumn);
  const isVertical = startCol === endCol;

  if (isVertical) {
    const row = range.startRow + offset;
    if (row > range.endRow) return null;
    return `${range.startColumn}${row}`;
  }

  const col = startCol + offset;
  if (col > endCol) return null;
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
    const openTag = cellMatch[1].replace(/\s+t="[^"]*"/g, '');
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

function ensureWorkbookRecalculation(workbookXml) {
  const calcPrRegex = /<calcPr\b[^>]*\/?>(?:<\/calcPr>)?/i;
  const forcedCalcPr = '<calcPr calcId="191029" calcMode="auto" fullCalcOnLoad="1" forceFullCalc="1" calcOnSave="1"/>';

  if (calcPrRegex.test(workbookXml)) {
    return workbookXml.replace(calcPrRegex, forcedCalcPr);
  }

  return workbookXml.replace('</workbook>', `${forcedCalcPr}</workbook>`);
}

function removeCalcChainArtifacts(zip) {
  if (zip.file('xl/calcChain.xml')) {
    zip.remove('xl/calcChain.xml');
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

function sanitizeSheetName(name) {
  const value = String(name || 'Sheet').replace(/[:\\/?*\[\]]/g, '').trim();
  return (value || 'Sheet').slice(0, 31);
}

function makeUniqueSheetName(name, used) {
  const base = sanitizeSheetName(name);
  if (!used.has(base)) return base;

  let i = 2;
  while (i < 1000) {
    const suffix = `_${i}`;
    const candidate = `${base.slice(0, Math.max(0, 31 - suffix.length))}${suffix}`;
    if (!used.has(candidate)) return candidate;
    i += 1;
  }

  return `Sheet_${Date.now()}`;
}

module.exports = router;
