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
const TEMPLATE_DIR = path.join(__dirname, '../templates/settlement');
if (!fs.existsSync(TEMPLATE_DIR)) {
  fs.mkdirSync(TEMPLATE_DIR, { recursive: true });
}

// 템플릿 메타 설정 파일 (사용자가 업로드/교체한 파일명 유지)
const CONFIG_FILE = path.join(TEMPLATE_DIR, 'template_config.json');

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
    id: 'hongcheon_yangyang',
    name: '홍천휴게소(양양방향)',
    shortName: '홍천(양양)',
    type: 'excel',
    format: 'xlsx',
    template: 'template_hongcheon_yangyang.xlsx',
    description: '오수정화조 임대료 정산보고서(월별 1~12월 탭 + 연정산 총괄표)',
    sheets: ['2026년도 01월~12월', '2026년 총괄(홍천 양양)'],
  },
];

/**
 * 템플릿 메타 로드/저장
 */
function loadTemplateConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const raw = fs.readFileSync(CONFIG_FILE, 'utf8');
      return JSON.parse(raw);
    }
  } catch (err) {
    console.warn('[settlementService] config 파일 읽기 실패, 기본값 사용:', err.message);
  }
  return DEFAULT_SITES;
}

function saveTemplateConfig(sites) {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(sites, null, 2), 'utf8');
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
    const mainFilePath = site.template ? path.join(TEMPLATE_DIR, site.template) : null;
    const exists = mainFilePath ? fs.existsSync(mainFilePath) : false;
    const size = exists ? fs.statSync(mainFilePath).size : 0;
    const updatedAt = exists ? fs.statSync(mainFilePath).mtime : null;

    let subSize = 0;
    let subExists = false;
    let subUpdatedAt = null;
    if (site.subTemplate) {
      const subFilePath = path.join(TEMPLATE_DIR, site.subTemplate);
      subExists = fs.existsSync(subFilePath);
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
  if (!templateFileName) return null;
  const safeName = path.basename(templateFileName);
  const fullPath = path.join(TEMPLATE_DIR, safeName);
  return fs.existsSync(fullPath) ? fullPath : null;
}

/**
 * 현장 템플릿 파일 교체 및 신규 저장
 */
function saveTemplateFile(siteId, fileBuffer, originalName, isSub = false) {
  const sites = loadTemplateConfig();
  const targetSite = sites.find(s => s.id === siteId);
  if (!targetSite) {
    throw new Error(`해당 현장(${siteId})을 찾을 수 없습니다.`);
  }

  const ext = path.extname(originalName).toLowerCase();
  const safeBaseName = `template_${siteId}${isSub ? '_sub' : ''}${ext}`;
  const targetPath = path.join(TEMPLATE_DIR, safeBaseName);

  // 기존 파일 삭제
  const oldTemplate = isSub ? targetSite.subTemplate : targetSite.template;
  if (oldTemplate && oldTemplate !== safeBaseName) {
    const oldPath = path.join(TEMPLATE_DIR, oldTemplate);
    if (fs.existsSync(oldPath)) {
      try { fs.unlinkSync(oldPath); } catch (e) { console.warn('이전 템플릿 삭제 실패:', e.message); }
    }
  }

  // 새 파일 쓰기
  fs.writeFileSync(targetPath, fileBuffer);

  // 메타 정보 갱신
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
  if (targetFileName) {
    const filePath = path.join(TEMPLATE_DIR, targetFileName);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    if (isSub) {
      targetSite.subTemplate = null;
    } else {
      targetSite.template = null;
    }
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
  saveTemplateFile,
  deleteTemplateFile,
  getSettlementSummary,
};
