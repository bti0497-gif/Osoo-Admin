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

  // 로컬 매칭 이미지 탐색 (바탕화면 점검준비/계산서/YYYYMM, 점검준비/입금표/YYYYMM, 청주 사진모음 폴더)
  const invoiceDir = path.join(desktopDirs[0], '점검준비', '계산서', targetYm);
  const depositDir = path.join(desktopDirs[0], '점검준비', '입금표', targetYm);
  const photoDir = path.join(desktopDirs[0], `청주휴게소(서울방향)_${year}년${String(month).padStart(2, '0')}월_사진모음`);

  // HWP 템플릿 내의 각 표 칸에 실제 인쇄된 텍스트 플레이스홀더 목록 및 규격 (가로 mm, 세로 mm)
  const imagePlaceholders = [
    // 1. 위탁관리비 계산서 및 입금증
    { findText: '위탁관리비(세금계산서)', width: 85, height: 50, files: findMatchingImages(invoiceDir, '용역비') },
    { findText: '위탁관리비(입금증)', width: 85, height: 30, files: findMatchingImages(depositDir, '용역비').concat(findMatchingImages(depositDir, '관리비')) },

    // 2. 수질검사 명세서, 계산서, 입금증, 시험성적서
    { findText: '수질검사(거래명세서)', width: 85, height: 50, files: statementFiles.waterQuality ? [statementFiles.waterQuality] : [] },
    { findText: '수질검사(세금계산서)', width: 85, height: 50, files: findMatchingImages(invoiceDir, '대신') },
    { findText: '수질검사(입금증)', width: 85, height: 30, files: findMatchingImages(depositDir, '대신') },
    { findText: '수질검사 시험성적서', width: 27, height: 42, isCertGrid: true, files: findMatchingImages(photoDir, '성적서').concat(findMatchingImages(depositDir, '성적서')) },

    // 3. 수질분석 키트 명세서, 계산서, 입금증, 사진
    { findText: '수질분석 키트 구입(거래명세서)', width: 85, height: 50, files: statementFiles.kit ? [statementFiles.kit] : [] },
    { findText: '수질분석 키트 구입(세금계산서)', width: 85, height: 50, files: findMatchingImages(invoiceDir, '케이엠') },
    { findText: '수질분석 키트 구입(입금증)', width: 85, height: 30, files: findMatchingImages(depositDir, '케이엠') },
    { findText: '수질분석 키트 구입 사진', width: 68, height: 93, isVerticalStack: true, files: findMatchingImages(photoDir, '키트') },

    // 4. 약품비 명세서, 계산서, 입금증, 사진
    { findText: '약품비(거래명세서)', width: 85, height: 50, files: statementFiles.chemical ? [statementFiles.chemical] : [] },
    { findText: '약품비(세금계산서)', width: 85, height: 50, files: findMatchingImages(invoiceDir, '에이치') },
    { findText: '약품비(입금증)', width: 85, height: 30, files: findMatchingImages(depositDir, '에이치') },
    { findText: '약품 구입사진', width: 68, height: 93, isVerticalStack: true, files: findMatchingImages(photoDir, '약품') },

    // 5. 슬러지 계량증명서, 계산서, 입금증, 사진
    { findText: '슬러지 수거 계량증명서', width: 32, height: 73, isDual: true, files: findMatchingImages(photoDir, '필증').concat(findMatchingImages(photoDir, '계량')) },
    { findText: '슬러지처리비(계산서)', width: 85, height: 50, files: findMatchingImages(invoiceDir, '국민환경') },
    { findText: '슬러지처리비(입금증)', width: 85, height: 30, files: findMatchingImages(depositDir, '국민환경') },
    { findText: '슬러지 처리 사진', width: 60, height: 90, isVerticalStack: true, files: findMatchingImages(photoDir, '슬러지') },
  ];

  // 템플릿 복사본을 임시 폴더에 생성하여 작업 (Program Files 권한 문제 및 원본 오염 원천 차단)
  const tempWorkingPath = path.join(os.tmpdir(), `osoo_cheongju_template_${Date.now()}_${Math.random().toString(36).substring(7)}.hwp`);
  fs.copyFileSync(templatePath, tempWorkingPath);

  const serializedImagePlaceholders = JSON.stringify(imagePlaceholders);

  // 약품/키트 연간 누계 계산
  const glucoseAnnual = (950 * month).toLocaleString();
  const sodaAnnual = (750 * month).toLocaleString();
  const pacAnnual = (750 * month).toLocaleString();
  const aluAnnual = (600 * month).toLocaleString();
  const polyAnnual = (10 * month).toLocaleString();
  const nh3Annual = (1061 + 156 * (month - 7)).toLocaleString();
  const no3Annual = (1061 + 156 * (month - 7)).toLocaleString();
  const po4Annual = (558 + 78 * (month - 7)).toLocaleString();
  const alkAnnual = (1061 + 154 * (month - 7)).toLocaleString();

  const psScript = [
    "$ErrorActionPreference = 'Stop'",
    `$tempWorkingPath = ${toPowerShellLiteral(tempWorkingPath)}`,
    `$outputPath = ${toPowerShellLiteral(outputFilePath)}`,
    `$placeholdersJson = ${toPowerShellLiteral(serializedImagePlaceholders)}`,
    "if (-not (Test-Path -LiteralPath $tempWorkingPath)) { throw \"HWP working template not found: $tempWorkingPath\" }",
    "if (Test-Path -LiteralPath $outputPath) { Remove-Item -LiteralPath $outputPath -Force }",
    "$imageItems = ConvertFrom-Json $placeholdersJson",
    "$hwp = $null",
    "try {",
    "  $hwp = New-Object -ComObject HWPFrame.HwpObject",
    "  try { $hwp.RegisterModule('FilePathCheckDLL', 'FilePathChecker') | Out-Null } catch {}",
    "  $hwp.SetMessageBoxMode(65535)",
    "  $openResult = $hwp.Open($tempWorkingPath, 'HWP', 'lock:false')",
    "  if (-not $openResult) { throw \"HWP 파일을 열 수 없습니다: $tempWorkingPath\" }",
    "",
    "  # 1. 문서 전체의 연도/월/누계 텍스트 일괄 찾아바꾸기 (AllReplace)",
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
    "  # 슬러지 대장 일자 치환 (7월 1일 ~ 7월 31일 -> ${month}월 1일 ~ ${month}월 31일)",
    "  for ($d = 1; $d -le 31; $d++) {",
    "    $findDay = '7월 ' + $d + '일'",
    `    $replaceDay = '${month}월 ' + $d + '일'`,
    "    $replacePairs += @{ Find = $findDay; Replace = $replaceDay }",
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
    "",
    "  # 2. 이미지 텍스트 플레이스홀더 탐색 후 이미지 삽입",
    "  foreach ($item in $imageItems) {",
    "    $fText = [string]$item.findText",
    "    $fileList = @($item.files)",
    "    if ($fileList.Count -eq 0) { continue }",
    "",
    "    $wUnit = [int]([double]$item.width * 283.464567)",
    "    $hUnit = [int]([double]$item.height * 283.464567)",
    "",
    "    # 문서 처음으로 이동",
    "    $hwp.Run('MoveDocBegin') | Out-Null",
    "",
    "    $param = $hwp.HParameterSet.HFindReplace",
    "    $hwp.HAction.GetDefault('Find', $param.HSet) | Out-Null",
    "    $param.FindString = $fText",
    "    $param.Direction = 0",
    "    $param.MatchCase = 0",
    "    $param.WholeWordOnly = 0",
    "    $param.IgnoreMessage = 1",
    "    $found = $hwp.HAction.Execute('Find', $param.HSet)",
    "",
    "    if ($found) {",
    "      $hwp.Run('Delete') | Out-Null",
    "",
    "      if ($item.isCertGrid) {",
    "        $idx = 0",
    "        foreach ($f in $fileList) {",
    "          if (Test-Path -LiteralPath $f) {",
    "            $hwp.InsertPicture($f, $true, 1, $false, $false, 0, $wUnit, $hUnit) | Out-Null",
    "            $idx++",
    "            if ($idx -eq 3) { $hwp.Run('BreakPara') | Out-Null } else { $hwp.InsertText(' ') | Out-Null }",
    "          }",
    "        }",
    "      } elseif ($item.isVerticalStack) {",
    "        foreach ($f in $fileList) {",
    "          if (Test-Path -LiteralPath $f) {",
    "            $hwp.InsertPicture($f, $true, 1, $false, $false, 0, $wUnit, $hUnit) | Out-Null",
    "            $hwp.Run('BreakPara') | Out-Null",
    "          }",
    "        }",
    "      } else {",
    "        foreach ($f in $fileList) {",
    "          if (Test-Path -LiteralPath $f) {",
    "            $hwp.InsertPicture($f, $true, 1, $false, $false, 0, $wUnit, $hUnit) | Out-Null",
    "            $hwp.InsertText(' ') | Out-Null",
    "          }",
    "        }",
    "      }",
    "    }",
    "  }",
    "",
    "  # 3. 완성된 HWP 저장",
    "  $hwp.SaveAs($outputPath, 'HWP', '') | Out-Null",
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

  // 임시 .ps1 스크립트 파일 생성 (BOM UTF-8)
  const tempScriptPath = path.join(os.tmpdir(), `osoo_cheongju_${Date.now()}_${Math.random().toString(36).substring(7)}.ps1`);
  // 한글 깨짐 방지 UTF-8 BOM
  const bomBuffer = Buffer.from('\uFEFF', 'utf8');
  const scriptBuffer = Buffer.from(psScript, 'utf8');
  fs.writeFileSync(tempScriptPath, Buffer.concat([bomBuffer, scriptBuffer]));

  return new Promise((resolve, reject) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', tempScriptPath],
      { windowsHide: true, maxBuffer: 20 * 1024 * 1024 },
      (error, stdout, stderr) => {
        // 임시 스크립트 및 작업 템플릿 삭제
        try {
          if (fs.existsSync(tempScriptPath)) fs.unlinkSync(tempScriptPath);
          if (fs.existsSync(tempWorkingPath)) fs.unlinkSync(tempWorkingPath);
        } catch (_) {}

        if (error) {
          console.error('[hwpSettlementService] HWP 생성 오류 stdout:', stdout);
          console.error('[hwpSettlementService] HWP 생성 오류 stderr:', stderr);
          return reject(new Error(`한글 정산서 생성 실패: ${stderr || error.message}`));
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
