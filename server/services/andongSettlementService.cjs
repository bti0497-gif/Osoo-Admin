'use strict';

/**
 * 안동휴게소(부산방향) 한글(HWP) 정산 보고서 + 엑셀(XLSX) 정산 증빙 자동 생성 서비스
 * 
 * [확정 규격 & 엔진]
 * - 템플릿: template_andong.hwp (한글 요약 보고서) + template_andong_excel.xlsx (엑셀 정산서 및 증빙)
 * - COM-free 초고속 무결성 CFB(HWP) 및 ZIP/XML(XLSX) 다이렉트 바인딩 엔진
 * - 한글(HWP): '년월' 표기(2026.10월분 -> YYYY.MM월분) 완벽 치환
 * - 엑셀(XLSX) 정의된 이름(셀이름) 및 증빙 4종 1:1 바인딩:
 *   1. 용역비계산서 (A11:D22, image4): 매출계산서 (용역비)
 *   2. 수질분석계산서 (E11:G22, image1): 매입계산서 (대신 / 수질분석비)
 *   3. 분석키트계산서 (H11:L22, image2): 매입계산서 (케이엠 / 분석키트)
 *   4. 약품비계산서 (A26:D37, image3): 매입계산서 (에이치·영일 / 약품비)
 *   5. 월제목 (A10:L10): 증빙자료 (M월)
 * - PDF 증빙 자동 감지 및 고화질 PNG 래스터라이징 변환
 * - 증빙 누락 시 원본 템플릿 이미지 무결성 보존(Fallback)
 * - 저장 위치:
 *   - 기본 마감 경로: 바탕화면 > 월정산 > 안동휴게소마감자료 > M월
 *   - YYYYMM 폴더 및 바탕화면 루트 동시 보존
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const zlib = require('zlib');
const { execSync } = require('child_process');
const JSZip = require('jszip');
const XLSX = require('xlsx');
const { resolveTemplateFilePath } = require('./settlementService.cjs');
const { drive, downloadDriveFileBuffer } = require('./driveService.cjs');

const SITE_CONFIG = {
  name: '안동휴게소(부산방향)',
  shortName: '안동(부산)',
  dirName: '안동휴게소마감자료',
  hwpTemplate: 'template_andong.hwp',
  excelTemplate: 'template_andong_excel.xlsx',
};

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

function ensureImageFromInvoice(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  const ext = path.extname(filePath).toLowerCase();
  if (['.png', '.jpg', '.jpeg', '.bmp'].includes(ext)) {
    return filePath;
  }
  if (ext === '.pdf') {
    const outPng = path.join(os.tmpdir(), `osoo_andong_inv_${path.basename(filePath, '.pdf')}_${Date.now()}.png`);
    try {
      const pyCmd = `python -c "import fitz; doc=fitz.open(r'''${filePath}'''); page=doc[0]; pix=page.get_pixmap(dpi=150); pix.save(r'''${outPng}''')"`;
      execSync(pyCmd, { timeout: 15000 });
      if (fs.existsSync(outPng)) {
        return outPng;
      }
    } catch (err) {
      console.warn(`[andongSettlement] PDF 변환 실패 (${path.basename(filePath)}):`, err.message);
    }
  }
  return null;
}

function findInvoiceFile(dirs, pattern, options = {}) {
  const validExts = new Set(['.jpg', '.jpeg', '.png', '.bmp', '.pdf']);
  const { mustStartWith = null, excludePattern = null } = options;
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    try {
      const files = fs.readdirSync(dir);
      for (const file of files) {
        const ext = path.extname(file).toLowerCase();
        if (!validExts.has(ext)) continue;
        if (mustStartWith && !file.startsWith(mustStartWith)) continue;
        if (excludePattern && excludePattern.test(file)) continue;
        if (pattern.test(file)) {
          return path.join(dir, file);
        }
      }
    } catch (_) {}
  }
  return null;
}

async function ensureAndongInvoicesFromDrive(year, month) {
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
    const q = `name contains '안동' and name contains '${targetYm}' and trashed = false`;
    const res = await drive.files.list({
      q,
      fields: 'files(id, name, mimeType)',
      pageSize: 30,
      spaces: 'drive',
      includeItemsFromAllDrives: true,
      supportsAllDrives: true,
    });
    for (const df of res.data.files || []) {
      const destPath = path.join(localInvoiceDir, df.name);
      if (!fs.existsSync(destPath)) {
        try {
          const buf = await downloadDriveFileBuffer(df.id);
          fs.writeFileSync(destPath, buf);
          console.log(`[andongSettlement] 드라이브 다운로드 완료: ${df.name}`);
        } catch (e) {
          console.warn(`[andongSettlement] 드라이브 다운로드 실패 (${df.name}):`, e.message);
        }
      }
    }
  } catch (err) {
    console.warn('[andongSettlement] Drive 탐색 실패:', err.message);
  }
}

async function getAndongEvidenceStatus(year, month) {
  const numYear = Number(year) || 2026;
  const numMonth = Number(month) || 10;
  const targetYm = `${numYear}${String(numMonth).padStart(2, '0')}`;

  await ensureAndongInvoicesFromDrive(numYear, numMonth);

  const desktopDirs = findDesktopDirectories();
  const searchDirs = [];
  desktopDirs.forEach((d) => {
    searchDirs.push(path.join(d, '점검준비', '계산서', targetYm));
    searchDirs.push(path.join(d, '월정산', SITE_CONFIG.dirName, `${numMonth}월`));
    searchDirs.push(path.join(d, '월정산', SITE_CONFIG.dirName, targetYm));
    searchDirs.push(path.join(d, '점검준비', '정산서', targetYm));
  });

  const rawSales = findInvoiceFile(searchDirs, /안동.*용역|용역.*안동/i, { mustStartWith: '매출' })
    || findInvoiceFile(searchDirs, /안동.*용역/i)
    || findInvoiceFile(searchDirs, /안동.*매출|매출.*안동/i);

  const rawWater = findInvoiceFile(searchDirs, /안동.*대신|대신.*안동/i, { excludePattern: /^매출/i })
    || findInvoiceFile(searchDirs, /안동.*수질분석|수질분석.*안동/i, { excludePattern: /^매출/i });

  const rawKit = findInvoiceFile(searchDirs, /안동.*케이엠|케이엠.*안동/i, { excludePattern: /^매출/i })
    || findInvoiceFile(searchDirs, /안동.*분석키트|분석키트.*안동|안동.*시약/i, { excludePattern: /^매출/i });

  const rawChem = findInvoiceFile(searchDirs, /안동.*(?:에이치디이앤씨|에이치디이엔씨|에이치디|에이치|영일과학상사|영일과학|영일|약품)|(?:에이치디이앤씨|에이치디이엔씨|에이치디|에이치|영일과학상사|영일과학|영일|약품).*안동/i, { excludePattern: /^매출/i })
    || findInvoiceFile(searchDirs, /에이치디이앤씨|에이치디이엔씨|에이치디|에이치|영일과학상사|영일과학|영일|약품/i, { excludePattern: /^매출/i });

  const invoiceMap = {
    salesService: ensureImageFromInvoice(rawSales),
    waterQuality: ensureImageFromInvoice(rawWater),
    kit: ensureImageFromInvoice(rawKit),
    chemical: ensureImageFromInvoice(rawChem),
  };

  const missing = [];
  if (!invoiceMap.salesService) missing.push('매출계산서(용역비)');
  if (!invoiceMap.waterQuality) missing.push('수질분석계산서(대신)');
  if (!invoiceMap.kit) missing.push('분석키트계산서(케이엠)');
  if (!invoiceMap.chemical) missing.push('약품비계산서(에이치디이앤씨/영일과학상사)');

  return {
    year: numYear,
    month: numMonth,
    targetYm,
    siteName: SITE_CONFIG.name,
    allReady: missing.length === 0,
    missing,
    invoiceMap,
  };
}

async function generateAndongHwpReport(year, month) {
  const numYear = Number(year) || 2026;
  const numMonth = Number(month) || 10;
  const padMonth = String(numMonth).padStart(2, '0');
  const targetYm = `${numYear}${padMonth}`;

  const tplPath = resolveTemplateFilePath(SITE_CONFIG.hwpTemplate)
    || path.join(__dirname, '../templates/settlement', SITE_CONFIG.hwpTemplate);

  if (!tplPath || !fs.existsSync(tplPath)) {
    throw new Error(`[안동휴게소] 한글 템플릿(${SITE_CONFIG.hwpTemplate})을 찾을 수 없습니다.`);
  }

  const cfb = XLSX.CFB.read(tplPath, { type: 'file' });
  const sec0Entry = XLSX.CFB.find(cfb, '/BodyText/Section0');
  if (!sec0Entry) {
    throw new Error('[안동휴게소] HWP 템플릿 BodyText/Section0 스트림이 손상되었습니다.');
  }

  const decomp = zlib.inflateRawSync(sec0Entry.content);
  const targetYmStr = `${numYear}.${padMonth}월분`;
  const replaceBuf = Buffer.from(targetYmStr, 'utf16le');

  const years = [numYear - 1, numYear, numYear + 1, 2025, 2026];
  for (const y of years) {
    for (let m = 1; m <= 12; m++) {
      const cand = Buffer.from(`${y}.${String(m).padStart(2, '0')}월분`, 'utf16le');
      let idx = decomp.indexOf(cand);
      while (idx !== -1) {
        replaceBuf.copy(decomp, idx);
        idx = decomp.indexOf(cand, idx + 1);
      }
    }
  }

  const recompressed = zlib.deflateRawSync(decomp, { level: 9 });
  sec0Entry.content = recompressed;
  sec0Entry.size = recompressed.length;

  const prvEntry = XLSX.CFB.find(cfb, '/PrvText');
  if (prvEntry) {
    const prvText = Buffer.from(prvEntry.content).toString('utf16le');
    const newPrv = prvText.replace(/[0-9]{4}\.[0-9]{2}월분/g, targetYmStr);
    const newPrvBuf = Buffer.from(newPrv, 'utf16le');
    prvEntry.content = newPrvBuf;
    prvEntry.size = newPrvBuf.length;
  }

  const outputBuffer = XLSX.CFB.write(cfb, { type: 'buffer' });
  const desktop = getPrimaryDesktop();
  const outputFileName = `1. 안동휴게소 오수처리비 정산 보고서_${numMonth}월.hwp`;

  const folderMonth = path.join(desktop, '월정산', SITE_CONFIG.dirName, `${numMonth}월`);
  const folderYm = path.join(desktop, '월정산', SITE_CONFIG.dirName, targetYm);
  [folderMonth, folderYm].forEach((d) => {
    if (!fs.existsSync(d)) {
      try { fs.mkdirSync(d, { recursive: true }); } catch (_) {}
    }
  });

  const finalMonth = path.join(folderMonth, outputFileName);
  const finalYm = path.join(folderYm, outputFileName);
  const finalDesktop = path.join(desktop, outputFileName);

  const safeWrite = (targetPath) => {
    try {
      fs.writeFileSync(targetPath, outputBuffer);
    } catch (e) {
      if (e.code === 'EBUSY') {
        console.warn(`[andongSettlement] 파일 열림 상태 건너뜀 (${path.basename(targetPath)})`);
      } else {
        throw e;
      }
    }
  };

  safeWrite(finalMonth);
  safeWrite(finalYm);
  safeWrite(finalDesktop);

  console.log(`[andongSettlement] 한글 정산서 작성 완료! 저장: ${finalMonth}`);

  return {
    success: true,
    filePath: finalMonth,
    monthPath: finalMonth,
    ymPath: finalYm,
    desktopPath: finalDesktop,
    fileName: outputFileName,
    targetYm,
  };
}

async function generateAndongExcelReport(year, month) {
  const numYear = Number(year) || 2026;
  const numMonth = Number(month) || 10;
  const targetYm = `${numYear}${String(numMonth).padStart(2, '0')}`;

  const evidenceStatus = await getAndongEvidenceStatus(numYear, numMonth);
  const invMap = evidenceStatus.invoiceMap;

  const tplPath = resolveTemplateFilePath(SITE_CONFIG.excelTemplate)
    || resolveTemplateFilePath('template_andong.xlsx')
    || path.join(__dirname, '../templates/settlement', SITE_CONFIG.excelTemplate);

  if (!tplPath || !fs.existsSync(tplPath)) {
    throw new Error(`[안동휴게소] 엑셀 템플릿(${SITE_CONFIG.excelTemplate})을 찾을 수 없습니다.`);
  }

  const zip = await JSZip.loadAsync(fs.readFileSync(tplPath));

  // 1. Sheet 명 및 DefinedNames 갱신
  let wbXml = await zip.file('xl/workbook.xml').async('text');
  wbXml = wbXml.replace(/<sheet\s+name="[^"]+"\s+sheetId="([^"]+)"/g, `<sheet name="${numMonth}월" sheetId="$1"`);
  wbXml = wbXml.replace(/'[0-9]{1,2}월'!/g, `'${numMonth}월'!`);
  zip.file('xl/workbook.xml', wbXml);

  // 2. SharedStrings 갱신 (증빙자료 타이틀)
  const ssPath = 'xl/sharedStrings.xml';
  if (zip.file(ssPath)) {
    let ssXml = await zip.file(ssPath).async('text');
    ssXml = ssXml.replace(/증빙자료\s*\([0-9]{1,2}월\)/g, `증빙자료 (${numMonth}월)`);
    zip.file(ssPath, ssXml);
  }

  // 3. 증빙 이미지 바인딩 (누락 시 템플릿 기본값 보존)
  const imageSlots = [
    { key: 'salesService', fileIndex: 4, label: '용역비계산서' },
    { key: 'waterQuality', fileIndex: 1, label: '수질분석계산서' },
    { key: 'kit', fileIndex: 2, label: '분석키트계산서' },
    { key: 'chemical', fileIndex: 3, label: '약품비계산서' },
  ];

  for (const slot of imageSlots) {
    const rawPath = invMap[slot.key];
    const imagePath = ensureImageFromInvoice(rawPath);
    if (imagePath && fs.existsSync(imagePath)) {
      const ext = path.extname(imagePath).toLowerCase();
      const isJpeg = ext === '.jpg' || ext === '.jpeg';
      const targetMedia = `xl/media/image${slot.fileIndex}.png`;
      zip.file(targetMedia, fs.readFileSync(imagePath));
      console.log(`[andongSettlement] 이미지 교체 완료: ${slot.label} -> ${path.basename(imagePath)}`);
    } else {
      console.log(`[andongSettlement] 이미지 템플릿 유지: ${slot.label}`);
    }
  }

  const outputBuffer = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  const desktop = getPrimaryDesktop();
  const outputFileName = `2. 안동휴게소 오수처리비 정산보고서_${numMonth}월.xlsx`;

  const folderMonth = path.join(desktop, '월정산', SITE_CONFIG.dirName, `${numMonth}월`);
  const folderYm = path.join(desktop, '월정산', SITE_CONFIG.dirName, targetYm);
  [folderMonth, folderYm].forEach((d) => {
    if (!fs.existsSync(d)) {
      try { fs.mkdirSync(d, { recursive: true }); } catch (_) {}
    }
  });

  const finalMonth = path.join(folderMonth, outputFileName);
  const finalYm = path.join(folderYm, outputFileName);
  const finalDesktop = path.join(desktop, outputFileName);

  const safeWrite = (targetPath) => {
    try {
      fs.writeFileSync(targetPath, outputBuffer);
    } catch (e) {
      if (e.code === 'EBUSY') {
        console.warn(`[andongSettlement] 파일 열림 상태 건너뜀 (${path.basename(targetPath)})`);
      } else {
        throw e;
      }
    }
  };

  safeWrite(finalMonth);
  safeWrite(finalYm);
  safeWrite(finalDesktop);

  console.log(`[andongSettlement] 엑셀 정산 증빙 작성 완료! 저장: ${finalMonth}`);

  return {
    success: true,
    filePath: finalMonth,
    monthPath: finalMonth,
    ymPath: finalYm,
    desktopPath: finalDesktop,
    fileName: outputFileName,
    targetYm,
    evidenceStatus,
  };
}

async function generateAndongAllReports(year, month) {
  const hwpRes = await generateAndongHwpReport(year, month);
  const excelRes = await generateAndongExcelReport(year, month);
  return {
    success: true,
    hwp: hwpRes,
    excel: excelRes,
    fileName: `${hwpRes.fileName} + ${excelRes.fileName}`,
    filePath: hwpRes.filePath,
    excelPath: excelRes.filePath,
  };
}

module.exports = {
  getAndongEvidenceStatus,
  generateAndongHwpReport,
  generateAndongExcelReport,
  generateAndongAllReports,
};
