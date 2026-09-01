/**
 * 청주휴게소 정산서 한글(HWP) 자동 생성 서비스
 */
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFile } = require('child_process');
const { getTemplateFilePath } = require('./settlementService.cjs');

/**
 * 1mm를 HWP 단위(HWPUNIT)로 환산
 * HWP 5.0 명세: 1 inch = 7200 HWPUNIT = 25.4 mm
 * 1 mm = 7200 / 25.4 = 283.4645669... HWPUNIT
 */
function mmToHwpUnit(mm) {
  return Math.round(mm * 283.464567);
}

function toPowerShellLiteral(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function buildEncodedPowerShellCommand(script) {
  return Buffer.from(script, 'utf16le').toString('base64');
}

function getDesktopDirectories() {
  const home = os.homedir();
  const dirs = [];
  const candidates = [
    path.join(home, 'OneDrive', '바탕 화면'),
    path.join(home, 'OneDrive', 'Desktop'),
    path.join(home, 'OneDrive - Personal', '바탕 화면'),
    path.join(home, 'OneDrive - Personal', 'Desktop'),
    path.join(home, '바탕 화면'),
    path.join(home, 'Desktop'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && !dirs.includes(candidate)) {
      dirs.push(candidate);
    }
  }
  if (dirs.length === 0) dirs.push(path.join(home, 'Desktop'));
  return dirs;
}

/**
 * 로컬 점검준비 폴더 또는 임시 폴더에서 특정 키워드의 이미지 파일들을 검색
 */
function findMatchingImages(folderPath, keyword) {
  if (!fs.existsSync(folderPath)) return [];
  try {
    const files = fs.readdirSync(folderPath);
    return files
      .filter(f => f.includes(keyword) && /\.(jpg|jpeg|png|bmp)$/i.test(f))
      .map(f => path.join(folderPath, f));
  } catch (e) {
    return [];
  }
}

/**
 * 청주휴게소 정산서 한글(HWP) 파일 생성
 * @param {Object} params
 * @param {number} params.year - 대상 연도 (예: 2026)
 * @param {number} params.month - 대상 월 (예: 7)
 * @param {Object} params.statementFiles - 3대 거래명세서 이미지 경로 { waterQuality, kit, chemical }
 * @param {string} [params.outputDir] - 결과 파일 저장 디렉토리 (기본값: 바탕화면/점검준비/정산서/YYYYMM)
 * @returns {Promise<string>} 생성된 HWP 파일 경로
 */
async function generateCheongjuHwpReport({ year, month, statementFiles = {}, outputDir = null }) {
  const templatePath = getTemplateFilePath('template_cheongju_report.hwp');
  if (!templatePath || !fs.existsSync(templatePath)) {
    throw new Error('청주휴게소 한글 템플릿(template_cheongju_report.hwp)을 찾을 수 없습니다.');
  }

  const targetYm = `${year}${String(month).padStart(2, '0')}`;
  const shortYear = String(year).slice(-2);
  const titleText = `${shortYear}년 ${String(month).padStart(2, '0')}월 증빙`;

  // 기본 출력 디렉토리 설정
  let targetOutputDir = outputDir;
  if (!targetOutputDir) {
    const desktopDirs = getDesktopDirectories();
    targetOutputDir = path.join(desktopDirs[0], '점검준비', '정산서', targetYm);
  }
  if (!fs.existsSync(targetOutputDir)) {
    fs.mkdirSync(targetOutputDir, { recursive: true });
  }

  const outputFileName = `${shortYear}년 ${String(month).padStart(2, '0')}월분 오수처리시설 외 임대료 정산 보고건 - 청주(서울)휴게소.hwp`;
  const outputFilePath = path.join(targetOutputDir, outputFileName);

  // 받아들인 명세서 이미지들을 데이터관리 경로(점검준비/명세서 및 청주 사진모음 폴더)에 자동 보관
  const desktopDirs = getDesktopDirectories();
  const statementSaveDirs = [
    path.join(desktopDirs[0], '점검준비', '명세서', targetYm),
    path.join(desktopDirs[0], `청주휴게소(서울방향)_${year}년${String(month).padStart(2, '0')}월_사진모음`),
  ];

  statementSaveDirs.forEach((dir) => {
    try {
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      if (statementFiles.waterQuality && fs.existsSync(statementFiles.waterQuality)) {
        const ext = path.extname(statementFiles.waterQuality) || '.jpg';
        fs.copyFileSync(statementFiles.waterQuality, path.join(dir, `명세서_${targetYm}_청주휴게소(서울방향) 대신${ext}`));
      }
      if (statementFiles.kit && fs.existsSync(statementFiles.kit)) {
        const ext = path.extname(statementFiles.kit) || '.jpg';
        fs.copyFileSync(statementFiles.kit, path.join(dir, `명세서_${targetYm}_청주휴게소(서울방향) 케이엠${ext}`));
      }
      if (statementFiles.chemical && fs.existsSync(statementFiles.chemical)) {
        const ext = path.extname(statementFiles.chemical) || '.jpg';
        fs.copyFileSync(statementFiles.chemical, path.join(dir, `명세서_${targetYm}_청주휴게소(서울방향) 에이치디이앤씨${ext}`));
      }
    } catch (e) {
      console.warn('[hwpSettlementService] 명세서 데이터관리 폴더 복사 중 경고:', e.message);
    }
  });

  // 로컬 점검준비 및 월정산 폴더들 (모든 Desktop 경로 탐색)
  const invoiceDirs = desktopDirs.map(d => path.join(d, '점검준비', '계산서', targetYm));
  const depositDirs = desktopDirs.map(d => path.join(d, '점검준비', '입금표', targetYm));
  const stmtDirs = desktopDirs.map(d => path.join(d, '점검준비', '명세서', targetYm));
  const certDirs = desktopDirs.flatMap(d => [
    path.join(d, '점검준비', '성적서', targetYm),
    path.join(d, '점검준비', '성적서')
  ]);

  // 현장 관리 사진 폴더들 (월정산 > 청주마감자료 > YYYYMM, 월정산 > 청주휴게소 > YYYYMM, 사진모음 폴더 등)
  const settlementPhotoDirs = desktopDirs.flatMap(d => [
    path.join(d, '월정산', '청주마감자료', targetYm),
    path.join(d, '월정산', '청주휴게소', targetYm),
    path.join(d, '월정산', '청주휴게소(서울방향)', targetYm),
    path.join(d, '월정산', '청주마감자료', `청주휴게소(서울방향)_${year}년${String(month).padStart(2, '0')}월_사진모음`),
    path.join(d, `청주휴게소(서울방향)_${year}년${String(month).padStart(2, '0')}월_사진모음`),
    path.join(d, `청주휴게소_${year}년${String(month).padStart(2, '0')}월_사진모음`),
  ]);

  // 특정 디렉토리 목록들에서 이미지 검색하는 헬퍼
  const findCheongjuImages = (dirs, vendorKeyword = '', isStrict = false) => {
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

  // 사진 서브폴더들
  const expPhotoDirs = settlementPhotoDirs.flatMap(dir => [
    path.join(dir, '1_실험사진'),
    dir
  ]).concat(certDirs);

  const sludgePhotoDirs = settlementPhotoDirs.flatMap(dir => [
    path.join(dir, '2_슬러지사진'),
    dir
  ]);

  const cleanCertPhotoDirs = settlementPhotoDirs.flatMap(dir => [
    path.join(dir, '3_청소필증'),
    dir
  ]);

  const chemPhotoDirs = settlementPhotoDirs.flatMap(dir => [
    path.join(dir, '4_약품입고'),
    dir
  ]);

  const kitPhotoDirs = settlementPhotoDirs.flatMap(dir => [
    path.join(dir, '5_키트입고'),
    dir
  ]);

  // HWP 템플릿 내의 각 항목별 다중 검색 키워드 및 규격 바인딩 정보 구성 (가로 mm, 세로 mm)
  const imageSpecs = {
    // 1. 위탁관리비 계산서 및 입금증
    '관리비계산서': {
      findKeywords: ['위탁관리계약서', '위탁관리비(세금계산서)', '위탁관리비'],
      width: 85, height: 50,
      files: findCheongjuImages(invoiceDirs, '용역비').concat(findCheongjuImages(invoiceDirs, '관리비'))
    },
    '관리비입금표': {
      findKeywords: ['위탁관리비(입금증)', '위탁관리비 (입금증)', '관리비(입금증)'],
      width: 85, height: 30,
      files: findCheongjuImages(depositDirs, '용역비').concat(findCheongjuImages(depositDirs, '관리비'))
    },

    // 2. 수질검사 명세서, 계산서, 입금증, 시험성적서
    '수질검사명세서': {
      findKeywords: ['수질검사(거래명세서)', '수질검사명세서', '수질(거래명세서)'],
      width: 85, height: 50,
      files: statementFiles.waterQuality ? [statementFiles.waterQuality] : findCheongjuImages(stmtDirs, '대신')
    },
    '수질검사계산서': {
      findKeywords: ['수질검사(세금계산서)', '수질(세금계산서)'],
      width: 85, height: 50,
      files: findCheongjuImages(invoiceDirs, '대신')
    },
    '수질검사입금표': {
      findKeywords: ['수질검사입금표', '수질검사(입금증)', '수질(입금증)'],
      width: 85, height: 30,
      files: findCheongjuImages(depositDirs, '대신')
    },
    '성적서': {
      findKeywords: ['수질검사 시험성적서', '시험성적서', '수질성적서'],
      width: 27, height: 42, isCertGrid: true,
      files: findCheongjuImages(expPhotoDirs, '성적서').concat(findCheongjuImages(expPhotoDirs, '실험')).concat(findCheongjuImages(expPhotoDirs, ''))
    },

    // 3. 수질분석 키트 명세서, 계산서, 입금증, 사진
    '키트명세서': {
      findKeywords: ['수질분석 키트 구입(거래명세서)', '키트(거래명세서)'],
      width: 85, height: 50,
      files: statementFiles.kit ? [statementFiles.kit] : findCheongjuImages(stmtDirs, '케이엠')
    },
    '키트계산서': {
      findKeywords: ['수질분석 키트 구입(세금계산서)', '키트계산서', '키트(세금계산서)'],
      width: 85, height: 50,
      files: findCheongjuImages(invoiceDirs, '케이엠')
    },
    '키트입금표': {
      findKeywords: ['수질분석 키트 구입(입금증)', '키트(입금증)'],
      width: 85, height: 30,
      files: findCheongjuImages(depositDirs, '케이엠')
    },
    '키트사진': {
      findKeywords: ['수질분석 키트 구입 사진', '키트 구입 사진', '키트사진'],
      width: 68, height: 93, isVerticalStack: true,
      files: findCheongjuImages(kitPhotoDirs, '').concat(findCheongjuImages(chemPhotoDirs, '키트'))
    },

    // 4. 약품비 명세서, 계산서, 입금증, 사진
    '약품명세서': {
      findKeywords: ['약품비(거래명세서)', '약품명세서', '약품(거래명세서)'],
      width: 85, height: 50,
      files: statementFiles.chemical ? [statementFiles.chemical] : findCheongjuImages(stmtDirs, '에이치')
    },
    '약품계산서': {
      findKeywords: ['약품비(세금계산서)', '약품(세금계산서)'],
      width: 85, height: 50,
      files: findCheongjuImages(invoiceDirs, '에이치')
    },
    '약품입금표': {
      findKeywords: ['약품비(입금증)', '약품입금표', '약품(입금증)'],
      width: 85, height: 30,
      files: findCheongjuImages(depositDirs, '에이치')
    },
    '약품사진': {
      findKeywords: ['약품 구입사진', '약품 구입 사진', '약품사진'],
      width: 68, height: 93, isVerticalStack: true,
      files: findCheongjuImages(chemPhotoDirs, '')
    },

    // 5. 슬러지 계량증명서, 계산서, 입금증, 사진
    '청소필증사진': {
      findKeywords: ['슬러지 수거 계량증명서', '슬러지 계량증명서', '청소필증사진', '청소필증'],
      width: 32, height: 73, isDual: true,
      files: findCheongjuImages(cleanCertPhotoDirs, '').concat(findCheongjuImages(sludgePhotoDirs, '필증'))
    },
    '슬러지계산서': {
      findKeywords: ['슬러지처리비(계산서)', '슬러지계산서', '슬러지(계산서)'],
      width: 85, height: 50,
      files: findCheongjuImages(invoiceDirs, '국민환경')
    },
    '슬러지입금표': {
      findKeywords: ['슬러지처리비(입금증)', '슬러지(입금증)'],
      width: 85, height: 30,
      files: findCheongjuImages(depositDirs, '국민환경')
    },
    '슬러지반출사진': {
      findKeywords: ['슬러지반출사진', '슬러지 처리 사진', '슬러지 사진'],
      width: 60, height: 90, isVerticalStack: true,
      files: findCheongjuImages(sludgePhotoDirs, '')
    },
  };

  const serializedImageSpecs = JSON.stringify(imageSpecs);

  // 템플릿 복사본을 임시 폴더에 생성하여 작업
  const tempWorkingPath = path.join(os.tmpdir(), `osoo_work_${Date.now()}_${Math.random().toString(36).substring(7)}.hwp`);
  try {
    fs.copyFileSync(templatePath, tempWorkingPath);
  } catch (cpErr) {
    console.error('[hwpSettlementService] 템플릿 복사 오류:', cpErr);
  }

  // 7월 기준 연간 누계 계산
  const glucoseAnnual = (6600 + 900 * (month - 7)).toLocaleString();
  const sodaAnnual = (5200 + 800 * (month - 7)).toLocaleString();
  const aluAnnual = (4200 + 700 * (month - 7)).toLocaleString();
  const nh3Annual = (1061 + 156 * (month - 7)).toLocaleString();
  const po4Annual = (558 + 78 * (month - 7)).toLocaleString();

  const logPath = path.join(os.tmpdir(), `osoo_hwp_log_${Date.now()}.txt`);

  const psScript = [
    "Add-Type -AssemblyName System.Windows.Forms",
    "Add-Type -AssemblyName System.Drawing",
    "$ErrorActionPreference = 'Stop'",
    `$tempWorkingPath = ${toPowerShellLiteral(tempWorkingPath)}`,
    `$specsJson = ${toPowerShellLiteral(serializedImageSpecs)}`,
    `$logFile = ${toPowerShellLiteral(logPath)}`,
    "function LogMsg($m) { Add-Content -LiteralPath $logFile -Value $m -Encoding utf8 }",
    "LogMsg '--- Starting HWP Automation ---'",
    "if (-not (Test-Path -LiteralPath $tempWorkingPath)) { throw \"HWP working template not found: $tempWorkingPath\" }",
    "$specs = ConvertFrom-Json $specsJson",
    "$hwp = $null",
    "try {",
    "  LogMsg 'Creating HWP COM object...'",
    "  $hwp = New-Object -ComObject HWPFrame.HwpObject",
    "  try { $hwp.RegisterModule('FilePathCheckDLL', 'FilePathChecker') | Out-Null } catch {}",
    "  $hwp.SetMessageBoxMode(65535)",
    "  LogMsg \"Opening template: $tempWorkingPath\"",
    "  $openResult = $hwp.Open($tempWorkingPath, 'HWP', 0)",
    "  LogMsg \"Open result: $openResult\"",
    "  if (-not $openResult) { throw \"HWP 파일을 열 수 없습니다: $tempWorkingPath\" }",
    "",
    "  # 1. 문서 전체의 연도/월/누계 텍스트 및 이미지 마커 일괄 찾아바꾸기 (AllReplace)",
    "  LogMsg '1. Replacing text and inserting markers...'",
    "  $replacePairs = @(",
    `    @{ Find = '25년 7월분'; Replace = '${shortYear}년 ${month}월분' },`,
    `    @{ Find = '25년 7월';   Replace = '${shortYear}년 ${month}월' },`,
    `    @{ Find = '25년 07월';  Replace = '${shortYear}년 ${String(month).padStart(2, '0')}월' },`,
    `    @{ Find = '2025년 7월'; Replace = '${year}년 ${month}월' },`,
    `    @{ Find = '2026년 7월'; Replace = '${year}년 ${month}월' },`,
    `    @{ Find = '(7월)';      Replace = '(${month}월)' },`,
    `    @{ Find = '7월분';      Replace = '${month}월분' },`,
    `    @{ Find = '25년 7월 증빙'; Replace = '${shortYear}년 ${month}월 증빙' },`,
    `    @{ Find = '6,600';     Replace = '${glucoseAnnual}' },`,
    `    @{ Find = '5,200';     Replace = '${sodaAnnual}' },`,
    `    @{ Find = '4,200';     Replace = '${aluAnnual}' },`,
    `    @{ Find = '1,061';     Replace = '${nh3Annual}' },`,
    `    @{ Find = '558';       Replace = '${po4Annual}' }`,
    "  )",
    "",
    "  # 슬러지 대장 일자 치환",
    "  for ($d = 1; $d -le 31; $d++) {",
    "    $findDay = '7월 ' + $d + '일'",
    `    $replaceDay = '${month}월 ' + $d + '일'`,
    "    $replacePairs += @{ Find = $findDay; Replace = $replaceDay }",
    "  }",
    "",
    "  # 각 이미지 항목별 키워드를 고유 마커([[KEY]])로 치환",
    "  foreach ($prop in $specs.PSObject.Properties) {",
    "    $key = [string]$prop.Name",
    "    $specObj = $prop.Value",
    "    $fileList = @($specObj.files)",
    "    if ($fileList.Count -gt 0) {",
    "      $marker = '[[' + $key + ']]'",
    "      foreach ($kw in @($specObj.findKeywords)) {",
    "        $kwStr = [string]$kw",
    "        if ($kwStr) {",
    "          $replacePairs += @{ Find = $kwStr; Replace = $marker }",
    "        }",
    "      }",
    "    }",
    "  }",
    "",
    "  foreach ($rp in $replacePairs) {",
    "    $fStr = [string]$rp.Find",
    "    $rStr = [string]$rp.Replace",
    "    if ($fStr -and $rStr -and $fStr -ne $rStr) {",
    "      $param = $hwp.HParameterSet.HFindReplace",
    "      $hwp.HAction.GetDefault('AllReplace', $param.HSet) | Out-Null",
    "      $param.FindString = $fStr",
    "      $param.ReplaceString = $rStr",
    "      $param.IgnoreMessage = 1",
    "      $param.Direction = 0",
    "      $param.MatchCase = 0",
    "      $param.WholeWordOnly = 0",
    "      $hwp.HAction.Execute('AllReplace', $param.HSet) | Out-Null",
    "    }",
    "  }",
    "  LogMsg 'Text replace and marker injection finished.'",
    "",
    "  # 2. 이미지 마커 위치 탐색 및 클립보드 삽입",
    "  LogMsg '2. Inserting images via Clipboard...'",
    "  foreach ($prop in $specs.PSObject.Properties) {",
    "    $key = [string]$prop.Name",
    "    $specObj = $prop.Value",
    "    $fileList = @($specObj.files)",
    "    if ($fileList.Count -eq 0) {",
    "      LogMsg \"Skip '$key': 0 files\"",
    "      continue",
    "    }",
    "",
    "    $marker = '[[' + $key + ']]'",
    "    $hwp.Run('MoveDocBegin') | Out-Null",
    "    $param = $hwp.HParameterSet.HFindReplace",
    "    $hwp.HAction.GetDefault('FindReplace', $param.HSet) | Out-Null",
    "    $param.FindString = $marker",
    "    $param.Direction = 0",
    "    $param.MatchCase = 0",
    "    $param.WholeWordOnly = 0",
    "    $param.IgnoreMessage = 1",
    "    $found = $hwp.HAction.Execute('FindReplace', $param.HSet)",
    "",
    "    LogMsg \"Binding '$key' (marker '$marker'): found=$found (files: $($fileList.Count))\"",
    "",
    "    if ($found) {",
    "      $hwp.Run('Delete') | Out-Null",
    "",
    "      $idx = 0",
    "      foreach ($f in $fileList) {",
    "        if (Test-Path -LiteralPath $f) {",
    "          try {",
    "            $img = [System.Drawing.Image]::FromFile($f)",
    "            [System.Windows.Forms.Clipboard]::SetImage($img)",
    "            $img.Dispose()",
    "            $hwp.Run('Paste') | Out-Null",
    "            $idx++",
    "            if ($specObj.isCertGrid -and $idx -eq 3) {",
    "              $hwp.Run('BreakPara') | Out-Null",
    "            } elseif ($specObj.isVerticalStack) {",
    "              $hwp.Run('BreakPara') | Out-Null",
    "            } else {",
    "              $hwp.InsertText(' ') | Out-Null",
    "            }",
    "          } catch {",
    "            LogMsg \"Error pasting image $f : $($_.Exception.Message)\"",
    "          }",
    "        }",
    "      }",
    "    }",
    "  }",
    "",
    "  # 3. 작업 템플릿 저장",
    "  LogMsg '3. Saving working document...'",
    "  $hwp.Save($false) | Out-Null",
    "  LogMsg 'HWP saved successfully!'",
    "} finally {",
    "  if ($hwp -ne $null) {",
    "    try { $hwp.Clear(1) } catch {}",
    "    try { $hwp.Quit() } catch {}",
    "    [void][System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($hwp)",
    "  }",
    "  [GC]::Collect()",
    "  [GC]::WaitForPendingFinalizers()",
    "}",
  ].join("\n");

  const fullScript = `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8\n${psScript}`;

  // 임시 .ps1 스크립트 파일 생성 (BOM UTF-8)
  const tempScriptPath = path.join(os.tmpdir(), `osoo_cheongju_${Date.now()}_${Math.random().toString(36).substring(7)}.ps1`);
  const bomBuffer = Buffer.from('\uFEFF', 'utf8');
  const scriptBuffer = Buffer.from(fullScript, 'utf8');
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
          try { fs.unlinkSync(logPath); } catch (_) {}
        }

        if (error) {
          try {
            if (fs.existsSync(tempScriptPath)) fs.unlinkSync(tempScriptPath);
            if (fs.existsSync(tempWorkingPath)) fs.unlinkSync(tempWorkingPath);
          } catch (_) {}
          console.error('[hwpSettlementService] HWP 생성 오류 stdout:', stdout);
          console.error('[hwpSettlementService] HWP 생성 오류 stderr:', stderr);
          return reject(new Error(`한글 정산서 생성 실패: ${stderr || error.message}`));
        }

        // 작업 템플릿을 최종 대상 경로로 안전하게 복사
        try {
          if (fs.existsSync(tempWorkingPath)) {
            fs.copyFileSync(tempWorkingPath, outputFilePath);
            fs.unlinkSync(tempWorkingPath);
          }
          if (fs.existsSync(tempScriptPath)) fs.unlinkSync(tempScriptPath);
        } catch (copyErr) {
          return reject(new Error(`정산서 파일 복사 실패: ${copyErr.message}`));
        }

        if (!fs.existsSync(outputFilePath)) {
          return reject(new Error('한글 정산서 파일이 생성되지 않았습니다.'));
        }
        resolve(outputFilePath);
      }
    );
  });
}

module.exports = {
  generateCheongjuHwpReport,
};
