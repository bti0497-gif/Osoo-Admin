/**
 * 밀양영남루(울산방향) 한글(HWPX) 도로공사 정산 서류 + 엑셀(XLSX) 정산서 자동 생성 서비스
 * 
 * [확정 규격 & 엔진]
 * - 템플릿: template_miryang.hwpx (및 .hwp) + template_miryang_sub.xlsx (및 _excel.xlsx)
 * - 초고속 무결성 HWPX (ZIP/XML) & XLSX (ZIP/XML) 다이렉트 바인딩 엔진 (COM 프리, 원본 서식/수식 100% 보존)
 * - 한글(HWPX) 증빙 항목 1:1 완벽 교체:
 *   1. Pic #1: 위탁관리계약서 사본 (고정 템플릿 유지)
 *   2. Pic #2 (책갈피: '용역비계산서', image2): 매출계산서 (용역비) - 반드시 '매출계산서_' 시작
 *   3. Pic #3 (책갈피: '약품비계산서', image3): 매입계산서 (에이치 / 약품비) - 매출 제외
 *   4. Pic #4 (책갈피: '분석키트계산서', image4): 매입계산서 (케이엠 / 분석키트) - 매출 제외
 *   5. Pic #5 (책갈피: '수질분석비계산서', image5): 매입계산서 (대신 / 수질분석비) - 매출 제외
 *   6. Pic #6 (책갈피: '슬러지계산서', image6): 매입계산서 (슬러지처리비) - 있으면 바인딩, 없으면 템플릿 보존!
 * - 한글 책갈피 및 월 표기 교체:
 *   - 책갈피 `<hp:bookmark name="26.10월)"/>` -> `<hp:bookmark name="${yy}.${numMonth}월)"/>`
 *   - 본문 표기 `(26.10월)` -> `(${yy}.${numMonth}월)`
 * - 엑셀(XLSX) 자동 작성:
 *   - `definedNames` ('월분', sheet1 A6): `□ ${numMonth}월분 관리비 내역`
 *   - `drawing1.xml` 도형('월정산제목'/'월제목'): `${numMonth}월  밀양영남루(울산)휴게소 오수처리시설 정산`
 * - 저장 위치:
 *   - 바탕화면 > 월정산 > 밀양휴게소마감자료 > YYYYMM (및 M월)
 *   - 바탕화면 루트 동시 보존
 */

const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');
const { resolveTemplateFilePath } = require('./settlementService.cjs');
const { drive, downloadDriveFileBuffer } = require('./driveService.cjs');

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

function findLocalImageFile(dirs, pattern, options = {}) {
  const imageExts = new Set(['.jpg', '.jpeg', '.png', '.bmp']);
  const { mustStartWith = null, excludePattern = null } = options;
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    try {
      const files = fs.readdirSync(dir);
      for (const file of files) {
        const ext = path.extname(file).toLowerCase();
        if (imageExts.has(ext)) {
          if (mustStartWith && !file.startsWith(mustStartWith)) continue;
          if (excludePattern && excludePattern.test(file)) continue;
          if (pattern.test(file)) {
            return path.join(dir, file);
          }
        }
      }
    } catch (_) {}
  }
  return null;
}

/**
 * Google Drive에서 밀양(영남루) 해당 월 계산서 검색 및 로컬 다운로드
 */
async function ensureMiryangInvoicesFromDrive(year, month) {
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
    const q = `(name contains '밀양' or name contains '영남루') and (name contains '계산서' or name contains '매출' or name contains '슬러지' or name contains '청소' or name contains '필증') and name contains '${targetYm}' and trashed = false`;
    const res = await drive.files.list({
      q,
      fields: 'files(id, name, mimeType)',
      pageSize: 30,
      spaces: 'drive',
      includeItemsFromAllDrives: true,
      supportsAllDrives: true,
    });

    const driveFiles = res.data.files || [];
    for (const df of driveFiles) {
      const destPath = path.join(localInvoiceDir, df.name);
      if (!fs.existsSync(destPath)) {
        try {
          const buf = await downloadDriveFileBuffer(df.id);
          fs.writeFileSync(destPath, buf);
        } catch (_) {}
      }
    }
  } catch (_) {}
}

/**
 * 밀양휴게소 계산서 및 증빙 파일 상태 진단
 */
async function getMiryangEvidenceStatus(year, month) {
  const numYear = Number(year) || 2026;
  const numMonth = Number(month) || 10;
  const targetYm = `${numYear}${String(numMonth).padStart(2, '0')}`;
  const desktop = getPrimaryDesktop();

  await ensureMiryangInvoicesFromDrive(numYear, numMonth);

  const searchDirs = [
    path.join(desktop, '점검준비', '계산서', targetYm),
    path.join(desktop, '월정산', '밀양휴게소마감자료', targetYm),
    path.join(desktop, '월정산', '밀양휴게소마감자료', `${numMonth}월`),
    path.join(desktop, '점검준비', '계산서'),
    path.join(desktop, '월정산', '밀양휴게소마감자료'),
  ].filter((d) => fs.existsSync(d));

  // 1. Pic #2: 매출계산서 (용역비) - 반드시 '매출계산서_' 시작 & (밀양 OR 영남루) & (용역비 OR 관리비)
  const salesService = findLocalImageFile(searchDirs, /(?:밀양|영남루).*(?:용역비|관리비)|(?:용역비|관리비).*(?:밀양|영남루)/i, { mustStartWith: '매출계산서' })
    || findLocalImageFile(searchDirs, /(?:밀양|영남루)/i, { mustStartWith: '매출계산서' })
    || findLocalImageFile(searchDirs, /(?:밀양|영남루).*(?:용역비|관리비)|(?:용역비|관리비).*(?:밀양|영남루)/i, { mustStartWith: '매출' });

  // 2. Pic #3: 약품비계산서 (에이치디이앤씨 / 영일과학상사) - 반드시 (밀양 OR 영남루) & (에이치 OR 영일 OR 약품), 매출 제외
  const chemical = findLocalImageFile(searchDirs, /(?:밀양|영남루).*(?:에이치디이앤씨|에이치디이엔씨|에이치디|에이치|영일과학상사|영일과학|영일|약품)|(?:에이치디이앤씨|에이치디이엔씨|에이치디|에이치|영일과학상사|영일과학|영일|약품).*(?:밀양|영남루)/i, { excludePattern: /^매출/i })
    || findLocalImageFile(searchDirs, /에이치디이앤씨|에이치디이엔씨|에이치디|에이치|영일과학상사|영일과학|영일|약품/i, { excludePattern: /^매출/i });

  // 3. Pic #4: 분석키트계산서 (케이엠) - 반드시 (밀양 OR 영남루) & (케이엠 OR 키트), 매출 제외
  const kit = findLocalImageFile(searchDirs, /(?:밀양|영남루).*(?:케이엠|키트)|(?:케이엠|키트).*(?:밀양|영남루)/i, { excludePattern: /^매출/i });

  // 4. Pic #5: 수질분석비계산서 (대신) - 반드시 (밀양 OR 영남루) & (대신 OR 수질분석), 매출 제외
  const waterQuality = findLocalImageFile(searchDirs, /(?:밀양|영남루).*(?:대신|수질분석)|(?:대신|수질분석).*(?:밀양|영남루)/i, { excludePattern: /^매출/i });

  // 5. Pic #6: 슬러지계산서 - 반드시 (밀양 OR 영남루) & (슬러지 OR 분뇨), 매출 제외 (없어도 템플릿 유지)
  const sludge = findLocalImageFile(searchDirs, /(?:밀양|영남루).*(?:슬러지|분뇨)|(?:슬러지|분뇨).*(?:밀양|영남루)/i, { excludePattern: /^매출/i });

  const invoiceMap = {
    salesService: salesService || null,
    chemical: chemical || null,
    kit: kit || null,
    waterQuality: waterQuality || null,
    sludge: sludge || null,
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
    allReady: missing.length === 0,
    missing,
    invoiceMap,
  };
}

/**
 * 밀양휴게소 엑셀(XLSX) 정산서 자동 생성 (서식/수식 100% 무결성 보존)
 */
async function generateMiryangExcelReport(year, month) {
  const numYear = Number(year) || 2026;
  const numMonth = Number(month) || 10;
  const targetYm = `${numYear}${String(numMonth).padStart(2, '0')}`;

  let tplPath = resolveTemplateFilePath('template_miryang_sub.xlsx')
    || resolveTemplateFilePath('template_miryang_excel.xlsx')
    || path.join(__dirname, '../templates/settlement/template_miryang_sub.xlsx');

  if (!tplPath || !fs.existsSync(tplPath)) {
    throw new Error('밀양휴게소 엑셀 템플릿(template_miryang_sub.xlsx)을 찾을 수 없습니다.');
  }

  const rawData = fs.readFileSync(tplPath);
  const zip = await JSZip.loadAsync(rawData);

  // 1. drawing1.xml 내 텍스트박스('월정산제목'/'월제목') 텍스트 치환
  const drawXmlPath = 'xl/drawings/drawing1.xml';
  if (zip.file(drawXmlPath)) {
    let drawXml = await zip.file(drawXmlPath).async('text');
    const spRegex = /(<xdr:sp\b[\s\S]*?<xdr:cNvPr[^>]*name="(?:월정산제목|월제목)"[\s\S]*?<xdr:txBody>)([\s\S]*?)(<\/xdr:txBody>[\s\S]*?<\/xdr:sp>)/i;
    if (spRegex.test(drawXml)) {
      const newTxBody = `<a:bodyPr vertOverflow="clip" wrap="square" lIns="54864" tIns="41148" rIns="54864" bIns="41148" anchor="ctr" upright="1"/><a:lstStyle/><a:p><a:pPr algn="ctr" rtl="0"><a:defRPr sz="1000"/></a:pPr><a:r><a:rPr lang="ko-KR" altLang="en-US" sz="2400" b="0" i="0" strike="noStrike"><a:solidFill><a:srgbClr val="000000"/></a:solidFill><a:latin typeface="HY견고딕"/><a:ea typeface="HY견고딕"/></a:rPr><a:t>${numMonth}월  밀양영남루(울산)휴게소 오수처리시설 정산</a:t></a:r><a:endParaRPr lang="en-US" altLang="ko-KR" sz="2400" b="0" i="0" strike="noStrike"><a:solidFill><a:srgbClr val="000000"/></a:solidFill><a:latin typeface="HY견고딕"/><a:ea typeface="HY견고딕"/></a:endParaRPr></a:p>`;
      drawXml = drawXml.replace(spRegex, `$1${newTxBody}$3`);
    } else {
      drawXml = drawXml.replace(/[0-9]{1,2}\s*월\s*밀양영남루/g, `${numMonth}월  밀양영남루`);
    }
    zip.file(drawXmlPath, drawXml);
  }

  // 2. sharedStrings.xml 내 '월분' 셀(A6) 텍스트 치환
  const ssPath = 'xl/sharedStrings.xml';
  if (zip.file(ssPath)) {
    let ssXml = await zip.file(ssPath).async('text');
    // Rich text 패턴 매칭
    const richRegex = /(<t>)[0-9]{1,2}(<\/t><\/r>\s*<r>[\s\S]*?<t>월분\s*관리비\s*내역<\/t>)/;
    if (richRegex.test(ssXml)) {
      ssXml = ssXml.replace(richRegex, `$1${numMonth}$2`);
    } else {
      ssXml = ssXml.replace(/([0-9]{1,2})(\s*월분\s*관리비\s*내역)/g, `${numMonth}$2`);
    }
    zip.file(ssPath, ssXml);
  }

  const outputBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  const desktop = getPrimaryDesktop();
  const outputFileName = '밀양휴게소오수처리비정산.xlsx';

  const folderYm = path.join(desktop, '월정산', '밀양휴게소마감자료', targetYm);
  const folderMonth = path.join(desktop, '월정산', '밀양휴게소마감자료', `${numMonth}월`);
  [folderYm, folderMonth].forEach((d) => {
    if (!fs.existsSync(d)) {
      try { fs.mkdirSync(d, { recursive: true }); } catch (_) {}
    }
  });

  const finalYm = path.join(folderYm, outputFileName);
  const finalMonth = path.join(folderMonth, outputFileName);
  const finalDesktop = path.join(desktop, outputFileName);

  fs.writeFileSync(finalYm, outputBuffer);
  fs.writeFileSync(finalMonth, outputBuffer);
  fs.writeFileSync(finalDesktop, outputBuffer);

  return { success: true, filePath: finalMonth, monthPath: finalMonth, ymPath: finalYm, fileName: outputFileName, targetYm };
}

/**
 * 밀양휴게소 한글(HWPX) 정산 서류 자동 생성
 */
async function generateMiryangHwpReport(year, month, customInputs = {}) {
  const numYear = Number(year) || 2026;
  const numMonth = Number(month) || 10;
  const targetYm = `${numYear}${String(numMonth).padStart(2, '0')}`;
  const yy = String(numYear).slice(-2);

  let tplPath = resolveTemplateFilePath('template_miryang.hwpx')
    || resolveTemplateFilePath('template_miryang.hwp')
    || path.join(__dirname, '../templates/settlement/template_miryang.hwpx');

  if (!tplPath || !fs.existsSync(tplPath)) {
    throw new Error('밀양휴게소 한글 템플릿(template_miryang.hwpx)을 찾을 수 없습니다.');
  }

  const tplData = fs.readFileSync(tplPath);
  const zip = await JSZip.loadAsync(tplData);

  const status = await getMiryangEvidenceStatus(numYear, numMonth);
  const invMap = {
    salesService: customInputs.salesService || status.invoiceMap.salesService,
    chemical: customInputs.chemical || status.invoiceMap.chemical,
    kit: customInputs.kit || status.invoiceMap.kit,
    waterQuality: customInputs.waterQuality || status.invoiceMap.waterQuality,
    sludge: customInputs.sludge || status.invoiceMap.sludge,
  };

  // 1. 본문 XML 및 미리보기 텍스트 연월 치환
  let section0Xml = await zip.file('Contents/section0.xml').async('string');
  section0Xml = section0Xml.replace(/<hp:bookmark\s+name="[0-9]{2}\.[0-9]{1,2}월\)"\/>/gi, `<hp:bookmark name="${yy}.${numMonth}월)"/>`);
  section0Xml = section0Xml.replace(/[0-9]{2}\.[0-9]{1,2}월\)/g, `${yy}.${numMonth}월)`);
  zip.file('Contents/section0.xml', section0Xml);

  if (zip.file('Preview/PrvText.txt')) {
    let prvText = await zip.file('Preview/PrvText.txt').async('string');
    prvText = prvText.replace(/[0-9]{2}\.[0-9]{1,2}월\)/g, `${yy}.${numMonth}월)`);
    zip.file('Preview/PrvText.txt', prvText);
  }

  // 2. 증빙 이미지 바인딩 (슬러지는 파일이 없을 경우 기존 템플릿 이미지 보존)
  let contentHpf = await zip.file('Contents/content.hpf').async('string');
  const replacements = [
    { id: 'image2', filePath: invMap.salesService, name: '위탁관리비계산서(용역비)' },
    { id: 'image3', filePath: invMap.chemical, name: '약품비계산서(에이치디이앤씨/영일과학상사)' },
    { id: 'image4', filePath: invMap.kit, name: '분석키트계산서(케이엠)' },
    { id: 'image5', filePath: invMap.waterQuality, name: '수질분석비계산서(대신)' },
    { id: 'image6', filePath: invMap.sludge, name: '슬러지계산서' },
  ];

  for (const item of replacements) {
    if (item.filePath && fs.existsSync(item.filePath)) {
      const ext = path.extname(item.filePath).toLowerCase();
      const rawBuf = fs.readFileSync(item.filePath);
      const isPng = ext === '.png';
      const newExt = isPng ? 'png' : 'jpg';
      const mediaType = isPng ? 'image/png' : 'image/jpeg';

      zip.remove(`BinData/${item.id}.bmp`);
      zip.remove(`BinData/${item.id}.jpg`);
      zip.remove(`BinData/${item.id}.png`);
      zip.file(`BinData/${item.id}.${newExt}`, rawBuf);

      const itemRegex = new RegExp(`href="BinData\\/${item.id}\\.[a-zA-Z0-9]+"[^>]*media-type="[^"]*"`, 'i');
      contentHpf = contentHpf.replace(itemRegex, `href="BinData/${item.id}.${newExt}" media-type="${mediaType}"`);
      console.log(`[miryangSettlement] 바인딩 완료: ${item.name} <- ${path.basename(item.filePath)}`);
    } else {
      console.log(`[miryangSettlement] 템플릿 유지: ${item.name} (중앙관리자 직접 교체 가능)`);
    }
  }

  zip.file('Contents/content.hpf', contentHpf);

  const outputBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  const desktop = getPrimaryDesktop();
  const outputHwpx = `밀양영남루(울산)휴게소 ${numMonth}월 도로공사 정산 서류.hwpx`;
  const outputHwp = `밀양영남루(울산)휴게소 ${numMonth}월 도로공사 정산 서류.hwp`;

  const folderYm = path.join(desktop, '월정산', '밀양휴게소마감자료', targetYm);
  const folderMonth = path.join(desktop, '월정산', '밀양휴게소마감자료', `${numMonth}월`);
  [folderYm, folderMonth].forEach((d) => {
    if (!fs.existsSync(d)) {
      try { fs.mkdirSync(d, { recursive: true }); } catch (_) {}
    }
  });

  const finalYmHwpx = path.join(folderYm, outputHwpx);
  const finalYmHwp = path.join(folderYm, outputHwp);
  const finalMonthHwpx = path.join(folderMonth, outputHwpx);
  const finalMonthHwp = path.join(folderMonth, outputHwp);
  const finalDesktopHwpx = path.join(desktop, outputHwpx);
  const finalDesktopHwp = path.join(desktop, outputHwp);

  fs.writeFileSync(finalYmHwpx, outputBuffer);
  fs.writeFileSync(finalYmHwp, outputBuffer);
  fs.writeFileSync(finalMonthHwpx, outputBuffer);
  fs.writeFileSync(finalMonthHwp, outputBuffer);
  fs.writeFileSync(finalDesktopHwpx, outputBuffer);
  fs.writeFileSync(finalDesktopHwp, outputBuffer);

  return { success: true, filePath: finalMonthHwpx, monthPath: finalMonthHwpx, ymPath: finalYmHwpx, desktopPath: finalDesktopHwpx, fileName: outputHwpx, targetYm, status };
}

/**
 * 밀양휴게소 한글 정산서 + 엑셀 명세서 동시 일괄 생성
 */
async function generateMiryangAllReports(year, month, customInputs = {}) {
  const hwpRes = await generateMiryangHwpReport(year, month, customInputs);
  const excelRes = await generateMiryangExcelReport(year, month);

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
  getMiryangEvidenceStatus,
  generateMiryangExcelReport,
  generateMiryangHwpReport,
  generateMiryangAllReports,
};
