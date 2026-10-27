/**
 * 월정산 데이터 취합 및 엑셀/한글 양식 관리 서비스
 */
const { BigQuery } = require('@google-cloud/bigquery');
const path = require('path');
const fs = require('fs');

const keyFile = path.join(__dirname, '../config/work-jindan-194620a46d59.json');
const getBigQueryClient = () => {
  return new BigQuery({
    projectId: 'work-jindan',
    keyFilename: keyFile,
  });
};

const DATASET = 'daily_log_system';

/**
 * 템플릿 저장용 쓰기 가능 디렉토리 (AppData) 및 번들 디렉토리 계산
 */
function getWritableTemplateDir() {
  const appDataRoot = process.env.APP_DATA_PATH || 
    (process.env.APPDATA ? path.join(process.env.APPDATA, 'Osoo_Admin_App') : path.join(__dirname, '../templates/settlement'));
  const targetDir = path.join(appDataRoot, 'templates', 'settlement');
  if (!fs.existsSync(targetDir)) {
    try {
      fs.mkdirSync(targetDir, { recursive: true });
    } catch (e) {
      console.warn('[settlementService] AppData 템플릿 폴더 생성 실패:', e.message);
    }
  }
  return targetDir;
}

function getBundleTemplateDir() {
  const relPath = path.join('server', 'templates', 'settlement');
  const candidates = [
    path.join(__dirname, '../templates/settlement'),
    process.resourcesPath ? path.join(process.resourcesPath, 'app.asar.unpacked', relPath) : '',
    process.resourcesPath ? path.join(process.resourcesPath, relPath) : '',
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return path.join(__dirname, '../templates/settlement');
}

/**
 * 템플릿 파일명 상호 호환 매핑 테이블 (safeBaseName과 DEFAULT_SITES 기본 파일명 동기화)
 */
const TEMPLATE_ALIASES = {
  // 청주(서울) HWP 보고서 & 운영일지 XLSM
  'template_cheongju_report.hwp': ['template_cheongju_seoul.hwp'],
  'template_cheongju_seoul.hwp': ['template_cheongju_report.hwp'],
  'template_cheongju_daily_log.xlsm': ['template_cheongju_seoul_sub.xlsm'],
  'template_cheongju_seoul_sub.xlsm': ['template_cheongju_daily_log.xlsm'],

  // 홍천(양양) 엑셀 & HWP
  'template_hongcheon_yangyang.xlsx': ['template_hongcheon_yangyang_excel.xlsx'],
  'template_hongcheon_yangyang_excel.xlsx': ['template_hongcheon_yangyang.xlsx'],
  'template_hongcheon_yangyang.hwp': ['template_hongcheon_yangyang_hwp.hwp'],
  'template_hongcheon_yangyang_hwp.hwp': ['template_hongcheon_yangyang.hwp'],

  // 죽암(서울) & 죽암(부산)
  'template_jukam_seoul.xls': ['template_jukam_seoul.xls'],
  'template_jukam_busan.xls': ['template_jukam_busan.xls'],

  // 천안(부산)
  'template_cheonan_busan.xlsx': ['template_cheonan_busan.xlsx'],
};

function getTemplateNameVariants(fileName) {
  if (!fileName) return [];
  const safeName = path.basename(fileName);
  const variants = [safeName];
  if (TEMPLATE_ALIASES[safeName]) {
    for (const alias of TEMPLATE_ALIASES[safeName]) {
      if (!variants.includes(alias)) variants.push(alias);
    }
  }
  return variants;
}

/**
 * 특정 템플릿 파일의 실제 존재하는 최우선 경로 탐색 (AppData > 번들)
 */
function resolveTemplateFilePath(fileName) {
  if (!fileName) return null;
  const safeName = path.basename(fileName);
  const writableDir = getWritableTemplateDir();
  const bundleDir = getBundleTemplateDir();
  const variants = getTemplateNameVariants(safeName);

  // 1순위: AppData (쓰기 가능 폴더)
  for (const name of variants) {
    const cand = path.join(writableDir, name);
    if (fs.existsSync(cand)) return cand;
  }

  // 2순위: 번들 폴더
  for (const name of variants) {
    const cand = path.join(bundleDir, name);
    if (fs.existsSync(cand)) return cand;
  }

  return null;
}

/**
 * 양식 열기 전, 항상 쓰기 가능한 AppData 폴더에 파일이 존재하도록 보장
 * (없으면 번들 원본을 AppData로 자동 복사 후 해당 AppData 경로 반환)
 */
function ensureWritableTemplateFilePath(fileName) {
  if (!fileName) return null;
  const safeName = path.basename(fileName);
  const writableDir = getWritableTemplateDir();
  const writablePath = path.join(writableDir, safeName);
  const variants = getTemplateNameVariants(safeName);

  // 1. 이미 AppData에 존재하면 해당 경로 반환
  if (fs.existsSync(writablePath)) {
    return writablePath;
  }

  // 2. 다른 변형 이름으로 AppData에 이미 존재하는 경우, 해당 파일을 safeName으로도 복사하여 동기화 후 반환
  for (const variant of variants) {
    const variantPath = path.join(writableDir, variant);
    if (fs.existsSync(variantPath)) {
      try {
        fs.copyFileSync(variantPath, writablePath);
        return writablePath;
      } catch (_) {
        return variantPath;
      }
    }
  }

  // 3. AppData에 없다면 번들(또는 기존 경로)에서 찾아 AppData로 복사
  const existingPath = resolveTemplateFilePath(safeName);
  if (existingPath && fs.existsSync(existingPath)) {
    try {
      fs.copyFileSync(existingPath, writablePath);
      console.log(`[settlementService] 양식 파일 AppData로 자동 복사 완료: ${existingPath} -> ${writablePath}`);

      // 호환성을 위해 모든 변형 이름으로도 AppData에 복사하여 두 이름 모두 즉시 준비
      for (const variant of variants) {
        const variantTarget = path.join(writableDir, variant);
        if (!fs.existsSync(variantTarget)) {
          try {
            fs.copyFileSync(existingPath, variantTarget);
          } catch (_) {}
        }
      }

      return writablePath;
    } catch (err) {
      console.warn('[settlementService] AppData 양식 복사 실패, 원본 경로 반환:', err.message);
      return existingPath;
    }
  }

  return null;
}

/**
 * 5대 지원 현장 기본 정의
 */
const DEFAULT_SITES = [
  {
    id: 'jukam_seoul',
    name: '죽암휴게소(서울방향)',
    shortName: '죽암(서울)',
    type: 'excel',
    format: 'xls',
    template: 'template_jukam_seoul.xls',
    description: '오수처리비 정산서 + 증빙자료 + 슬러지반출대장',
    sheets: ['7월 죽암오수처리 정산', '7월증빙자료', '슬러지반출관리대장(7월)'],
  },
  {
    id: 'jukam_busan',
    name: '죽암휴게소(부산방향)',
    shortName: '죽암(부산)',
    type: 'excel',
    format: 'xls',
    template: 'template_jukam_busan.xls',
    description: '위탁계약 방식2 정산서 + 월간운영일지 + 슬러지반출대장 + 증빙',
    sheets: ['위탁계약 방식', '증빙', '월간운영일지', '슬러지반출대장'],
  },
  {
    id: 'cheonan_busan',
    name: '천안휴게소(부산방향)',
    shortName: '천안(부산)',
    type: 'excel',
    format: 'xlsx',
    template: 'template_cheonan_busan.xlsx',
    description: '오수정화조 정산내역(변경양식) + 증빙현황 + 슬러지반출대장',
    sheets: ['변경양식(최종)', '7월(증빙현황)', '슬러지반출관리대장(7월)'],
  },
  {
    id: 'cheongju_seoul',
    name: '청주휴게소(서울방향)',
    shortName: '청주(서울)',
    type: 'hwp_excel',
    format: 'hwp + xlsm',
    template: 'template_cheongju_report.hwp',
    subTemplate: 'template_cheongju_daily_log.xlsm',
    description: '임대료 정산 보고건(한글 HWP) + 청주 운영일지(엑셀 XLSM) + 약품대장',
    sheets: ['정산보고서.hwp', '운영일지.xlsm', '약품관리대장.hwp'],
  },
  {
    id: 'hongcheon_yangyang_excel',
    name: '홍천휴게소(양양방향)',
    shortName: '홍천(양양)',
    type: 'excel',
    format: 'xlsx',
    template: 'template_hongcheon_yangyang.xlsx',
    description: '오수정화조 임대료 정산보고서(월별 1~12월 탭 + 연정산 총괄표)',
    sheets: ['2026년도 01월~12월', '2026년 총괄(홍천 양양)'],
  },
  {
    id: 'hongcheon_yangyang_hwp',
    name: '홍천휴게소(양양방향)',
    shortName: '홍천(양양)',
    type: 'hwp',
    format: 'hwp',
    template: 'template_hongcheon_yangyang.hwp',
    description: '오수정화조 임대료 정산보고서(한글 HWP 양식)',
    sheets: ['정산보고서.hwp'],
  },
];

/**
 * 템플릿 메타 로드/저장
 */
function loadTemplateConfig() {
  const appDataConfigFile = path.join(getWritableTemplateDir(), 'template_config.json');
  const bundleConfigFile = path.join(getBundleTemplateDir(), 'template_config.json');

  try {
    if (fs.existsSync(appDataConfigFile)) {
      const raw = fs.readFileSync(appDataConfigFile, 'utf8');
      return JSON.parse(raw);
    }
    if (fs.existsSync(bundleConfigFile)) {
      const raw = fs.readFileSync(bundleConfigFile, 'utf8');
      return JSON.parse(raw);
    }
  } catch (err) {
    console.warn('[settlementService] config 파일 읽기 실패, 기본값 사용:', err.message);
  }
  return DEFAULT_SITES;
}

function saveTemplateConfig(sites) {
  try {
    const configFile = path.join(getWritableTemplateDir(), 'template_config.json');
    fs.writeFileSync(configFile, JSON.stringify(sites, null, 2), 'utf8');
  } catch (err) {
    console.error('[settlementService] config 파일 저장 실패:', err);
  }
}

/**
 * 템플릿 목록 및 실존 여부/파일 크기 조회
 */
function getTemplateList() {
  const sites = loadTemplateConfig();
  return sites.map((site) => {
    const mainFilePath = resolveTemplateFilePath(site.template);
    const exists = !!mainFilePath;
    const size = exists ? fs.statSync(mainFilePath).size : 0;
    const updatedAt = exists ? fs.statSync(mainFilePath).mtime : null;

    let subSize = 0;
    let subExists = false;
    let subUpdatedAt = null;
    if (site.subTemplate) {
      const subFilePath = resolveTemplateFilePath(site.subTemplate);
      subExists = !!subFilePath;
      subSize = subExists ? fs.statSync(subFilePath).size : 0;
      subUpdatedAt = subExists ? fs.statSync(subFilePath).mtime : null;
    }

    return {
      ...site,
      exists,
      fileSize: size,
      updatedAt,
      subExists,
      subFileSize: subSize,
      subUpdatedAt,
    };
  });
}

/**
 * 템플릿 파일 경로 조회
 */
function getTemplateFilePath(templateFileName) {
  return resolveTemplateFilePath(templateFileName);
}

/**
 * 현장 템플릿 파일 교체 및 신규 저장 (항상 쓰기 가능한 AppData 폴더에 저장)
 * - safeBaseName뿐만 아니라 DEFAULT_SITES 기본 파일명과도 동기화하여 파일명 불일치 방지
 */
function saveTemplateFile(siteId, fileBuffer, originalName, isSub = false) {
  const sites = loadTemplateConfig();
  const targetSite = sites.find(s => s.id === siteId);
  if (!targetSite) {
    throw new Error(`해당 현장(${siteId})을 찾을 수 없습니다.`);
  }

  const ext = path.extname(originalName).toLowerCase();
  const safeBaseName = `template_${siteId}${isSub ? '_sub' : ''}${ext}`;
  const targetDir = getWritableTemplateDir();
  const targetPath = path.join(targetDir, safeBaseName);

  // 1. 새 파일 쓰기 (safeBaseName)
  fs.writeFileSync(targetPath, fileBuffer);

  // 2. DEFAULT_SITES의 기본 파일명 확인 및 호환 동기화 저장
  const defaultSite = DEFAULT_SITES.find(s => s.id === siteId);
  const defaultFileName = isSub ? defaultSite?.subTemplate : defaultSite?.template;
  if (defaultFileName && defaultFileName !== safeBaseName) {
    const defaultTarget = path.join(targetDir, defaultFileName);
    try {
      fs.writeFileSync(defaultTarget, fileBuffer);
    } catch (e) {
      console.warn('[settlementService] 기본 파일명 호환 동기화 경고:', e.message);
    }
  }

  // 3. safeBaseName 및 defaultFileName의 모든 변형(alias) 파일명에도 동기화
  const allVariants = new Set([
    ...getTemplateNameVariants(safeBaseName),
    ...(defaultFileName ? getTemplateNameVariants(defaultFileName) : []),
  ]);
  for (const variant of allVariants) {
    const vPath = path.join(targetDir, variant);
    if (vPath !== targetPath) {
      try {
        fs.writeFileSync(vPath, fileBuffer);
      } catch (_) {}
    }
  }

  // 4. 메타 정보 갱신
  if (isSub) {
    targetSite.subTemplate = safeBaseName;
  } else {
    targetSite.template = safeBaseName;
    targetSite.format = ext.replace('.', '');
    if (ext === '.hwp' || ext === '.hwpx') {
      targetSite.type = targetSite.subTemplate ? 'hwp_excel' : 'hwp';
    } else {
      targetSite.type = 'excel';
    }
  }

  saveTemplateConfig(sites);
  return { site: targetSite, fileName: safeBaseName };
}

/**
 * 현장 템플릿 파일 삭제
 */
function deleteTemplateFile(siteId, isSub = false) {
  const sites = loadTemplateConfig();
  const targetSite = sites.find(s => s.id === siteId);
  if (!targetSite) {
    throw new Error(`해당 현장(${siteId})을 찾을 수 없습니다.`);
  }

  const targetFileName = isSub ? targetSite.subTemplate : targetSite.template;
  const defaultSite = DEFAULT_SITES.find(s => s.id === siteId);
  const defaultFileName = isSub ? defaultSite?.subTemplate : defaultSite?.template;

  const namesToDelete = new Set([
    ...(targetFileName ? getTemplateNameVariants(targetFileName) : []),
    ...(defaultFileName ? getTemplateNameVariants(defaultFileName) : []),
  ]);

  const targetDir = getWritableTemplateDir();
  for (const name of namesToDelete) {
    const p = path.join(targetDir, name);
    if (fs.existsSync(p)) {
      try {
        fs.unlinkSync(p);
      } catch (e) {
        console.warn('템플릿 파일 삭제 실패:', e.message);
      }
    }
  }

  if (isSub) {
    targetSite.subTemplate = null;
  } else {
    targetSite.template = null;
  }

  saveTemplateConfig(sites);
  return targetSite;
}

/**
 * 특정 연월/현장의 월정산 집계 데이터 조회
 */
async function getSettlementSummary(year, month, siteId = 'all') {
  const bq = getBigQueryClient();
  const yearNum = parseInt(year, 10);
  const monthNum = parseInt(month, 10);
  const startDate = `${yearNum}-${String(monthNum).padStart(2, '0')}-01`;
  const endDate = monthNum === 12
    ? `${yearNum + 1}-01-01`
    : `${yearNum}-${String(monthNum + 1).padStart(2, '0')}-01`;

  const sites = loadTemplateConfig();
  const targetSites = siteId === 'all'
    ? sites
    : sites.filter(s => s.id === siteId || s.name === siteId || s.shortName === siteId);

  const siteNames = targetSites.map(s => s.name);

  // 1. 일일점검 데이터 조회 (daily_check)
  let dailyChecks = [];
  try {
    const queryDaily = `
      SELECT *
      FROM \`${DATASET}.daily_check\`
      WHERE date >= @startDate AND date < @endDate
        AND site_name IN UNNEST(@siteNames)
      ORDER BY date ASC, site_name ASC
    `;
    const [rows] = await bq.query({
      query: queryDaily,
      params: { startDate, endDate, siteNames },
      location: 'asia-northeast3',
    });
    dailyChecks = rows;
  } catch (err) {
    console.warn('[settlementService] daily_check 조회 실패:', err.message);
  }

  // 2. QnTech 키트 수질 데이터 조회 (qntech_water_quality)
  let qntechData = [];
  try {
    const queryQn = `
      SELECT *
      FROM \`${DATASET}.qntech_water_quality\`
      WHERE (date >= @startDate AND date < @endDate)
        AND site_name IN UNNEST(@siteNames)
      ORDER BY date ASC, site_name ASC
    `;
    const [rows] = await bq.query({
      query: queryQn,
      params: { startDate, endDate, siteNames },
      location: 'asia-northeast3',
    });
    qntechData = rows;
  } catch (err) {
    console.warn('[settlementService] qntech_water_quality 조회 실패:', err.message);
  }

  // 3. 공인 성적서 수질 데이터 조회 (water_quality)
  let certData = [];
  try {
    const queryCert = `
      SELECT *
      FROM \`${DATASET}.water_quality\`
      WHERE (COALESCE(sample_date, report_date) >= @startDate AND COALESCE(sample_date, report_date) < @endDate)
        AND site_name IN UNNEST(@siteNames)
      ORDER BY report_date ASC, site_name ASC
    `;
    const [rows] = await bq.query({
      query: queryCert,
      params: { startDate, endDate, siteNames },
      location: 'asia-northeast3',
    });
    certData = rows;
  } catch (err) {
    console.warn('[settlementService] water_quality 조회 실패:', err.message);
  }

  return {
    year: yearNum,
    month: monthNum,
    targetSites,
    dailyChecksCount: dailyChecks.length,
    qntechCount: qntechData.length,
    certCount: certData.length,
    dailyChecks,
    qntechData,
    certData,
  };
}

module.exports = {
  SETTLEMENT_TARGET_SITES: DEFAULT_SITES,
  getTemplateList,
  getTemplateFilePath,
  ensureWritableTemplateFilePath,
  resolveTemplateFilePath,
  saveTemplateFile,
  deleteTemplateFile,
  getSettlementSummary,
};
