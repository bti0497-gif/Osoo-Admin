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

  // 로컬 매칭 이미지 탐색 (바탕화면 점검준비/계산서/YYYYMM 및 점검준비/입금표/YYYYMM)
  const invoiceDir = path.join(desktopDirs[0], '점검준비', '계산서', targetYm);
  const depositDir = path.join(desktopDirs[0], '점검준비', '입금표', targetYm);

  // 규격별 이미지 바인딩 정보 구성
  // HWP 규격 (가로 mm, 세로 mm)
  const imageSpecs = {
    // 계산서 및 명세서류 (85x50)
    '관리비계산서': { width: 85, height: 50, files: findMatchingImages(invoiceDir, '용역비') },
    '수질검사명세서': { width: 85, height: 50, files: statementFiles.waterQuality ? [statementFiles.waterQuality] : [] },
    '수질검사계산서': { width: 85, height: 50, files: findMatchingImages(invoiceDir, '대신') },
    '키트명세서': { width: 85, height: 50, files: statementFiles.kit ? [statementFiles.kit] : [] },
    '키트계산서': { width: 85, height: 50, files: findMatchingImages(invoiceDir, '케이엠') },
    '약품명세서': { width: 85, height: 50, files: statementFiles.chemical ? [statementFiles.chemical] : [] },
    '약품계산서': { width: 85, height: 50, files: findMatchingImages(invoiceDir, '에이치') },
    '슬러지계산서': { width: 85, height: 50, files: findMatchingImages(invoiceDir, '국민환경') },

    // 입금표류 (85x30)
    '수질검사입금표': { width: 85, height: 30, files: findMatchingImages(depositDir, '대신') },
    '키트입금표': { width: 85, height: 30, files: findMatchingImages(depositDir, '케이엠') },
    '약품입금표': { width: 85, height: 30, files: findMatchingImages(depositDir, '에이치') },
    '슬러지입금표': { width: 85, height: 30, files: findMatchingImages(depositDir, '국민환경') },

    // 성적서 (27x42, 6개 - 3개 후 줄바꿈 3개)
    '성적서': { width: 27, height: 42, isCertGrid: true, files: [] },

    // 사진류
    '약품사진': { width: 68, height: 93, isVerticalStack: true, files: [] },
    '청소필증사진': { width: 32, height: 73, isDual: true, files: [] },
    '슬러지반출사진': { width: 60, height: 90, isVerticalStack: true, files: [] },
  };

  // 표 제목 텍스트 바인딩
  const textBindings = {
    '증빙표제목': titleText,
    '증빙표제목0': titleText,
    '증빙표제목1': titleText,
    '증빙표제목2': titleText,
    '증빙표제목3': titleText,
    '증빙표제목4': titleText,
    '증빙표제목6': titleText,
    '증빙표제목7': titleText,
    '슬러지년도': `${year}년`,
    '슬러지월': `${month}월`,
  };

  const serializedImageSpecs = JSON.stringify(imageSpecs);
  const serializedTextBindings = JSON.stringify(textBindings);

  const psScript = [
    "$ErrorActionPreference = 'Stop'",
    `$templatePath = ${toPowerShellLiteral(templatePath)}`,
    `$outputPath = ${toPowerShellLiteral(outputFilePath)}`,
    `$specsJson = ${toPowerShellLiteral(serializedImageSpecs)}`,
    `$textsJson = ${toPowerShellLiteral(serializedTextBindings)}`,
    "if (-not (Test-Path -LiteralPath $templatePath)) { throw \"HWP template not found: $templatePath\" }",
    "if (Test-Path -LiteralPath $outputPath) { Remove-Item -LiteralPath $outputPath -Force }",
    "$specs = ConvertFrom-Json $specsJson",
    "$texts = ConvertFrom-Json $textsJson",
    "$hwp = $null",
    "try {",
    "  $hwp = New-Object -ComObject HWPFrame.HwpObject",
    "  try { $hwp.RegisterModule('FilePathCheckDLL', 'FilePathChecker') | Out-Null } catch {}",
    "  $hwp.SetMessageBoxMode(65535)",
    "  $openResult = $hwp.Open($templatePath, 'HWP', 0)",
    "  if (-not $openResult) { throw \"HWP 파일을 열 수 없습니다: $templatePath\" }",
    "",
    "  # 1. 문서 전체의 연도/월 텍스트 일괄 찾아바꾸기 (AllReplace)",
    "  $replacePairs = @(",
    `    @{ Find = '25년 7월분'; Replace = '${shortYear}년 ${month}월분' },`,
    `    @{ Find = '25년 7월';   Replace = '${shortYear}년 ${month}월' },`,
    `    @{ Find = '25년 07월';  Replace = '${shortYear}년 ${String(month).padStart(2, '0')}월' },`,
    `    @{ Find = '2025년 7월'; Replace = '${year}년 ${month}월' },`,
    `    @{ Find = '2026년 7월'; Replace = '${year}년 ${month}월' },`,
    `    @{ Find = '(7월)';      Replace = '(${month}월)' },`,
    `    @{ Find = '7월분';      Replace = '${month}월분' }`,
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
    "  # 2. 텍스트 책갈피 주입",
    "  foreach ($prop in $texts.PSObject.Properties) {",
    "    $bName = [string]$prop.Name",
    "    $bVal = [string]$prop.Value",
    "    if ($hwp.MoveToBookmark($bName)) {",
    "      $hwp.Run('SelectAll') | Out-Null",
    "      $hwp.InsertText($bVal) | Out-Null",
    "    }",
    "  }",
    "",
    "  # 3. 이미지 책갈피 주입 (지정 규격 적용)",
    "  foreach ($prop in $specs.PSObject.Properties) {",
    "    $bName = [string]$prop.Name",
    "    $specObj = $prop.Value",
    "    $fileList = @($specObj.files)",
    "    if ($fileList.Count -eq 0) { continue }",
    "",
    "    $wMm = [double]$specObj.width",
    "    $hMm = [double]$specObj.height",
    "    # 1mm = 283.465 hwpunit",
    "    $wUnit = [int]($wMm * 283.464567)",
    "    $hUnit = [int]($hMm * 283.464567)",
    "",
    "    if ($hwp.MoveToBookmark($bName)) {",
    "      $hwp.Run('SelectAll') | Out-Null",
    "      $hwp.Run('Delete') | Out-Null",
    "",
    "      if ($specObj.isCertGrid) {",
    "        # 성적서 6장: 3장 나열 후 줄바꿈 + 3장",
    "        $idx = 0",
    "        foreach ($f in $fileList) {",
    "          if (Test-Path -LiteralPath $f) {",
    "            $hwp.InsertPicture($f, $true, 1, $false, $false, 0, $wUnit, $hUnit) | Out-Null",
    "            $idx++",
    "            if ($idx -eq 3) {",
    "              $hwp.Run('BreakPara') | Out-Null",
    "            } else {",
    "              $hwp.InsertText(' ') | Out-Null",
    "            }",
    "          }",
    "        }",
    "      } elseif ($specObj.isVerticalStack) {",
    "        # 세로 묶음",
    "        foreach ($f in $fileList) {",
    "          if (Test-Path -LiteralPath $f) {",
    "            $hwp.InsertPicture($f, $true, 1, $false, $false, 0, $wUnit, $hUnit) | Out-Null",
    "            $hwp.Run('BreakPara') | Out-Null",
    "          }",
    "        }",
    "      } else {",
    "        # 단일 또는 일반 나열",
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
    "  $hwp.SaveAs($outputPath, 'HWP')",
    "} finally {",
    "  if ($hwp -ne $null) {",
    "    try { $hwp.Quit() } catch {}",
    "    [void][System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($hwp)",
    "  }",
    "  [GC]::Collect()",
    "  [GC]::WaitForPendingFinalizers()",
    "}",
  ].join("\n");

  const encoded = buildEncodedPowerShellCommand(psScript);

  return new Promise((resolve, reject) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded],
      { windowsHide: true, maxBuffer: 10 * 1024 * 1024 },
      (error, stdout, stderr) => {
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
