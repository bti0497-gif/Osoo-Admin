'use strict';

/**
 * 선산휴게소(창원방향 / 양평방향) 한글(HWPX) 도로공사 정산 서류 자동 생성 서비스
 * 
 * [확정 규격 & 엔진]
 * - 템플릿: template_seonsan_changwon.hwpx / template_seonsan_yangpyeong.hwpx
 * - OWPML (XML+ZIP) 다이렉트 바인딩 엔진 (COM-free 초고속 무결성)
 * - 책갈피(Bookmark) 12종 1:1 이미지 바인딩:
 *   1. 용역비계산서 (image3): 매출계산서 (용역비)
 *   2. 용역비입금확인증 (image4): 용역비 입금/이체확인증 (미발견 시 템플릿 원본 보존)
 *   3. 약품비계산서 (image5): 매입계산서 (에이치디이앤씨 / 영일과학상사 / 약품)
 *   4. 약품비입금표 (image6): 약품비 입금표/이체확인증
 *   5. 분석키트계산서 (image7): 매입계산서 (케이엠 / 분석키트)
 *   6. 분석키트입금표/입금증 (image8): 분석키트 입금표/입금증
 *   7. 수질분석계산서 (image9): 매입계산서 (대신 / 수질분석비)
 *   8. 수질분석입금표 (image10): 수질분석비 입금표
 *   9. 성적서1~4 (image11~image14): MLSS 성적서 1~4차
 * - PDF/JPG/PNG 고화질 자동 래스터라이징 및 BinData 규격 변환
 * - 증빙 누락 시 원본 템플릿 이미지 무결성 보존(Fallback)
 * - 년월 표기 '(26.10월)' -> '(YY.M월)' 치환
 * - 저장 위치:
 *   - 바탕화면 > 월정산 > 선산휴게소(창원/양평)마감자료 > M월정산자료 / M월 / YYYYMM
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');
const JSZip = require('jszip');
const { resolveTemplateFilePath } = require('./settlementService.cjs');
const { drive, downloadDriveFileBuffer } = require('./driveService.cjs');

const SITES_CONFIG = {
  seonsan_changwon: {
    id: 'seonsan_changwon',
    name: '선산휴게소(창원방향)',
    shortName: '선산(창원)',
    dirName: '선산휴게소(창원)마감자료',
    dirKey: '창원',
    template: 'template_seonsan_changwon.hwpx',
    outputPrefix: '선산휴게소(창원)',
  },
  seonsan_yangpyeong: {
    id: 'seonsan_yangpyeong',
    name: '선산휴게소(양평방향)',
    shortName: '선산(양평)',
    dirName: '선산휴게소(양평)마감자료',
    dirKey: '양평',
    template: 'template_seonsan_yangpyeong.hwpx',
    outputPrefix: '선산휴게소(양평)',
  },
};

function getSiteCfg(dirParam) {
  const norm = String(dirParam || '').toLowerCase();
  if (norm.includes('yangpyeong') || norm.includes('양평')) {
    return SITES_CONFIG.seonsan_yangpyeong;
  }
  return SITES_CONFIG.seonsan_changwon;
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

function convertToImageBuffer(srcPath, targetExt = '.bmp') {
  if (!srcPath || !fs.existsSync(srcPath)) return null;
  const ext = path.extname(srcPath).toLowerCase();
  const tgtExt = targetExt.toLowerCase();
  if (ext === tgtExt && ext !== '.pdf') {
    return fs.readFileSync(srcPath);
  }
  const tmpOut = path.join(os.tmpdir(), `osoo_ss_img_${Date.now()}_${Math.random().toString(36).slice(2)}${tgtExt}`);
  const pyCode = `import sys
from PIL import Image
src = sys.argv[1]
dest = sys.argv[2]
if src.lower().endswith('.pdf'):
    import fitz
    doc = fitz.open(src)
    pix = doc[0].get_pixmap(dpi=150)
    img = Image.frombytes('RGB', [pix.width, pix.height], pix.samples)
else:
    img = Image.open(src)
    if img.mode != 'RGB':
        img = img.convert('RGB')
fmt = 'BMP' if dest.lower().endswith('.bmp') else 'JPEG'
img.save(dest, fmt)
`;
  const tmpPy = path.join(os.tmpdir(), `osoo_ss_py_${Date.now()}_${Math.random().toString(36).slice(2)}.py`);
  try {
    fs.writeFileSync(tmpPy, pyCode, 'utf8');
    execSync(`python "${tmpPy}" "${srcPath}" "${tmpOut}"`, { timeout: 20000 });
    if (fs.existsSync(tmpOut)) {
      const buf = fs.readFileSync(tmpOut);
      try { fs.unlinkSync(tmpOut); } catch (_) {}
      return buf;
    }
  } catch (err) {
    console.warn(`[seonsanSettlement] 이미지 변환 실패 (${path.basename(srcPath)}):`, err.message);
  } finally {
    try { fs.unlinkSync(tmpPy); } catch (_) {}
  }
  return null;
}

function findMatchingFile(dirs, patterns, options = {}) {
  const { excludePattern = null, mustStartWith = null } = options;
  const validExts = new Set(['.jpg', '.jpeg', '.png', '.bmp', '.pdf']);
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    try {
      const files = fs.readdirSync(dir);
      for (const f of files) {
        const ext = path.extname(f).toLowerCase();
        if (!validExts.has(ext)) continue;
        if (mustStartWith && !f.startsWith(mustStartWith)) continue;
        if (excludePattern && excludePattern.test(f)) continue;
        let pass = true;
        for (const pat of patterns) {
          if (!pat.test(f)) { pass = false; break; }
        }
        if (pass) return path.join(dir, f);
      }
    } catch (_) {}
  }
  return null;
}

function findMultipleMatchingFiles(dirs, patterns, options = {}) {
  const { excludePattern = null, mustStartWith = null } = options;
  const validExts = new Set(['.jpg', '.jpeg', '.png', '.bmp', '.pdf']);
  const results = [];
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    try {
      const files = fs.readdirSync(dir);
      for (const f of files) {
        const ext = path.extname(f).toLowerCase();
        if (!validExts.has(ext)) continue;
        if (mustStartWith && !f.startsWith(mustStartWith)) continue;
        if (excludePattern && excludePattern.test(f)) continue;
        let pass = true;
        for (const pat of patterns) {
          if (!pat.test(f)) { pass = false; break; }
        }
        if (pass) results.push(path.join(dir, f));
      }
    } catch (_) {}
  }
  return results.filter((v, idx, arr) => arr.indexOf(v) === idx);
}

async function ensureSeonsanInvoicesFromDrive(year, month, direction) {
  const cfg = getSiteCfg(direction);
  const numYear = Number(year) || 2026;
  const numMonth = Number(month) || 10;
  const targetYm = `${numYear}${String(numMonth).padStart(2, '0')}`;
  const desktop = getPrimaryDesktop();
  const invoiceDir = path.join(desktop, '점검준비', '계산서', targetYm);
  const certDir = path.join(desktop, '점검준비', '성적서', targetYm);

  [invoiceDir, certDir].forEach((d) => {
    if (!fs.existsSync(d)) {
      try { fs.mkdirSync(d, { recursive: true }); } catch (_) {}
    }
  });

  if (!drive) return;
  try {
    const q = `name contains '선산' and (name contains '${targetYm}' or name contains '${numYear}${numMonth}') and trashed = false`;
    const res = await drive.files.list({
      q,
      fields: 'files(id, name, mimeType)',
      pageSize: 50,
      spaces: 'drive',
      includeItemsFromAllDrives: true,
      supportsAllDrives: true,
    });
    for (const df of res.data.files || []) {
      const isMlss = /mlss|성적서/i.test(df.name);
      const targetFolder = isMlss ? certDir : invoiceDir;
      const destPath = path.join(targetFolder, df.name);
      if (!fs.existsSync(destPath)) {
        try {
          const buf = await downloadDriveFileBuffer(df.id);
          fs.writeFileSync(destPath, buf);
          console.log(`[seonsanSettlement] Drive 다운로드: ${df.name}`);
        } catch (e) {
          console.warn(`[seonsanSettlement] Drive 다운로드 실패 (${df.name}):`, e.message);
        }
      }
    }
  } catch (err) {
    console.warn('[seonsanSettlement] Drive 탐색 실패:', err.message);
  }
}

async function getSeonsanEvidenceStatus(year, month, direction = 'changwon') {
  const cfg = getSiteCfg(direction);
  const numYear = Number(year) || 2026;
  const numMonth = Number(month) || 10;
  const targetYm = `${numYear}${String(numMonth).padStart(2, '0')}`;
  const dirKey = cfg.dirKey;

  await ensureSeonsanInvoicesFromDrive(numYear, numMonth, direction);

  const desktopDirs = findDesktopDirectories();
  const searchDirs = [];
  desktopDirs.forEach((d) => {
    searchDirs.push(path.join(d, '점검준비', '계산서', targetYm));
    searchDirs.push(path.join(d, '점검준비', '입금표', targetYm));
    searchDirs.push(path.join(d, '점검준비', '성적서', targetYm));
    searchDirs.push(path.join(d, '월정산', cfg.dirName, `${numMonth}월정산자료`));
    searchDirs.push(path.join(d, '월정산', cfg.dirName, `${numMonth}월 정산자료`));
    searchDirs.push(path.join(d, '월정산', cfg.dirName, `${numMonth}월`));
    searchDirs.push(path.join(d, '월정산', cfg.dirName, targetYm));
    searchDirs.push(path.join(d, '점검준비', '정산서', targetYm));
    searchDirs.push(path.join(d, '점검준비', '계산서'));
    searchDirs.push(path.join(d, '점검준비', '입금표'));
    searchDirs.push(path.join(d, '점검준비', '성적서'));
  });

  const chemPats = [/(?:에이치디이앤씨|에이치디이엔씨|에이치디|에이치|영일과학상사|영일과학|영일|약품)/i];

  // 1. 용역비 계산서 (매출)
  const salesService = findMatchingFile(searchDirs, [/선산/i, new RegExp(dirKey, 'i'), /용역/i], { mustStartWith: '매출' })
    || findMatchingFile(searchDirs, [/선산/i, new RegExp(dirKey, 'i'), /매출/i])
    || findMatchingFile(searchDirs, [/매출계산서/i, /용역/i]);

  // 2. 용역비 입금확인증 (선택적)
  const salesReceipt = findMatchingFile(searchDirs, [/선산/i, new RegExp(dirKey, 'i'), /용역.*입금|매출.*입금|입금표.*용역|이체.*용역/i])
    || findMatchingFile(searchDirs, [/입금.*용역|이체.*용역/i]);

  // 3. 약품 계산서 (매입)
  const chemical = findMatchingFile(searchDirs, [/선산/i, new RegExp(dirKey, 'i'), chemPats[0]], { excludePattern: /^매출/i })
    || findMatchingFile(searchDirs, [/선산/i, new RegExp(dirKey, 'i'), /약품/i], { excludePattern: /^매출/i })
    || findMatchingFile(searchDirs, [/약품계산서/i], { excludePattern: /^매출/i });

  // 4. 약품 입금표
  const chemicalReceipt = findMatchingFile(searchDirs, [/선산/i, new RegExp(dirKey, 'i'), chemPats[0], /입금|이체/i])
    || findMatchingFile(searchDirs, [/입금표/i, chemPats[0]])
    || findMatchingFile(searchDirs, [/선산/i, new RegExp(dirKey, 'i'), /약품.*입금/i]);

  // 5. 분석키트 계산서 (매입)
  const kit = findMatchingFile(searchDirs, [/선산/i, new RegExp(dirKey, 'i'), /케이엠|키트|시약/i], { excludePattern: /^매출/i })
    || findMatchingFile(searchDirs, [/선산/i, new RegExp(dirKey, 'i'), /키트/i], { excludePattern: /^매출/i })
    || findMatchingFile(searchDirs, [/키트계산서|시약계산서/i], { excludePattern: /^매출/i });

  // 6. 분석키트 입금표
  const kitReceipt = findMatchingFile(searchDirs, [/선산/i, new RegExp(dirKey, 'i'), /케이엠|키트|시약/i, /입금|이체/i])
    || findMatchingFile(searchDirs, [/입금표/i, /케이엠|키트/i])
    || findMatchingFile(searchDirs, [/선산/i, new RegExp(dirKey, 'i'), /키트.*입금/i]);

  // 7. 수질분석 계산서 (매입)
  const waterQuality = findMatchingFile(searchDirs, [/선산/i, new RegExp(dirKey, 'i'), /대신|수질분석|수질/i], { excludePattern: /^매출/i })
    || findMatchingFile(searchDirs, [/선산/i, new RegExp(dirKey, 'i'), /수질/i], { excludePattern: /^매출/i })
    || findMatchingFile(searchDirs, [/수질분석계산서|수질분석게산서/i], { excludePattern: /^매출/i });

  // 8. 수질분석 입금표
  const waterReceipt = findMatchingFile(searchDirs, [/선산/i, new RegExp(dirKey, 'i'), /대신|수질분석|수질/i, /입금|이체/i])
    || findMatchingFile(searchDirs, [/입금표/i, /대신|수질/i])
    || findMatchingFile(searchDirs, [/선산/i, new RegExp(dirKey, 'i'), /수질.*입금/i]);

  // 9~12. 성적서 1~4
  let mlssImages = findMultipleMatchingFiles(searchDirs, [/선산/i, new RegExp(dirKey, 'i'), /mlss|성적서/i]);
  if (!mlssImages.length) {
    mlssImages = findMultipleMatchingFiles(searchDirs, [/mlss|성적서/i]);
  }
  mlssImages.sort();

  const invoiceMap = {
    salesService: salesService || null,
    salesReceipt: salesReceipt || null,
    chemical: chemical || null,
    chemicalReceipt: chemicalReceipt || null,
    kit: kit || null,
    kitReceipt: kitReceipt || null,
    waterQuality: waterQuality || null,
    waterReceipt: waterReceipt || null,
    test1: mlssImages[0] || null,
    test2: mlssImages[1] || null,
    test3: mlssImages[2] || null,
    test4: mlssImages[3] || null,
  };

  const missing = [];
  if (!salesService) missing.push('매출계산서(용역비)');
  if (!chemical) missing.push('약품비계산서(에이치디이앤씨/영일과학상사)');
  if (!kit) missing.push('분석키트계산서(케이엠)');
  if (!waterQuality) missing.push('수질분석비계산서(대신)');

  return {
    year: numYear,
    month: numMonth,
    targetYm,
    direction: cfg.id,
    siteName: cfg.name,
    allReady: missing.length === 0,
    missing,
    invoiceMap,
  };
}

async function generateSeonsanHwpReport(year, month, direction = 'changwon', customInputs = {}) {
  const cfg = getSiteCfg(direction);
  const numYear = Number(year) || 2026;
  const numMonth = Number(month) || 10;
  const padMonth = String(numMonth).padStart(2, '0');
  const targetYm = `${numYear}${padMonth}`;
  const yy = String(numYear).slice(-2);

  const tplPath = resolveTemplateFilePath(cfg.template)
    || path.join(__dirname, '../templates/settlement', cfg.template);

  if (!tplPath || !fs.existsSync(tplPath)) {
    throw new Error(`[${cfg.name}] 한글 템플릿(${cfg.template})을 찾을 수 없습니다.`);
  }

  const status = await getSeonsanEvidenceStatus(numYear, numMonth, direction);
  const invMap = {
    salesService: customInputs.salesService || status.invoiceMap.salesService,
    salesReceipt: customInputs.salesReceipt || status.invoiceMap.salesReceipt,
    chemical: customInputs.chemical || status.invoiceMap.chemical,
    chemicalReceipt: customInputs.chemicalReceipt || status.invoiceMap.chemicalReceipt,
    kit: customInputs.kit || status.invoiceMap.kit,
    kitReceipt: customInputs.kitReceipt || status.invoiceMap.kitReceipt,
    waterQuality: customInputs.waterQuality || status.invoiceMap.waterQuality,
    waterReceipt: customInputs.waterReceipt || status.invoiceMap.waterReceipt,
    test1: customInputs.test1 || status.invoiceMap.test1,
    test2: customInputs.test2 || status.invoiceMap.test2,
    test3: customInputs.test3 || status.invoiceMap.test3,
    test4: customInputs.test4 || status.invoiceMap.test4,
  };

  const tplBuf = fs.readFileSync(tplPath);
  const zip = await JSZip.loadAsync(tplBuf);

  // 1. 년월 텍스트 치환 (Contents/section0.xml & Preview/PrvText.txt)
  if (zip.file('Contents/section0.xml')) {
    let sec0Text = await zip.file('Contents/section0.xml').async('string');
    sec0Text = sec0Text.replace(/\([0-9]{2}\.[0-9]{1,2}월\)/g, `(${yy}.${numMonth}월)`);
    sec0Text = sec0Text.replace(/[0-9]{4}\s*년\s*[0-9]{1,2}\s*월/g, `${numYear}년 ${numMonth}월`);
    zip.file('Contents/section0.xml', sec0Text);
  }
  if (zip.file('Preview/PrvText.txt')) {
    let prvText = await zip.file('Preview/PrvText.txt').async('string');
    prvText = prvText.replace(/\([0-9]{2}\.[0-9]{1,2}월\)/g, `(${yy}.${numMonth}월)`);
    zip.file('Preview/PrvText.txt', prvText);
  }

  // 2. 책갈피 12종 이미지 바인딩 (증빙 누락 시 원본 이미지 보존)
  const imageSlots = [
    { id: 'image3', filePath: invMap.salesService, name: '용역비계산서' },
    { id: 'image4', filePath: invMap.salesReceipt, name: '용역비입금확인증' },
    { id: 'image5', filePath: invMap.chemical, name: '약품비계산서' },
    { id: 'image6', filePath: invMap.chemicalReceipt, name: '약품비입금표' },
    { id: 'image7', filePath: invMap.kit, name: '분석키트계산서' },
    { id: 'image8', filePath: invMap.kitReceipt, name: '분석키트입금표' },
    { id: 'image9', filePath: invMap.waterQuality, name: '수질분석계산서' },
    { id: 'image10', filePath: invMap.waterReceipt, name: '수질분석입금표' },
    { id: 'image11', filePath: invMap.test1, name: '성적서1' },
    { id: 'image12', filePath: invMap.test2, name: '성적서2' },
    { id: 'image13', filePath: invMap.test3, name: '성적서3' },
    { id: 'image14', filePath: invMap.test4, name: '성적서4' },
  ];

  for (const slot of imageSlots) {
    if (!slot.filePath || !fs.existsSync(slot.filePath)) {
      continue; // 원본 이미지 보존 (Fallback)
    }
    // zip 내부 파일 확장자 확인 (image4.jpg vs imageX.bmp)
    let targetZipPath = `BinData/${slot.id}.bmp`;
    let targetExt = '.bmp';
    if (zip.file(`BinData/${slot.id}.jpg`)) {
      targetZipPath = `BinData/${slot.id}.jpg`;
      targetExt = '.jpg';
    } else if (zip.file(`BinData/${slot.id}.png`)) {
      targetZipPath = `BinData/${slot.id}.png`;
      targetExt = '.png';
    }

    const imgBuf = convertToImageBuffer(slot.filePath, targetExt);
    if (imgBuf && imgBuf.length > 0) {
      zip.file(targetZipPath, imgBuf);
      console.log(`[seonsanSettlement] [${cfg.shortName}] 바인딩 성공: ${slot.name} -> ${targetZipPath} (${imgBuf.length} bytes)`);
    }
  }

  const outputBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  const desktop = getPrimaryDesktop();
  const outputFileName = `${cfg.outputPrefix} ${numMonth}월 도로공사 정산 서류.hwpx`;

  // 저장 경로 목록: M월정산자료, M월, YYYYMM
  const saveFolders = [
    path.join(desktop, '월정산', cfg.dirName, `${numMonth}월정산자료`),
    path.join(desktop, '월정산', cfg.dirName, `${numMonth}월`),
    path.join(desktop, '월정산', cfg.dirName, targetYm),
  ];

  const savedPaths = [];
  for (const folder of saveFolders) {
    try {
      if (!fs.existsSync(folder)) fs.mkdirSync(folder, { recursive: true });
      const destFile = path.join(folder, outputFileName);
      fs.writeFileSync(destFile, outputBuffer);
      savedPaths.push(destFile);
    } catch (e) {
      console.warn(`[seonsanSettlement] 폴더 저장 실패 (${folder}):`, e.message);
    }
  }

  return {
    success: true,
    siteName: cfg.name,
    targetYm,
    fileName: outputFileName,
    outPath: savedPaths[0] || path.join(saveFolders[0], outputFileName),
    savedPaths,
    buffer: outputBuffer,
  };
}

async function generateSeonsanAllReports(year, month, direction = 'changwon', customInputs = {}) {
  const hwpResult = await generateSeonsanHwpReport(year, month, direction, customInputs);
  return {
    success: true,
    siteName: hwpResult.siteName,
    targetYm: hwpResult.targetYm,
    hwpResult,
    allSavedPaths: hwpResult.savedPaths,
  };
}

module.exports = {
  getSeonsanEvidenceStatus,
  generateSeonsanHwpReport,
  generateSeonsanAllReports,
};
