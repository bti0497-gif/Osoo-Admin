const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFile } = require('child_process');
const sharp = require('sharp');

/**
 * 5가지 약품 입고 사진을 가로 규격(80.3mm)에 맞추고 세로를 5등분하여
 * 셀 높이가 늘어나지 않도록 단 1장의 합성 이미지(80.3mm x 51.6mm 규격)로 병합합니다.
/**
 * 약품 입고 사진 병합 유틸리티
 * - 가로 너비는 고정
 * - 세로 높이는 전체 높이를 약품 수(청주 5개, 타현장 3개)로 균등 분할
 * - 원본을 잘라내지(crop) 않고, 세로 크기를 줄여 맞춰서(fit: 'fill') 위에서 아래로 순서대로 이어붙임
 */
async function mergeChemicalPhotos(photoPaths, outputPath, options = {}) {
  const targetWidth = options.width || 948;    // 300DPI 기준 80.3mm (가로 고정)
  const targetHeight = options.height || 610;  // 300DPI 기준 51.6mm (전체 세로 고정)
  const expectedCount = options.expectedCount || (options.siteId === 'cheongju_seoul' ? 5 : 3);

  let validPaths = (Array.isArray(photoPaths) ? photoPaths : [photoPaths]).filter(p => p && fs.existsSync(p));
  if (validPaths.length === 0) {
    return null;
  }

  // 약품 사진 파일명 순서대로 정렬 (포도당, 중탄산나트륨, PAC 등 순서 보장)
  validPaths.sort((a, b) => path.basename(a).localeCompare(path.basename(b), 'ko-KR', { numeric: true }));

  // 최대 개수 제한 (청주 5개, 타현장 3개 등)
  const n = Math.min(validPaths.length, expectedCount || 5);
  validPaths = validPaths.slice(0, n);

  console.log(`[mergeChemicalPhotos] 약품 입고 사진 ${n}장 세로 압축/이어붙이기 시작 (목표 규격: ${targetWidth}x${targetHeight}px, 등분: ${n}개)...`);

  if (n === 1) {
    await sharp(validPaths[0])
      .resize(targetWidth, targetHeight, { fit: 'fill' })
      .jpeg({ quality: 92 })
      .toFile(outputPath);
    return outputPath;
  }

  const sliceHeight = Math.floor(targetHeight / n);
  const composites = [];

  for (let i = 0; i < n; i++) {
    const isLast = (i === n - 1);
    const thisHeight = isLast ? (targetHeight - (sliceHeight * (n - 1))) : sliceHeight;
    const topPos = sliceHeight * i;

    // ★ 핵심: fit: 'fill'로 세로 크기를 줄여 맞춰서(스케일 압축) 원본 라벨과 약품 전체가 잘리지 않고 온전히 다 보이게 함
    const resizedBuffer = await sharp(validPaths[i])
      .resize(targetWidth, thisHeight, {
        fit: 'fill',
      })
      .toBuffer();

    composites.push({
      input: resizedBuffer,
      top: topPos,
      left: 0,
    });
  }

  await sharp({
    create: {
      width: targetWidth,
      height: targetHeight,
      channels: 3,
      background: { r: 255, g: 255, b: 255 },
    },
  })
    .composite(composites)
    .jpeg({ quality: 92 })
    .toFile(outputPath);

  console.log(`[mergeChemicalPhotos] 약품 사진 ${n}장 병합 완료 (잘림 없는 전체 압축 이어붙이기): ${outputPath}`);
  return outputPath;
}

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
 * 정산 시즌 판별 (매월 말일 ~ 익월 2일)
 * - 말일이 되어야 최종 검침값이 집계되어 정산서 생성이 가능함
 * - 도로공사 마감 제출을 위해 말일 ~ 익월 2일 사이에 집중 처리
 */
function isSettlementSeason(date = new Date()) {
  const d = date.getDate();
  const lastDayOfMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  return d === lastDayOfMonth || d <= 2;
}

let lastPrewarmTime = 0;
let isPrewarming = false;

/**
 * HWP COM 엔진 사전 웜업 (Pre-warm)
 * - 정산 시즌(말일~익월2일) 또는 정산 화면 진입 시 한글 COM을 메모리에 올려 Cold Start 딜레이 제거
 */
async function prewarmHwpEngine(force = false) {
  const now = Date.now();
  if (!force && now - lastPrewarmTime < 30 * 60 * 1000) {
    return { status: 'already_warm', lastWarm: new Date(lastPrewarmTime).toISOString() };
  }
  if (isPrewarming) {
    return { status: 'in_progress' };
  }

  isPrewarming = true;
  console.log('[hwpSettlementService] HWP COM 엔진 백그라운드 사전 웜업(Pre-warm) 시작...');

  const psScript = `
    $ErrorActionPreference = 'SilentlyContinue'
    try {
      $hwp = New-Object -ComObject HWPFrame.HwpObject
      try { $hwp.RegisterModule('FilePathCheckDLL', 'FilePathChecker') | Out-Null } catch {}
      $hwp.SetMessageBoxMode(65535)
      $hwp.Clear(1)
      $hwp.Quit()
      [void][System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($hwp)
      [GC]::Collect()
      Write-Host "HWP_WARM_OK"
    } catch {
      Write-Host "HWP_WARM_ERR: $($_.Exception.Message)"
    }
  `;

  return new Promise((resolve) => {
    const tempPs1 = path.join(os.tmpdir(), `osoo_hwp_prewarm_${now}.ps1`);
    fs.writeFileSync(tempPs1, '\uFEFF' + psScript, 'utf8');

    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-STA', '-File', tempPs1], { timeout: 15000 }, (err, stdout) => {
      try { if (fs.existsSync(tempPs1)) fs.unlinkSync(tempPs1); } catch (_) {}
      isPrewarming = false;
      lastPrewarmTime = Date.now();
      const output = (stdout || '').trim();
      console.log(`[hwpSettlementService] HWP COM 엔진 사전 웜업 완료 (${output})`);
      resolve({ status: 'warm_ok', output, time: new Date().toISOString() });
    });
  });
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
  const appDataRoot = process.env.APP_DATA_PATH
    || path.join(process.env.APPDATA || os.homedir(), 'Osoo_Admin_App');

  // 1. 원본 템플릿 탐색 (양식관리 AppData 최신 양식 우선)
  const templateCandidates = [
    configuredTemplatePath,
    path.join(appDataRoot, 'templates', 'settlement', 'template_cheongju_seoul.hwp'),
    path.join(__dirname, '..', 'templates', 'settlement', 'template_cheongju_seoul.hwp'),
    path.join(__dirname, '..', 'templates', 'settlement', 'template_cheongju_report.hwp'),
    ...desktopDirs.map(d => path.join(d, '정산양식', 'template_cheongju_seoul.hwp')),
    ...desktopDirs.map(d => path.join(d, '정산양식', 'template_cheongju_report.hwp')),
    path.join(__dirname, '..', '..', 'templates', 'template_cheongju_report.hwp'),
    path.join(process.cwd(), 'templates', 'template_cheongju_report.hwp'),
  ];

  let templatePath = null;
  for (const cand of templateCandidates) {
    if (cand && fs.existsSync(cand)) {
      templatePath = cand;
      break;
    }
  }

  if (!templatePath) {
    throw new Error('청주휴게소 정산 한글 템플릿을 찾을 수 없습니다.');
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
    sludgeBindingSource: 'BigQuery flowRows 기반 슬러지 반출일 바인딩',
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
      const key = path.basename(file).toLowerCase();
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
  const certPhotoDirs = [
    ...desktopDirs.map(d => path.join(d, '점검준비', '성적서', targetYm)),
    ...desktopDirs.map(d => path.join(d, '성적서', targetYm)),
  ];
  const sludgePhotoDirs = subDirs('2_슬러지사진');
  const cleanCertPhotoDirs = subDirs('3_청소필증');
  const chemPhotoDirs = subDirs('4_약품입고');
  const photoDocExcludes = ['명세서_', '계산서_', '입금표_', '매출계산서_'];

  // ★ 사용자 지침: 성적서는 실험사진이 아닌 '점검준비\성적서\YYYYMM' 폴더 내 청주 파일들(mlss 4장 + 성적서 2장 등)에서 직접 가져옴
  const certFiles = findFiles(certPhotoDirs, '청주', false)
    .sort((a, b) => path.basename(a).localeCompare(path.basename(b), 'ko-KR', { numeric: true }));

  // ★ 5가지 약품 입고 사진 세로 5등분 단일 이미지로 사전 병합 (가로 66mm × 세로 94mm 확정 규격)
  const rawChemPhotos = photoFiles.medicineInPhotos?.length
    ? photoFiles.medicineInPhotos.slice(0, 5)
    : findPhotoFiles(chemPhotoDirs, '', photoDocExcludes).slice(0, 5);

  let mergedChemicalPhotoPath = null;
  if (rawChemPhotos.length > 0) {
    const mergedOut = path.join(os.tmpdir(), `cheongju_chem_merged_${Date.now()}.jpg`);
    try {
      mergedChemicalPhotoPath = await mergeChemicalPhotos(rawChemPhotos, mergedOut, {
        width: 780,
        height: 1110,
        expectedCount: 5,
        siteId: 'cheongju_seoul'
      });
    } catch (mergeErr) {
      console.warn('[hwpSettlementService] 약품 사진 병합 실패, 첫번째 사진 사용:', mergeErr.message);
      mergedChemicalPhotoPath = rawChemPhotos[0];
    }
  }

  // 슬러지 청소필증 및 반출 사진 필터링 준비
  const cleanCertFiles = mergeUnique(
    photoFiles.cleaningCertificates?.length ? photoFiles.cleaningCertificates.slice(0, 2) : findPhotoFiles(cleanCertPhotoDirs, '', photoDocExcludes).slice(0, 2),
    photoFiles.cleaningCertificates?.length ? [] : findPhotoFiles(sludgePhotoDirs, '필증', photoDocExcludes).slice(0, 2)
  );

  const cleanCertSizes = new Set(cleanCertFiles.map((f) => {
    try { return fs.statSync(f).size; } catch (_) { return null; }
  }).filter(Boolean));

  const rawSludgeCandidates = photoFiles.sludgePhotos?.length
    ? photoFiles.sludgePhotos
    : findPhotoFiles(sludgePhotoDirs, '', photoDocExcludes);

  // ★ 청소필증(영수증) 파일과 크기(bytes)가 완벽히 동일하거나 파일명에 '필증'/'영수증'이 포함된 오분류 파일은 슬러지 반출 사진에서 완벽 제외
  const filteredSludgePhotos = rawSludgeCandidates.filter((f) => {
    const base = path.basename(f).toLowerCase();
    if (base.includes('필증') || base.includes('영수증')) return false;
    try {
      const sz = fs.statSync(f).size;
      if (cleanCertSizes.has(sz)) return false;
    } catch (_) {}
    return true;
  });

  // 키워드 및 책갈피별 바인딩 대상 파일 목록 구성
  // ★ 관리비는 입금증은 제외하고 매출계산서(용역비)만 삽입
  // ★ 키트 사진은 원본 템플릿의 기존 사진을 유지하므로 바인딩 목록에서 제외
  const { selectSingleEvidence } = require('./cheongjuEvidenceSelection.cjs');
  const selectStatement = (explicit, vendor, label) => selectSingleEvidence(
    explicit ? [explicit] : findFiles(stmtDirs, vendor, true), `명세서_${targetYm}_`, label);
  const bindingTasks = [

    // 0. 관리비(용역비) 매출 세금계산서
    {
      fields: ['관리비계산서'],
      bookmarks: ['관리비계산서', '위탁관리비계산서', '위탁관리비(세금계산서)'],
      keywords: ['위탁관리비(세금계산서)', '위탁관리비', '관리비계산서'],
      files: selectSingleEvidence(findFiles(invoiceDirs, '용역비', true).filter(file => path.basename(file).startsWith('매출계산서_')), `매출계산서_${targetYm}_`, '관리비계산서'),
      isCertGrid: false, isVertical: false,
      imgWidthMm: 80.3, imgHeightMm: 51.6
    },

    // 1. 수질검사 명세서, 계산서, 입금표, 성적서
    {
      fields: ['수질검사명세서'],
      bookmarks: ['수질검사명세서', '수질명세서', '수질검사_거래명세서', 'water_quality_statement'],
      keywords: ['수질검사(거래명세서)', '수질검사명세서', '수질(거래명세서)'],
      files: selectStatement(statementFiles.waterQuality, '대신', '수질검사명세서'),
      isCertGrid: false, isVertical: false,
      imgWidthMm: 80.3, imgHeightMm: 51.6   // 8.03cm × 5.16cm
    },
    {
      fields: ['수질검사계산서'],
      bookmarks: ['수질검사계산서', '수질계산서', '수질검사_세금계산서', 'water_quality_invoice'],
      keywords: ['수질검사(세금계산서)', '수질(세금계산서)'],
      files: findFiles(invoiceDirs, '대신', true),
      isCertGrid: false, isVertical: false,
      imgWidthMm: 80.3, imgHeightMm: 51.6
    },
    {
      fields: ['수질검사입금표'],
      bookmarks: ['수질검사입금표', '수질입금표', '수질검사_입금증', 'water_quality_deposit'],
      keywords: ['수질검사(입금증)', '수질검사입금표', '수질(입금증)'],
      files: findFiles(depositDirs, '대신', true),
      isCertGrid: false, isVertical: false,
      imgWidthMm: 80.3, imgHeightMm: 28.0   // 8.03cm × 2.8cm
    },
    {
      fields: ['성적서', '수질검사성적서', '수질성적서'],
      bookmarks: ['성적서', '수질성적서', '수질검사성적서', '수질검사_시험성적서', '수질검사시험성적서', '시험성적서', 'water_quality_certificate'],
      keywords: ['수질검사 시험성적서', '시험성적서', '수질성적서', '수질검사'],
      files: certFiles,
      required: false,
      isCertGrid: true, isVertical: false,
      imgWidthMm: 27.63, imgHeightMm: 42.12   // 가로 27.63mm × 세로 42.12mm (한글 툴바 실측 규격, 3장씩 2줄)
    },

    // 2. 키트 명세서, 계산서, 입금표 (키트 사진은 원본 유지로 제외)
    {
      fields: ['키트명세서'],
      bookmarks: ['키트명세서', '키트_거래명세서', '키트거래명세서', 'kit_statement'],
      keywords: ['수질분석 키트 구입(거래명세서)', '키트(거래명세서)'],
      files: selectStatement(statementFiles.kit, '케이엠', '키트명세서'),
      isCertGrid: false, isVertical: false,
      imgWidthMm: 80.3, imgHeightMm: 51.6
    },
    {
      fields: ['키트계산서'],
      bookmarks: ['키트계산서', '키트_세금계산서', 'kit_invoice'],
      keywords: ['수질분석 키트 구입(세금계산서)', '키트계산서', '키트(세금계산서)'],
      files: findFiles(invoiceDirs, '케이엠', true),
      isCertGrid: false, isVertical: false,
      imgWidthMm: 80.3, imgHeightMm: 51.6
    },
    {
      fields: ['키트입금표'],
      bookmarks: ['키트입금표', '키트_입금증', 'kit_deposit'],
      keywords: ['수질분석 키트 구입(입금증)', '키트(입금증)'],
      files: findFiles(depositDirs, '케이엠', true),
      isCertGrid: false, isVertical: false,
      imgWidthMm: 80.3, imgHeightMm: 28.0
    },

    // 3. 약품 명세서, 계산서, 입금표, 사진 (사진은 5장 병합본 1개만 전달)
    {
      fields: ['약품명세서'],
      bookmarks: ['약품명세서', '약품_거래명세서', '약품거래명세서', '약품비_거래명세서', 'chemical_statement'],
      keywords: ['약품비(거래명세서)', '약품명세서', '약품(거래명세서)'],
      files: selectStatement(statementFiles.chemical, '에이치', '약품명세서'),
      isCertGrid: false, isVertical: false,
      imgWidthMm: 80.3, imgHeightMm: 51.6
    },
    {
      fields: ['약품계산서'],
      bookmarks: ['약품계산서', '약품_세금계산서', '약품비_세금계산서', 'chemical_invoice'],
      keywords: ['약품비(세금계산서)', '약품(세금계산서)'],
      files: findFiles(invoiceDirs, '에이치', true),
      isCertGrid: false, isVertical: false,
      imgWidthMm: 80.3, imgHeightMm: 51.6
    },
    {
      fields: ['약품입금표'],
      bookmarks: ['약품입금표', '약품_입금증', 'chemical_deposit'],
      keywords: ['약품비(입금증)', '약품입금표', '약품(입금증)'],
      files: findFiles(depositDirs, '에이치', true),
      isCertGrid: false, isVertical: false,
      imgWidthMm: 80.3, imgHeightMm: 28.0
    },
    {
      fields: ['약품사진'],
      bookmarks: ['약품사진', '약품_구입사진', 'chemical_photo'],
      keywords: ['약품 구입사진', '약품 구입 사진', '약품사진'],
      files: mergedChemicalPhotoPath ? [mergedChemicalPhotoPath] : [],
      isCertGrid: false, isVertical: false,
      imgWidthMm: 66.0, imgHeightMm: 94.0   // 가로 66.0mm × 세로 94.0mm (사용자 확정 규격 완벽 일치)
    },

    // 4. 슬러지 청소필증, 계산서, 입금표, 반출사진
    {
      fields: ['청소필증사진'],
      bookmarks: ['청소필증사진', '청소필증', '슬러지_청소필증', 'sludge_certificate'],
      keywords: ['슬러지 수거 계량증명서', '슬러지 계량증명서', '청소필증사진', '청소필증'],
      files: cleanCertFiles,
      isCertGrid: false, isVertical: false,
      imgWidthMm: 32.0, imgHeightMm: 73.0   // 영수증 서식 지정 규격 (가로 32mm x 세로 73mm): 2장이 한 줄에 쏙 배치됨
    },
    {
      fields: ['슬러지계산서'],
      bookmarks: ['슬러지계산서', '슬러지_계산서', '슬러지처리비_계산서', 'sludge_invoice'],
      keywords: ['슬러지처리비(계산서)', '슬러지계산서', '슬러지(계산서)', '슬러지처리비'],
      files: findFiles(invoiceDirs, '국민환경', true).filter(file => path.basename(file).startsWith('계산서_')),
      required: true,
      isCertGrid: false, isVertical: false,
      imgWidthMm: 80.3, imgHeightMm: 51.6
    },
    {
      fields: ['슬러지입금표'],
      bookmarks: ['슬러지입금표', '슬러지_입금증', 'sludge_deposit'],
      keywords: ['슬러지처리비(입금증)', '슬러지(입금증)', '슬러지입금표'],
      files: mergeUnique(findFiles(depositDirs, '국민환경', true), findFiles(depositDirs, '슬러지', true)),
      required: true,
      isCertGrid: false, isVertical: false,
      imgWidthMm: 80.3, imgHeightMm: 28.0
    },
    {
      fields: ['슬러지반출사진'],
      bookmarks: ['슬러지반출사진', '슬러지_반출사진', '슬러지사진', 'sludge_photo'],
      keywords: ['슬러지 반출 사진', '슬러지 처리 사진', '슬러지사진'],
      files: filteredSludgePhotos.slice(0, 2),
      isCertGrid: false, isVertical: false,
      imgWidthMm: 60.0, imgHeightMm: 38.0   // 슬러지 반출 사진 지정 규격 (가로 60mm x 세로 38mm 사용자 확정)
    }
  ];
  const evidenceWorkingDir = materializeBindingTaskFiles(bindingTasks);

  // ★ 디버그: bindingTasks 파일 수 로깅
  console.log('[hwpSettlementService] bindingTasks 파일 수 확인:');
  bindingTasks.forEach((t, i) => {
    console.log(`  [${i}] keywords: ${t.keywords[0]}, files: ${t.files.length}`);
    t.files.forEach(f => console.log(`      -> ${path.basename(f)}`));
  });

  const { buildLedgerBindings, buildSludgeEvents } = require('./cheongjuBindingData.cjs');
  const ledgerBindings = buildLedgerBindings(usageSummary);
  const sludgeEvents = buildSludgeEvents(flowRows, year, month);
  const usageSummaryJson = JSON.stringify(usageSummary);
  const ledgerBindingScript = fs.readFileSync(path.join(__dirname, 'cheongjuLedgerBinding.ps1'), 'utf8');

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
$ledgerBindingsJson = ${toPowerShellLiteral(JSON.stringify(ledgerBindings))}
$usageSummaryJson = ${toPowerShellLiteral(usageSummaryJson)}
$diagnosticSnapshot = ${toPowerShellLiteral(diagnosticSnapshot)}

function LogMsg($m) {
  try { Add-Content -LiteralPath $logFile -Value "[$(Get-Date -Format 'HH:mm:ss')] $m" -Encoding utf8 } catch {}
  Write-Host "[HWP진단] $m"
}

function MoveToBookmarkSafe($name) {
  if (-not $name) { return $false }
  try {
    $pset = $hwp.HParameterSet.HBookMark
    $hwp.HAction.GetDefault('Bookmark', $pset.HSet) | Out-Null
    $pset.Name = [string]$name
    $pset.Command = 1
    $ok = $hwp.HAction.Execute('Bookmark', $pset.HSet)
    if ($ok) { return $true }
  } catch {}

  # 폴백: '약품명세서' 책갈피가 없으면 '약품계산서'로 이동 후 왼쪽 셀로 이동
  if ($name -like '*약품*명세서*') {
    try {
      $pset = $hwp.HParameterSet.HBookMark
      $hwp.HAction.GetDefault('Bookmark', $pset.HSet) | Out-Null
      $pset.Name = '약품계산서'
      $pset.Command = 1
      $ok = $hwp.HAction.Execute('Bookmark', $pset.HSet)
      if ($ok) {
        $hwp.Run('TableLeftCell') | Out-Null
        LogMsg "     Fallback: Moved to '약품계산서' and shifted to left cell (약품명세서)."
        return $true
      }
    } catch {}
  }
  return $false
}

function PasteImageToHwp($fPath, $wMm, $hMm) {
  try {
    if (-not (Test-Path -LiteralPath $fPath)) { return $false }
    # 한글 COM 공식 InsertPicture 시그니처:
    # InsertPicture(Path, Embedded, sizeoption, Reverse, watermark, effect, width, height)
    # sizeoption 1: 지정 크기로 삽입
    # 중요: 한글 COM에서 width, height 인자는 HWPUnit이 아니라 밀리미터(mm) 단위임!
    # (과거에 7200/25.4를 곱한 거대한 HWPUnit을 전달하여 22미터짜리 거대 그림으로 삽입되었던 문제 완벽 해결)
    $widthMm = [math]::Round([double]$wMm, 1)
    $heightMm = [math]::Round([double]$hMm, 1)

    # 1. sizeoption = 1로 이미지 삽입
    $ctrl = $hwp.InsertPicture([string]$fPath, $true, 1, $false, $false, 0, $widthMm, $heightMm)
    LogMsg "     InsertPicture (sizeoption 1): Path, true, 1, false, false, 0, $($widthMm)mm, $($heightMm)mm -> $($ctrl -ne $null)"

    if ($ctrl -ne $null) {
      try {
        if ($ctrl.Properties.Item('TreatAsChar') -ne 1) {
          $ctrl.Properties.SetItem('TreatAsChar', 1)
        }
        $actualW = [math]::Round(($ctrl.Properties.Item('Width')) * 25.4 / 7200, 1)
        $actualH = [math]::Round(($ctrl.Properties.Item('Height')) * 25.4 / 7200, 1)
        LogMsg "     Ctrl properties: TreatAsChar=$($ctrl.Properties.Item('TreatAsChar')), Width=$($actualW)mm, Height=$($actualH)mm"
      } catch {
        LogMsg "     Ctrl property check note: $($_.Exception.Message)"
      }
      return $true
    }

    # fallback (기본 정수형 인자)
    try {
      $ctrl = $hwp.InsertPicture([string]$fPath, 1, 1, 0, 0, 0, [int]$widthMm, [int]$heightMm)
      if ($ctrl -ne $null) {
        return $true
      }
    } catch {}

    return $false
  } catch {
    LogMsg "     ERROR in PasteImageToHwp: $($_.Exception.Message)"
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

  # 화면 갱신 억제로 고속 일괄 바인딩 (LockCommand)
  try { $hwp.Run('LockCommand') | Out-Null; LogMsg '  LockCommand applied for fast batch processing.' } catch {}

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

  # 텍스트 삽입 헬퍼 함수 (한글 COM 공식 방식)
  function InsertHwpText($val) {
    if ($null -eq $val -or [string]$val -eq '') { return }
    $insParam = $hwp.HParameterSet.HInsertText
    $hwp.HAction.GetDefault('InsertText', $insParam.HSet) | Out-Null
    $insParam.Text = [string]$val
    $hwp.HAction.Execute('InsertText', $insParam.HSet) | Out-Null
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
    @{ F = '25년7월';    R = '${shortYear}년${month}월' }
  )

  # 텍스트 이동 헬퍼 함수 (한글 COM 공식 HFindReplace 액션)
  function MoveToText($findStr) {
    if (-not $findStr) { return $false }
    $hwp.Run('MoveDocBegin') | Out-Null
    $p = $hwp.HParameterSet.HFindReplace
    $hwp.HAction.GetDefault('FindReplace', $p.HSet) | Out-Null
    $p.FindString = [string]$findStr
    $p.Direction = 0
    $p.MatchCase = 0
    $p.WholeWordOnly = 0
    $p.IgnoreMessage = 1
    return $hwp.HAction.Execute('FindReplace', $p.HSet)
  }

  for ($d = 1; $d -le 31; $d++) {
    $replacePairs += @{ F = "7월 $($d)일"; R = "${month}월 $($d)일" }
    $replacePairs += @{ F = "7/$($d)"; R = "${month}/$($d)" }
  }

  foreach ($rp in $replacePairs) {
    ReplaceTextEverywhere $rp.F $rp.R
  }
  LogMsg "Text replace finished."

  # Bind only named ledger cells; no global numeric replacements.
  ${ledgerBindingScript}
  $ledgerExpected = Set-CheongjuLedgers $hwp (ConvertFrom-Json $ledgerBindingsJson) (ConvertFrom-Json $sludgeJson) ${year} ${month} $workingDoc
  Test-CheongjuLedgers $hwp $ledgerExpected

  # 3. 클립보드 기반 이미지 삽입 (안정성 및 크기 보장)
  LogMsg "4. Inserting images via Clipboard Paste..."
  $tasks = ConvertFrom-Json $tasksJson
  LogMsg "   Total binding tasks: $($tasks.Count)"
  $taskIdx = 0
  $bindingFailures = @()
  foreach ($task in $tasks) {
    $taskIdx++
    $files = @($task.files)
    $fields = @($task.fields)
    $keywords = @($task.keywords)
    $bookmarks = @($task.bookmarks)
    $wMm = if ($task.imgWidthMm) { $task.imgWidthMm } else { 80.3 }
    $hMm = if ($task.imgHeightMm) { $task.imgHeightMm } else { 51.6 }
    $sizeStr = "$($wMm)x$($hMm)mm"
    LogMsg "   Task $taskIdx - fields: $($fields -join ', ') - bookmarks: $($bookmarks -join ', ') - files: $($files.Count) - size: $sizeStr"
    if ($files.Count -eq 0) {
      LogMsg "   -> SKIP (no files)"
      continue
    }
    foreach ($ff in $files) {
      LogMsg "     file: $ff (exists: $(Test-Path -LiteralPath ([string]$ff)))"
    }
    
    $inserted = $false

    # 1순위: HWP 누름틀 필드(Field)로 직접 이동
    foreach ($fd in $fields) {
      if ($inserted) { break }
      $fdStr = [string]$fd
      if (-not $fdStr) { continue }

      $moved = $false
      try {
        # MoveToField(field, text, start, select)
        $moved = $hwp.MoveToField($fdStr, $true, $true, $false)
      } catch {
        $moved = $false
      }

      LogMsg "   -> MoveToField '$fdStr' -> found: $moved"
      if ($moved) {
        LogMsg "   -> Found field '$fdStr', pasting $($files.Count) image(s) at $sizeStr..."
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

    # 2순위: 책갈피(Bookmark)로 이동
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

    # 4순위: 성적서(수질검사성적서) 전용 셀 위치 폴백
    # 캡처 실측: 좌측 하단 '수질검사입금표'의 바로 오른쪽 셀에 성적서 6장(3장씩 2줄)이 들어감
    if (-not $inserted -and ($fields -contains '성적서' -or $bookmarks -contains '성적서')) {
      LogMsg "   -> Trying certificate cell fallback via '수질검사입금표'..."
      $hwp.Run('MoveDocBegin') | Out-Null
      if (MoveToBookmarkSafe '수질검사입금표') {
        $hwp.Run('TableRightCell') | Out-Null
        LogMsg "   -> Certificate fallback: Moved to '수질검사입금표' and shifted right to certificate cell. Pasting $($files.Count) image(s)..."
        try { $hwp.Run('Delete') | Out-Null } catch {}

        $idx = 0
        foreach ($f in $files) {
          $fStr = [string]$f
          if (Test-Path -LiteralPath $fStr) {
            $ok = PasteImageToHwp $fStr $wMm $hMm
            if ($ok) {
              $idx++
              LogMsg "     Pasted cert image $idx : $(Split-Path $fStr -Leaf) ($sizeStr)"
              if (($idx % 3) -eq 0) {
                $hwp.Run('BreakPara') | Out-Null
              }
            }
          }
        }
        $inserted = $idx -gt 0
      }
    }

    # Sludge evidence must use its own named destination, never relative row guesses.
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
  LogMsg '7. Re-opening saved HWP for cell verification...'
  $hwp.Clear(1) | Out-Null
  if (-not $hwp.Open($workingDoc, 'HWP', 'lock:false')) { throw 'Saved HWP reopen failed' }
  Test-CheongjuLedgers $hwp $ledgerExpected
  LogMsg 'EXACT CELL VERIFICATION PASSED'
  Test-CheongjuEvidence $hwp $tasks
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

        if (!automationLog.includes('6. HWP saved successfully!') || !automationLog.includes('EXACT CELL VERIFICATION PASSED')) {
          try { if (fs.existsSync(tempWorkingPath)) fs.unlinkSync(tempWorkingPath); } catch (_) {}
          return reject(new Error(`한글 정산서 자동 생성이 완료되지 않았습니다. 로그: ${persistentLogPath}`));
        }

        try {
          let savedPath = finalReportPath;
          try {
            fs.copyFileSync(tempWorkingPath, finalReportPath);
          } catch (lockErr) {
            if (lockErr.code === 'EBUSY') {
              const altName = `${path.basename(finalReportPath, '.hwp')}_새로고침.hwp`;
              savedPath = path.join(path.dirname(finalReportPath), altName);
              fs.copyFileSync(tempWorkingPath, savedPath);
              console.warn(`[hwpSettlementService] 원본 파일이 한글에서 열려 있어 대체 파일로 저장했습니다: ${savedPath}`);
            } else {
              throw lockErr;
            }
          }

          if (outputPath && outputPath !== finalReportPath) {
            try {
              fs.copyFileSync(tempWorkingPath, outputPath);
            } catch (_) {}
          }

          try { if (fs.existsSync(tempWorkingPath)) fs.unlinkSync(tempWorkingPath); } catch (_) {}

          console.log(`[hwpSettlementService] 청주 정산서 한글 파일 생성 완료: ${savedPath}`);
          return resolve({
            success: true,
            filePath: savedPath,
            fileName: path.basename(savedPath),
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
