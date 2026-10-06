/**
 * 홍천휴게소(양양방향) 한글(HWP) 정산 보고서 자동 생성 서비스
 * 
 * [확정 규격 & 엔진]
 * - 템플릿: template_hongcheon_yangyang.hwp
 * - HWPML2X (한글 XML) 무결성 바이너리(Base64) 고속 바인딩 엔진
 * - 증빙 항목 1:1 완벽 교체:
 *   1. Pic #3 (Id="1"): 매출계산서 (용역비)
 *   2. Pic #4 (Id="2"): 매출계산서 (슬러지)
 *   3. Pic #5 (Id="3"): 매입계산서 (영일/약품)
 *   4. Pic #6 (Id="4"): 매입계산서 (대신/자가측정)
 *   5. Pic #7 (Id="5"): 매입계산서 (케이엠/분석키트)
 *   6. Pic #8 (Id="6"): 매입계산서 (준명/슬러지)
 *   7. Pic #9 (Id="7"): 슬러지 반출 사진
 *   8. Pic #10 (Id="8"): 청소필증
 *   9. Pic #13~16 (Id="9"~"12"): 수질성적서 4장 (9월부터 4장 규격)
 *   10. Pic #17~18 (Id="13"~"14"): 5, 6번째 잔상 이미지 투명화 제거
 * - Google Drive 연동:
 *   - 로컬 바탕화면에 성적서가 없으면 Google Drive에서 홍천 성적서 4장을 자동 검색하여
 *     바탕화면 '점검준비/성적서/YYYYMM' 폴더로 자동 다운로드한 후 바인딩 진행
 * - 저장 위치:
 *   - 정규 경로: 바탕화면 > 월정산 > 홍천마감자료 > YYYYMM > 홍천휴게소(양양)휴게소_${yy}년 ${month}월 오수정화조 임대료 정산보고서.hwp
 *   - 바탕화면 루트: 바탕화면 바로 위 동시 복사 보존
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');
const { getTemplateFilePath } = require('./settlementService.cjs');
const { drive, downloadDriveFileBuffer } = require('./driveService.cjs');

/** 1x1 픽셀 투명 PNG Base64 (미사용 슬롯 잔상 제거용) */
const TRANSPARENT_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

/**
 * 사용자 바탕화면(OneDrive 포함) 경로 탐색
 */
function findDesktopDirectories() {
  const home = process.env.USERPROFILE || 'C:\\Users\\ASUS';
  const dirs = [
    path.join(home, 'OneDrive', '바탕 화면'),
    path.join(home, 'Desktop'),
    path.join(home, 'OneDrive', 'Desktop'),
    path.join(home, '바탕 화면'),
  ];
  return dirs.filter(d => fs.existsSync(d));
}

function getPrimaryDesktop() {
  const dirs = findDesktopDirectories();
  return dirs[0] || path.join(process.env.USERPROFILE || 'C:\\Users\\ASUS', 'Desktop');
}

/**
 * Google Drive에서 홍천 해당 월 성적서 파일 자동 검색 및 로컬 다운로드
 */
async function ensureHongcheonCertificatesFromDrive(year, month) {
  const numYear = Number(year) || 2026;
  const numMonth = Number(month) || 9;
  const targetYm = `${numYear}${String(numMonth).padStart(2, '0')}`;
  const desktop = getPrimaryDesktop();
  const localCertDir = path.join(desktop, '점검준비', '성적서', targetYm);

  if (!fs.existsSync(localCertDir)) {
    try { fs.mkdirSync(localCertDir, { recursive: true }); } catch (_) {}
  }

  // 1. 로컬에 이미 4장 이상 존재하는지 확인
  let localFiles = [];
  try {
    const list = fs.readdirSync(localCertDir);
    localFiles = list
      .filter(f => f.includes('홍천') && (f.includes('성적서') || f.includes('mlss')) && /\.(jpe?g|png|bmp)$/i.test(f))
      .map(f => path.join(localCertDir, f));
  } catch (_) {}

  if (localFiles.length >= 4) {
    localFiles.sort((a, b) => path.basename(a).localeCompare(path.basename(b), 'ko-KR', { numeric: true }));
    return localFiles.slice(0, 4);
  }

  // 2. Drive 연동이 없으면 로컬 파일 반환
  if (!drive) {
    console.warn('[hongcheonHwpService] Drive 클라이언트가 없어 드라이브 검색을 건너뜁니다.');
    return localFiles;
  }

  // 3. Google Drive에서 홍천 해당 월 성적서/mlss 파일 검색
  try {
    console.log(`[hongcheonHwpService] Drive에서 홍천 ${targetYm} 성적서 검색 중...`);
    const q = `name contains '홍천' and (name contains '성적서' or name contains 'mlss') and name contains '${targetYm}' and trashed = false`;
    const res = await drive.files.list({
      q,
      fields: 'files(id, name, mimeType, createdTime)',
      pageSize: 20,
      spaces: 'drive',
      includeItemsFromAllDrives: true,
      supportsAllDrives: true,
    });

    const driveFiles = res.data.files || [];
    console.log(`[hongcheonHwpService] Drive 검색 결과: ${driveFiles.length}개 발견`);

    for (const df of driveFiles) {
      const destPath = path.join(localCertDir, df.name);
      if (!fs.existsSync(destPath)) {
        try {
          const buf = await downloadDriveFileBuffer(df.id);
          fs.writeFileSync(destPath, buf);
          console.log(`[hongcheonHwpService] Drive 성적서 다운로드 완료: ${df.name} (${buf.length} bytes)`);
        } catch (dlErr) {
          console.error(`[hongcheonHwpService] Drive 다운로드 실패 (${df.name}):`, dlErr.message);
        }
      }
    }

    // 다운로드 후 다시 로컬 파일 목록 정렬 및 4장 반환
    const refreshed = fs.readdirSync(localCertDir)
      .filter(f => f.includes('홍천') && (f.includes('성적서') || f.includes('mlss')) && /\.(jpe?g|png|bmp)$/i.test(f))
      .map(f => path.join(localCertDir, f));
    refreshed.sort((a, b) => path.basename(a).localeCompare(path.basename(b), 'ko-KR', { numeric: true }));
    return refreshed.slice(0, 4);
  } catch (driveErr) {
    console.error('[hongcheonHwpService] Drive 성적서 검색/다운로드 오류:', driveErr.message);
    return localFiles;
  }
}

/**
 * 홍천 증빙 이미지 및 필수 파일 상태 진단 (Drive 자동 동기화 포함)
 */
async function getHongcheonEvidenceStatus(year, month) {
  const numYear = Number(year) || 2026;
  const numMonth = Number(month) || 9;
  const targetYm = `${numYear}${String(numMonth).padStart(2, '0')}`;
  const desktop = getPrimaryDesktop();

  // 1. 홍천 마감자료 폴더
  const settlementDir = path.join(desktop, '월정산', '홍천마감자료', targetYm);
  if (!fs.existsSync(settlementDir)) {
    try { fs.mkdirSync(settlementDir, { recursive: true }); } catch (_) {}
  }

  // 검색 대상 디렉토리들 (대상 연월 폴더 엄격 한정)
  const searchDirs = [
    settlementDir,
    path.join(desktop, '점검준비', '계산서', targetYm),
    path.join(desktop, '점검준비', '성적서', targetYm),
    path.join(desktop, '월정산', '홍천마감자료'),
    path.join(desktop, '점검준비', '계산서'),
    path.join(desktop, '점검준비', '성적서'),
  ].filter(d => fs.existsSync(d));

  const findFiles = (dirs, pattern, max = 10) => {
    const list = [];
    const imageExts = new Set(['.jpg', '.jpeg', '.png', '.bmp']);
    for (const dir of dirs) {
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isFile()) {
            const ext = path.extname(entry.name).toLowerCase();
            if (imageExts.has(ext)) {
              if (!pattern || pattern.test(entry.name)) {
                const fullPath = path.join(dir, entry.name);
                if (!list.includes(fullPath)) list.push(fullPath);
                if (list.length >= max) return list;
              }
            }
          }
        }
      } catch (_) {}
    }
    return list;
  };

  // 청소필증 (settlementDir 최우선)
  const cleanCertFiles = findFiles([settlementDir], /필증/i)
    .concat(findFiles(searchDirs, /청소필증|준명필증|슬러지필증|필증/i));
  const cleanCert = cleanCertFiles[0] || null;

  // 반출사진 (settlementDir 최우선)
  const sludgePhotoFiles = findFiles([settlementDir], /반출/i)
    .concat(findFiles(searchDirs, /반출사진|반출/i));
  const sludgePhoto = sludgePhotoFiles[0] || null;

  // 계산서 6종 탐색 (홍천 9월 계산서)
  const invoiceCandidates = findFiles(searchDirs, /홍천.*계산서|계산서.*홍천/i, 20);
  const findInvoiceByKeyword = (kw, isSales = false) => {
    return invoiceCandidates.find(f => {
      const base = path.basename(f);
      const salesMatch = isSales ? base.startsWith('매출') : !base.startsWith('매출');
      return salesMatch && base.includes(kw);
    }) || null;
  };

  const invoiceSalesService = findInvoiceByKeyword('용역비', true) || invoiceCandidates.find(f => f.includes('용역비')) || null;
  const invoiceSalesSludge  = findInvoiceByKeyword('슬러지', true) || invoiceCandidates.find(f => f.includes('슬러지') && f.startsWith('매출')) || null;
  const invoiceMedicine     = findInvoiceByKeyword('영일', false) || null;
  const invoiceTest         = findInvoiceByKeyword('대신', false) || null;
  const invoiceKit          = findInvoiceByKeyword('케이엠', false) || null;
  const invoiceSludge       = findInvoiceByKeyword('준명', false) || null;

  // 대표 계산서 (UI 미리보기용)
  const invoice = invoiceSalesService || invoiceSalesSludge || invoiceMedicine || invoiceCandidates[0] || null;

  // 성적서 4장 (바탕화면에 없으면 Drive 자동 검색 다운로드 후 반환)
  const certs = await ensureHongcheonCertificatesFromDrive(numYear, numMonth);

  // 수리수선비 계산서 (선택 사항)
  const repairFiles = findFiles(searchDirs, /수리수선비|수리/i);

  const missing = [];
  if (!invoice) missing.push('계산서');
  if (!cleanCert) missing.push('청소필증');
  if (!sludgePhoto) missing.push('반출사진');
  if (certs.length === 0) missing.push('성적서');

  return {
    year: numYear,
    month: numMonth,
    targetYm,
    settlementDir,
    cleanCert,
    sludgePhoto,
    invoice,
    invoiceMap: {
      salesService: invoiceSalesService,
      salesSludge: invoiceSalesSludge,
      medicine: invoiceMedicine,
      test: invoiceTest,
      kit: invoiceKit,
      sludge: invoiceSludge,
    },
    certs,
    repairs: repairFiles.slice(0, 2),
    missing,
    isReady: Boolean(cleanCert && sludgePhoto), // 필증과 반출사진이 둘 다 등록되어야 활성화
  };
}

/**
 * 청소필증 또는 반출사진 업로드 저장
 */
function saveHongcheonEvidence(year, month, type, fileBuffer, originalName) {
  const numYear = Number(year) || 2026;
  const numMonth = Number(month) || 9;
  const targetYm = `${numYear}${String(numMonth).padStart(2, '0')}`;
  const desktop = getPrimaryDesktop();
  const settlementDir = path.join(desktop, '월정산', '홍천마감자료', targetYm);
  if (!fs.existsSync(settlementDir)) {
    fs.mkdirSync(settlementDir, { recursive: true });
  }

  const ext = path.extname(originalName) || '.png';
  let safeFileName = '';
  if (type === 'cleanCert') {
    safeFileName = `청소필증_${targetYm}${ext}`;
  } else if (type === 'sludgePhoto') {
    safeFileName = `슬러지반출사진_${targetYm}${ext}`;
  } else {
    safeFileName = `${type}_${targetYm}${ext}`;
  }

  const targetPath = path.join(settlementDir, safeFileName);
  fs.writeFileSync(targetPath, fileBuffer);
  console.log(`[hongcheonHwpService] 증빙 이미지(${type}) 저장 완료: ${targetPath}`);

  return {
    success: true,
    type,
    fileName: safeFileName,
    filePath: targetPath,
  };
}

/**
 * HWP 템플릿을 HWPML2X XML로 추출하는 헬퍼 함수
 */
function extractHwpmlFromTemplate(tplPath) {
  return new Promise((resolve, reject) => {
    const xmlOut = path.join(os.tmpdir(), `osoo_hongcheon_tpl_${Date.now()}.xml`);
    const ps = `
$ErrorActionPreference = 'Stop'
$hwp = New-Object -ComObject HWPFrame.HwpObject
try { $hwp.RegisterModule('FilePathCheckDLL', 'FilePathChecker') | Out-Null } catch {}
$hwp.SetMessageBoxMode(65535)

$tmpHwp = [System.IO.Path]::Combine([System.IO.Path]::GetTempPath(), "hongcheon_tpl_copy_${Date.now()}.hwp")
[System.IO.File]::Copy('${tplPath.replace(/'/g, "''")}', $tmpHwp, $true)

$openRes = $hwp.Open($tmpHwp, 'HWP', 'lock:false')
if (-not $openRes) { throw "템플릿 파일을 열지 못했습니다: $tmpHwp" }

$saveRes = $hwp.SaveAs('${xmlOut.replace(/'/g, "''")}', 'HWPML2X', '')
if (-not $saveRes) { throw "HWPML2X XML 추출에 실패했습니다: $xmlOut" }

$hwp.Clear(1)
$hwp.Quit()
[System.Runtime.InteropServices.Marshal]::ReleaseComObject($hwp) | Out-Null
try { [System.IO.File]::Delete($tmpHwp) } catch {}
Write-Host "XML_EXTRACT_OK"
`;
    const tempPs1 = path.join(os.tmpdir(), `extract_xml_${Date.now()}.ps1`);
    fs.writeFileSync(tempPs1, Buffer.concat([Buffer.from('\uFEFF', 'utf8'), Buffer.from(ps, 'utf8')]));

    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-STA', '-File', tempPs1], { timeout: 35000 }, (err, stdout, stderr) => {
      try { if (fs.existsSync(tempPs1)) fs.unlinkSync(tempPs1); } catch (_) {}
      if (err || !fs.existsSync(xmlOut)) {
        return reject(new Error(`HWPML2X 추출 실패: ${err?.message || ''}\n${stdout || stderr}`));
      }
      const xmlContent = fs.readFileSync(xmlOut, 'utf8');
      try { fs.unlinkSync(xmlOut); } catch (_) {}
      resolve(xmlContent);
    });
  });
}

/**
 * 수정된 HWPML2X XML을 한글 COM으로 열어 HWP로 저장하는 헬퍼 함수
 */
function convertXmlToHwp(xmlContent, targetHwpPath) {
  return new Promise((resolve, reject) => {
    const boundXmlPath = path.join(os.tmpdir(), `osoo_bound_${Date.now()}.xml`);
    fs.writeFileSync(boundXmlPath, xmlContent, 'utf8');

    const tempHwpOut = path.join(os.tmpdir(), `osoo_hwp_out_${Date.now()}.hwp`);

    const ps = `
$ErrorActionPreference = 'Stop'
$hwp = New-Object -ComObject HWPFrame.HwpObject
try { $hwp.RegisterModule('FilePathCheckDLL', 'FilePathChecker') | Out-Null } catch {}
$hwp.SetMessageBoxMode(65535)

$openRes = $hwp.Open('${boundXmlPath.replace(/'/g, "''")}', 'HWPML2X', 'lock:false')
if (-not $openRes) { throw "바운드 XML 열기 실패: $boundXmlPath" }

$saveRes = $hwp.SaveAs('${tempHwpOut.replace(/'/g, "''")}', 'HWP', '')
if (-not $saveRes) { throw "HWP 변환 저장 실패: $tempHwpOut" }

$hwp.Clear(1)
$hwp.Quit()
[System.Runtime.InteropServices.Marshal]::ReleaseComObject($hwp) | Out-Null
Write-Host "CONVERT_OK"
`;
    const tempPs1 = path.join(os.tmpdir(), `convert_xml_${Date.now()}.ps1`);
    fs.writeFileSync(tempPs1, Buffer.concat([Buffer.from('\uFEFF', 'utf8'), Buffer.from(ps, 'utf8')]));

    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-STA', '-File', tempPs1], { timeout: 45000 }, (err, stdout, stderr) => {
      try { if (fs.existsSync(tempPs1)) fs.unlinkSync(tempPs1); } catch (_) {}
      try { if (fs.existsSync(boundXmlPath)) fs.unlinkSync(boundXmlPath); } catch (_) {}

      if (err || !fs.existsSync(tempHwpOut)) {
        return reject(new Error(`XML -> HWP 변환 실패: ${err?.message || ''}\n${stdout || stderr}`));
      }

      try {
        // 목표 경로로 안전 복사
        fs.copyFileSync(tempHwpOut, targetHwpPath);
        try { fs.unlinkSync(tempHwpOut); } catch (_) {}
        resolve(targetHwpPath);
      } catch (copyErr) {
        try { if (fs.existsSync(tempHwpOut)) fs.unlinkSync(tempHwpOut); } catch (_) {}
        reject(copyErr);
      }
    });
  });
}

/**
 * 홍천 한글(HWP) 정산서 자동 생성 메인 함수 (HWPML2X 무결성 엔진)
 */
async function generateHongcheonHwpReport(year, month, customInputs = {}) {
  const numYear = Number(year) || 2026;
  const numMonth = Number(month) || 9;
  const targetYm = `${numYear}${String(numMonth).padStart(2, '0')}`;
  const yy = String(numYear).slice(-2);
  const mm = String(numMonth).padStart(2, '0');

  // 1. 템플릿 탐색 (AppData > 서버 순서)
  let tplPath = getTemplateFilePath('template_hongcheon_yangyang.hwp');
  if (!tplPath || !fs.existsSync(tplPath)) {
    tplPath = getTemplateFilePath('template_hongcheon_yangyang_hwp.hwp');
  }
  if (!tplPath || !fs.existsSync(tplPath)) {
    throw new Error('홍천휴게소 한글 템플릿 파일(template_hongcheon_yangyang.hwp)을 찾을 수 없습니다.');
  }

  // 2. 증빙 이미지 상태 수집 (Drive 자동 다운로드 포함)
  const status = await getHongcheonEvidenceStatus(numYear, numMonth);
  const cleanCert = customInputs.cleanCert || status.cleanCert;
  const sludgePhoto = customInputs.sludgePhoto || status.sludgePhoto;
  const certs = customInputs.certs?.length ? customInputs.certs : status.certs;
  const invMap = status.invoiceMap || {};

  if (!cleanCert) {
    throw new Error('청소필증 이미지가 등록되지 않았습니다. 모달에서 청소필증을 업로드해 주세요.');
  }
  if (!sludgePhoto) {
    throw new Error('반출사진 이미지가 등록되지 않았습니다. 모달에서 반출사진을 업로드해 주세요.');
  }

  console.log(`[hongcheonHwpService] 1. 템플릿에서 HWPML2X XML 추출 시작: ${tplPath}`);
  let xml = await extractHwpmlFromTemplate(tplPath);

  // 3. 텍스트 일괄 치환 (6월/8월 잔상 100% 제거 -> 대상 월 반영)
  console.log(`[hongcheonHwpService] 2. 정산월(${numMonth}월) 텍스트 일괄 치환 진행...`);
  xml = xml.replace(/오수처리비용 정산증빙 자료26년\(6월\)/g, `오수처리비용 정산증빙 자료${yy}년(${numMonth}월)`);
  xml = xml.replace(/오수처리비용 정산증빙 자료26년\(8월\)/g, `오수처리비용 정산증빙 자료${yy}년(${numMonth}월)`);
  xml = xml.replace(/26년\(6월\)/g, `${yy}년(${numMonth}월)`);
  xml = xml.replace(/25년\(6월\)/g, `${yy}년(${numMonth}월)`);
  xml = xml.replace(/26년\(8월\)/g, `${yy}년(${numMonth}월)`);
  xml = xml.replace(/25년\(8월\)/g, `${yy}년(${numMonth}월)`);
  xml = xml.replace(/\(6월\)/g, `(${numMonth}월)`);
  xml = xml.replace(/\(8월\)/g, `(${numMonth}월)`);
  xml = xml.replace(/26년 6월/g, `${yy}년 ${numMonth}월`);
  xml = xml.replace(/25년 6월/g, `${yy}년 ${numMonth}월`);
  xml = xml.replace(/26년 8월/g, `${yy}년 ${numMonth}월`);
  xml = xml.replace(/25년 8월/g, `${yy}년 ${numMonth}월`);
  xml = xml.replace(/2026년 06월/g, `${numYear}년 ${mm}월`);
  xml = xml.replace(/2026년 08월/g, `${numYear}년 ${mm}월`);
  xml = xml.replace(/2026년 6월/g, `${numYear}년 ${numMonth}월`);
  xml = xml.replace(/2026년 8월/g, `${numYear}년 ${numMonth}월`);
  xml = xml.replace(/2025년 6월/g, `${numYear}년 ${numMonth}월`);
  xml = xml.replace(/2025년 8월/g, `${numYear}년 ${numMonth}월`);

  // 4. 18개 이미지 바인딩 매핑 테이블 구성
  console.log(`[hongcheonHwpService] 3. 18개 이미지 바이너리(Base64) 전수 교체 진행...`);
  const imageReplacements = {
    // 계산서 6종
    '1': invMap.salesService, // Pic #3: 매출계산서 용역비
    '2': invMap.salesSludge,  // Pic #4: 매출계산서 슬러지
    '3': invMap.medicine,     // Pic #5: 매입계산서 영일(약품)
    '4': invMap.test,         // Pic #6: 매입계산서 대신(자가측정)
    '5': invMap.kit,          // Pic #7: 매입계산서 케이엠(키트)
    '6': invMap.sludge,       // Pic #8: 매입계산서 준명(슬러지)
    // 슬러지 반출사진 & 청소필증
    '7': sludgePhoto,         // Pic #9: 슬러지반출사진
    '8': cleanCert,           // Pic #10: 청소필증
    // 수질성적서 4장
    '9': certs[0] || null,    // Pic #13: 성적서 1
    '10': certs[1] || null,   // Pic #14: 성적서 2
    '11': certs[2] || null,   // Pic #15: 성적서 3
    '12': certs[3] || null,   // Pic #16: 성적서 4
    // 5번째, 6번째 성적서 -> 9월부터 4장 규격이므로 투명화 제거
    '13': 'EMPTY',            // Pic #17: 5차 성적서 슬롯 투명화
    '14': 'EMPTY',            // Pic #18: 6차 성적서 슬롯 투명화
  };

  // 수리수선비 또는 관련사진이 있으면 교체
  if (status.repairs?.[0]) imageReplacements['15'] = status.repairs[0];
  if (status.repairs?.[1]) imageReplacements['18'] = status.repairs[1];

  for (const [id, fPath] of Object.entries(imageReplacements)) {
    let b64 = '';
    let format = 'jpg';

    if (fPath === 'EMPTY') {
      b64 = TRANSPARENT_PNG_BASE64;
      format = 'png';
    } else if (fPath && fs.existsSync(fPath)) {
      const buf = fs.readFileSync(fPath);
      b64 = buf.toString('base64');
      format = path.extname(fPath).toLowerCase().replace('.', '') || 'jpg';
      if (format === 'jpeg') format = 'jpg';
      console.log(`  -> [Id=${id}] ${path.basename(fPath)} 바인딩 완료 (${buf.length} bytes)`);
    } else {
      console.warn(`  -> [Id=${id}] 파일 없음 또는 미지정: ${fPath}, 기존 템플릿 유지`);
      continue;
    }

    // <BINDATA Encoding="Base64" Id="N" Size="...">...</BINDATA> 교체
    const binDataRegex = new RegExp(`(<BINDATA[^>]*Id="${id}"[^>]*>)[\\s\\S]*?(<\\/BINDATA>)`, 'i');
    if (binDataRegex.test(xml)) {
      xml = xml.replace(binDataRegex, `$1${b64}$2`);
    }

    // BINITEM 포맷 갱신 (Format="jpg" 또는 "png")
    const binItemRegex = new RegExp(`(<BINITEM[^>]*BinData="${id}"[^>]*Format=")[^"]*(")`, 'i');
    if (binItemRegex.test(xml)) {
      xml = xml.replace(binItemRegex, `$1${format}$2`);
    }
  }

  // 5. 출력 파일 경로 결정
  const desktop = getPrimaryDesktop();
  const outputFileName = `홍천휴게소(양양)휴게소_${yy}년 ${numMonth}월 오수정화조 임대료 정산보고서.hwp`;
  const targetFolder = path.join(desktop, '월정산', '홍천마감자료', targetYm);
  if (!fs.existsSync(targetFolder)) {
    fs.mkdirSync(targetFolder, { recursive: true });
  }
  const targetFilePath = path.join(targetFolder, outputFileName);
  const desktopFilePath = path.join(desktop, outputFileName);

  // 6. XML -> HWP 변환 및 저장
  console.log(`[hongcheonHwpService] 4. 바운드 XML -> HWP 변환 및 저장 시작...`);
  await convertXmlToHwp(xml, targetFilePath);
  console.log(`[hongcheonHwpService] 정규 경로 저장 성공: ${targetFilePath}`);

  // 7. 바탕화면 바로 위에도 동시 복사
  try {
    fs.copyFileSync(targetFilePath, desktopFilePath);
    console.log(`[hongcheonHwpService] 바탕화면 동시 복사 완료: ${desktopFilePath}`);
  } catch (deskErr) {
    console.warn(`[hongcheonHwpService] 바탕화면 복사 주의: ${deskErr.message}`);
  }

  return {
    success: true,
    fileName: outputFileName,
    savedPath: targetFilePath,
    desktopPath: desktopFilePath,
    year: numYear,
    month: numMonth,
    missing: status.missing,
  };
}

module.exports = {
  ensureHongcheonCertificatesFromDrive,
  getHongcheonEvidenceStatus,
  saveHongcheonEvidence,
  generateHongcheonHwpReport,
};
