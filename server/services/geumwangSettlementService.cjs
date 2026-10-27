/**
 * 금왕휴게소(평택방향) 한글(HWPX) 도로공사 정산 서류 자동 생성 서비스
 * 
 * [확정 규격 & 엔진]
 * - 템플릿: template_geumwang.hwpx (및 template_geumwang.hwp)
 * - 초고속 무결성 HWPX (ZIP/XML) 다이렉트 바인딩 엔진 (COM 프리, 초저지연)
 * - 증빙 항목 1:1 완벽 교체:
 *   1. Pic #1, #2: 위탁관리계약서 및 일반조건 (고정 템플릿 유지)
 *   2. Pic #3 (책갈피: '위탁관리비계산서', image3): 매출계산서 (용역비) - 반드시 '매출계산서_' 시작
 *   3. Pic #4 (책갈피: '위탁관리비입금표', image4): 위탁관리비 입금표/이체확인증 (있을 시 바인딩)
 *   4. Pic #5 (책갈피: '약품비계산서', image5): 매입계산서 (영일 / 약품비) - 매출 제외
 *   5. Pic #6 (책갈피: '약품비입금표', image6): 약품비 이체확인증 (영일)
 *   6. Pic #7 (책갈피: '분석키트계산서', image7): 매입계산서 (케이엠 / 분석키트) - 매출 제외
 *   7. Pic #8 (책갈피: '분석키트입금표', image8): 분석시약 이체확인증 (케이엠)
 *   8. Pic #9 (책갈피: '수질분석계산서', image9): 매입계산서 (대신 / 수질분석비) - 매출 제외
 *   9. Pic #10 (책갈피: '수질분석입금표', image10): 수질분석비 이체확인증 (대신)
 *   10. Pic #11~#14 (책갈피: '성적서1'~'성적서4', image11~image14): MLSS 성적서 (있을 시 바인딩)
 *   11. Pic #15 (책갈피: '슬러지계산서', image15): 매입계산서 (충북위생사 / 슬러지) - 매출 제외
 *   12. Pic #16 (책갈피: '슬러지입금표', image16): 슬러지반출 이체확인증 (충북위생사)
 *   13. Pic #17 (책갈피: '청소필증', image17): 청소필증/영수증 (현장앱 미설치로 Drive 미연동 -> 로컬 탐색 or UI 첨부, 없으면 템플릿 유지)
 *   14. Pic #18, #19 (책갈피: '슬러지사진1', '슬러지사진2', image18, image19): 작업사진 (있을 시 바인딩)
 * - 책갈피 및 월 표기 교체:
 *   - 책갈피 `<hp:bookmark name="26.10월)"/>` -> `<hp:bookmark name="${yy}.${numMonth}월)"/>`
 *   - 본문 표기 `(26.10월)` -> `(${yy}.${numMonth}월)`
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

function fileMatches(fileName, allOf = [], anyOf = [], noneOf = []) {
  const lower = fileName.toLowerCase();
  for (const n of noneOf) {
    if (lower.includes(n.toLowerCase())) return false;
  }
  for (const a of allOf) {
    if (!lower.includes(a.toLowerCase())) return false;
  }
  if (anyOf.length > 0) {
    const hasAny = anyOf.some(o => lower.includes(o.toLowerCase()));
    if (!hasAny) return false;
  }
  return true;
}

function findFile(dirs, matcher) {
  const imageExts = new Set(['.jpg', '.jpeg', '.png', '.bmp']);
  for (const d of dirs) {
    if (!fs.existsSync(d)) continue;
    try {
      const files = fs.readdirSync(d);
      for (const f of files) {
        const ext = path.extname(f).toLowerCase();
        if (imageExts.has(ext) && matcher(f)) {
          return path.join(d, f);
        }
      }
    } catch (_) {}
  }
  return null;
}

function findMultipleFiles(dirs, matcher) {
  const imageExts = new Set(['.jpg', '.jpeg', '.png', '.bmp']);
  const res = [];
  for (const d of dirs) {
    if (!fs.existsSync(d)) continue;
    try {
      const files = fs.readdirSync(d).sort();
      for (const f of files) {
        const ext = path.extname(f).toLowerCase();
        if (imageExts.has(ext) && matcher(f)) {
          res.push(path.join(d, f));
        }
      }
    } catch (_) {}
  }
  return res;
}

/**
 * Google Drive에서 금왕 해당 월 계산서 검색 및 로컬 다운로드 (선택적)
 */
async function ensureGeumwangInvoicesFromDrive(year, month) {
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
    const q = `name contains '금왕' and (name contains '계산서' or name contains '매출' or name contains '입금표') and name contains '${targetYm}' and trashed = false`;
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
 * 금왕휴게소 증빙 파일 상태 진단
 */
async function getGeumwangEvidenceStatus(year, month) {
  const numYear = Number(year) || 2026;
  const numMonth = Number(month) || 10;
  const targetYm = `${numYear}${String(numMonth).padStart(2, '0')}`;
  const desktop = getPrimaryDesktop();

  await ensureGeumwangInvoicesFromDrive(numYear, numMonth);

  const searchDirs = [
    path.join(desktop, '점검준비', '계산서', targetYm),
    path.join(desktop, '점검준비', '입금표', targetYm),
    path.join(desktop, '점검준비', '성적서', targetYm),
    path.join(desktop, '월정산', '금왕휴게소마감자료', targetYm),
    path.join(desktop, '월정산', '금왕휴게소마감자료', `${numMonth}월 정산자료`),
    path.join(desktop, '월정산', '금왕휴게소마감자료', `${numMonth}월`),
    path.join(desktop, '월정산', '금왕휴게소마감자료'),
    path.join(desktop, '점검준비', '계산서'),
    path.join(desktop, '점검준비', '입금표'),
    path.join(desktop, '점검준비', '성적서'),
  ].filter((d) => fs.existsSync(d));

  // 1. 위탁관리비계산서: 반드시 '매출계산서_' 시작 & 금왕 용역비/관리비 매칭
  const salesService = findFile(searchDirs, f => f.startsWith('매출') && fileMatches(f, ['금왕'], ['용역비', '관리비']));

  // 2. 위탁관리비입금표 (선택적)
  const salesReceipt = findFile(searchDirs, f => fileMatches(f, ['금왕'], ['용역비', '위탁', '관리비'], ['매출계산서', '계산서']) && (f.includes('입금') || f.includes('이체')));

  // 3. 약품비계산서: 매입계산서 (영일과학상사 / 영일) - 매출 제외
  const chemical = findFile(searchDirs, f => !f.startsWith('매출') && fileMatches(f, ['금왕'], ['영일', '약품']) && f.includes('계산서'));

  // 4. 약품비입금표
  const chemicalReceipt = findFile(searchDirs, f => fileMatches(f, ['금왕'], ['영일', '약품'], ['계산서']) && (f.includes('입금') || f.includes('이체')));

  // 5. 분석키트계산서: 매입계산서 (케이엠에스씨 / 케이엠) - 매출 제외
  const kit = findFile(searchDirs, f => !f.startsWith('매출') && fileMatches(f, ['금왕'], ['케이엠', '키트']) && f.includes('계산서'));

  // 6. 분석키트입금표
  const kitReceipt = findFile(searchDirs, f => fileMatches(f, ['금왕'], ['케이엠', '키트'], ['계산서']) && (f.includes('입금') || f.includes('이체')));

  // 7. 수질분석비계산서: 매입계산서 (대신환경기술 / 대신) - 매출 제외
  const waterQuality = findFile(searchDirs, f => !f.startsWith('매출') && fileMatches(f, ['금왕'], ['대신', '수질']) && (f.includes('계산서') || f.includes('게산서')));

  // 8. 수질분석입금표
  const waterReceipt = findFile(searchDirs, f => fileMatches(f, ['금왕'], ['대신', '수질'], ['계산서']) && (f.includes('입금') || f.includes('이체')));

  // 9. 슬러지계산서: 매입계산서 (충북위생사 / 슬러지) - 매출 및 영수증 제외
  const sludge = findFile(searchDirs, f => !f.startsWith('매출') && fileMatches(f, ['금왕'], ['충북위생사', '슬러지'], ['영수증', '필증']) && f.includes('계산서'));

  // 10. 슬러지입금표
  const sludgeReceipt = findFile(searchDirs, f => fileMatches(f, ['금왕'], ['충북위생사', '슬러지'], ['계산서']) && (f.includes('입금') || f.includes('이체')));

  // 11. 청소필증 (현장관리자용 앱 미설치 -> 로컬 탐색, 없으면 Optional 통과)
  const cleaningCert = findFile(searchDirs, f => !f.startsWith('매출') && fileMatches(f, ['금왕'], ['청소필증', '영수증', '슬러지계산서']));

  // 12. 성적서 1~4 (MLSS 이미지)
  const mlssImages = findMultipleFiles(searchDirs, f => fileMatches(f, ['금왕'], ['mlss', '성적서']));

  const invoiceMap = {
    salesService: salesService || null,
    salesReceipt: salesReceipt || null,
    chemical: chemical || null,
    chemicalReceipt: chemicalReceipt || null,
    kit: kit || null,
    kitReceipt: kitReceipt || null,
    waterQuality: waterQuality || null,
    waterReceipt: waterReceipt || null,
    sludge: sludge || null,
    sludgeReceipt: sludgeReceipt || null,
    cleaningCert: cleaningCert || null,
    mlss1: mlssImages[0] || null,
    mlss2: mlssImages[1] || null,
    mlss3: mlssImages[2] || null,
    mlss4: mlssImages[3] || null,
  };

  // 필수 항목 (청소필증/입금표/성적서는 Optional 처리되어 생성을 막지 않음)
  const missing = [];
  if (!salesService) missing.push('매출계산서(용역비)');
  if (!chemical) missing.push('약품비계산서(영일)');
  if (!kit) missing.push('분석키트계산서(케이엠)');
  if (!waterQuality) missing.push('수질분석비계산서(대신)');
  if (!sludge) missing.push('슬러지처리비계산서(충북위생사)');

  return {
    year: numYear,
    month: numMonth,
    targetYm,
    allReady: missing.length === 0,
    missing,
    hasCleaningCert: Boolean(cleaningCert),
    invoiceMap,
  };
}

/**
 * 금왕 한글(HWPX) 정산서 자동 생성 메인 함수
 */
async function generateGeumwangHwpReport(year, month, customInputs = {}) {
  const numYear = Number(year) || 2026;
  const numMonth = Number(month) || 10;
  const targetYm = `${numYear}${String(numMonth).padStart(2, '0')}`;
  const yy = String(numYear).slice(-2);

  let tplPath = resolveTemplateFilePath('template_geumwang.hwpx')
    || resolveTemplateFilePath('template_geumwang.hwp')
    || path.join(__dirname, '../templates/settlement/template_geumwang.hwpx');

  if (!tplPath || !fs.existsSync(tplPath)) {
    throw new Error('금왕휴게소 한글 템플릿 파일(template_geumwang.hwpx)을 찾을 수 없습니다.');
  }

  console.log(`[geumwangSettlement] 1. 템플릿 파일 로드: ${tplPath}`);
  const tplData = fs.readFileSync(tplPath);
  const zip = await JSZip.loadAsync(tplData);

  const status = await getGeumwangEvidenceStatus(numYear, numMonth);
  const invMap = {
    salesService: customInputs.salesService || status.invoiceMap.salesService,
    salesReceipt: customInputs.salesReceipt || status.invoiceMap.salesReceipt,
    chemical: customInputs.chemical || status.invoiceMap.chemical,
    chemicalReceipt: customInputs.chemicalReceipt || status.invoiceMap.chemicalReceipt,
    kit: customInputs.kit || status.invoiceMap.kit,
    kitReceipt: customInputs.kitReceipt || status.invoiceMap.kitReceipt,
    waterQuality: customInputs.waterQuality || status.invoiceMap.waterQuality,
    waterReceipt: customInputs.waterReceipt || status.invoiceMap.waterReceipt,
    sludge: customInputs.sludge || status.invoiceMap.sludge,
    sludgeReceipt: customInputs.sludgeReceipt || status.invoiceMap.sludgeReceipt,
    cleaningCert: customInputs.cleaningCert || status.invoiceMap.cleaningCert,
    mlss1: customInputs.mlss1 || status.invoiceMap.mlss1,
    mlss2: customInputs.mlss2 || status.invoiceMap.mlss2,
    mlss3: customInputs.mlss3 || status.invoiceMap.mlss3,
    mlss4: customInputs.mlss4 || status.invoiceMap.mlss4,
    sludgePhoto1: customInputs.sludgePhoto1 || null,
    sludgePhoto2: customInputs.sludgePhoto2 || null,
  };

  // 본문 XML 연월 및 책갈피 치환
  console.log(`[geumwangSettlement] 2. 연월(${yy}.${numMonth}월) 치환...`);
  let section0Xml = await zip.file('Contents/section0.xml').async('string');

  // 책갈피 치환: <hp:bookmark name="26.10월)"/> -> name="${yy}.${numMonth}월)"/>
  section0Xml = section0Xml.replace(
    /<hp:bookmark\s+name="[0-9]{2}\.[0-9]{1,2}월\)"\/>/gi,
    `<hp:bookmark name="${yy}.${numMonth}월)"/>`
  );
  // 본문 텍스트 연월 치환
  section0Xml = section0Xml.replace(/\([0-9]{2}\.[0-9]{1,2}월\)/g, `(${yy}.${numMonth}월)`);
  section0Xml = section0Xml.replace(/<hp:t>[0-9]{2}\.[0-9]{1,2}월\)<\/hp:t>/g, `<hp:t>${yy}.${numMonth}월)</hp:t>`);

  zip.file('Contents/section0.xml', section0Xml);

  if (zip.file('Preview/PrvText.txt')) {
    let prvText = await zip.file('Preview/PrvText.txt').async('string');
    prvText = prvText.replace(/\([0-9]{2}\.[0-9]{1,2}월\)/g, `(${yy}.${numMonth}월)`);
    zip.file('Preview/PrvText.txt', prvText);
  }

  // 증빙 이미지 1:1 교체
  console.log('[geumwangSettlement] 3. 증빙 이미지 바인딩...');
  let contentHpf = await zip.file('Contents/content.hpf').async('string');

  const replacements = [
    { id: 'image3', filePath: invMap.salesService, name: '위탁관리비계산서(용역비)' },
    { id: 'image4', filePath: invMap.salesReceipt, name: '위탁관리비입금표' },
    { id: 'image5', filePath: invMap.chemical, name: '약품비계산서(영일)' },
    { id: 'image6', filePath: invMap.chemicalReceipt, name: '약품비입금표(영일)' },
    { id: 'image7', filePath: invMap.kit, name: '분석키트계산서(케이엠)' },
    { id: 'image8', filePath: invMap.kitReceipt, name: '분석키트입금표(케이엠)' },
    { id: 'image9', filePath: invMap.waterQuality, name: '수질분석계산서(대신)' },
    { id: 'image10', filePath: invMap.waterReceipt, name: '수질분석입금표(대신)' },
    { id: 'image11', filePath: invMap.mlss1, name: '성적서1(MLSS 1차)' },
    { id: 'image12', filePath: invMap.mlss2, name: '성적서2(MLSS 2차)' },
    { id: 'image13', filePath: invMap.mlss3, name: '성적서3(MLSS 3차)' },
    { id: 'image14', filePath: invMap.mlss4, name: '성적서4(MLSS 4차)' },
    { id: 'image15', filePath: invMap.sludge, name: '슬러지계산서(충북위생사)' },
    { id: 'image16', filePath: invMap.sludgeReceipt, name: '슬러지입금표(충북위생사)' },
    { id: 'image17', filePath: invMap.cleaningCert, name: '청소필증/영수증' },
    { id: 'image18', filePath: invMap.sludgePhoto1, name: '슬러지작업사진1' },
    { id: 'image19', filePath: invMap.sludgePhoto2, name: '슬러지작업사진2' },
  ];

  for (const item of replacements) {
    if (item.filePath && fs.existsSync(item.filePath)) {
      const ext = path.extname(item.filePath).toLowerCase();
      const rawBuf = fs.readFileSync(item.filePath);
      const isPng = ext === '.png';
      const isJpg = ext === '.jpg' || ext === '.jpeg';
      const newExt = isPng ? 'png' : isJpg ? 'jpg' : 'bmp';
      const mediaType = isPng ? 'image/png' : isJpg ? 'image/jpeg' : 'image/bmp';

      zip.remove(`BinData/${item.id}.bmp`);
      zip.remove(`BinData/${item.id}.jpg`);
      zip.remove(`BinData/${item.id}.png`);
      zip.file(`BinData/${item.id}.${newExt}`, rawBuf);

      const itemRegex = new RegExp(`href="BinData\\/${item.id}\\.[a-zA-Z0-9]+"[^>]*media-type="[^"]*"`, 'i');
      contentHpf = contentHpf.replace(itemRegex, `href="BinData/${item.id}.${newExt}" media-type="${mediaType}"`);
      console.log(`  -> [${item.name}] 바인딩 성공: ${path.basename(item.filePath)}`);
    } else {
      console.log(`  -> [${item.name}] 파일 없음, 기존 템플릿 유지`);
    }
  }

  zip.file('Contents/content.hpf', contentHpf);

  // 최종 패키지 빌드
  const outputBuffer = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  const desktop = getPrimaryDesktop();
  const outputFileName = `금왕휴게소 ${numMonth}월 도로공사 정산 서류.hwpx`;
  const outputHwpFileName = `금왕휴게소 ${numMonth}월 도로공사 정산 서류.hwp`;

  const targetFolderYm = path.join(desktop, '월정산', '금왕휴게소마감자료', targetYm);
  const targetFolderMonth = path.join(desktop, '월정산', '금왕휴게소마감자료', `${numMonth}월 정산자료`);
  const targetFolderSimple = path.join(desktop, '월정산', '금왕휴게소마감자료', `${numMonth}월`);

  [targetFolderYm, targetFolderMonth, targetFolderSimple].forEach((f) => {
    if (!fs.existsSync(f)) {
      try { fs.mkdirSync(f, { recursive: true }); } catch (_) {}
    }
  });

  const finalYmHwpx = path.join(targetFolderYm, outputFileName);
  const finalMonthHwpx = path.join(targetFolderMonth, outputFileName);
  const finalDesktopHwpx = path.join(desktop, outputFileName);
  const finalDesktopHwp = path.join(desktop, outputHwpFileName);

  fs.writeFileSync(finalYmHwpx, outputBuffer);
  fs.writeFileSync(path.join(targetFolderYm, outputHwpFileName), outputBuffer);
  fs.writeFileSync(finalMonthHwpx, outputBuffer);
  fs.writeFileSync(path.join(targetFolderMonth, outputHwpFileName), outputBuffer);
  fs.writeFileSync(finalDesktopHwpx, outputBuffer);
  fs.writeFileSync(finalDesktopHwp, outputBuffer);

  console.log(`[geumwangSettlement] 금왕 정산서 작성 완료! 저장: ${finalYmHwpx}`);

  return {
    success: true,
    filePath: finalYmHwpx,
    desktopPath: finalDesktopHwpx,
    fileName: outputFileName,
    targetYm,
    invoiceMap: invMap,
    status,
  };
}

module.exports = {
  getGeumwangEvidenceStatus,
  generateGeumwangHwpReport,
};
