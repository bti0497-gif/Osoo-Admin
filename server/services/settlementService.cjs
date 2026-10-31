/**
 * 월정산 데이터 취합 및 엑셀/한글 양식 관리 서비스
 */
const { BigQuery } = require('@google-cloud/bigquery');
const path = require('path');
const fs = require('fs');

const keyFile = path.join(__dirname, '../config/work-jindan-194620a46d59.json');
const getBigQueryClient = () => {
  return new BigQuery({ projectId: 'work-jindan', keyFilename: keyFile });
};

const DATASET = 'daily_log_system';

function getWritableTemplateDir() {
  const appDataRoot = process.env.APP_DATA_PATH || 
    (process.env.APPDATA ? path.join(process.env.APPDATA, 'Osoo_Admin_App') : path.join(__dirname, '../templates/settlement'));
  const targetDir = path.join(appDataRoot, 'templates', 'settlement');
  if (!fs.existsSync(targetDir)) {
    try { fs.mkdirSync(targetDir, { recursive: true }); } catch (e) {
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

const TEMPLATE_ALIASES = {
  'template_cheongju_report.hwp': ['template_cheongju_seoul.hwp'],
  'template_cheongju_seoul.hwp': ['template_cheongju_report.hwp'],
  'template_cheongju_daily_log.xlsm': ['template_cheongju_seoul_sub.xlsm'],
  'template_cheongju_seoul_sub.xlsm': ['template_cheongju_daily_log.xlsm'],
  'template_hongcheon_yangyang.xlsx': ['template_hongcheon_yangyang_excel.xlsx'],
  'template_hongcheon_yangyang_excel.xlsx': ['template_hongcheon_yangyang.xlsx'],
  'template_hongcheon_yangyang.hwp': ['template_hongcheon_yangyang_hwp.hwp'],
  'template_hongcheon_yangyang_hwp.hwp': ['template_hongcheon_yangyang.hwp'],
  'template_cheongsong.hwpx': ['template_cheongsong.hwp'],
  'template_cheongsong.hwp': ['template_cheongsong.hwpx'],
  'template_geumwang.hwpx': ['template_geumwang.hwp'],
  'template_geumwang.hwp': ['template_geumwang.hwpx'],
  'template_miryang.hwpx': ['template_miryang.hwp'],
  'template_miryang.hwp': ['template_miryang.hwpx'],
  'template_miryang_sub.xlsx': ['template_miryang_excel.xlsx'],
  'template_miryang_excel.xlsx': ['template_miryang_sub.xlsx'],
  'template_andong_excel.xlsx': ['template_andong.xlsx'],
  'template_andong.xlsx': ['template_andong_excel.xlsx'],
  'template_seonsan_changwon.hwpx': ['template_seonsan_changwon.hwp'],
  'template_seonsan_changwon.hwp': ['template_seonsan_changwon.hwpx'],
  'template_seonsan_yangpyeong.hwpx': ['template_seonsan_yangpyeong.hwp'],
  'template_seonsan_yangpyeong.hwp': ['template_seonsan_yangpyeong.hwpx'],
  'template_hoengseong_gangneung.hwpx': ['template_hoengseong_gangneung.hwp'],
  'template_hoengseong_gangneung.hwp': ['template_hoengseong_gangneung.hwpx'],
  'template_hoengseong_incheon.hwpx': ['template_hoengseong_incheon.hwp'],
  'template_hoengseong_incheon.hwp': ['template_hoengseong_incheon.hwpx'],
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

function resolveTemplateFilePath(fileName) {
  if (!fileName) return null;
  const safeName = path.basename(fileName);
  const writableDir = getWritableTemplateDir();
  const bundleDir = getBundleTemplateDir();
  const variants = getTemplateNameVariants(safeName);

  for (const name of variants) {
    const cand = path.join(writableDir, name);
    if (fs.existsSync(cand)) return cand;
  }
  for (const name of variants) {
    const cand = path.join(bundleDir, name);
    if (fs.existsSync(cand)) return cand;
  }
  return null;
}

function ensureWritableTemplateFilePath(fileName) {
  if (!fileName) return null;
  const safeName = path.basename(fileName);
  const writableDir = getWritableTemplateDir();
  const writablePath = path.join(writableDir, safeName);
  const variants = getTemplateNameVariants(safeName);

  if (fs.existsSync(writablePath)) return writablePath;

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

  const existingPath = resolveTemplateFilePath(safeName);
  if (existingPath && fs.existsSync(existingPath)) {
    try {
      fs.copyFileSync(existingPath, writablePath);
      for (const variant of variants) {
        const variantTarget = path.join(writableDir, variant);
        if (!fs.existsSync(variantTarget)) {
          try { fs.copyFileSync(existingPath, variantTarget); } catch (_) {}
        }
      }
      return writablePath;
    } catch (err) {
      console.warn('[settlementService] AppData 양식 복사 실패, 원본 반환:', err.message);
      return existingPath;
    }
  }
  return null;
}

const DEFAULT_SITES = [
  { id: 'jukam_seoul', name: '죽암휴게소(서울방향)', shortName: '죽암(서울)', type: 'excel', format: 'xls', template: 'template_jukam_seoul.xls', description: '오수처리비 정산서 + 증빙자료 + 슬러지반출대장', sheets: ['7월 죽암오수처리 정산', '7월증빙자료', '슬러지반출관리대장(7월)'] },
  { id: 'jukam_busan', name: '죽암휴게소(부산방향)', shortName: '죽암(부산)', type: 'excel', format: 'xls', template: 'template_jukam_busan.xls', description: '위탁계약 방식2 정산서 + 월간운영일지 + 슬러지반출대장 + 증빙', sheets: ['위탁계약 방식', '증빙', '월간운영일지', '슬러지반출대장'] },
  { id: 'cheonan_busan', name: '천안휴게소(부산방향)', shortName: '천안(부산)', type: 'excel', format: 'xlsx', template: 'template_cheonan_busan.xlsx', description: '오수정화조 정산내역(변경양식) + 증빙현황 + 슬러지반출대장', sheets: ['변경양식(최종)', '7월(증빙현황)', '슬러지반출관리대장(7월)'] },
  { id: 'cheongju_seoul', name: '청주휴게소(서울방향)', shortName: '청주(서울)', type: 'hwp_excel', format: 'hwp + xlsm', template: 'template_cheongju_report.hwp', subTemplate: 'template_cheongju_daily_log.xlsm', description: '임대료 정산 보고건(한글 HWP) + 청주 운영일지(엑셀 XLSM) + 약품대장', sheets: ['정산보고서.hwp', '운영일지.xlsm', '약품관리대장.hwp'] },
  { id: 'hongcheon_yangyang_excel', name: '홍천휴게소(양양방향)', shortName: '홍천(양양)', type: 'excel', format: 'xlsx', template: 'template_hongcheon_yangyang.xlsx', description: '오수정화조 임대료 정산보고서(월별 1~12월 탭 + 연정산 총괄표)', sheets: ['2026년도 01월~12월', '2026년 총괄(홍천 양양)'] },
  { id: 'hongcheon_yangyang_hwp', name: '홍천휴게소(양양방향)', shortName: '홍천(양양)', type: 'hwp', format: 'hwp', template: 'template_hongcheon_yangyang.hwp', description: '오수정화조 임대료 정산보고서(한글 HWP 양식)', sheets: ['정산보고서.hwp'] },
  { id: 'cheongsong', name: '청송휴게소(상주방향)', shortName: '청송(상주)', type: 'hwp', format: 'hwpx', template: 'template_cheongsong.hwpx', description: '도로공사 정산 서류(한글 HWPX) + 계약서 + 계산서 4종 증빙', sheets: ['정산서류.hwpx'] },
  { id: 'geumwang', name: '금왕휴게소(평택방향)', shortName: '금왕(평택)', type: 'hwp', format: 'hwpx', template: 'template_geumwang.hwpx', description: '도로공사 정산 서류(한글 HWPX) + 계약서 + 계산서 5종 증빙', sheets: ['정산서류.hwpx'] },
  { id: 'miryang', name: '밀양영남루휴게소(울산방향)', shortName: '밀양영남루', type: 'hwp_excel', format: 'hwpx + xlsx', template: 'template_miryang.hwpx', subTemplate: 'template_miryang_sub.xlsx', description: '도로공사 정산 서류(한글 HWPX) + 오수처리비정산(엑셀 XLSX)', sheets: ['정산서류.hwpx', '밀양휴게소오수처리비정산.xlsx'] },
  { id: 'gochang_mokpo', name: '고창고인돌휴게소(목포방향)', shortName: '고창(목포)', type: 'excel', format: 'xlsx', template: 'template_gochang_mokpo.xlsx', description: '정산서 + 증빙자료 + 운영일지(약품 차염산/포도당/중탄산/PAC)', sheets: ['정산내역', '증빙', '운영일지'] },
  { id: 'gochang_seoul', name: '고창고인돌휴게소(서울방향)', shortName: '고창(서울)', type: 'excel', format: 'xlsx', template: 'template_gochang_seoul.xlsx', description: '정산서 + 증빙자료 + 운영일지(약품 차염산/포도당/중탄산/PAC)', sheets: ['정산내역', '증빙', '운영일지'] },
  { id: 'andong', name: '안동휴게소(부산방향)', shortName: '안동(부산)', type: 'hwp_excel', format: 'hwp + xlsx', template: 'template_andong.hwp', subTemplate: 'template_andong_excel.xlsx', description: '오수처리비 정산 보고서(한글 HWP) + 오수처리비 정산보고서(엑셀 XLSX 증빙)', sheets: ['정산보고서.hwp', '정산보고서.xlsx'] },
  { id: 'seonsan_changwon', name: '선산휴게소(창원방향)', shortName: '선산(창원)', type: 'hwp', format: 'hwpx', template: 'template_seonsan_changwon.hwpx', description: '도로공사 정산 서류(한글 HWPX) + 계산서/입금표 4종 + 성적서 4종 증빙', sheets: ['정산서류.hwpx'] },
  { id: 'seonsan_yangpyeong', name: '선산휴게소(양평방향)', shortName: '선산(양평)', type: 'hwp', format: 'hwpx', template: 'template_seonsan_yangpyeong.hwpx', description: '도로공사 정산 서류(한글 HWPX) + 계산서/입금표 4종 + 성적서 4종 증빙', sheets: ['정산서류.hwpx'] },
  { id: 'hoengseong_gangneung', name: '횡성휴게소(강릉방향)', shortName: '횡성(강릉)', type: 'hwp', format: 'hwpx', template: 'template_hoengseong_gangneung.hwpx', description: '도로공사 정산 서류(한글 HWPX) + 계약서 + 계산서/입금표 + 성적서 증빙', sheets: ['정산서류.hwpx'] },
  { id: 'hoengseong_incheon', name: '횡성휴게소(인천방향)', shortName: '횡성(인천)', type: 'hwp', format: 'hwpx', template: 'template_hoengseong_incheon.hwpx', description: '도로공사 정산 서류(한글 HWPX) + 계약서 + 계산서/입금표 + 성적서 증빙', sheets: ['정산서류.hwpx'] },
];

function loadTemplateConfig() {
  const appDataConfigFile = path.join(getWritableTemplateDir(), 'template_config.json');
  const bundleConfigFile = path.join(getBundleTemplateDir(), 'template_config.json');

  let loaded = null;
  try {
    if (fs.existsSync(appDataConfigFile)) {
      loaded = JSON.parse(fs.readFileSync(appDataConfigFile, 'utf8').replace(/^\uFEFF/, ''));
    } else if (fs.existsSync(bundleConfigFile)) {
      loaded = JSON.parse(fs.readFileSync(bundleConfigFile, 'utf8').replace(/^\uFEFF/, ''));
    }
  } catch (err) {
    console.warn('[settlementService] config 파일 읽기 실패, 기본값 사용:', err.message);
  }

  if (!Array.isArray(loaded)) return DEFAULT_SITES;

  let hasMissing = false;
  for (const defSite of DEFAULT_SITES) {
    if (!loaded.some((s) => s.id === defSite.id)) {
      loaded.push(defSite);
      hasMissing = true;
    }
  }
  if (hasMissing) {
    try { saveTemplateConfig(loaded); } catch (_) {}
  }
  return loaded;
}

function saveTemplateConfig(sites) {
  try {
    const configFile = path.join(getWritableTemplateDir(), 'template_config.json');
    fs.writeFileSync(configFile, JSON.stringify(sites, null, 2), 'utf8');
  } catch (err) {
    console.error('[settlementService] config 파일 저장 실패:', err);
  }
}

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

function getTemplateFilePath(templateFileName) {
  return resolveTemplateFilePath(templateFileName);
}

async function ensureTemplateFileAsync(fileName) {
  if (!fileName) return null;
  const localCand = resolveTemplateFilePath(fileName);
  if (localCand && fs.existsSync(localCand)) return localCand;

  // 로컬에 없으면 구글 드라이브 '정산양식' 폴더에서 검색하여 자동 다운로드
  try {
    const templateDriveService = require('./settlementTemplateDriveService.cjs');
    const variants = getTemplateNameVariants(fileName);
    const downloaded = await templateDriveService.ensureTemplateFromDrive(fileName, variants);
    if (downloaded && fs.existsSync(downloaded)) {
      return downloaded;
    }
  } catch (err) {
    console.warn('[settlementService] 드라이브 양식 자동 동기화 실패:', err.message);
  }

  return null;
}

function saveTemplateFile(siteId, fileBuffer, originalName, isSub = false) {
  const sites = loadTemplateConfig();
  const targetSite = sites.find(s => s.id === siteId);
  if (!targetSite) throw new Error(`해당 현장(${siteId})을 찾을 수 없습니다.`);

  const ext = path.extname(originalName).toLowerCase();
  const safeBaseName = `template_${siteId}${isSub ? '_sub' : ''}${ext}`;
  const targetDir = getWritableTemplateDir();
  const targetPath = path.join(targetDir, safeBaseName);

  fs.writeFileSync(targetPath, fileBuffer);

  const defaultSite = DEFAULT_SITES.find(s => s.id === siteId);
  const defaultFileName = isSub ? defaultSite?.subTemplate : defaultSite?.template;
  if (defaultFileName && defaultFileName !== safeBaseName) {
    try { fs.writeFileSync(path.join(targetDir, defaultFileName), fileBuffer); } catch (_) {}
  }

  const allVariants = new Set([
    ...getTemplateNameVariants(safeBaseName),
    ...(defaultFileName ? getTemplateNameVariants(defaultFileName) : []),
  ]);
  for (const variant of allVariants) {
    const vPath = path.join(targetDir, variant);
    if (vPath !== targetPath) {
      try { fs.writeFileSync(vPath, fileBuffer); } catch (_) {}
    }
  }

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

  // 구글 드라이브 '정산양식' 폴더로 자동 비동기 업로드 (모든 중앙관리자 즉시 공유)
  try {
    const templateDriveService = require('./settlementTemplateDriveService.cjs');
    templateDriveService.uploadTemplateToDrive({
      fileName: safeBaseName,
      buffer: fileBuffer,
      mimeType: ext.includes('xls') ? 'application/vnd.ms-excel' : (ext.includes('hwp') ? 'application/x-hwp' : 'application/octet-stream')
    }).catch(err => console.warn('[settlementService] 양식 구글 드라이브 업로드 비동기 실패:', err.message));
  } catch (err) {
    console.warn('[settlementService] 양식 구글 드라이브 업로드 호출 실패:', err.message);
  }

  return { site: targetSite, fileName: safeBaseName };
}

function deleteTemplateFile(siteId, isSub = false) {
  const sites = loadTemplateConfig();
  const targetSite = sites.find(s => s.id === siteId);
  if (!targetSite) throw new Error(`해당 현장(${siteId})을 찾을 수 없습니다.`);

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
      try { fs.unlinkSync(p); } catch (_) {}
    }
  }

  if (isSub) targetSite.subTemplate = null;
  else targetSite.template = null;

  saveTemplateConfig(sites);
  return targetSite;
}

async function getSettlementSummary(year, month, siteId = 'all') {
  const bq = getBigQueryClient();
  const yearNum = parseInt(year, 10);
  const monthNum = parseInt(month, 10);
  const startDate = `${yearNum}-${String(monthNum).padStart(2, '0')}-01`;
  const endDate = monthNum === 12 ? `${yearNum + 1}-01-01` : `${yearNum}-${String(monthNum + 1).padStart(2, '0')}-01`;

  const sites = loadTemplateConfig();
  const targetSites = siteId === 'all'
    ? sites
    : sites.filter(s => s.id === siteId || s.name === siteId || s.shortName === siteId);

  const siteNames = targetSites.map(s => s.name);

  let dailyChecks = [];
  try {
    const [rows] = await bq.query({
      query: `SELECT * FROM \`${DATASET}.daily_check\` WHERE date >= @startDate AND date < @endDate AND site_name IN UNNEST(@siteNames) ORDER BY date ASC, site_name ASC`,
      params: { startDate, endDate, siteNames },
      location: 'asia-northeast3',
    });
    dailyChecks = rows;
  } catch (err) {
    console.warn('[settlementService] daily_check 조회 실패:', err.message);
  }

  let qntechData = [];
  try {
    const [rows] = await bq.query({
      query: `SELECT * FROM \`${DATASET}.qntech_water_quality\` WHERE (date >= @startDate AND date < @endDate) AND site_name IN UNNEST(@siteNames) ORDER BY date ASC, site_name ASC`,
      params: { startDate, endDate, siteNames },
      location: 'asia-northeast3',
    });
    qntechData = rows;
  } catch (err) {
    console.warn('[settlementService] qntech_water_quality 조회 실패:', err.message);
  }

  let certData = [];
  try {
    const [rows] = await bq.query({
      query: `SELECT * FROM \`${DATASET}.water_quality\` WHERE (COALESCE(sample_date, report_date) >= @startDate AND COALESCE(sample_date, report_date) < @endDate) AND site_name IN UNNEST(@siteNames) ORDER BY report_date ASC, site_name ASC`,
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
  ensureTemplateFileAsync,
  saveTemplateFile,
  deleteTemplateFile,
  getSettlementSummary,
};
