/**
 * 홍천휴게소(양양방향) 한글(HWP) 정산 보고서 자동 생성 서비스
 * 
 * [확정 규격]
 * - 템플릿: template_hongcheon_yangyang.hwp
 * - 책갈피 및 이미지 크기 (가로 mm × 세로 mm):
 *   1. '계산서': 162 mm × 100 mm
 *   2. '반출사진': 135 mm × 100 mm
 *   3. '청소필증': 135 mm × 100 mm
 *   4. '성적서1', '성적서2', '성적서3', '성적서4': 각 54 mm × 64 mm
 *   5. '수리수선비계산서1', '수리수선비계산서2': 각 135 mm × 100 mm (선택 사항/자리 보존)
 * - 저장 위치:
 *   - 정규 경로: 바탕화면 > 월정산 > 홍천마감자료 > YYYYMM > 홍천휴게소(양양)휴게소_${yy}년 ${month}월 오수정화조 임대료 정산보고서.hwp
 *   - 바탕화면 루트: 바탕화면 바로 위 동시 복사 보존
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');
const { getTemplateFilePath } = require('./settlementService.cjs');

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
 * 홍천 증빙 이미지 및 필수 파일 상태 진단
 */
function getHongcheonEvidenceStatus(year, month) {
  const numYear = Number(year) || 2026;
  const numMonth = Number(month) || 8;
  const targetYm = `${numYear}${String(numMonth).padStart(2, '0')}`;
  const desktop = getPrimaryDesktop();

  // 1. 홍천 마감자료 폴더
  const settlementDir = path.join(desktop, '월정산', '홍천마감자료', targetYm);
  if (!fs.existsSync(settlementDir)) {
    try { fs.mkdirSync(settlementDir, { recursive: true }); } catch (_) {}
  }

  // 검색 대상 디렉토리들
  const searchDirs = [
    settlementDir,
    path.join(desktop, '월정산', '홍천마감자료'),
    path.join(desktop, '점검준비', '성적서', targetYm),
    path.join(desktop, '점검준비', '성적서'),
    path.join(desktop, '성적서', targetYm),
    path.join(desktop, '점검준비', '계산서', targetYm),
    path.join(desktop, '점검준비', '계산서'),
    path.join(desktop, '계산서', targetYm),
    path.join(desktop, '월정산', '홍천마감자료', '202608'),
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

  // 계산서: 홍천 키워드 최우선 매칭 (마감 폴더 -> 점검준비 순)
  let invoice = null;
  const settlementInvoices = findFiles([settlementDir], /계산서/i);
  if (settlementInvoices.length > 0) {
    invoice = settlementInvoices[0];
  } else {
    // 1순위: 홍천 용역비 매출계산서
    const priorityInvoices = findFiles(searchDirs, /(매출계산서|용역비).*홍천|홍천.*(매출계산서|용역비)/i);
    if (priorityInvoices.length > 0) {
      invoice = priorityInvoices[0];
    } else {
      const searchInvoices = findFiles(searchDirs, /홍천.*계산서|계산서.*홍천/i);
      invoice = searchInvoices[0] || null;
    }
  }

  // 성적서 4장: 홍천 키워드가 들어간 성적서 / mlss 선별
  let certFiles = findFiles([settlementDir], /성적서|mlss/i)
    .concat(findFiles(searchDirs, /홍천.*(성적서|mlss)|(성적서|mlss).*홍천/i));
  certFiles = Array.from(new Set(certFiles)).filter(f => {
    const base = path.basename(f);
    return base.includes('홍천') && (base.includes('성적서') || base.includes('mlss'));
  });
  // 타 현장 배제
  certFiles = certFiles.filter(f => {
    const base = path.basename(f);
    return !base.includes('죽암') && !base.includes('청주') && !base.includes('천안') && !base.includes('고창');
  });
  certFiles.sort((a, b) => path.basename(a).localeCompare(path.basename(b), 'ko-KR', { numeric: true }));
  const certs = certFiles.slice(0, 4);

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
  const numMonth = Number(month) || 8;
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
 * 홍천 한글(HWP) 정산서 자동 생성 메인 함수
 */
async function generateHongcheonHwpReport(year, month, customInputs = {}) {
  const numYear = Number(year) || 2026;
  const numMonth = Number(month) || 8;
  const targetYm = `${numYear}${String(numMonth).padStart(2, '0')}`;
  const yy = String(numYear).slice(-2);

  // 1. 템플릿 탐색 (AppData 최우선)
  let tplPath = getTemplateFilePath('template_hongcheon_yangyang.hwp');
  if (!tplPath || !fs.existsSync(tplPath)) {
    tplPath = getTemplateFilePath('template_hongcheon_yangyang_hwp.hwp');
  }
  if (!tplPath || !fs.existsSync(tplPath)) {
    throw new Error('홍천휴게소 한글 템플릿 파일(template_hongcheon_yangyang.hwp)을 찾을 수 없습니다.');
  }

  // 2. 증빙 이미지 상태 수집
  const status = getHongcheonEvidenceStatus(numYear, numMonth);
  const cleanCert = customInputs.cleanCert || status.cleanCert;
  const sludgePhoto = customInputs.sludgePhoto || status.sludgePhoto;
  const invoice = customInputs.invoice || status.invoice;
  const certs = customInputs.certs?.length ? customInputs.certs : status.certs;
  const repairs = customInputs.repairs || status.repairs;

  if (!cleanCert) {
    throw new Error('청소필증 이미지가 등록되지 않았습니다. 모달에서 청소필증을 업로드해 주세요.');
  }
  if (!sludgePhoto) {
    throw new Error('반출사진 이미지가 등록되지 않았습니다. 모달에서 반출사진을 업로드해 주세요.');
  }

  // 3. 임시 작업 파일 생성 (원본 템플릿 락 방지)
  const workingDoc = path.join(os.tmpdir(), `osoo_hongcheon_working_${Date.now()}_${Math.random().toString(36).substring(7)}.hwp`);
  fs.copyFileSync(tplPath, workingDoc);

  // 4. 출력 경로 및 파일명 결정
  const desktop = getPrimaryDesktop();
  const outputFileName = `홍천휴게소(양양)휴게소_${yy}년 ${numMonth}월 오수정화조 임대료 정산보고서.hwp`;
  const targetFolder = path.join(desktop, '월정산', '홍천마감자료', targetYm);
  if (!fs.existsSync(targetFolder)) {
    fs.mkdirSync(targetFolder, { recursive: true });
  }
  const targetFilePath = path.join(targetFolder, outputFileName);
  const desktopFilePath = path.join(desktop, outputFileName);

  // 5. 바인딩 작업 정의 (규격: 가로 mm × 세로 mm)
  const bindingTasks = [
    { name: '계산서', bookmark: '계산서', file: invoice, wMm: 162, hMm: 100 },
    { name: '반출사진', bookmark: '반출사진', file: sludgePhoto, wMm: 135, hMm: 100 },
    { name: '청소필증', bookmark: '청소필증', file: cleanCert, wMm: 135, hMm: 100 },
    { name: '성적서1', bookmark: '성적서1', file: certs[0] || null, wMm: 54, hMm: 64 },
    { name: '성적서2', bookmark: '성적서2', file: certs[1] || null, wMm: 54, hMm: 64 },
    { name: '성적서3', bookmark: '성적서3', file: certs[2] || null, wMm: 54, hMm: 64 },
    { name: '성적서4', bookmark: '성적서4', file: certs[3] || null, wMm: 54, hMm: 64 },
  ];

  if (repairs[0]) {
    bindingTasks.push({ name: '수리수선비1', bookmark: '수리수선비계산서1', file: repairs[0], wMm: 135, hMm: 100 });
  }
  if (repairs[1]) {
    bindingTasks.push({ name: '수리수선비2', bookmark: '수리수선비계산서2', file: repairs[1], wMm: 135, hMm: 100 });
  }

  // 6. PowerShell HWP COM 자동화 스크립트 작성
  const tasksJson = JSON.stringify(bindingTasks);
  const psScript = `
$ErrorActionPreference = 'Stop'

function LogMsg($msg) {
  Write-Host "[홍천HWP] $msg"
}

try {
  LogMsg "1. HWP COM 개체 생성 및 초기화..."
  $hwp = New-Object -ComObject HWPFrame.HwpObject
  try { $hwp.RegisterModule("FilePathCheckDLL", "FilePathChecker") | Out-Null } catch {}
  $hwp.SetMessageBoxMode(65535)

  LogMsg "2. 템플릿 작업 복사본 열기: ${workingDoc.replace(/'/g, "''")}"
  $openRes = $hwp.Open('${workingDoc.replace(/'/g, "''")}', "HWP", "lock:false")
  if (-not $openRes) {
    throw "템플릿 작업 복사본을 열지 못했습니다: ${workingDoc.replace(/'/g, "''")}"
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
      $ok = $hwp.HAction.Execute('Bookmark', $pset.HSet)
      if ($ok) { return $true }
    } catch {}
    return $false
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

    $replaced = $hwp.HAction.Execute('AllReplace', $param.HSet)
    LogMsg "  Replace '$findStr' -> '$repStr': $replaced"
  }

  LogMsg "3. 정산월(${numMonth}월) 텍스트 일괄 치환 및 책갈피 처리..."
  $replacePairs = @(
    @{ F = '26년(6월)'; R = '${yy}년(${numMonth}월)' },
    @{ F = '25년(6월)'; R = '${yy}년(${numMonth}월)' },
    @{ F = '26년 (6월)'; R = '${yy}년 (${numMonth}월)' },
    @{ F = '(6월)'; R = '(${numMonth}월)' },
    @{ F = '6월)'; R = '${numMonth}월)' },
    @{ F = '26년 6월'; R = '${yy}년 ${numMonth}월' },
    @{ F = '25년 6월'; R = '${yy}년 ${numMonth}월' },
    @{ F = '2026년 06월'; R = '${numYear}년 ${String(numMonth).padStart(2, '0')}월' },
    @{ F = '2026년 6월'; R = '${numYear}년 ${numMonth}월' },
    @{ F = '2025년 6월'; R = '${numYear}년 ${numMonth}월' }
  )

  foreach ($rp in $replacePairs) {
    ReplaceTextEverywhere $rp.F $rp.R
  }

  # 정산월 책갈피 탐색 및 값 치환 (책갈피가 지정되어 있는 경우)
  $monthBms = @('정산월', '정산월1', '정산월2', '월', '월1', '월2', '정산', '년월')
  foreach ($mb in $monthBms) {
    if (MoveToBookmarkSafe $mb) {
      LogMsg "  -> 정산월 책갈피 [$mb] 발견! '${numMonth}월' 입력"
      try {
        $insParam = $hwp.HParameterSet.HInsertText
        $hwp.HAction.GetDefault('InsertText', $insParam.HSet) | Out-Null
        $insParam.Text = "${numMonth}월"
        $hwp.HAction.Execute('InsertText', $insParam.HSet) | Out-Null
      } catch {}
    }
  }

  function PasteImageToHwp($fPath, $wMm, $hMm) {
    try {
      if (-not (Test-Path -LiteralPath $fPath)) { return $false }
      $widthMm = [math]::Round([double]$wMm, 1)
      $heightMm = [math]::Round([double]$hMm, 1)
      # sizeoption 1: mm 단위
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

  LogMsg "4. 책갈피 위치별 이미지 바인딩 시작..."
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
      # 필증/청소필증 상호 폴백
      if ($bm -eq '청소필증') { $moved = MoveToBookmarkSafe '필증' }
      elseif ($bm -eq '필증') { $moved = MoveToBookmarkSafe '청소필증' }
    }

    if ($moved) {
      LogMsg " -> 책갈피 [$bm] 이동 성공, 이미지 삽입 ($($t.wMm)x$($t.hMm)mm): $(Split-Path $t.file -Leaf)"
      try { $hwp.Run('Delete') | Out-Null } catch {}
      $ok = PasteImageToHwp $t.file $t.wMm $t.hMm
      if ($ok) {
        LogMsg "    [$bm] 삽입 성공!"
      } else {
        LogMsg "    [$bm] 삽입 실패!"
      }
    } else {
      LogMsg " -> 경고: 책갈피 [$bm]을 찾지 못했습니다."
    }
  }

  # 4. 저장 (작업 복사본에 저장 후 닫기)
  LogMsg "4. HWP 작업 문서 저장..."
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

  const tempPs1 = path.join(os.tmpdir(), `osoo_hongcheon_hwp_${Date.now()}.ps1`);
  const bomBuffer = Buffer.from('\uFEFF', 'utf8');
  const scriptBuffer = Buffer.from(`[Console]::OutputEncoding = [System.Text.Encoding]::UTF8\n${psScript}`, 'utf8');
  fs.writeFileSync(tempPs1, Buffer.concat([bomBuffer, scriptBuffer]));

  return new Promise((resolve, reject) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-STA', '-File', tempPs1], { timeout: 60000 }, (err, stdout, stderr) => {
      try { if (fs.existsSync(tempPs1)) fs.unlinkSync(tempPs1); } catch (_) {}

      if (err) {
        console.error('[hongcheonHwpService] HWP 생성 실행 오류:', err.message);
        try { if (fs.existsSync(workingDoc)) fs.unlinkSync(workingDoc); } catch (_) {}
        return reject(new Error(`홍천 한글 정산서 생성 실패: ${err.message}\n${stdout || stderr}`));
      }

      // 5. 완료된 작업 복사본을 정규 경로 및 바탕화면에 안전 복사
      try {
        fs.copyFileSync(workingDoc, targetFilePath);
        console.log(`[hongcheonHwpService] 정규 경로 저장 완료: ${targetFilePath}`);
        try {
          fs.copyFileSync(workingDoc, desktopFilePath);
          console.log(`[hongcheonHwpService] 바탕화면 동시 복사 완료: ${desktopFilePath}`);
        } catch (desktopErr) {
          console.warn('[hongcheonHwpService] 바탕화면 복사 경고:', desktopErr.message);
        }
      } catch (saveErr) {
        try { if (fs.existsSync(workingDoc)) fs.unlinkSync(workingDoc); } catch (_) {}
        return reject(new Error(`생성된 파일 복사 실패: ${saveErr.message}`));
      } finally {
        try { if (fs.existsSync(workingDoc)) fs.unlinkSync(workingDoc); } catch (_) {}
      }

      resolve({
        success: true,
        fileName: outputFileName,
        savedPath: targetFilePath,
        desktopPath: desktopFilePath,
        year: numYear,
        month: numMonth,
        missing: status.missing,
      });
    });
  });
}

module.exports = {
  getHongcheonEvidenceStatus,
  saveHongcheonEvidence,
  generateHongcheonHwpReport,
};
