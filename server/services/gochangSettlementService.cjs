'use strict';

/**
 * 고창고인돌휴게소(목포방향 / 서울방향) 엑셀(XLSX) 정산서 + 운영일지 + 증빙 자동 생성 서비스
 */
const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');
const { resolveTemplateFilePath } = require('./settlementService.cjs');
const { getBigQueryClient, DATASET_ID } = require('./bigQueryClientService.cjs');
const { drive, downloadDriveFileBuffer } = require('./driveService.cjs');

const SITES_CONFIG = {
  mokpo: {
    siteId: 'a6b5359b-2401-47cd-9afa-d41a66bd83d0',
    name: '고창고인돌휴게소(목포방향)',
    shortName: '고창(목포)',
    dirName: '고창휴게소(목포)마감자료',
    template: 'template_gochang_mokpo.xlsx',
    chemSlot: { col: 31, row: 19, toCol: 44, toRow: 34 },
  },
  seoul: {
    siteId: '0350bab1-ebaa-402f-b46f-95e1504ff907',
    name: '고창고인돌휴게소(서울방향)',
    shortName: '고창(서울)',
    dirName: '고창휴게소(서울)마감자료',
    template: 'template_gochang_seoul.xlsx',
    chemSlot: { col: 31, row: 19, toCol: 44, toRow: 34 },
  },
};

function getSiteCfg(direction = 'mokpo') {
  return SITES_CONFIG[direction] || (direction.includes('seoul') || direction.includes('서울') ? SITES_CONFIG.seoul : SITES_CONFIG.mokpo);
}

function findDesktopDirectories() {
  const home = process.env.USERPROFILE || 'C:\\Users\\ASUS';
  const dirs = [
    path.join(home, 'OneDrive', '바탕 화면'),
    path.join(home, 'Desktop'),
    path.join(home, 'OneDrive', 'Desktop'),
    path.join(home, '바탕 화면'),
  ];
  return dirs.filter((d) => fs.existsSync(d));
}

function getPrimaryDesktop() {
  const dirs = findDesktopDirectories();
  return dirs[0] || path.join(process.env.USERPROFILE || 'C:\\Users\\ASUS', 'Desktop');
}

function dateToExcelSerial(year, month, day = 1) {
  const date = new Date(Date.UTC(year, month - 1, day));
  const epoch = new Date(Date.UTC(1899, 11, 30));
  return Math.round((date.getTime() - epoch.getTime()) / (24 * 60 * 60 * 1000));
}

function findLocalImageFile(dirs, pattern, options = {}) {
  const imageExts = new Set(['.jpg', '.jpeg', '.png', '.bmp']);
  const { mustStartWith = null, excludePattern = null } = options;
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    try {
      for (const file of fs.readdirSync(dir)) {
        if (!imageExts.has(path.extname(file).toLowerCase())) continue;
        if (mustStartWith && !file.startsWith(mustStartWith)) continue;
        if (excludePattern && excludePattern.test(file)) continue;
        if (pattern.test(file)) return path.join(dir, file);
      }
    } catch (_) {}
  }
  return null;
}

async function ensureGochangInvoicesFromDrive(year, month, direction = 'mokpo') {
  const cfg = getSiteCfg(direction);
  const numYear = Number(year) || 2026;
  const numMonth = Number(month) || 10;
  const targetYm = `${numYear}${String(numMonth).padStart(2, '0')}`;
  const desktop = getPrimaryDesktop();
  const localInvoiceDir = path.join(desktop, '점검준비', '계산서', targetYm);

  if (!fs.existsSync(localInvoiceDir)) {
    try { fs.mkdirSync(localInvoiceDir, { recursive: true }); } catch (_) {}
  }
  if (!drive) return;

  try {
    const isSeoul = cfg.shortName.includes('서울');
    const dirKey = isSeoul ? '서울' : '목포';
    const q = `name contains '고창' and name contains '${dirKey}' and name contains '${targetYm}' and trashed = false`;
    const res = await drive.files.list({
      q, fields: 'files(id, name, mimeType)', pageSize: 30, spaces: 'drive',
      includeItemsFromAllDrives: true, supportsAllDrives: true,
    });
    for (const df of res.data.files || []) {
      const destPath = path.join(localInvoiceDir, df.name);
      if (!fs.existsSync(destPath)) {
        try {
          const buf = await downloadDriveFileBuffer(df.id);
          fs.writeFileSync(destPath, buf);
          console.log(`[gochangSettlement] 드라이브 다운로드 완료 (${cfg.shortName}): ${df.name}`);
        } catch (e) {
          console.warn(`[gochangSettlement] 다운로드 실패 (${df.name}):`, e.message);
        }
      }
    }
  } catch (err) {
    console.warn('[gochangSettlement] Drive 탐색 실패:', err.message);
  }
}

async function getGochangEvidenceStatus(year, month, direction = 'mokpo') {
  const cfg = getSiteCfg(direction);
  const numYear = Number(year) || 2026;
  const numMonth = Number(month) || 10;
  const targetYm = `${numYear}${String(numMonth).padStart(2, '0')}`;
  const isSeoul = cfg.shortName.includes('서울');
  const dirKey = isSeoul ? '서울' : '목포';

  await ensureGochangInvoicesFromDrive(numYear, numMonth, direction);

  const desktopDirs = findDesktopDirectories();
  const searchDirs = [];
  desktopDirs.forEach((d) => {
    searchDirs.push(path.join(d, '점검준비', '계산서', targetYm));
    searchDirs.push(path.join(d, '월정산', cfg.dirName, `${numMonth}월`));
    searchDirs.push(path.join(d, '월정산', cfg.dirName, targetYm));
    searchDirs.push(path.join(d, '점검준비', '정산서', targetYm));
  });

  const dirRegex = new RegExp(`고창.*${dirKey}`, 'i');
  const salesService = findLocalImageFile(searchDirs, new RegExp(`고창.*${dirKey}.*용역|용역.*고창.*${dirKey}`, 'i'), { mustStartWith: '매출' })
    || findLocalImageFile(searchDirs, new RegExp(`고창.*${dirKey}.*용역`, 'i'));
  const chemical = findLocalImageFile(searchDirs, new RegExp(`고창.*${dirKey}.*(?:에이치디이앤씨|에이치디이엔씨|에이치디|에이치|영일과학상사|영일과학|영일|약품)|(?:에이치디이앤씨|에이치디이엔씨|에이치디|에이치|영일과학상사|영일과학|영일|약품).*고창.*${dirKey}`, 'i'), { excludePattern: /^매출/i })
    || findLocalImageFile(searchDirs, new RegExp(`고창.*(?:에이치디이앤씨|에이치디이엔씨|에이치디|에이치|영일과학상사|영일과학|영일|약품)`, 'i'), { excludePattern: /^매출/i })
    || findLocalImageFile(searchDirs, /에이치디이앤씨|에이치디이엔씨|에이치디|에이치|영일과학상사|영일과학|영일|약품/i, { excludePattern: /^매출/i });
  const kit = findLocalImageFile(searchDirs, new RegExp(`고창.*${dirKey}.*케이엠|케이엠.*고창.*${dirKey}`, 'i'), { excludePattern: /^매출/i })
    || findLocalImageFile(searchDirs, new RegExp(`고창.*${dirKey}.*(?:키트|시약)`, 'i'), { excludePattern: /^매출/i });
  const waterQuality = findLocalImageFile(searchDirs, new RegExp(`고창.*${dirKey}.*대신|대신.*고창.*${dirKey}`, 'i'), { excludePattern: /^매출/i })
    || findLocalImageFile(searchDirs, new RegExp(`고창.*${dirKey}.*수질분석`, 'i'), { excludePattern: /^매출/i });

  const test1 = findLocalImageFile(searchDirs, new RegExp(`고창.*${dirKey}.*1차|1차.*(?:MLSS|성적서)`, 'i'));
  const test2 = findLocalImageFile(searchDirs, new RegExp(`고창.*${dirKey}.*2차|2차.*(?:MLSS|성적서)`, 'i'));
  const test3 = findLocalImageFile(searchDirs, new RegExp(`고창.*${dirKey}.*3차|3차.*(?:MLSS|성적서)`, 'i'));
  const test4 = findLocalImageFile(searchDirs, new RegExp(`고창.*${dirKey}.*4차|4차.*(?:MLSS|성적서)`, 'i'));

  const invoiceMap = { salesService, chemical, kit, waterQuality, test1, test2, test3, test4 };
  const missing = [];
  if (!salesService) missing.push('매출계산서(용역비)');
  if (!chemical) missing.push('약품비계산서(에이치디이앤씨/영일과학상사)');
  if (!kit) missing.push('분석키트계산서(케이엠)');
  if (!waterQuality) missing.push('수질분석비계산서(대신)');

  return { year: numYear, month: numMonth, targetYm, direction, siteName: cfg.name, allReady: missing.length === 0, missing, invoiceMap };
}

async function fetchGochangBqData(year, month, direction = 'mokpo') {
  const cfg = getSiteCfg(direction);
  const bq = getBigQueryClient();
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const endDate = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  const prevMonthStart = `${prevYear}-${String(prevMonth).padStart(2, '0')}-01`;
  const dirKey = cfg.shortName.includes('서울') ? '서울' : '목포';

  const flowMap = new Map();
  const medicineDailyMap = new Map();
  const purchaseTotals = { glucose: 0, pac: 0, chlorine: 0, bicarb: 0 };
  const prevInventory = { glucose: 0, pac: 0, chlorine: 0, bicarb: 0 };

  if (!bq) return { flowMap, medicineDailyMap, purchaseTotals, prevInventory };

  try {
    const flowQuery = `SELECT date, type, calculated_flow, raw_value, sludge_export FROM \`${DATASET_ID}.flow_readings\` WHERE (site_id = @siteId OR (site_name LIKE '%고창%' AND site_name LIKE '%${dirKey}%')) AND date >= @startDate AND date < @endDate ORDER BY date`;
    const [flowRows] = await bq.query({ query: flowQuery, params: { siteId: cfg.siteId, startDate, endDate } });
    flowRows.forEach((r) => {
      const d = new Date(r.date?.value || r.date).getDate();
      if (!flowMap.has(d)) flowMap.set(d, { inflow: 0, outflow: 0, sludge: 0 });
      const cur = flowMap.get(d);
      const val = Number(r.calculated_flow || r.raw_value || 0);
      if (r.type === '유입유량계' || r.type === '유입') cur.inflow = val;
      else if (r.type === '방류유량계' || r.type === '방류') cur.outflow = val;
      else if (r.type === '슬러지') cur.sludge = Number(r.sludge_export || r.raw_value || 0);
    });
  } catch (err) {
    console.warn(`[gochangSettlement] BQ 유량 경고 (${cfg.shortName}):`, err.message);
  }

  try {
    const medQuery = `SELECT date, medicine_name, usage_amount, purchase_amount, current_inventory FROM (SELECT date, medicine_name, usage_amount, purchase_amount, current_inventory, ROW_NUMBER() OVER (PARTITION BY date, medicine_name ORDER BY uploaded_at DESC) AS rn FROM \`${DATASET_ID}.medicine_logs\` WHERE (site_id = @siteId OR (site_name LIKE '%고창%' AND site_name LIKE '%${dirKey}%')) AND date >= @startDate AND date < @endDate) WHERE rn = 1`;
    const [medRows] = await bq.query({ query: medQuery, params: { siteId: cfg.siteId, startDate, endDate } });
    medRows.forEach((r) => {
      const d = new Date(r.date?.value || r.date).getDate();
      if (!medicineDailyMap.has(d)) medicineDailyMap.set(d, { glucose: 0, pac: 0, chlorine: 0, bicarb: 0 });
      const cur = medicineDailyMap.get(d);
      const name = String(r.medicine_name || '');
      const usage = Number(r.usage_amount || 0);
      const purchase = Number(r.purchase_amount || 0);
      if (name.includes('포도당')) { cur.glucose += usage; purchaseTotals.glucose += purchase; }
      else if (name.includes('PAC') || name.includes('팩') || name.includes('응집제')) { cur.pac += usage; purchaseTotals.pac += purchase; }
      else if (name.includes('차염') || name.includes('염소')) { cur.chlorine += usage; purchaseTotals.chlorine += purchase; }
      else if (name.includes('중탄산')) { cur.bicarb += usage; purchaseTotals.bicarb += purchase; }
    });
  } catch (err) {
    console.warn(`[gochangSettlement] BQ 약품 경고 (${cfg.shortName}):`, err.message);
  }

  try {
    const prevQuery = `SELECT medicine_name, current_inventory FROM (SELECT medicine_name, current_inventory, ROW_NUMBER() OVER (PARTITION BY medicine_name ORDER BY date DESC, uploaded_at DESC) AS rn FROM \`${DATASET_ID}.medicine_logs\` WHERE (site_id = @siteId OR (site_name LIKE '%고창%' AND site_name LIKE '%${dirKey}%')) AND date >= @prevMonthStart AND date < @startDate) WHERE rn = 1`;
    const [prevRows] = await bq.query({ query: prevQuery, params: { siteId: cfg.siteId, prevMonthStart, startDate } });
    prevRows.forEach((r) => {
      const name = String(r.medicine_name || '');
      const inv = Number(r.current_inventory || 0);
      if (name.includes('포도당')) prevInventory.glucose = inv;
      else if (name.includes('PAC') || name.includes('팩')) prevInventory.pac = inv;
      else if (name.includes('차염') || name.includes('염소')) prevInventory.chlorine = inv;
      else if (name.includes('중탄산')) prevInventory.bicarb = inv;
    });
  } catch (err) {
    console.warn(`[gochangSettlement] BQ 이월량 경고 (${cfg.shortName}):`, err.message);
  }

  return { flowMap, medicineDailyMap, purchaseTotals, prevInventory };
}

function buildTwoCellAnchor({ id, name, rId, fromCol, fromRow, toCol, toRow, colOff = 56031, rowOff = 16062, toColOff = 182469, toRowOff = 212913 }) {
  return `<xdr:twoCellAnchor editAs="oneCell">` +
    `<xdr:from><xdr:col>${fromCol}</xdr:col><xdr:colOff>${colOff}</xdr:colOff><xdr:row>${fromRow}</xdr:row><xdr:rowOff>${rowOff}</xdr:rowOff></xdr:from>` +
    `<xdr:to><xdr:col>${toCol}</xdr:col><xdr:colOff>${toColOff}</xdr:colOff><xdr:row>${toRow}</xdr:row><xdr:rowOff>${toRowOff}</xdr:rowOff></xdr:to>` +
    `<xdr:pic><xdr:nvPicPr><xdr:cNvPr id="${id}" name="${name}"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr>` +
    `<xdr:blipFill><a:blip xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:embed="${rId}"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill>` +
    `<xdr:spPr><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:twoCellAnchor>`;
}

async function generateGochangExcelReport(year, month, customInputs = {}, direction = 'mokpo') {
  const cfg = getSiteCfg(direction);
  const numYear = Number(year) || 2026;
  const numMonth = Number(month) || 10;
  const targetYm = `${numYear}${String(numMonth).padStart(2, '0')}`;
  const daysInMonth = new Date(numYear, numMonth, 0).getDate();

  const tplPath = resolveTemplateFilePath(cfg.template)
    || path.join(__dirname, '../templates/settlement', cfg.template);

  if (!tplPath || !fs.existsSync(tplPath)) {
    throw new Error(`[${cfg.name}] 엑셀 템플릿(${cfg.template})을 찾을 수 없습니다.`);
  }

  const rawData = fs.readFileSync(tplPath);
  const zip = await JSZip.loadAsync(rawData);
  const { flowMap, medicineDailyMap, purchaseTotals, prevInventory } = await fetchGochangBqData(numYear, numMonth, direction);

  // 1. sharedStrings.xml 연월 치환
  if (zip.file('xl/sharedStrings.xml')) {
    let ssXml = await zip.file('xl/sharedStrings.xml').async('text');
    ssXml = ssXml.replace(/고창\((?:목포|서울)\)휴게소\s+[0-9]{4}년\s+[0-9]{1,2}월\s+오수처리시설\s+정산서\s+내역서/g,
      `${cfg.shortName}휴게소   ${numYear}년 ${numMonth}월 오수처리시설 정산서 내역서`);
    ssXml = ssXml.replace(/고창휴게소\((?:목포방향|서울방향)\)\s+오수처리시설\s+운영일지\([0-9]{1,2}월\)/g,
      `고창휴게소(${cfg.shortName.includes('서울') ? '서울방향' : '목포방향'}) 오수처리시설 운영일지(${numMonth}월)`);
    zip.file('xl/sharedStrings.xml', ssXml);
  }

  // 2. sheet3.xml (운영일지) 일별 데이터 및 재고 바인딩
  if (zip.file('xl/worksheets/sheet3.xml')) {
    let s3Xml = await zip.file('xl/worksheets/sheet3.xml').async('text');
    const startSerial = dateToExcelSerial(numYear, numMonth, 1);

    for (let day = 1; day <= 31; day++) {
      const rowNum = 4 + day;
      const rowRegex = new RegExp(`(<row r="${rowNum}"[^>]*>)([\\s\\S]*?)(<\\/row>)`);
      const rowMatch = s3Xml.match(rowRegex);
      if (rowMatch) {
        const rowOpen = rowMatch[1];
        const rowClose = rowMatch[3];
        if (day <= daysInMonth) {
          const serial = startSerial + day - 1;
          const fData = flowMap.get(day) || { inflow: 0, outflow: 0, sludge: 0 };
          const mData = medicineDailyMap.get(day) || { glucose: 0, pac: 0, chlorine: 0, bicarb: 0 };
          const cells = `<c r="A${rowNum}" s="54"><v>${serial}</v></c>` +
            `<c r="B${rowNum}" s="51"><v>${fData.inflow || ''}</v></c>` +
            `<c r="C${rowNum}" s="51"><v>${fData.outflow || ''}</v></c>` +
            `<c r="D${rowNum}" s="51"><v>${fData.sludge || ''}</v></c>` +
            `<c r="E${rowNum}" s="51"><v>${mData.glucose || ''}</v></c>` +
            `<c r="F${rowNum}" s="51"/>` +
            `<c r="G${rowNum}" s="51"><v>${mData.pac || ''}</v></c>` +
            `<c r="H${rowNum}" s="51"/>` +
            `<c r="I${rowNum}" s="51"><v>${mData.chlorine || ''}</v></c>` +
            `<c r="J${rowNum}" s="51"><v>${mData.bicarb || ''}</v></c>` +
            `<c r="K${rowNum}" s="52"/>`;
          s3Xml = s3Xml.replace(rowRegex, `${rowOpen}${cells}${rowClose}`);
        } else {
          const emptyRow = `<c r="A${rowNum}" s="54"/><c r="B${rowNum}" s="51"/><c r="C${rowNum}" s="51"/><c r="D${rowNum}" s="51"/><c r="E${rowNum}" s="51"/><c r="F${rowNum}" s="51"/><c r="G${rowNum}" s="51"/><c r="H${rowNum}" s="51"/><c r="I${rowNum}" s="51"/><c r="J${rowNum}" s="51"/><c r="K${rowNum}" s="52"/>`;
          s3Xml = s3Xml.replace(rowRegex, `${rowOpen}${emptyRow}${rowClose}`);
        }
      }
    }

    // Row 39 이월량 (전월 잔량)
    const invChlorine = customInputs.prevChlorine ?? prevInventory.chlorine;
    const invGlucose = customInputs.prevGlucose ?? prevInventory.glucose;
    const invPac = customInputs.prevPac ?? prevInventory.pac;
    const invBicarb = customInputs.prevBicarb ?? prevInventory.bicarb;

    s3Xml = s3Xml.replace(/(<c r="C39"[^>]*>)(?:<v>[\s\S]*?<\/v>)?(<\/c>)/, `$1<v>${invGlucose}</v>$2`);
    s3Xml = s3Xml.replace(/(<c r="F39"[^>]*>)(?:<v>[\s\S]*?<\/v>)?(<\/c>)/, `$1<v>${invPac}</v>$2`);
    s3Xml = s3Xml.replace(/(<c r="H39"[^>]*>)(?:<v>[\s\S]*?<\/v>)?(<\/c>)/, `$1<v>${invChlorine}</v>$2`);
    s3Xml = s3Xml.replace(/(<c r="I39"[^>]*>)(?:<v>[\s\S]*?<\/v>)?(<\/c>)/, `$1<v>${invBicarb}</v>$2`);

    // Row 40 구입량 (당월 구매량)
    const purChlorine = customInputs.purChlorine ?? purchaseTotals.chlorine;
    const purGlucose = customInputs.purGlucose ?? purchaseTotals.glucose;
    const purPac = customInputs.purPac ?? purchaseTotals.pac;
    const purBicarb = customInputs.purBicarb ?? purchaseTotals.bicarb;

    s3Xml = s3Xml.replace(/(<c r="C40"[^>]*>)(?:<v>[\s\S]*?<\/v>)?(<\/c>)/, `$1<v>${purGlucose || ''}</v>$2`);
    s3Xml = s3Xml.replace(/(<c r="F40"[^>]*>)(?:<v>[\s\S]*?<\/v>)?(<\/c>)/, `$1<v>${purPac || ''}</v>$2`);
    s3Xml = s3Xml.replace(/(<c r="H40"[^>]*>)(?:<v>[\s\S]*?<\/v>)?(<\/c>)/, `$1<v>${purChlorine || ''}</v>$2`);
    s3Xml = s3Xml.replace(/(<c r="I40"[^>]*>)(?:<v>[\s\S]*?<\/v>)?(<\/c>)/, `$1<v>${purBicarb || ''}</v>$2`);

    // Row 37 평균 나누기 일수 조정
    s3Xml = s3Xml.replace(/=C36\/[0-9]+/g, `=C36/${daysInMonth}`);
    s3Xml = s3Xml.replace(/=E36\/[0-9]+/g, `=E36/${daysInMonth}`);
    s3Xml = s3Xml.replace(/=G36\/[0-9]+/g, `=G36/${daysInMonth}`);
    s3Xml = s3Xml.replace(/=I36\/[0-9]+/g, `=I36/${daysInMonth}`);
    s3Xml = s3Xml.replace(/=J36\/[0-9]+/g, `=J36/${daysInMonth}`);

    zip.file('xl/worksheets/sheet3.xml', s3Xml);
  }

  // 3. 증빙 시트 이미지 바인딩 (여백 적용)
  const evidenceStatus = await getGochangEvidenceStatus(numYear, numMonth, direction);
  const invMap = {
    salesService: customInputs.salesService || evidenceStatus.invoiceMap.salesService,
    kit: customInputs.kit || evidenceStatus.invoiceMap.kit,
    waterQuality: customInputs.waterQuality || evidenceStatus.invoiceMap.waterQuality,
    chemical: customInputs.chemical || evidenceStatus.invoiceMap.chemical,
    test1: customInputs.test1 || evidenceStatus.invoiceMap.test1,
    test2: customInputs.test2 || evidenceStatus.invoiceMap.test2,
    test3: customInputs.test3 || evidenceStatus.invoiceMap.test3,
    test4: customInputs.test4 || evidenceStatus.invoiceMap.test4,
  };

  const drawSlots = [
    { key: 'kit', id: 2, name: '그림 1', rId: 'rId2', fileIndex: 2, fromCol: 16, fromRow: 20, toCol: 30, toRow: 34, colOff: 11206, rowOff: 16062, toColOff: 182469, toRowOff: 212913 },
    { key: 'waterQuality', id: 4, name: '그림 3', rId: 'rId3', fileIndex: 3, fromCol: 31, fromRow: 2, toCol: 44, toRow: 17, colOff: 0, rowOff: 0, toColOff: 403411, toRowOff: 0 },
    { key: 'chemical', id: 5, name: '그림 4', rId: 'rId4', fileIndex: 4, fromCol: cfg.chemSlot.col, fromRow: cfg.chemSlot.row, toCol: cfg.chemSlot.toCol, toRow: cfg.chemSlot.toRow, colOff: 1, rowOff: 224116, toColOff: 406587, toRowOff: 224117 },
    { key: 'test1', id: 7, name: '그림 6', rId: 'rId5', fileIndex: 5, fromCol: 61, fromRow: 2, toCol: 67, toRow: 16, colOff: 0, rowOff: 0, toColOff: 358588, toRowOff: 198531 },
    { key: 'test2', id: 8, name: '그림 7', rId: 'rId6', fileIndex: 6, fromCol: 67, fromRow: 2, toCol: 74, toRow: 16, colOff: 381001, rowOff: 3174, toColOff: 369793, toRowOff: 216086 },
    { key: 'salesService', id: 6, name: '그림 5', rId: 'rId7', fileIndex: 7, fromCol: 0, fromRow: 20, toCol: 14, toRow: 35, colOff: 56031, rowOff: 11206, toColOff: 190500, toRowOff: 9525 },
    { key: 'test3', id: 9, name: '그림 8', rId: 'rId8', fileIndex: 8, fromCol: 60, fromRow: 19, toCol: 67, toRow: 34, colOff: 392205, rowOff: 220941, toColOff: 392205, toRowOff: 198530 },
    { key: 'test4', id: 10, name: '그림 9', rId: 'rId9', fileIndex: 9, fromCol: 68, fromRow: 20, toCol: 74, toRow: 34, colOff: 28762, rowOff: 11205, toColOff: 372969, toRowOff: 190499 },
  ];

  let drawXml = await zip.file('xl/drawings/drawing1.xml').async('text');
  let relsXml = await zip.file('xl/drawings/_rels/drawing1.xml.rels').async('text');

  for (const slot of drawSlots) {
    const filePath = invMap[slot.key];
    if (filePath && fs.existsSync(filePath)) {
      const ext = path.extname(filePath).toLowerCase();
      const mediaName = `image${slot.fileIndex}${ext === '.jpg' || ext === '.jpeg' ? '.jpeg' : '.png'}`;
      const mediaPath = `xl/media/${mediaName}`;
      zip.file(mediaPath, fs.readFileSync(filePath));

      if (!relsXml.includes(`Id="${slot.rId}"`)) {
        relsXml = relsXml.replace('</Relationships>',
          `<Relationship Id="${slot.rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/${mediaName}"/></Relationships>`);
      }

      if (!drawXml.includes(`r:embed="${slot.rId}"`)) {
        const anchorXml = buildTwoCellAnchor({
          id: slot.id, name: slot.name, rId: slot.rId,
          fromCol: slot.fromCol, fromRow: slot.fromRow, toCol: slot.toCol, toRow: slot.toRow,
          colOff: slot.colOff, rowOff: slot.rowOff, toColOff: slot.toColOff, toRowOff: slot.toRowOff,
        });
        drawXml = drawXml.replace('</xdr:wsDr>', `${anchorXml}</xdr:wsDr>`);
      }
      console.log(`[gochangSettlement] 이미지 바인딩 완료 (${cfg.shortName}): ${slot.key} -> ${path.basename(filePath)}`);
    }
  }

  zip.file('xl/drawings/drawing1.xml', drawXml);
  zip.file('xl/drawings/_rels/drawing1.xml.rels', relsXml);

  // 4. 파일 저장
  const outputBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  const desktop = getPrimaryDesktop();
  const outputFileName = `${cfg.shortName}26년 ${numMonth}월오수처리정산시트.xlsx`;

  const folderYm = path.join(desktop, '월정산', cfg.dirName, targetYm);
  const folderMonth = path.join(desktop, '월정산', cfg.dirName, `${numMonth}월`);
  [folderYm, folderMonth].forEach((d) => {
    if (!fs.existsSync(d)) {
      try { fs.mkdirSync(d, { recursive: true }); } catch (_) {}
    }
  });

  const finalYm = path.join(folderYm, outputFileName);
  const finalMonth = path.join(folderMonth, outputFileName);
  const finalDesktop = path.join(desktop, outputFileName);

  const safeWrite = (targetPath) => {
    try {
      fs.writeFileSync(targetPath, outputBuffer);
    } catch (e) {
      if (e.code === 'EBUSY') {
        console.warn(`[gochangSettlement] 파일 열림(잠금) 상태로 덮어쓰기 건너뜀 (${path.basename(targetPath)})`);
      } else {
        throw e;
      }
    }
  };

  safeWrite(finalYm);
  safeWrite(finalMonth);
  safeWrite(finalDesktop);

  return { success: true, filePath: finalMonth, monthPath: finalMonth, ymPath: finalYm, fileName: outputFileName, targetYm, direction, siteName: cfg.name, evidenceStatus };
}

async function generateGochangAllReports(year, month, customInputs = {}, direction = 'mokpo') {
  const excelRes = await generateGochangExcelReport(year, month, customInputs, direction);
  return { success: true, excel: excelRes, fileName: excelRes.fileName, filePath: excelRes.filePath, direction };
}

module.exports = {
  getGochangEvidenceStatus,
  generateGochangExcelReport,
  generateGochangAllReports,
};
