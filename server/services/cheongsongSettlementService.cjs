/**
 * 청송휴게소(상주방향) 한글(HWPX) 도로공사 정산 서류 자동 생성 서비스
 * 
 * [확정 규격 & 엔진]
 * - 템플릿: template_cheongsong.hwpx (및 template_cheongsong.hwp)
 * - 초고속 무결성 HWPX (ZIP/XML) 다이렉트 바인딩 엔진 (COM 프리, 초저지연)
 * - 증빙 항목 1:1 완벽 교체:
 *   1. Pic #1: 위탁관리계약서 (고정 유지)
 *   2. Pic #2 (책갈피: '위탁관리비계산서', image2): 매출계산서 (용역비)
 *   3. Pic #3 (책갈피: '약품비계산서', image3): 매입계산서 (에이치 / 약품비)
 *   4. Pic #4 (책갈피: '분석키트계산서', image4): 매입계산서 (케이엠 / 분석키트)
 *   5. Pic #5 (책갈피: '수질분석비계산서', image5): 매입계산서 (대신 / 수질분석비)
 * - 책갈피 및 월 표기 교체:
 *   - 책갈피 `(26.10월)` -> `(YY.M월)`
 *   - 본문 표기 `(26.10월)` -> `(YY.M월)`
 * - Google Drive 연동:
 *   - 로컬 바탕화면에 계산서가 없으면 Google Drive에서 청송 계산서 4종을 자동 검색하여
 *     바탕화면 '점검준비/계산서/YYYYMM' 폴더로 자동 다운로드 후 바인딩
 * - 저장 위치:
 *   - 정규 마감 경로: 바탕화면 > 월정산 > 청송마감자료 > YYYYMM (및 M월)
 *   - 바탕화면 루트: 바로 열어볼 수 있도록 동시 복사 보존
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const JSZip = require('jszip');
const { getTemplateFilePath, resolveTemplateFilePath } = require('./settlementService.cjs');
const { drive, downloadDriveFileBuffer } = require('./driveService.cjs');

/**
 * 사용자 바탕화면(OneDrive 포함) 디렉토리 목록 조회
 */
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

/**
 * 특정 패턴의 이미지 파일 탐색
 * options:
 *   mustStartWith: 파일명이 특정 문자열로 시작해야 함 (예: '매출계산서', '매출')
 *   excludePattern: 해당 정규식과 일치하는 파일은 제외 (예: /^매출/i)
 */
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
 * Google Drive에서 청송 해당 월 계산서 검색 및 로컬 다운로드
 */
async function ensureCheongsongInvoicesFromDrive(year, month) {
  const numYear = Number(year) || 2026;
  const numMonth = Number(month) || 10;
  const targetYm = `${numYear}${String(numMonth).padStart(2, '0')}`;
  const desktop = getPrimaryDesktop();
  const localInvoiceDir = path.join(desktop, '점검준비', '계산서', targetYm);

  if (!fs.existsSync(localInvoiceDir)) {
    try {
      fs.mkdirSync(localInvoiceDir, { recursive: true });
    } catch (_) {}
  }

  if (!drive) {
    console.warn('[cheongsongSettlement] Google Drive 클라이언트 미설정으로 드라이브 검색을 건너뜁니다.');
    return;
  }

  try {
    console.log(`[cheongsongSettlement] Drive에서 청송 ${targetYm} 계산서 검색 중...`);
    const q = `name contains '청송' and (name contains '계산서' or name contains '매출') and name contains '${targetYm}' and trashed = false`;
    const res = await drive.files.list({
      q,
      fields: 'files(id, name, mimeType)',
      pageSize: 30,
      spaces: 'drive',
      includeItemsFromAllDrives: true,
      supportsAllDrives: true,
    });

    const driveFiles = res.data.files || [];
    console.log(`[cheongsongSettlement] Drive 검색 결과: ${driveFiles.length}개 발견`);

    for (const df of driveFiles) {
      const destPath = path.join(localInvoiceDir, df.name);
      if (!fs.existsSync(destPath)) {
        try {
          const buf = await downloadDriveFileBuffer(df.id);
          fs.writeFileSync(destPath, buf);
          console.log(`[cheongsongSettlement] Drive 계산서 다운로드 완료: ${df.name} (${buf.length} bytes)`);
        } catch (dlErr) {
          console.error(`[cheongsongSettlement] Drive 다운로드 실패 (${df.name}):`, dlErr.message);
        }
      }
    }
  } catch (driveErr) {
    console.error('[cheongsongSettlement] Drive 계산서 검색/다운로드 오류:', driveErr.message);
  }
}

/**
 * 청송휴게소 계산서 4종 상태 진단 (Drive 자동 동기화 포함)
 */
async function getCheongsongEvidenceStatus(year, month) {
  const numYear = Number(year) || 2026;
  const numMonth = Number(month) || 10;
  const targetYm = `${numYear}${String(numMonth).padStart(2, '0')}`;
  const desktop = getPrimaryDesktop();

  // 1. Google Drive에서 계산서 자동 동기화
  await ensureCheongsongInvoicesFromDrive(numYear, numMonth);

  // 2. 검색 대상 폴더 목록 구성
  const searchDirs = [
    path.join(desktop, '점검준비', '계산서', targetYm),
    path.join(desktop, '월정산', '청송마감자료', targetYm),
    path.join(desktop, '월정산', '청송마감자료', `${numMonth}월`),
    path.join(desktop, '점검준비', '계산서'),
    path.join(desktop, '월정산', '청송마감자료'),
  ].filter((d) => fs.existsSync(d));

  // 3. 4대 계산서 1:1 매칭 (매출/매입 엄격 구분)
  // - Pic #2 (위탁관리비계산서): 반드시 매출계산서_ 시작 & 용역비/관리비 매칭
  const salesService = findLocalImageFile(searchDirs, /용역비|관리비/i, { mustStartWith: '매출계산서' })
    || findLocalImageFile(searchDirs, /청송.*(?:용역비|관리비)|(?:용역비|관리비).*청송/i, { mustStartWith: '매출' })
    || findLocalImageFile(searchDirs, /용역비|관리비/i, { mustStartWith: '매출' })
    || findLocalImageFile(searchDirs, /청송.*매출/i, { mustStartWith: '매출' });

  // - Pic #3 (약품비계산서): 매입계산서 (에이치디이앤씨 / 영일과학상사 / 약품) - 매출 제외
  const chemical = findLocalImageFile(searchDirs, /청송.*(?:에이치디이앤씨|에이치디이엔씨|에이치디|에이치|영일과학상사|영일과학|영일|약품)|(?:에이치디이앤씨|에이치디이엔씨|에이치디|에이치|영일과학상사|영일과학|영일|약품).*청송/i, { excludePattern: /^매출/i })
    || findLocalImageFile(searchDirs, /에이치디이앤씨|에이치디이엔씨|에이치디|에이치|영일과학상사|영일과학|영일|약품/i, { excludePattern: /^매출/i });

  // - Pic #4 (분석키트계산서): 매입계산서 (케이엠 / 분석키트) - 매출 제외
  const kit = findLocalImageFile(searchDirs, /청송.*(?:케이엠|키트)|(?:케이엠|키트).*청송/i, { excludePattern: /^매출/i })
    || findLocalImageFile(searchDirs, /케이엠|분석키트계산서/i, { excludePattern: /^매출/i });

  // - Pic #5 (수질분석비계산서): 매입계산서 (대신 / 수질분석) - 매출 제외
  const waterQuality = findLocalImageFile(searchDirs, /청송.*(?:대신|수질분석)|(?:대신|수질분석).*청송/i, { excludePattern: /^매출/i })
    || findLocalImageFile(searchDirs, /대신.*계산서|수질분석계산서/i, { excludePattern: /^매출/i });

  const invoiceMap = {
    salesService: salesService || null,
    chemical: chemical || null,
    kit: kit || null,
    waterQuality: waterQuality || null,
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
 * 청송 한글(HWPX) 정산서 자동 생성 메인 함수
 */
async function generateCheongsongHwpReport(year, month, customInputs = {}) {
  const numYear = Number(year) || 2026;
  const numMonth = Number(month) || 10;
  const targetYm = `${numYear}${String(numMonth).padStart(2, '0')}`;
  const yy = String(numYear).slice(-2);
  const mm = String(numMonth).padStart(2, '0');

  // 1. 템플릿 파일 탐색 (template_cheongsong.hwpx 또는 template_cheongsong.hwp)
  let tplPath = resolveTemplateFilePath('template_cheongsong.hwpx')
    || resolveTemplateFilePath('template_cheongsong.hwp')
    || path.join(__dirname, '../templates/settlement/template_cheongsong.hwpx');

  if (!tplPath || !fs.existsSync(tplPath)) {
    throw new Error('청송휴게소 한글 템플릿 파일(template_cheongsong.hwpx)을 찾을 수 없습니다.');
  }

  console.log(`[cheongsongSettlement] 1. 템플릿 파일 로드: ${tplPath}`);
  const tplData = fs.readFileSync(tplPath);
  const zip = await JSZip.loadAsync(tplData);

  // 2. 증빙 계산서 수집
  const status = await getCheongsongEvidenceStatus(numYear, numMonth);
  const invMap = {
    salesService: customInputs.salesService || status.invoiceMap.salesService,
    chemical: customInputs.chemical || status.invoiceMap.chemical,
    kit: customInputs.kit || status.invoiceMap.kit,
    waterQuality: customInputs.waterQuality || status.invoiceMap.waterQuality,
  };

  // 3. 본문 XML 및 미리보기 텍스트 월(연월) 치환
  console.log(`[cheongsongSettlement] 2. 대상 연월(${yy}.${numMonth}월) 본문 및 책갈피 치환 진행...`);
  let section0Xml = await zip.file('Contents/section0.xml').async('string');

  // 책갈피 치환: <hp:bookmark name="(YY.M월)"/>
  section0Xml = section0Xml.replace(
    /<hp:bookmark\s+name="\([^"]*월\)"\/>/gi,
    `<hp:bookmark name="(${yy}.${numMonth}월)"/>`
  );
  // 본문 텍스트 치환: (26.10월), (26.9월) 등
  section0Xml = section0Xml.replace(/\([0-9]{2}\.[0-9]{1,2}월\)/g, `(${yy}.${numMonth}월)`);
  section0Xml = section0Xml.replace(/오수처리비용 정산증빌 자료\([^\)]*\)/g, `오수처리비용 정산증빌 자료(${yy}.${numMonth}월)`);

  zip.file('Contents/section0.xml', section0Xml);

  // PrvText.txt 갱신
  if (zip.file('Preview/PrvText.txt')) {
    let prvText = await zip.file('Preview/PrvText.txt').async('string');
    prvText = prvText.replace(/\([0-9]{2}\.[0-9]{1,2}월\)/g, `(${yy}.${numMonth}월)`);
    zip.file('Preview/PrvText.txt', prvText);
  }

  // 4. 계산서 이미지 4종 1:1 교체
  console.log('[cheongsongSettlement] 3. 계산서 4종 이미지 바인딩...');
  let contentHpf = await zip.file('Contents/content.hpf').async('string');

  const replacements = [
    { id: 'image2', filePath: invMap.salesService, name: '위탁관리비계산서(용역비)' },
    { id: 'image3', filePath: invMap.chemical, name: '약품비계산서(에이치디이앤씨/영일과학상사)' },
    { id: 'image4', filePath: invMap.kit, name: '분석키트계산서(케이엠)' },
    { id: 'image5', filePath: invMap.waterQuality, name: '수질분석비계산서(대신)' },
  ];

  for (const item of replacements) {
    if (item.filePath && fs.existsSync(item.filePath)) {
      const ext = path.extname(item.filePath).toLowerCase();
      const rawBuf = fs.readFileSync(item.filePath);
      const isPng = ext === '.png';
      const newExt = isPng ? 'png' : 'jpg';
      const mediaType = isPng ? 'image/png' : 'image/jpeg';

      // 기존 BinData 내 항목 제거 및 새 이미지 저장
      zip.remove(`BinData/${item.id}.bmp`);
      zip.remove(`BinData/${item.id}.jpg`);
      zip.remove(`BinData/${item.id}.png`);
      zip.file(`BinData/${item.id}.${newExt}`, rawBuf);

      // content.hpf 매니페스트 항목 갱신
      const itemRegex = new RegExp(`href="BinData\\/${item.id}\\.[a-zA-Z0-9]+"[^>]*media-type="[^"]*"`, 'i');
      contentHpf = contentHpf.replace(
        itemRegex,
        `href="BinData/${item.id}.${newExt}" media-type="${mediaType}"`
      );

      console.log(`  -> [${item.name}] 바인딩 성공: ${path.basename(item.filePath)} (${rawBuf.length} bytes)`);
    } else {
      console.warn(`  -> [${item.name}] 파일 없음, 기존 템플릿 이미지 유지`);
    }
  }

  zip.file('Contents/content.hpf', contentHpf);

  // 5. 최종 HWPX 버퍼 생성
  console.log('[cheongsongSettlement] 4. HWPX 패키지 빌드...');
  const outputBuffer = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  // 6. 대상 폴더 생성 및 저장
  const desktop = getPrimaryDesktop();
  const outputFileName = `청송휴게소 ${numMonth}월 도로공사 정산 서류.hwpx`;
  const outputHwpFileName = `청송휴게소 ${numMonth}월 도로공사 정산 서류.hwp`;

  const targetFolderYm = path.join(desktop, '월정산', '청송마감자료', targetYm);
  const targetFolderMonth = path.join(desktop, '월정산', '청송마감자료', `${numMonth}월`);
  [targetFolderYm, targetFolderMonth].forEach((f) => {
    if (!fs.existsSync(f)) {
      try { fs.mkdirSync(f, { recursive: true }); } catch (_) {}
    }
  });

  const finalYmHwpx = path.join(targetFolderYm, outputFileName);
  const finalYmHwp = path.join(targetFolderYm, outputHwpFileName);
  const finalMonthHwpx = path.join(targetFolderMonth, outputFileName);
  const finalMonthHwp = path.join(targetFolderMonth, outputHwpFileName);
  const finalDesktopHwpx = path.join(desktop, outputFileName);
  const finalDesktopHwp = path.join(desktop, outputHwpFileName);

  // 정규 경로 및 바탕화면에 동시 저장
  fs.writeFileSync(finalYmHwpx, outputBuffer);
  fs.writeFileSync(finalYmHwp, outputBuffer); // 호환성을 위해 .hwp로도 함께 보존
  fs.writeFileSync(finalMonthHwpx, outputBuffer);
  fs.writeFileSync(finalMonthHwp, outputBuffer);
  fs.writeFileSync(finalDesktopHwpx, outputBuffer);
  fs.writeFileSync(finalDesktopHwp, outputBuffer);

  console.log(`[cheongsongSettlement] 청송 정산서 작성 완료! 저장 위치: ${finalMonthHwpx}`);

  return {
    success: true,
    filePath: finalMonthHwpx,
    monthPath: finalMonthHwpx,
    ymPath: finalYmHwpx,
    desktopPath: finalDesktopHwpx,
    fileName: outputFileName,
    targetYm,
    invoiceMap: invMap,
    status,
  };
}

module.exports = {
  getCheongsongEvidenceStatus,
  generateCheongsongHwpReport,
};
