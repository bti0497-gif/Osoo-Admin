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

function persistHwpAutomationLog(logContent, targetYm) {
  const appDataRoot = process.env.APP_DATA_PATH
    || path.join(process.env.APPDATA || os.homedir(), 'Osoo_Admin_App');
  const logDir = path.join(appDataRoot, 'logs', 'cheongju-hwp');
  fs.mkdirSync(logDir, { recursive: true });

  const logFileName = `${targetYm}_${new Date().toISOString().replace(/[:.]/g, '-')}.log`;
  const persistentLogPath = path.join(logDir, logFileName);
  fs.writeFileSync(persistentLogPath, logContent || '(자동화 로그가 생성되지 않았습니다.)\n', 'utf8');
  return persistentLogPath;
}

function describeFiles(files) {
  return (Array.isArray(files) ? files : [files]).filter(Boolean).map((filePath) => ({
    path: filePath,
    exists: fs.existsSync(filePath),
    bytes: fs.existsSync(filePath) ? fs.statSync(filePath).size : 0,
  }));
}

function materializeBindingTaskFiles(bindingTasks) {
  const evidenceWorkingDir = fs.mkdtempSync(path.join(os.tmpdir(), 'osoo_cheongju_hwp_inputs_'));
  bindingTasks.forEach((task, taskIndex) => {
    task.files = (task.files || []).map((sourcePath, fileIndex) => {
      if (!fs.existsSync(sourcePath)) return sourcePath;
      const extension = path.extname(sourcePath) || '.jpg';
      const targetPath = path.join(evidenceWorkingDir, `task_${taskIndex + 1}_${fileIndex + 1}${extension}`);
      fs.copyFileSync(sourcePath, targetPath);
      return targetPath;
    });
  });
  return evidenceWorkingDir;
}

/**
 * 청주휴게소 정산서 한글(HWP) 파일 자동 생성 메인 함수
 */
async function generateCheongjuHwpReport({
  year = new Date().getFullYear(),
  month = new Date().getMonth() + 1,
  statementFiles = {},
  photoFiles = {},
  usageSummary = { medicines: {}, kits: {} },
  reportData = null,
  flowRows = [],
  site = {},
  templatePath: configuredTemplatePath = null,
  outputPath = null,
} = {}) {
  const shortYear = String(year).slice(-2);
  const targetYm = `${year}${String(month).padStart(2, '0')}`;
  const desktopDirs = getDesktopDirectories();

  // 1. 원본 템플릿 탐색
  const templateCandidates = [
    configuredTemplatePath,
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

  // 2. 최종 저장 대상은 OneDrive 바탕 화면 > 월정산 > 청주마감자료 > YYYYMM으로 고정한다.
  const defaultOutputDir = path.join(
    os.homedir(),
    'OneDrive',
    '바탕 화면',
    '월정산',
    '청주마감자료',
    targetYm
  );

  if (!fs.existsSync(defaultOutputDir)) {
    fs.mkdirSync(defaultOutputDir, { recursive: true });
  }

  const finalReportFileName = `${shortYear}년 ${String(month).padStart(2, '0')}월분 오수처리시설 외 임대료 정산 보고건 - 청주(서울)휴게소.hwp`;
  const finalReportPath = outputPath || path.join(defaultOutputDir, finalReportFileName);

  // 3. 임시 작업 파일 생성
  const tempWorkingPath = path.join(os.tmpdir(), `cheongju_hwp_${Date.now()}_${Math.random().toString(36).substring(7)}.hwp`);
  fs.copyFileSync(templatePath, tempWorkingPath);
  const diagnosticSnapshot = JSON.stringify({
    site,
    targetYm,
    template: describeFiles(templatePath)[0],
    workingCopy: describeFiles(tempWorkingPath)[0],
    outputPath: finalReportPath,
    statements: Object.fromEntries(Object.entries(statementFiles).map(([name, filePath]) => [name, describeFiles(filePath)[0] || null])),
    photos: Object.fromEntries(Object.entries(photoFiles).map(([name, files]) => [name, describeFiles(files)])),
    medicine: reportData?.medicine || {},
    kitUsage: usageSummary.kits || {},
    medicineUsage: usageSummary.medicines || {},
    flowRows: (flowRows || []).map((row) => ({
      date: row.date?.value || row.date,
      type: row.type,
      calculatedFlow: row.calculated_flow,
      sludgeExport: row.sludge_export,
      rawValue: row.raw_value,
    })),
    sludgeBindingSource: '현재 HWP 대장 행은 고정 슬러지 이벤트를 사용하며 BigQuery 슬러지 바인딩은 구현되지 않음',
  });

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
            const dedupeKey = f.toLowerCase();
            if (!seen.has(dedupeKey)) {
              seen.add(dedupeKey);
              list.push(fullPath);
            }
          }
        }
      } catch (_) {}
    }
    return list;
  };

  const mergeUnique = (...groups) => {
    const seen = new Set();
    const merged = [];
    groups.flat().filter(Boolean).forEach((file) => {
      const key = path.resolve(file).toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        merged.push(file);
      }
    });
    return merged;
  };

  const subDirs = (folderName) => settlementPhotoDirs.map(dir => path.join(dir, folderName));
  const findPhotoFiles = (dirs, includeKeyword = '', excludeKeywords = []) => {
    const files = findFiles(dirs, includeKeyword, false);
    return files.filter((file) => {
      const name = path.basename(file).toLowerCase();
      return !excludeKeywords.some((kw) => name.includes(kw.toLowerCase()));
    });
  };

  const expPhotoDirs = subDirs('1_실험사진');
  const sludgePhotoDirs = subDirs('2_슬러지사진');
  const cleanCertPhotoDirs = subDirs('3_청소필증');
  const chemPhotoDirs = subDirs('4_약품입고');
  const kitPhotoDirs = subDirs('5_키트입고');
  const photoDocExcludes = ['명세서_', '계산서_', '입금표_', '매출계산서_'];

  // 키워드별 바인딩 대상 파일 목록 구성
  // ★ 점검준비 폴더(계산서/입금표/명세서)는 모든 현장 파일이 섞여 있으므로 isStrict=true로 '청주' 필터링 필수
  // ★ 관리비 계산서/입금증은 휴게소측에서 직접 넣으므로 자동 마운트 대상에서 제외
  const bindingTasks = [

    // 1. 수질검사 명세서, 계산서, 입금표, 성적서
    {
      bookmarks: ['수질명세서', '수질검사명세서', '수질검사_거래명세서', '수질검사거래명세서', '수질거래명세서', 'water_quality_statement'],
      keywords: ['수질검사(거래명세서)', '수질검사명세서', '수질(거래명세서)'],
      files: statementFiles.waterQuality ? [statementFiles.waterQuality] : findFiles(stmtDirs, '대신', true),
      isCertGrid: false, isVertical: false,
      imgWidthMm: 80.3, imgHeightMm: 51.6   // 8.03cm × 5.16cm
    },
    {
      bookmarks: ['수질계산서', '수질검사계산서', '수질검사_세금계산서', '수질검사세금계산서', '수질세금계산서', 'water_quality_invoice'],
      keywords: ['수질검사(세금계산서)', '수질(세금계산서)'],
      files: findFiles(invoiceDirs, '대신', true),
      isCertGrid: false, isVertical: false,
      imgWidthMm: 80.3, imgHeightMm: 51.6
    },
    {
      bookmarks: ['수질입금표', '수질검사입금표', '수질검사_입금증', '수질검사_입금표', '수질검사입금증', 'water_quality_deposit'],
      keywords: ['수질검사(입금증)', '수질검사입금표', '수질(입금증)'],
      files: findFiles(depositDirs, '대신', true),
      isCertGrid: false, isVertical: false,
      imgWidthMm: 80.3, imgHeightMm: 28.0   // 8.03cm × 2.8cm
    },
    {
      bookmarks: ['성적서', '수질성적서', '수질검사성적서', '수질검사_시험성적서', '수질검사시험성적서', '시험성적서', 'water_quality_certificate'],
      keywords: ['수질검사 시험성적서', '시험성적서', '수질성적서'],
      files: photoFiles.testPhotos?.length ? photoFiles.testPhotos : findPhotoFiles(expPhotoDirs, '', photoDocExcludes),
      isCertGrid: true, isVertical: false,
      imgWidthMm: 27.7, imgHeightMm: 40.2   // 2.77cm × 4.02cm, 3장씩 2줄
    },

    // 2. 키트 명세서, 계산서, 입금표, 사진
    {
      bookmarks: ['키트명세서', '키트_거래명세서', '키트거래명세서', '수질분석키트_거래명세서', 'kit_statement'],
      keywords: ['수질분석 키트 구입(거래명세서)', '키트(거래명세서)'],
      files: statementFiles.kit ? [statementFiles.kit] : findFiles(stmtDirs, '케이엠', true),
      isCertGrid: false, isVertical: false,
      imgWidthMm: 80.3, imgHeightMm: 51.6
    },
    {
      bookmarks: ['키트계산서', '키트_세금계산서', '키트세금계산서', '수질분석키트_세금계산서', 'kit_invoice'],
      keywords: ['수질분석 키트 구입(세금계산서)', '키트계산서', '키트(세금계산서)'],
      files: findFiles(invoiceDirs, '케이엠', true),
      isCertGrid: false, isVertical: false,
      imgWidthMm: 80.3, imgHeightMm: 51.6
    },
    {
      bookmarks: ['키트입금표', '키트_입금증', '키트_입금표', '키트입금증', 'kit_deposit'],
      keywords: ['수질분석 키트 구입(입금증)', '키트(입금증)'],
      files: findFiles(depositDirs, '케이엠', true),
      isCertGrid: false, isVertical: false,
      imgWidthMm: 80.3, imgHeightMm: 28.0
    },
    {
      bookmarks: ['키트사진', '키트_구입사진', '키트구입사진', 'kit_photo'],
      keywords: ['수질분석 키트 구입 사진', '키트 구입 사진', '키트사진'],
      files: mergeUnique(
        photoFiles.kitInPhotos?.length ? photoFiles.kitInPhotos : findPhotoFiles(kitPhotoDirs, '', photoDocExcludes),
        photoFiles.kitInPhotos?.length ? [] : findPhotoFiles(chemPhotoDirs, '키트', photoDocExcludes)
      ),
      required: false,
      isCertGrid: false, isVertical: true,
      imgWidthMm: 80.3, imgHeightMm: 51.6
    },

    // 3. 약품 명세서, 계산서, 입금표, 사진
    {
      bookmarks: ['약품명세서', '약품_거래명세서', '약품거래명세서', '약품비_거래명세서', 'chemical_statement'],
      keywords: ['약품비(거래명세서)', '약품명세서', '약품(거래명세서)'],
      files: statementFiles.chemical ? [statementFiles.chemical] : findFiles(stmtDirs, '에이치', true),
      isCertGrid: false, isVertical: false,
      imgWidthMm: 80.3, imgHeightMm: 51.6
    },
    {
      bookmarks: ['약품계산서', '약품_세금계산서', '약품세금계산서', '약품비_세금계산서', 'chemical_invoice'],
      keywords: ['약품비(세금계산서)', '약품(세금계산서)'],
      files: findFiles(invoiceDirs, '에이치', true),
      isCertGrid: false, isVertical: false,
      imgWidthMm: 80.3, imgHeightMm: 51.6
    },
    {
      bookmarks: ['약품입금표', '약품_입금증', '약품_입금표', '약품입금증', 'chemical_deposit'],
      keywords: ['약품비(입금증)', '약품입금표', '약품(입금증)'],
      files: findFiles(depositDirs, '에이치', true),
      isCertGrid: false, isVertical: false,
      imgWidthMm: 80.3, imgHeightMm: 28.0
    },
    {
      bookmarks: ['약품사진', '약품_구입사진', '약품구입사진', 'chemical_photo'],
      keywords: ['약품 구입사진', '약품 구입 사진', '약품사진'],
      files: photoFiles.medicineInPhotos?.length ? photoFiles.medicineInPhotos.slice(0, 5) : findPhotoFiles(chemPhotoDirs, '', photoDocExcludes).slice(0, 5),
      isCertGrid: false, isVertical: true,
      imgWidthMm: 80.3, imgHeightMm: 51.6
    },

    // 4. 슬러지 청소필증, 계산서, 입금표, 반출사진
    {
      bookmarks: ['청소필증사진', '슬러지_청소필증', '슬러지청소필증', '청소필증', '슬러지_계량증명서', 'sludge_certificate'],
      keywords: ['슬러지 수거 계량증명서', '슬러지 계량증명서', '청소필증사진', '청소필증'],
      files: mergeUnique(
        photoFiles.cleaningCertificates?.length ? photoFiles.cleaningCertificates.slice(0, 2) : findPhotoFiles(cleanCertPhotoDirs, '', photoDocExcludes).slice(0, 2),
        photoFiles.cleaningCertificates?.length ? [] : findPhotoFiles(sludgePhotoDirs, '필증', photoDocExcludes).slice(0, 2)
      ),
      isCertGrid: false, isVertical: false,
      imgWidthMm: 80.3, imgHeightMm: 51.6
    },
    {
      bookmarks: ['슬러지계산서', '슬러지_계산서', '슬러지처리비_계산서', 'sludge_invoice'],
      keywords: ['슬러지처리비(계산서)', '슬러지계산서', '슬러지(계산서)'],
      files: mergeUnique(findFiles(invoiceDirs, '국민환경', true), findFiles(invoiceDirs, '슬러지', true)),
      isCertGrid: false, isVertical: false,
      imgWidthMm: 80.3, imgHeightMm: 51.6
    },
    {
      bookmarks: ['슬러지입금표', '슬러지_입금증', '슬러지_입금표', '슬러지입금증', 'sludge_deposit'],
      keywords: ['슬러지처리비(입금증)', '슬러지(입금증)'],
      files: mergeUnique(findFiles(depositDirs, '국민환경', true), findFiles(depositDirs, '슬러지', true)),
      isCertGrid: false, isVertical: false,
      imgWidthMm: 80.3, imgHeightMm: 28.0
    },
    {
      bookmarks: ['슬러지반출사진', '슬러지_반출사진', '슬러지사진', 'sludge_photo'],
      keywords: ['슬러지 반출 사진', '슬러지 처리 사진', '슬러지사진'],
      files: photoFiles.sludgePhotos?.length ? photoFiles.sludgePhotos.slice(0, 2) : findPhotoFiles(sludgePhotoDirs, '', photoDocExcludes).slice(0, 2),
      isCertGrid: false, isVertical: false,
      imgWidthMm: 80.3, imgHeightMm: 51.6
    }
  ];
  const evidenceWorkingDir = materializeBindingTaskFiles(bindingTasks);

  // ★ 디버그: bindingTasks 파일 수 로깅
  console.log('[hwpSettlementService] bindingTasks 파일 수 확인:');
  bindingTasks.forEach((t, i) => {
    console.log(`  [${i}] keywords: ${t.keywords[0]}, files: ${t.files.length}`);
    t.files.forEach(f => console.log(`      -> ${path.basename(f)}`));
  });

  // 슬러지 반출 이벤트 데이터 (청주 8월: 8월 11일, 8월 18일 등)
  const sludgeEvents = [
    { dayStr: `${month}월 11일`, vendor: '국민환경', time: '08:30', weight: '20' },
    { dayStr: `${month}월 18일`, vendor: '국민환경', time: '08:30', weight: '20' },
  ];

  // 5. PowerShell 자동화 스크립트 작성
  const findUsage = (items, names) => {
    const normalizedNames = names.map((name) => String(name).replace(/\s/g, '').toLowerCase());
    const entry = Object.entries(items || {}).find(([name]) => {
      const normalizedName = String(name).replace(/\s/g, '').toLowerCase();
      return normalizedNames.some((candidate) => normalizedName.includes(candidate) || candidate.includes(normalizedName));
    })?.[1];
    return Number(entry?.yearUsage) || 0;
  };
  const glucoseAnnual = findUsage(usageSummary.medicines, ['포도당']).toLocaleString();
  const sodaAnnual = findUsage(usageSummary.medicines, ['중탄산나트륨', '중탄산']).toLocaleString();
  const aluAnnual = findUsage(usageSummary.medicines, ['팩(PAC)', 'PAC', '응집제']).toLocaleString();
  const nh3Annual = findUsage(usageSummary.kits, ['암모니아성질소', 'NH3']).toLocaleString();
  const po4Annual = findUsage(usageSummary.kits, ['인산염인', 'PO4']).toLocaleString();
  const usageSummaryJson = JSON.stringify(usageSummary);

  const logPath = path.join(os.tmpdir(), `osoo_hwp_log_${Date.now()}.txt`);

  const psScript = `
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$ErrorActionPreference = 'Continue'

$workingDoc = ${toPowerShellLiteral(tempWorkingPath)}
$logFile = ${toPowerShellLiteral(logPath)}
$targetYm = ${toPowerShellLiteral(targetYm)}
$tasksJson = ${toPowerShellLiteral(JSON.stringify(bindingTasks))}
$sludgeJson = ${toPowerShellLiteral(JSON.stringify(sludgeEvents))}
$usageSummaryJson = ${toPowerShellLiteral(usageSummaryJson)}
$diagnosticSnapshot = ${toPowerShellLiteral(diagnosticSnapshot)}

function LogMsg($m) {
  Add-Content -LiteralPath $logFile -Value "[$(Get-Date -Format 'HH:mm:ss')] $m" -Encoding utf8
  Write-Host $m
}

function MoveToBookmarkSafe($name) {
  if (-not $name) { return $false }
  try {
    $pset = $hwp.HParameterSet.HBookMark
    $hwp.HAction.GetDefault('Bookmark', $pset.HSet) | Out-Null
    $pset.Name = [string]$name
    $pset.Command = 1
    return $hwp.HAction.Execute('Bookmark', $pset.HSet)
  } catch {
    return $false
  }
}

function PasteImageToHwp($fPath, $wMm, $hMm) {
  try {
    if (-not (Test-Path -LiteralPath $fPath)) { return $false }
    # 한글 COM의 표준 InsertPicture 인자: 경로, 포함, 크기 옵션, 폭, 높이, 글자처럼 취급, 줄간격 영향, 비율 유지.
    $widthHwpUnit = [int]([math]::Round($wMm * 7200 / 25.4))
    $heightHwpUnit = [int]([math]::Round($hMm * 7200 / 25.4))
    try {
      $result = $hwp.InsertPicture([string]$fPath, 1, 3, $widthHwpUnit, $heightHwpUnit, 1, 0, 0)
      LogMsg "     InsertPicture signature: 8 arguments ($($wMm)x$($hMm)mm) -> $result"
      return [bool]$result
    } catch {
      LogMsg "     InsertPicture 8-argument call failed: $($_.Exception.Message)"
    }

    try {
      $result = $hwp.InsertPicture([string]$fPath, 1, 3, $widthHwpUnit, $heightHwpUnit, 1, 0)
      LogMsg "     InsertPicture signature: 7 arguments ($($wMm)x$($hMm)mm) -> $result"
      return [bool]$result
    } catch {
      LogMsg "     InsertPicture 7-argument call failed: $($_.Exception.Message)"
    }

    try {
      $result = $hwp.InsertPicture([string]$fPath, 1, 3, 0, 0)
      LogMsg "     InsertPicture signature: 5 arguments -> $result"
      return [bool]$result
    } catch {
      LogMsg "     InsertPicture 5-argument call failed: $($_.Exception.Message)"
    }

    try {
      $result = $hwp.InsertPicture([string]$fPath, 1, 3)
      LogMsg "     InsertPicture signature: 3 arguments -> $result"
      return [bool]$result
    } catch {
      LogMsg "     InsertPicture 3-argument call failed: $($_.Exception.Message)"
      return $false
    }
  } catch {
    LogMsg "     ERROR in InsertPicture: $($_.Exception.Message)"
    return $false
  }
}

LogMsg "RUN START: target=$targetYm"
LogMsg "INPUT SNAPSHOT: $diagnosticSnapshot"
LogMsg "1. Opening template working copy: $workingDoc"
$hwp = New-Object -ComObject HWPFrame.HwpObject
try {
  try { $hwp.RegisterModule('FilePathCheckDLL', 'FilePathChecker') | Out-Null } catch {}
  $hwp.SetMessageBoxMode(65535)
  $openRes = $hwp.Open($workingDoc, 'HWP', 'lock:false')
  LogMsg "Open result: $openRes"
  if (-not $openRes) { throw 'HWP working copy open failed' }
  LogMsg "Monthly usage source (BigQuery): $usageSummaryJson"

  # 1. 텍스트 일괄 찾아바꾸기 (표/셀 내부까지 전수 순회)
  LogMsg "2. Replacing text throughout entire document (including tables)..."

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

  $replacePairs = @(
    @{ F = '25년 7월분'; R = '${shortYear}년 ${month}월분' },
    @{ F = '25년 07월분'; R = '${shortYear}년 ${String(month).padStart(2, '0')}월분' },
    @{ F = '25년 7월';   R = '${shortYear}년 ${month}월' },
    @{ F = '25년 07월';  R = '${shortYear}년 ${String(month).padStart(2, '0')}월' },
    @{ F = '2025년 7월'; R = '${year}년 ${month}월' },
    @{ F = '2026년 7월'; R = '${year}년 ${month}월' },
    @{ F = '2025년 07월'; R = '${year}년 ${String(month).padStart(2, '0')}월' },
    @{ F = '2026년 07월'; R = '${year}년 ${String(month).padStart(2, '0')}월' },
    @{ F = '7월 슬러지반출 관리대장'; R = '${month}월 슬러지반출 관리대장' },
    @{ F = '7월 슬러지반출관리대장'; R = '${month}월 슬러지반출관리대장' },
    @{ F = '2026년 7월 슬러지반출 관리대장'; R = '${year}년 ${month}월 슬러지반출 관리대장' },
    @{ F = '2025년 7월 슬러지반출 관리대장'; R = '${year}년 ${month}월 슬러지반출 관리대장' },
    @{ F = '7월 슬러지';  R = '${month}월 슬러지' },
    @{ F = '(7월)';      R = '(${month}월)' },
    @{ F = '7월분';      R = '${month}월분' },
    @{ F = '25년 7월 증빙'; R = '${shortYear}년 ${month}월 증빙' },
    @{ F = '26년 7월 증빙'; R = '${shortYear}년 ${month}월 증빙' },
    @{ F = '25년7월';    R = '${shortYear}년${month}월' },
    @{ F = '6,600';     R = '${glucoseAnnual}' },
    @{ F = '5,200';     R = '${sodaAnnual}' },
    @{ F = '4,200';     R = '${aluAnnual}' },
    @{ F = '1,061';     R = '${nh3Annual}' },
    @{ F = '558';       R = '${po4Annual}' }
  )

  for ($d = 1; $d -le 31; $d++) {
    $replacePairs += @{ F = "7월 $d일"; R = "${month}월 $d일" }
    $replacePairs += @{ F = "7/$d"; R = "${month}/$d" }
  }

  foreach ($rp in $replacePairs) {
    ReplaceTextEverywhere $rp.F $rp.R
  }
  LogMsg "Text replace finished."

  # 2. 슬러지 반출일자 대장 표 채우기
  LogMsg "3. Filling sludge ledger table..."
  $sludgeList = ConvertFrom-Json $sludgeJson
  foreach ($ev in $sludgeList) {
    $targetDays = @($ev.dayStr, "$($ev.dayStr) ", "$([int]$ev.dayStr.Split('월')[1].Replace('일','').Trim())일")
    $injected = $false
    foreach ($td in $targetDays) {
      if ($injected) { break }
      $hwp.Run('MoveDocBegin') | Out-Null
      $param = $hwp.HParameterSet.HFindReplace
      $hwp.HAction.GetDefault('FindReplace', $param.HSet) | Out-Null
      $param.FindString = $td
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
        LogMsg "Injected sludge row for $td (vendor: $($ev.vendor), weight: $($ev.weight))"
        $injected = $true
      }
    }
  }

  # 3. 클립보드 기반 이미지 삽입 (안정성 및 크기 보장)
  LogMsg "4. Inserting images via Clipboard Paste..."
  $tasks = ConvertFrom-Json $tasksJson
  LogMsg "   Total binding tasks: $($tasks.Count)"
  $taskIdx = 0
  $bindingFailures = @()
  foreach ($task in $tasks) {
    $taskIdx++
    $files = @($task.files)
    $keywords = @($task.keywords)
    $bookmarks = @($task.bookmarks)
    $wMm = if ($task.imgWidthMm) { $task.imgWidthMm } else { 80.3 }
    $hMm = if ($task.imgHeightMm) { $task.imgHeightMm } else { 51.6 }
    $sizeStr = "$($wMm)x$($hMm)mm"
    LogMsg "   Task $taskIdx - bookmarks: $($bookmarks -join ', ') - keywords: $($keywords[0]) - files: $($files.Count) - size: $sizeStr"
    if ($files.Count -eq 0) {
      LogMsg "   -> SKIP (no files)"
      continue
    }
    foreach ($ff in $files) {
      LogMsg "     file: $ff (exists: $(Test-Path -LiteralPath ([string]$ff)))"
    }
    
    $inserted = $false

    foreach ($bm in $bookmarks) {
      if ($inserted) { break }
      $bmStr = [string]$bm
      if (-not $bmStr) { continue }

      $moved = $false
      try {
        $hwp.Run('MoveDocBegin') | Out-Null
        $moved = MoveToBookmarkSafe $bmStr
      } catch {
        $moved = $false
      }

      LogMsg "   -> Moving to bookmark '$bmStr' -> found: $moved"
      if ($moved) {
        LogMsg "   -> Found bookmark '$bmStr', pasting $($files.Count) image(s) at $sizeStr..."
        try { $hwp.Run('Delete') | Out-Null } catch {}

        $idx = 0
        foreach ($f in $files) {
          $fStr = [string]$f
          if (Test-Path -LiteralPath $fStr) {
            $ok = PasteImageToHwp $fStr $wMm $hMm
            if ($ok) {
              $idx++
              LogMsg "     Pasted image $idx : $(Split-Path $fStr -Leaf) ($sizeStr)"

              if ($task.isCertGrid -and ($idx % 3) -eq 0) {
                $hwp.Run('BreakPara') | Out-Null
              } elseif ($task.isVertical) {
                $hwp.Run('BreakPara') | Out-Null
              }
            }
          } else {
            LogMsg "     FILE NOT FOUND: $fStr"
          }
        }
        $inserted = $idx -gt 0
      }
    }

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

      LogMsg "   -> Searching keyword '$kwStr' -> found: $found"
      if ($found) {
        LogMsg "   -> Found keyword '$kwStr', pasting $($files.Count) image(s) at $sizeStr..."
        $hwp.Run('Delete') | Out-Null

        $idx = 0
        foreach ($f in $files) {
          $fStr = [string]$f
          if (Test-Path -LiteralPath $fStr) {
            $ok = PasteImageToHwp $fStr $wMm $hMm
            if ($ok) {
              $idx++
              LogMsg "     Pasted image $idx : $(Split-Path $fStr -Leaf) ($sizeStr)"

              if ($task.isCertGrid -and ($idx % 3) -eq 0) {
                $hwp.Run('BreakPara') | Out-Null
              } elseif ($task.isVertical) {
                $hwp.Run('BreakPara') | Out-Null
              }
            }
          } else {
            LogMsg "     FILE NOT FOUND: $fStr"
          }
        }
        $inserted = $idx -gt 0
      }
    }
    if (-not $inserted) {
      LogMsg "   -> WARN: No bookmark/keyword matched for task $taskIdx ($($keywords[0]))"
      if ($task.required -ne $false) {
        $bindingFailures += "Task \${taskIdx}: $($keywords[0])"
      } else {
        LogMsg "   -> OPTIONAL: Task $taskIdx was skipped because this template has no insertion location."
      }
    }
  }

  if ($bindingFailures.Count -gt 0) {
    LogMsg "ERROR: Required evidence bindings failed: $($bindingFailures -join '; ')"
    throw "증빙 이미지 바인딩 실패: $($bindingFailures -join '; ')"
  }

  # 4. 저장
  LogMsg "5. Saving HWP working document..."
  $saveResult = $hwp.SaveAs($workingDoc, 'HWP', 'lock:false')
  if (-not $saveResult) { throw 'HWP working copy save failed' }
  LogMsg "6. HWP saved successfully! result=$saveResult"
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
        let persistentLogPath = null;
        let automationLog = '';
        if (fs.existsSync(logPath)) {
          automationLog = fs.readFileSync(logPath, 'utf8');
        }
        if (!automationLog) automationLog = '(PowerShell 자동화 로그가 생성되지 않았습니다.)\n';
        if (stdout) automationLog += `\n[PowerShell stdout]\n${stdout}\n`;
        if (stderr) automationLog += `\n[PowerShell stderr]\n${stderr}\n`;
        if (error) automationLog += `\n[Node execFile error]\n${error.message}\n`;
        persistentLogPath = persistHwpAutomationLog(automationLog, targetYm);
        console.log('[hwpSettlementService Log]:\n' + automationLog);
        console.log(`[hwpSettlementService] 자동화 로그 저장: ${persistentLogPath}`);

        try { if (fs.existsSync(tempScriptPath)) fs.unlinkSync(tempScriptPath); } catch (_) {}
        try { if (fs.existsSync(logPath)) fs.unlinkSync(logPath); } catch (_) {}
        try { if (fs.existsSync(evidenceWorkingDir)) fs.rmSync(evidenceWorkingDir, { recursive: true, force: true }); } catch (_) {}

        if (error) {
          console.error('[hwpSettlementService] PowerShell 실행 실패:', error, stderr);
          try { if (fs.existsSync(tempWorkingPath)) fs.unlinkSync(tempWorkingPath); } catch (_) {}
          const logHint = persistentLogPath ? ` 로그: ${persistentLogPath}` : '';
          return reject(new Error(`한글 정산서 자동 생성 실패: ${error.message}${logHint}`));
        }

        if (!automationLog.includes('6. HWP saved successfully!')) {
          try { if (fs.existsSync(tempWorkingPath)) fs.unlinkSync(tempWorkingPath); } catch (_) {}
          return reject(new Error(`한글 정산서 자동 생성이 완료되지 않았습니다. 로그: ${persistentLogPath}`));
        }

        try {
          fs.copyFileSync(tempWorkingPath, finalReportPath);

          if (outputPath) {
            fs.copyFileSync(tempWorkingPath, outputPath);
          }

          try { if (fs.existsSync(tempWorkingPath)) fs.unlinkSync(tempWorkingPath); } catch (_) {}

          console.log(`[hwpSettlementService] 청주 정산서 한글 파일 생성 완료: ${finalReportPath}`);
          return resolve({
            success: true,
            filePath: finalReportPath,
            fileName: path.basename(finalReportPath),
            targetYm,
            logPath: persistentLogPath,
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
