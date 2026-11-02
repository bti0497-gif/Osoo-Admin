/**
 * 홍천휴게소(양양방향) 한글(HWP) 정산 보고서 자동 생성 서비스
 * 
 * [확정 규격 & 엔진]
 * - 템플릿: template_hongcheon_yangyang.hwp
 * - HWP COM 개체 기반 북마크(책갈피) 직접 삽입 엔진:
 *   - 템플릿 내 위탁관리계약서 2장(Pic #1, Pic #2)은 100% 원본 그대로 완벽 보존
 *   - 빈 책갈피 사각형 영역에 증빙 자료를 정밀 규격으로 1:1 자동 바인딩:
 *     1. '매출계산서용역비': 매출계산서 (용역비) [162 mm × 100 mm]
 *     2. '매출계산서슬러지': 매출계산서 (슬러지) [162 mm × 100 mm]
 *     3. '약품비계산서': 매입계산서 (영일/약품/에이치디) [162 mm × 100 mm]
 *     4. '수질분석계산서': 매입계산서 (대신/자가측정) [162 mm × 100 mm]
 *     5. '키트계산서': 매입계산서 (케이엠/분석키트) [162 mm × 100 mm]
 *     6. '슬러지처리계산서': 매입계산서 (준명/슬러지) [162 mm × 100 mm]
 *     7. '반출사진': 슬러지 반출 사진 [135 mm × 100 mm]
 *     8. '청소필증': 청소필증 [135 mm × 100 mm]
 *     9. '성적서1' ~ '성적서4': 수질성적서 4장 [각 54 mm × 64 mm]
 *     10. '수리비계산서1', '수리비계산서2': 수리수선비 (존재 시) [각 135 mm × 100 mm]
 * - 텍스트 정산월 자동 일괄 치환:
 *   - 문서 전반의 연월 텍스트(예: 26년(8월) -> 26년(10월), 8월) -> 10월) 등) 일괄 갱신
 * - Google Drive 연동:
 *   - 로컬 바탕화면에 성적서가 부족하면 Google Drive에서 홍천 성적서를 자동 검색하여
 *     Google Drive에서 홍천 성적서를 자동 검색하여 임시 캐시로 다운로드 후 바인딩
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
const { getEvidenceCacheDir, ensureSettlementEvidence } = require('./settlementEvidenceSyncService.cjs');

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
  const numMonth = Number(month) || 10;
  const mm = String(numMonth).padStart(2, '0');
  const targetYm = `${numYear}${mm}`;
  const hyphenYm = `${numYear}-${mm}`;
  const localCertDir = getEvidenceCacheDir('성적서', targetYm);

  if (!fs.existsSync(localCertDir)) {
    try { fs.mkdirSync(localCertDir, { recursive: true }); } catch (_) {}
  }

  // Drive가 설정되어 있으면 항상 Drive에서 새로 추가된 성적서가 있는지 검색하여 다운로드
  if (drive) {
    try {
      console.log(`[hongcheonHwpService] Drive에서 홍천 ${targetYm} 성적서 검색 중...`);
      const certRootId = String(process.env.CERTIFICATE_DRIVE_FOLDER_ID || '1Po-gd-OKlaeGyL-Ppjc6_wKgSLEM4iX4').trim();
      const foundDriveFiles = new Map();

      // 1. CERTIFICATE_ROOT_FOLDER_ID / 성적서 / YYYY / MM 폴더 직접 조회
      try {
        const rootRes = await drive.files.list({
          q: `'${certRootId}' in parents and trashed = false`,
          fields: 'files(id, name, mimeType)',
          pageSize: 50,
          supportsAllDrives: true,
          includeItemsFromAllDrives: true,
        });
        const roots = [certRootId];
        const certSub = (rootRes.data.files || []).find(f => String(f.name || '').trim() === '성적서');
        if (certSub) roots.push(certSub.id);

        for (const rId of roots) {
          const yRes = await drive.files.list({
            q: `'${rId}' in parents and trashed = false`,
            fields: 'files(id, name, mimeType)',
            pageSize: 50,
            supportsAllDrives: true,
            includeItemsFromAllDrives: true,
          });
          const yFolder = (yRes.data.files || []).find(f => f.name.includes(String(numYear)));
          if (!yFolder) continue;

          const mRes = await drive.files.list({
            q: `'${yFolder.id}' in parents and trashed = false`,
            fields: 'files(id, name, mimeType)',
            pageSize: 50,
            supportsAllDrives: true,
            includeItemsFromAllDrives: true,
          });
          const mFolder = (mRes.data.files || []).find(f => f.name === mm || f.name === `${numMonth}` || f.name === `${numMonth}월`);
          if (!mFolder) continue;

          const filesRes = await drive.files.list({
            q: `'${mFolder.id}' in parents and trashed = false`,
            fields: 'files(id, name, mimeType, size)',
            pageSize: 100,
            supportsAllDrives: true,
            includeItemsFromAllDrives: true,
          });
          for (const df of filesRes.data.files || []) {
            if (df.name.includes('홍천') && /\.(jpe?g|png|bmp|webp)$/i.test(df.name)) {
              foundDriveFiles.set(df.id, df);
            }
          }
        }
      } catch (folderErr) {
        console.warn('[hongcheonHwpService] 성적서 폴더 조회 경고:', folderErr.message);
      }

      // 2. Drive 쿼리 개별 검색 (구글 드라이브 쿼리 구문 제한 우회)
      const queries = [
        `name contains '홍천' and name contains 'mlss' and trashed = false`,
        `name contains '홍천' and name contains '성적서' and trashed = false`,
      ];
      for (const q of queries) {
        try {
          const qRes = await drive.files.list({
            q,
            fields: 'files(id, name, mimeType, size)',
            pageSize: 50,
            supportsAllDrives: true,
            includeItemsFromAllDrives: true,
          });
          for (const df of qRes.data.files || []) {
            const n = df.name.toLowerCase();
            if (n.includes('홍천') && (n.includes(targetYm) || n.includes(hyphenYm)) && /\.(jpe?g|png|bmp|webp)$/i.test(df.name)) {
              foundDriveFiles.set(df.id, df);
            }
          }
        } catch (_) {}
      }

      console.log(`[hongcheonHwpService] Drive 홍천 성적서 ${foundDriveFiles.size}건 발견`);

      // 3. 로컬에 없는 파일 다운로드
      for (const [id, df] of foundDriveFiles.entries()) {
        const destPath = path.join(localCertDir, df.name);
        if (!fs.existsSync(destPath)) {
          try {
            const buf = await downloadDriveFileBuffer(id);
            fs.writeFileSync(destPath, buf);
            console.log(`[hongcheonHwpService] Drive 성적서 신규 다운로드 완료: ${df.name} (${buf.length} bytes)`);
          } catch (dlErr) {
            console.error(`[hongcheonHwpService] Drive 다운로드 실패 (${df.name}):`, dlErr.message);
          }
        }
      }
    } catch (driveErr) {
      console.error('[hongcheonHwpService] Drive 성적서 검색/다운로드 오류:', driveErr.message);
    }
  }

  // 4. 로컬 파일 목록 정렬 및 최대 4장 반환 (확장자 webp 포함, 날짜순 정렬)
  let localFiles = [];
  try {
    const list = fs.readdirSync(localCertDir);
    localFiles = list
      .filter(f => f.includes('홍천') && (f.includes('성적서') || f.includes('mlss')) && /\.(jpe?g|png|bmp|webp)$/i.test(f))
      .map(f => path.join(localCertDir, f));
    localFiles.sort((a, b) => path.basename(a).localeCompare(path.basename(b), 'ko-KR', { numeric: true }));
  } catch (_) {}

  return localFiles.slice(0, 4);
}

/**
 * 홍천 증빙 이미지 및 필수 파일 상태 진단 (Drive 자동 동기화 포함)
 */
async function getHongcheonEvidenceStatus(year, month) {
  const numYear = Number(year) || 2026;
  const numMonth = Number(month) || 10;
  const targetYm = `${numYear}${String(numMonth).padStart(2, '0')}`;
  const desktop = getPrimaryDesktop();

  try {
    await ensureSettlementEvidence({ siteName: '홍천휴게소(양양방향)', year: numYear, month: numMonth, targetYm });
  } catch (_) {}

  // 1. 홍천 마감자료 폴더
  const settlementDir = path.join(desktop, '월정산', '홍천마감자료', targetYm);
  if (!fs.existsSync(settlementDir)) {
    try { fs.mkdirSync(settlementDir, { recursive: true }); } catch (_) {}
  }

  // 검색 대상 디렉토리들 (대상 연월 폴더 엄격 최우선, 임시 캐시 디렉토리 및 마감자료 기준)
  const searchDirs = [
    settlementDir,
    getEvidenceCacheDir('계산서', targetYm),
    getEvidenceCacheDir('성적서', targetYm),
    path.join(desktop, '월정산', '홍천마감자료'),
  ].filter(d => fs.existsSync(d));

  const findFiles = (dirs, pattern, max = 20) => {
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

  // 계산서 후보 탐색 (홍천 키워드)
  const invoiceCandidates = findFiles(searchDirs, /홍천.*계산서|계산서.*홍천/i, 30);
  const findInvoiceByKeywords = (keywords, isSales = false) => {
    const kwList = Array.isArray(keywords) ? keywords : [keywords];
    return invoiceCandidates.find(f => {
      const base = path.basename(f);
      const salesMatch = isSales ? (base.startsWith('매출') || base.includes('매출')) : !base.startsWith('매출');
      return salesMatch && kwList.some(kw => base.includes(kw));
    }) || null;
  };

  const invoiceSalesService = findInvoiceByKeywords(['용역비'], true) || invoiceCandidates.find(f => f.includes('용역비')) || null;
  const invoiceSalesSludge  = findInvoiceByKeywords(['슬러지'], true) || invoiceCandidates.find(f => f.includes('슬러지') && (f.includes('매출') || path.basename(f).startsWith('매출'))) || null;
  const invoiceMedicine     = findInvoiceByKeywords(['에이치디', '에이치', '영일', '약품'], false) || null;
  const invoiceTest         = findInvoiceByKeywords(['대신', '수질', '자가측정'], false) || null;
  const invoiceKit          = findInvoiceByKeywords(['케이엠', '키트'], false) || null;
  const invoiceSludge       = findInvoiceByKeywords(['준명', '슬러지'], false) || null;

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
  const numMonth = Number(month) || 10;
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
 * 홍천 한글(HWP) 정산서 자동 생성 메인 함수 (HWP COM 북마크 직접 바인딩 엔진)
 * 
 * 계약서 원본(Pic #1, #2)은 100% 무결성 보존되며,
 * 비어있는 북마크 사각형 위치에 6종 계산서, 사진, 성적서가 정확한 규격으로 자동 배치됩니다.
 */
async function generateHongcheonHwpReport(year, month, customInputs = {}) {
  const numYear = Number(year) || 2026;
  const numMonth = Number(month) || 10;
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
  const invMap = { ...status.invoiceMap, ...(customInputs.invoiceMap || {}) };

  if (!cleanCert) {
    console.warn('[hongcheonHwpService] 청소필증 이미지가 없어 빈 슬롯으로 유지합니다.');
  }
  if (!sludgePhoto) {
    console.warn('[hongcheonHwpService] 반출사진 이미지가 없어 빈 슬롯으로 유지합니다.');
  }

  // 3. 바인딩 작업 목록 구성 (계약서는 템플릿 첫 페이지에 보존되므로 바인딩 목록에 포함하지 않음)
  const bindingTasks = [
    { name: '매출계산서용역비', bookmark: '매출계산서용역비', file: invMap.salesService, wMm: 162, hMm: 100 },
    { name: '매출계산서슬러지', bookmark: '매출계산서슬러지', file: invMap.salesSludge, wMm: 162, hMm: 100 },
    { name: '약품비계산서', bookmark: '약품비계산서', file: invMap.medicine, wMm: 162, hMm: 100 },
    { name: '수질분석계산서', bookmark: '수질분석계산서', file: invMap.test, wMm: 162, hMm: 100 },
    { name: '키트계산서', bookmark: '키트계산서', file: invMap.kit, wMm: 162, hMm: 100 },
    { name: '슬러지처리계산서', bookmark: '슬러지처리계산서', file: invMap.sludge, wMm: 162, hMm: 100 },
    { name: '반출사진', bookmark: '반출사진', file: sludgePhoto, wMm: 135, hMm: 100 },
    { name: '청소필증', bookmark: '청소필증', file: cleanCert, wMm: 135, hMm: 100 },
    { name: '성적서1', bookmark: '성적서1', file: certs[0] || null, wMm: 54, hMm: 64 },
    { name: '성적서2', bookmark: '성적서2', file: certs[1] || null, wMm: 54, hMm: 64 },
    { name: '성적서3', bookmark: '성적서3', file: certs[2] || null, wMm: 54, hMm: 64 },
    { name: '성적서4', bookmark: '성적서4', file: certs[3] || null, wMm: 54, hMm: 64 },
  ];

  if (status.repairs?.[0]) {
    bindingTasks.push({ name: '수리비계산서1', bookmark: '수리비계산서1', file: status.repairs[0], wMm: 135, hMm: 100 });
  }
  if (status.repairs?.[1]) {
    bindingTasks.push({ name: '수리비계산서2', bookmark: '수리비계산서2', file: status.repairs[1], wMm: 135, hMm: 100 });
  }

  // 4. 출력 경로 설정
  const desktop = getPrimaryDesktop();
  const outputFileName = `홍천휴게소(양양)휴게소_${yy}년 ${numMonth}월 오수정화조 임대료 정산보고서.hwp`;
  const targetFolder = path.join(desktop, '월정산', '홍천마감자료', targetYm);
  if (!fs.existsSync(targetFolder)) {
    fs.mkdirSync(targetFolder, { recursive: true });
  }
  const targetFilePath = path.join(targetFolder, outputFileName);

  // 5. 작업용 임시 파일 경로
  const workingDoc = path.join(os.tmpdir(), `osoo_hongcheon_${Date.now()}.hwp`);
  fs.copyFileSync(tplPath, workingDoc);

  const tasksJson = JSON.stringify(bindingTasks).replace(/'/g, "''");

  const psScript = `
$ErrorActionPreference = 'Stop'

function LogMsg($msg) {
  Write-Host "[홍천HWP] $msg"
}

try {
  LogMsg "1. HWP COM 개체 생성 및 보안 모듈 등록..."
  $hwp = New-Object -ComObject HWPFrame.HwpObject
  try { $hwp.RegisterModule('FilePathCheckDLL', 'OsooHandleFilePathChecker') | Out-Null } catch {}
  try { $hwp.RegisterModule('FilePathCheckDLL', 'FilePathChecker') | Out-Null } catch {}
  $hwp.SetMessageBoxMode(65535)

  LogMsg "2. 템플릿 작업 복사본 열기: ${workingDoc.replace(/'/g, "''")}"
  $openRes = $hwp.Open('${workingDoc.replace(/'/g, "''")}', 'HWP', 'lock:false')
  if (-not $openRes) {
    throw "템플릿 파일을 열지 못했습니다: ${workingDoc.replace(/'/g, "''")}"
  }

  try { $hwp.Run('LockCommand') | Out-Null; LogMsg "LockCommand 적용 완료" } catch {}

  function MoveToBookmarkSafe($name) {
    if (-not $name) { return $false }
    try {
      $hwp.Run('MoveDocBegin') | Out-Null
      $pset = $hwp.HParameterSet.HBookMark
      $hwp.HAction.GetDefault('Bookmark', $pset.HSet) | Out-Null
      $pset.Name = [string]$name
      $pset.Command = 1
      return $hwp.HAction.Execute('Bookmark', $pset.HSet)
    } catch {
      return $false
    }
  }

  function ReplaceTextEverywhere($findStr, $repStr) {
    if (-not $findStr) { return }
    $hwp.Run('MoveDocBegin') | Out-Null
    $param = $hwp.HParameterSet.HFindReplace
    $hwp.HAction.GetDefault('AllReplace', $param.HSet) | Out-Null
    $param.FindString = [string]$findStr
    $param.ReplaceString = [string]$repStr
    $param.IgnoreMessage = 1
    $param.Direction = 0
    $param.MatchCase = 0
    $param.WholeWordOnly = 0
    $param.ReplaceMode = 1
    $hwp.HAction.Execute('AllReplace', $param.HSet) | Out-Null
  }

  function PasteImageToHwp($fPath, $wMm, $hMm) {
    try {
      if (-not (Test-Path -LiteralPath $fPath)) { return $false }
      $widthMm = [math]::Round([double]$wMm, 1)
      $heightMm = [math]::Round([double]$hMm, 1)
      $ctrl = $hwp.InsertPicture([string]$fPath, $true, 1, $false, $false, 0, $widthMm, $heightMm)
      if ($ctrl -ne $null) {
        try {
          if ($ctrl.Properties.Item('TreatAsChar') -ne 1) {
            $ctrl.Properties.SetItem('TreatAsChar', 1)
          }
        } catch {}
        return $true
      }
      return $false
    } catch {
      LogMsg "InsertPicture Error: $($_.Exception.Message)"
      return $false
    }
  }

  LogMsg "3. 정산월(${numMonth}월) 텍스트 일괄 치환 시작..."
  $replacePairs = @(
    @{ F = '26년(8월)'; R = '${yy}년(${numMonth}월)' },
    @{ F = '26년(6월)'; R = '${yy}년(${numMonth}월)' },
    @{ F = '25년(8월)'; R = '${yy}년(${numMonth}월)' },
    @{ F = '25년(6월)'; R = '${yy}년(${numMonth}월)' },
    @{ F = '26년 8월';  R = '${yy}년 ${numMonth}월' },
    @{ F = '26년 6월';  R = '${yy}년 ${numMonth}월' },
    @{ F = '25년 8월';  R = '${yy}년 ${numMonth}월' },
    @{ F = '25년 6월';  R = '${yy}년 ${numMonth}월' },
    @{ F = '8월)';      R = '${numMonth}월)' },
    @{ F = '6월)';      R = '${numMonth}월)' },
    @{ F = '(8월)';     R = '(${numMonth}월)' },
    @{ F = '(6월)';     R = '(${numMonth}월)' },
    @{ F = '2026년 08월'; R = '${numYear}년 ${mm}월' },
    @{ F = '2026년 06월'; R = '${numYear}년 ${mm}월' },
    @{ F = '2026년 8월';  R = '${numYear}년 ${numMonth}월' },
    @{ F = '2026년 6월';  R = '${numYear}년 ${numMonth}월' },
    @{ F = '2025년 8월';  R = '${numYear}년 ${numMonth}월' },
    @{ F = '2025년 6월';  R = '${numYear}년 ${numMonth}월' },
    @{ F = '26년(';     R = '${yy}년(' },
    @{ F = '25년(';     R = '${yy}년(' }
  )

  foreach ($pair in $replacePairs) {
    ReplaceTextEverywhere $pair.F $pair.R
  }

  LogMsg "4. 책갈피별 증빙 이미지 정밀 바인딩 시작..."
  $tasks = ConvertFrom-Json @'
${tasksJson}
'@

  foreach ($t in $tasks) {
    if (-not $t.file) {
      LogMsg " -> [$($t.name)] 파일이 없어 건너뜁니다."
      continue
    }
    if (-not (Test-Path -LiteralPath $t.file)) {
      LogMsg " -> [$($t.name)] 파일 미존재: $($t.file)"
      continue
    }

    $bm = $t.bookmark
    $moved = MoveToBookmarkSafe $bm
    if (-not $moved) {
      if ($bm -eq '청소필증') { $moved = MoveToBookmarkSafe '필증' }
      elseif ($bm -eq '필증') { $moved = MoveToBookmarkSafe '청소필증' }
    }

    if ($moved) {
      LogMsg " -> 책갈피 [$bm] 이동 성공, 이미지 삽입 ($($t.wMm)x$($t.hMm)mm): $(Split-Path $t.file -Leaf)"
      $ok = PasteImageToHwp $t.file $t.wMm $t.hMm
      if ($ok) {
        LogMsg "    [$bm] 삽입 완료!"
      } else {
        LogMsg "    [$bm] 삽입 실패!"
      }
    } else {
      LogMsg " -> 경고: 책갈피 [$bm]을 찾지 못했습니다."
    }
  }

  LogMsg "5. HWP 문서 저장..."
  $saveRes = $hwp.SaveAs('${workingDoc.replace(/'/g, "''")}', 'HWP', 'lock:false')
  LogMsg "Save result: $saveRes"

  $hwp.Clear(1)
  $hwp.Quit()
  [System.Runtime.InteropServices.Marshal]::ReleaseComObject($hwp) | Out-Null
  Write-Host "HWP_GEN_SUCCESS"
} catch {
  Write-Host "HWP_GEN_ERROR: $($_.Exception.Message)"
  exit 1
}
`;

  const tempPs1 = path.join(os.tmpdir(), `osoo_hongcheon_gen_${Date.now()}.ps1`);
  fs.writeFileSync(tempPs1, Buffer.concat([Buffer.from('\uFEFF', 'utf8'), Buffer.from(psScript, 'utf8')]));

  return new Promise((resolve, reject) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-STA', '-File', tempPs1], { timeout: 60000 }, (err, stdout, stderr) => {
      try { if (fs.existsSync(tempPs1)) fs.unlinkSync(tempPs1); } catch (_) {}

      if (err) {
        console.error('[hongcheonHwpService] HWP 생성 실행 오류:', err.message);
        try { if (fs.existsSync(workingDoc)) fs.unlinkSync(workingDoc); } catch (_) {}
        return reject(new Error(`홍천 한글 정산서 생성 실패: ${err.message}\n${stdout || stderr}`));
      }

      // 정규 마감 폴더에만 안전 저장 (바탕화면 루트 중복 복사 방지)
      try {
        fs.copyFileSync(workingDoc, targetFilePath);
        console.log(`[hongcheonHwpService] 정규 경로 저장 완료: ${targetFilePath}`);
      } catch (saveErr) {
        try { if (fs.existsSync(workingDoc)) fs.unlinkSync(workingDoc); } catch (_) {}
        return reject(new Error(`생성된 파일 저장 실패: ${saveErr.message}`));
      } finally {
        try { if (fs.existsSync(workingDoc)) fs.unlinkSync(workingDoc); } catch (_) {}
      }

      resolve({
        success: true,
        fileName: outputFileName,
        savedPath: targetFilePath,
        desktopPath: targetFilePath,
        year: numYear,
        month: numMonth,
        missing: status.missing,
      });
    });
  });
}

module.exports = {
  ensureHongcheonCertificatesFromDrive,
  getHongcheonEvidenceStatus,
  saveHongcheonEvidence,
  generateHongcheonHwpReport,
};
