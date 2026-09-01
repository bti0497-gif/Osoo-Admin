const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFile } = require('child_process');

/**
 * 윈도우 바탕화면 디렉토리 목록 조회 (OneDrive 및 로컬)
 */
function getDesktopDirectories() {
  const home = os.homedir();
  const dirs = [
    path.join(home, 'OneDrive', '바탕 화면'),
    path.join(home, 'OneDrive', 'Desktop'),
    path.join(home, '바탕 화면'),
    path.join(home, 'Desktop'),
  ];
  return dirs.filter(d => fs.existsSync(d));
}

/**
 * 문자열을 PowerShell 이스케이프 문자열로 변환
 */
function toPowerShellLiteral(str) {
  if (typeof str !== 'string') return "''";
  return "'" + str.replace(/'/g, "''") + "'";
}

/**
 * 청주휴게소 정산서 한글(HWP) 파일 자동 생성 메인 함수
 */
async function generateCheongjuHwpReport({
  year = new Date().getFullYear(),
  month = new Date().getMonth() + 1,
  statementFiles = {},
  outputPath = null,
} = {}) {
  const shortYear = String(year).slice(-2);
  const targetYm = `${year}${String(month).padStart(2, '0')}`;
  const desktopDirs = getDesktopDirectories();

  // 1. 원본 템플릿 탐색
  const templateCandidates = [
    ...desktopDirs.map(d => path.join(d, '정산양식', 'template_cheongju_report.hwp')),
    ...desktopDirs.map(d => path.join(d, '정산양식', '청주휴게소_정산양식.hwp')),
    path.join(__dirname, '..', '..', 'templates', 'template_cheongju_report.hwp'),
    path.join(process.cwd(), 'templates', 'template_cheongju_report.hwp'),
  ];

  let templatePath = null;
  for (const cand of templateCandidates) {
    if (fs.existsSync(cand)) {
      templatePath = cand;
      break;
    }
  }

  if (!templatePath) {
    throw new Error('청주휴게소 정산 한글 템플릿(template_cheongju_report.hwp)을 찾을 수 없습니다.');
  }

  // 2. 최종 저장 대상 경로 결정 (월정산 > 청주마감자료 > YYYYMM)
  const defaultOutputDir = desktopDirs.length > 0
    ? path.join(desktopDirs[0], '월정산', '청주마감자료', targetYm)
    : path.join(os.homedir(), '바탕 화면', '월정산', '청주마감자료', targetYm);

  if (!fs.existsSync(defaultOutputDir)) {
    fs.mkdirSync(defaultOutputDir, { recursive: true });
  }

  const finalReportFileName = `${shortYear}년 ${String(month).padStart(2, '0')}월분 오수처리시설 외 임대료 정산 보고건 - 청주(서울)휴게소.hwp`;
  const finalReportPath = outputPath || path.join(defaultOutputDir, finalReportFileName);

  // 3. 임시 작업 파일 생성
  const tempWorkingPath = path.join(os.tmpdir(), `cheongju_hwp_${Date.now()}_${Math.random().toString(36).substring(7)}.hwp`);
  fs.copyFileSync(templatePath, tempWorkingPath);

  // 4. 로컬 디렉토리들에서 필요한 이미지 파일들 탐색
  const invoiceDirs = desktopDirs.map(d => path.join(d, '점검준비', '계산서', targetYm));
  const depositDirs = desktopDirs.map(d => path.join(d, '점검준비', '입금표', targetYm));
  const stmtDirs = desktopDirs.map(d => path.join(d, '점검준비', '명세서', targetYm));

  const settlementPhotoDirs = desktopDirs.flatMap(d => [
    path.join(d, '월정산', '청주마감자료', targetYm),
    path.join(d, '월정산', '청주휴게소', targetYm),
    path.join(d, '월정산', '청주휴게소(서울방향)', targetYm),
    path.join(d, `청주휴게소(서울방향)_${year}년${String(month).padStart(2, '0')}월_사진모음`),
    path.join(d, `청주휴게소_${year}년${String(month).padStart(2, '0')}월_사진모음`),
  ]);

  const findFiles = (dirs, vendorKeyword = '', isStrict = false) => {
    const list = [];
    const seen = new Set();
    const dirList = Array.isArray(dirs) ? dirs : [dirs];
    for (const d of dirList) {
      if (!d || !fs.existsSync(d)) continue;
      try {
        const files = fs.readdirSync(d);
        for (const f of files) {
          const lower = f.toLowerCase();
          const isExt = /\.(jpg|jpeg|png|bmp|webp)$/i.test(f);
          if (!isExt) continue;
          const siteMatch = lower.includes('청주');
          const vendorMatch = !vendorKeyword || lower.includes(vendorKeyword.toLowerCase());
          const match = isStrict ? (siteMatch && vendorMatch) : vendorMatch;
          if (match) {
            const fullPath = path.join(d, f);
            if (!seen.has(fullPath)) {
              seen.add(fullPath);
              list.push(fullPath);
            }
          }
        }
      } catch (_) {}
    }
    return list;
  };

  const expPhotoDirs = settlementPhotoDirs.flatMap(dir => [path.join(dir, '1_실험사진'), dir]);
  const sludgePhotoDirs = settlementPhotoDirs.flatMap(dir => [path.join(dir, '2_슬러지사진'), dir]);
  const cleanCertPhotoDirs = settlementPhotoDirs.flatMap(dir => [path.join(dir, '3_청소필증'), dir]);
  const chemPhotoDirs = settlementPhotoDirs.flatMap(dir => [path.join(dir, '4_약품입고'), dir]);
  const kitPhotoDirs = settlementPhotoDirs.flatMap(dir => [path.join(dir, '5_키트입고'), dir]);

  // 키워드별 바인딩 대상 파일 목록 구성
  const bindingTasks = [
    // 1. 관리비 계산서 및 입금증
    {
      keywords: ['위탁관리계약서', '위탁관리비(세금계산서)', '위탁관리비'],
      files: findFiles(invoiceDirs, '용역비').concat(findFiles(invoiceDirs, '관리비')),
      isCertGrid: false, isVertical: false
    },
    {
      keywords: ['위탁관리비(입금증)', '위탁관리비 (입금증)', '관리비(입금증)'],
      files: findFiles(depositDirs, '용역비').concat(findFiles(depositDirs, '관리비')),
      isCertGrid: false, isVertical: false
    },

    // 2. 수질검사 명세서, 계산서, 입금증, 성적서
    {
      keywords: ['수질검사(거래명세서)', '수질검사명세서', '수질(거래명세서)'],
      files: statementFiles.waterQuality ? [statementFiles.waterQuality] : findFiles(stmtDirs, '대신'),
      isCertGrid: false, isVertical: false
    },
    {
      keywords: ['수질검사(세금계산서)', '수질(세금계산서)'],
      files: findFiles(invoiceDirs, '대신'),
      isCertGrid: false, isVertical: false
    },
    {
      keywords: ['수질검사(입금증)', '수질검사입금표', '수질(입금증)'],
      files: findFiles(depositDirs, '대신'),
      isCertGrid: false, isVertical: false
    },
    {
      keywords: ['수질검사 시험성적서', '시험성적서', '수질성적서'],
      files: findFiles(expPhotoDirs, '성적서').concat(findFiles(expPhotoDirs, '실험')).concat(findFiles(expPhotoDirs, '')),
      isCertGrid: true, isVertical: false
    },

    // 3. 키트 명세서, 계산서, 입금증, 사진
    {
      keywords: ['수질분석 키트 구입(거래명세서)', '키트(거래명세서)'],
      files: statementFiles.kit ? [statementFiles.kit] : findFiles(stmtDirs, '케이엠'),
      isCertGrid: false, isVertical: false
    },
    {
      keywords: ['수질분석 키트 구입(세금계산서)', '키트계산서', '키트(세금계산서)'],
      files: findFiles(invoiceDirs, '케이엠'),
      isCertGrid: false, isVertical: false
    },
    {
      keywords: ['수질분석 키트 구입(입금증)', '키트(입금증)'],
      files: findFiles(depositDirs, '케이엠'),
      isCertGrid: false, isVertical: false
    },
    {
      keywords: ['수질분석 키트 구입 사진', '키트 구입 사진', '키트사진'],
      files: findFiles(kitPhotoDirs, '').concat(findFiles(chemPhotoDirs, '키트')),
      isCertGrid: false, isVertical: true
    },

    // 4. 약품 명세서, 계산서, 입금증, 사진
    {
      keywords: ['약품비(거래명세서)', '약품명세서', '약품(거래명세서)'],
      files: statementFiles.chemical ? [statementFiles.chemical] : findFiles(stmtDirs, '에이치'),
      isCertGrid: false, isVertical: false
    },
    {
      keywords: ['약품비(세금계산서)', '약품(세금계산서)'],
      files: findFiles(invoiceDirs, '에이치'),
      isCertGrid: false, isVertical: false
    },
    {
      keywords: ['약품비(입금증)', '약품입금표', '약품(입금증)'],
      files: findFiles(depositDirs, '에이치'),
      isCertGrid: false, isVertical: false
    },
    {
      keywords: ['약품 구입사진', '약품 구입 사진', '약품사진'],
      files: findFiles(chemPhotoDirs, ''),
      isCertGrid: false, isVertical: true
    },

    // 5. 슬러지 계량증명서, 계산서, 입금증, 사진
    {
      keywords: ['슬러지 수거 계량증명서', '슬러지 계량증명서', '청소필증사진', '청소필증'],
      files: findFiles(cleanCertPhotoDirs, '').concat(findFiles(sludgePhotoDirs, '필증')),
      isCertGrid: false, isVertical: false
    },
    {
      keywords: ['슬러지처리비(계산서)', '슬러지계산서', '슬러지(계산서)'],
      files: findFiles(invoiceDirs, '국민환경').concat(findFiles(invoiceDirs, '슬러지')),
      isCertGrid: false, isVertical: false
    },
    {
      keywords: ['슬러지처리비(입금증)', '슬러지(입금증)'],
      files: findFiles(depositDirs, '국민환경').concat(findFiles(depositDirs, '슬러지')),
      isCertGrid: false, isVertical: false
    },
    {
      keywords: ['슬러지 반출 사진', '슬러지 처리 사진', '슬러지사진'],
      files: findFiles(sludgePhotoDirs, ''),
      isCertGrid: false, isVertical: false
    }
  ];

  // 슬러지 반출 이벤트 데이터 (청주 8월: 8월 11일, 8월 18일 등)
  const sludgeEvents = [
    { dayStr: `${month}월 11일`, vendor: '국민환경', time: '08:30', weight: '20' },
    { dayStr: `${month}월 18일`, vendor: '국민환경', time: '08:30', weight: '20' },
  ];

  // 5. PowerShell 자동화 스크립트 작성
  const glucoseAnnual = (6600 + 900 * (month - 7)).toLocaleString();
  const sodaAnnual = (5200 + 800 * (month - 7)).toLocaleString();
  const aluAnnual = (4200 + 700 * (month - 7)).toLocaleString();
  const nh3Annual = (1061 + 156 * (month - 7)).toLocaleString();
  const po4Annual = (558 + 78 * (month - 7)).toLocaleString();

  const logPath = path.join(os.tmpdir(), `osoo_hwp_log_${Date.now()}.txt`);

  const psScript = `
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$ErrorActionPreference = 'Continue'

$workingDoc = ${toPowerShellLiteral(tempWorkingPath)}
$logFile = ${toPowerShellLiteral(logPath)}
$tasksJson = ${toPowerShellLiteral(JSON.stringify(bindingTasks))}
$sludgeJson = ${toPowerShellLiteral(JSON.stringify(sludgeEvents))}

function LogMsg($m) {
  Add-Content -LiteralPath $logFile -Value "[$(Get-Date -Format 'HH:mm:ss')] $m" -Encoding utf8
  Write-Host $m
}

LogMsg "1. Opening template: $workingDoc"
$hwp = New-Object -ComObject HWPFrame.HwpObject
try {
  try { $hwp.RegisterModule('FilePathCheckDLL', 'FilePathChecker') | Out-Null } catch {}
  $hwp.SetMessageBoxMode(65535)
  $openRes = $hwp.Open($workingDoc, 'HWP', 'lock:false')
  LogMsg "Open result: $openRes"

  # 1. 텍스트 일괄 찾아바꾸기
  LogMsg "2. Replacing text..."
  $replacePairs = @(
    @{ F = '25년 7월분'; R = '${shortYear}년 ${month}월분' },
    @{ F = '25년 7월';   R = '${shortYear}년 ${month}월' },
    @{ F = '25년 07월';  R = '${shortYear}년 ${String(month).padStart(2, '0')}월' },
    @{ F = '2025년 7월'; R = '${year}년 ${month}월' },
    @{ F = '2026년 7월'; R = '${year}년 ${month}월' },
    @{ F = '7월 슬러지반출 관리대장'; R = '${month}월 슬러지반출 관리대장' },
    @{ F = '2026년 7월 슬러지반출 관리대장'; R = '${year}년 ${month}월 슬러지반출 관리대장' },
    @{ F = '2025년 7월 슬러지반출 관리대장'; R = '${year}년 ${month}월 슬러지반출 관리대장' },
    @{ F = '(7월)';      R = '(${month}월)' },
    @{ F = '7월분';      R = '${month}월분' },
    @{ F = '25년 7월 증빙'; R = '${shortYear}년 ${month}월 증빙' },
    @{ F = '26년 7월 증빙'; R = '${shortYear}년 ${month}월 증빙' },
    @{ F = '6,600';     R = '${glucoseAnnual}' },
    @{ F = '5,200';     R = '${sodaAnnual}' },
    @{ F = '4,200';     R = '${aluAnnual}' },
    @{ F = '1,061';     R = '${nh3Annual}' },
    @{ F = '558';       R = '${po4Annual}' }
  )

  for ($d = 1; $d -le 31; $d++) {
    $replacePairs += @{ F = "7월 $d일"; R = "${month}월 $d일" }
  }

  foreach ($rp in $replacePairs) {
    $param = $hwp.HParameterSet.HFindReplace
    $hwp.HAction.GetDefault('AllReplace', $param.HSet) | Out-Null
    $param.FindString = $rp.F
    $param.ReplaceString = $rp.R
    $param.IgnoreMessage = 1
    $param.Direction = 0
    $param.MatchCase = 0
    $param.WholeWordOnly = 0
    $hwp.HAction.Execute('AllReplace', $param.HSet) | Out-Null
  }
  LogMsg "Text replace finished."

  # 2. 슬러지 반출일자 대장 표 채우기
  LogMsg "3. Filling sludge ledger table..."
  $sludgeList = ConvertFrom-Json $sludgeJson
  foreach ($ev in $sludgeList) {
    $hwp.Run('MoveDocBegin') | Out-Null
    $param = $hwp.HParameterSet.HFindReplace
    $hwp.HAction.GetDefault('FindReplace', $param.HSet) | Out-Null
    $param.FindString = $ev.dayStr
    $param.Direction = 0
    $param.MatchCase = 0
    $param.WholeWordOnly = 0
    $param.IgnoreMessage = 1
    $found = $hwp.HAction.Execute('FindReplace', $param.HSet)
    if ($found) {
      $hwp.Run('TableRightCell') | Out-Null
      $hwp.InsertText($ev.vendor) | Out-Null
      $hwp.Run('TableRightCell') | Out-Null
      $hwp.InsertText($ev.time) | Out-Null
      $hwp.Run('TableRightCell') | Out-Null
      $hwp.InsertText($ev.weight) | Out-Null
      LogMsg "Injected sludge row for $($ev.dayStr)"
    }
  }

  # 3. 이미지 직접 검색 및 클립보드 붙여넣기
  LogMsg "4. Pasting images directly into table cells..."
  $tasks = ConvertFrom-Json $tasksJson
  foreach ($task in $tasks) {
    $files = @($task.files)
    if ($files.Count -eq 0) { continue }
    
    $keywords = @($task.keywords)
    $inserted = $false

    foreach ($kw in $keywords) {
      if ($inserted) { break }
      $kwStr = [string]$kw
      if (-not $kwStr) { continue }

      $hwp.Run('MoveDocBegin') | Out-Null
      $param = $hwp.HParameterSet.HFindReplace
      $hwp.HAction.GetDefault('FindReplace', $param.HSet) | Out-Null
      $param.FindString = $kwStr
      $param.Direction = 0
      $param.MatchCase = 0
      $param.WholeWordOnly = 0
      $param.IgnoreMessage = 1
      $found = $hwp.HAction.Execute('FindReplace', $param.HSet)

      if ($found) {
        LogMsg "Found keyword '$kwStr', inserting $($files.Count) image(s)..."
        $hwp.Run('Delete') | Out-Null

        $idx = 0
        foreach ($f in $files) {
          $fStr = [string]$f
          if (Test-Path -LiteralPath $fStr) {
            try {
              $img = [System.Drawing.Image]::FromFile($fStr)
              [System.Windows.Forms.Clipboard]::SetImage($img)
              $img.Dispose()
              $hwp.Run('Paste') | Out-Null
              $idx++

              if ($task.isCertGrid -and $idx -eq 3) {
                $hwp.Run('BreakPara') | Out-Null
              } elseif ($task.isVertical) {
                $hwp.Run('BreakPara') | Out-Null
              } else {
                $hwp.InsertText(' ') | Out-Null
              }
            } catch {
              LogMsg "Error pasting $fStr : $($_.Exception.Message)"
            }
          }
        }
        $inserted = $true
      }
    }
  }

  # 4. 저장
  LogMsg "5. Saving HWP working document..."
  $hwp.Save($false) | Out-Null
  LogMsg "6. HWP saved successfully!"
} finally {
  if ($hwp -ne $null) {
    try { $hwp.Clear(1) } catch {}
    try { $hwp.Quit() } catch {}
    [void][System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($hwp)
  }
  [GC]::Collect()
  [GC]::WaitForPendingFinalizers()
}
`;

  // 임시 .ps1 스크립트 파일 생성 (BOM UTF-8)
  const tempScriptPath = path.join(os.tmpdir(), `osoo_cheongju_${Date.now()}_${Math.random().toString(36).substring(7)}.ps1`);
  const bomBuffer = Buffer.from('\uFEFF', 'utf8');
  const scriptBuffer = Buffer.from(`[Console]::OutputEncoding = [System.Text.Encoding]::UTF8\n${psScript}`, 'utf8');
  fs.writeFileSync(tempScriptPath, Buffer.concat([bomBuffer, scriptBuffer]));

  return new Promise((resolve, reject) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-STA', '-File', tempScriptPath],
      { windowsHide: true, maxBuffer: 20 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (fs.existsSync(logPath)) {
          const logContent = fs.readFileSync(logPath, 'utf8');
          console.log('[hwpSettlementService Log]:\n' + logContent);
        }

        try { if (fs.existsSync(tempScriptPath)) fs.unlinkSync(tempScriptPath); } catch (_) {}
        try { if (fs.existsSync(logPath)) fs.unlinkSync(logPath); } catch (_) {}

        if (error) {
          console.error('[hwpSettlementService] PowerShell 실행 실패:', error, stderr);
          try { if (fs.existsSync(tempWorkingPath)) fs.unlinkSync(tempWorkingPath); } catch (_) {}
          return reject(new Error(`한글 정산서 자동 생성 실패: ${error.message}`));
        }

        try {
          fs.copyFileSync(tempWorkingPath, finalReportPath);
          try { if (fs.existsSync(tempWorkingPath)) fs.unlinkSync(tempWorkingPath); } catch (_) {}

          console.log(`[hwpSettlementService] 청주 정산서 한글 파일 생성 완료: ${finalReportPath}`);
          return resolve({
            success: true,
            filePath: finalReportPath,
            fileName: path.basename(finalReportPath),
            targetYm,
          });
        } catch (copyErr) {
          console.error('[hwpSettlementService] 최종 파일 복사 실패:', copyErr);
          return reject(new Error(`한글 정산서 파일 복사 실패: ${copyErr.message}`));
        }
      }
    );
  });
}

module.exports = {
  generateCheongjuHwpReport,
};
