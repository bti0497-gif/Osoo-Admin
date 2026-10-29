'use strict';

/**
 * settlementDocDownloadService.cjs
 * =====================================================================
 * 계산서·입금표 Drive 및 로컬 점검준비 폴더 월별(단일월 및 시작월~종료월 기간)·현장별 선택 다운로드 서비스
 * - 단일 월 / 다중 월(시작월 ~ 종료월) 기간 일괄 수집 및 로컬 점검준비 폴더 자동 동기화
 * - 1개 현장 & 1개월 선택 시 개별 파일 다운로드 지원
 * - 다중 월 또는 2개 이상 현장 선택 시 월별 폴더 구조(계산서_YYYYMM/...)로 JSZip 압축 다운로드 지원
 * - 양방향 현장명(서울/부산, 춘천/부산, 목포/서울, 창원/양평 등) 정밀 분리 매칭 지원
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const JSZip = require('jszip');
const {
  isDriveConfigured,
  getSingleSettlementRootFolder,
  findFolderInParent,
  listFilesFolder,
  downloadDriveFileBuffer,
} = require('./driveService.cjs');

const DIRECTION_KEYWORDS = [
  '서울', '부산', '상행', '하행', '순천', '춘천', '양양',
  '목포', '창원', '양평', '상주', '울산', '평택', '포항', '인천', '대전',
];

const OPPOSITE_DIRECTIONS = {
  '서울': ['부산', '목포'],
  '부산': ['서울', '춘천'],
  '춘천': ['부산'],
  '목포': ['서울'],
  '창원': ['양평'],
  '양평': ['창원'],
  '상행': ['하행'],
  '하행': ['상행'],
};

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

function normalizeYm(val) {
  const digits = String(val || '').replace(/[^0-9]/g, '');
  return /^\d{6}$/.test(digits) ? digits : '';
}

function expandYmRange({ targetYm, startYm, endYm, targetYms }) {
  if (Array.isArray(targetYms) && targetYms.length > 0) {
    const valid = Array.from(new Set(targetYms.map(normalizeYm).filter(Boolean))).sort();
    if (valid.length > 0) return valid;
  }

  const sYm = normalizeYm(startYm || targetYm);
  const eYm = normalizeYm(endYm || startYm || targetYm);
  if (!sYm && !eYm) return [];
  if (!sYm) return [eYm];
  if (!eYm || sYm === eYm) return [sYm];

  const [firstYm, lastYm] = sYm <= eYm ? [sYm, eYm] : [eYm, sYm];
  let y = parseInt(firstYm.slice(0, 4), 10);
  let m = parseInt(firstYm.slice(4, 6), 10);
  const endY = parseInt(lastYm.slice(0, 4), 10);
  const endM = parseInt(lastYm.slice(4, 6), 10);

  const list = [];
  let guard = 0;
  while ((y < endY || (y === endY && m <= endM)) && guard < 60) {
    list.push(`${y}${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
    guard += 1;
  }
  return list;
}

function extractSiteMatchTokens(siteInput) {
  const name = typeof siteInput === 'string'
    ? siteInput
    : (siteInput?.name || siteInput?.site_name || siteInput?.shortName || siteInput?.id || '');
  if (!name) return null;

  const raw = String(name).trim();
  let direction = '';
  for (const dir of DIRECTION_KEYWORDS) {
    if (raw.includes(dir)) {
      direction = dir;
      break;
    }
  }

  const dirRegex = new RegExp(DIRECTION_KEYWORDS.join('|'), 'g');
  const stem = raw
    .replace(/[\s\-_/()（）\[\]]/g, '')
    .replace(/휴게소/g, '')
    .replace(/방향/g, '')
    .replace(/고인돌|영남루|예당호/g, '')
    .replace(dirRegex, '');

  return { raw, stem, direction };
}

function doesFileMatchSite(fileName, siteInput) {
  const tokens = extractSiteMatchTokens(siteInput);
  if (!tokens || !tokens.stem) return false;

  const cleanFile = fileName.replace(/\.[^/.]+$/, '');
  if (cleanFile.includes(tokens.raw)) return true;

  const normFile = cleanFile.replace(/[\s\-_/()（）\[\]]/g, '').toLowerCase();
  const normStem = tokens.stem.toLowerCase();

  if (!normFile.includes(normStem)) return false;

  if (tokens.direction) {
    const opposites = OPPOSITE_DIRECTIONS[tokens.direction] || [];
    for (const opp of opposites) {
      if (normFile.includes(opp)) return false;
    }
    if (normFile.includes(tokens.direction)) return true;
  }

  return true;
}

function matchesAnySite(fileName, siteList) {
  if (!Array.isArray(siteList) || siteList.length === 0) return true;
  return siteList.some((site) => doesFileMatchSite(fileName, site));
}

function matchesDocType(fileName, docType) {
  const name = String(fileName || '');
  if (docType === 'deposit') {
    return name.includes('입금표');
  }
  return name.includes('계산서') && !name.includes('입금표');
}

async function collectSettlementFiles({ docType = 'invoice', targetYm, sites = [] }) {
  const normalizedYm = normalizeYm(targetYm);
  if (!normalizedYm) {
    throw new Error('대상 연월은 YYYYMM(6자리) 형식이어야 합니다.');
  }

  const docFolder = docType === 'deposit' ? '입금표' : '계산서';
  const fileMap = new Map();

  // 1. Google Drive 탐색
  if (isDriveConfigured()) {
    try {
      const monthlyRoot = await getSingleSettlementRootFolder();
      if (monthlyRoot?.id) {
        const monthlyFolder = await findFolderInParent(monthlyRoot.id, normalizedYm);
        if (monthlyFolder?.id) {
          const driveFiles = (await listFilesFolder(monthlyFolder.id))
            .filter((f) => f.mimeType !== 'application/vnd.google-apps.folder');

          for (const df of driveFiles) {
            if (!matchesDocType(df.name, docType)) continue;
            if (!matchesAnySite(df.name, sites)) continue;

            try {
              const buffer = await downloadDriveFileBuffer(df.id);
              fileMap.set(df.name, {
                name: df.name,
                ym: normalizedYm,
                buffer,
                mimeType: df.mimeType || 'image/jpeg',
                size: buffer.length,
                source: 'drive',
              });
            } catch (err) {
              console.warn(`[settlementDocDownload] Drive 파일 다운로드 실패 (${df.name}):`, err.message);
            }
          }
        }
      }
    } catch (driveErr) {
      console.warn('[settlementDocDownload] Google Drive 조회 경고:', driveErr.message);
    }
  }

  // 2. 로컬 바탕화면 점검준비 폴더 보강
  const desktopDirs = getDesktopDirectories();
  for (const desktopDir of desktopDirs) {
    const localDir = path.join(desktopDir, '점검준비', docFolder, normalizedYm);
    if (!fs.existsSync(localDir)) continue;

    try {
      const localFiles = fs.readdirSync(localDir);
      for (const lf of localFiles) {
        if (fileMap.has(lf)) continue;
        if (!matchesDocType(lf, docType)) continue;
        if (!matchesAnySite(lf, sites)) continue;

        const filePath = path.join(localDir, lf);
        try {
          const stat = fs.statSync(filePath);
          if (stat.isFile()) {
            const buffer = fs.readFileSync(filePath);
            const ext = path.extname(lf).toLowerCase();
            const mimeType = ext === '.pdf' ? 'application/pdf' : ext === '.png' ? 'image/png' : 'image/jpeg';
            fileMap.set(lf, {
              name: lf,
              ym: normalizedYm,
              buffer,
              mimeType,
              size: buffer.length,
              source: 'local',
            });
          }
        } catch (_) {}
      }
    } catch (_) {}
  }

  // 3. 로컬 바탕화면 점검준비 폴더에 동기화 저장
  const primaryDesktopDir = desktopDirs[0];
  const primaryTargetDir = path.join(primaryDesktopDir, '점검준비', docFolder, normalizedYm);
  if (fileMap.size > 0) {
    try {
      fs.mkdirSync(primaryTargetDir, { recursive: true });
      for (const file of fileMap.values()) {
        const destPath = path.join(primaryTargetDir, file.name);
        if (!fs.existsSync(destPath)) {
          fs.writeFileSync(destPath, file.buffer);
        }
      }
    } catch (syncErr) {
      console.warn('[settlementDocDownload] 로컬 점검준비 폴더 동기화 경고:', syncErr.message);
    }
  }

  const items = Array.from(fileMap.values());
  items.sort((a, b) => a.name.localeCompare(b.name, 'ko'));

  return {
    items,
    targetDir: primaryTargetDir,
    targetYm: normalizedYm,
    docType,
    docFolder,
  };
}

async function downloadSettlementDocs({
  docType = 'invoice',
  targetYm,
  startYm,
  endYm,
  targetYms,
  sites = [],
  format = 'auto',
}) {
  const ymList = expandYmRange({ targetYm, startYm, endYm, targetYms });
  if (ymList.length === 0) {
    throw new Error('대상 연월은 YYYYMM(6자리) 형식이어야 합니다.');
  }

  const docFolder = docType === 'deposit' ? '입금표' : '계산서';
  const allItems = [];
  let lastTargetDir = '';

  for (const ym of ymList) {
    const res = await collectSettlementFiles({ docType, targetYm: ym, sites });
    lastTargetDir = res.targetDir;
    for (const item of res.items) {
      allItems.push(item);
    }
  }

  const periodLabel = ymList.length === 1
    ? ymList[0]
    : `${ymList[0]}~${ymList[ymList.length - 1]}(${ymList.length}개월)`;

  if (allItems.length === 0) {
    const siteMsg = sites.length > 0 ? `선택한 ${sites.length}개 현장의 ` : '';
    return {
      success: false,
      error: `선택한 기간(${periodLabel})에 ${siteMsg}${docFolder} 파일을 찾을 수 없습니다.`,
      targetDir: lastTargetDir,
    };
  }

  if (format === 'json') {
    return {
      success: true,
      mode: 'json',
      docType,
      targetYm: ymList[0],
      targetYms: ymList,
      targetDir: lastTargetDir,
      count: allItems.length,
      siteCount: sites.length,
      files: allItems.map((item) => ({
        name: item.name,
        ym: item.ym,
        mimeType: item.mimeType,
        size: item.size,
        base64: item.buffer.toString('base64'),
      })),
    };
  }

  if (ymList.length === 1 && allItems.length === 1 && (sites.length === 1 || format === 'single')) {
    const single = allItems[0];
    return {
      success: true,
      mode: 'single',
      fileName: single.name,
      mimeType: single.mimeType,
      buffer: single.buffer,
      targetDir: lastTargetDir,
    };
  }

  const zip = new JSZip();
  for (const item of allItems) {
    const folderInZip = `${docFolder}_${item.ym}`;
    zip.file(`${folderInZip}/${item.name}`, item.buffer);
  }
  const zipBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  const siteSuffix = sites.length === 1
    ? String(sites[0]).replace(/[\\/:*?"<>|]/g, '_')
    : sites.length > 1
      ? `${sites.length}개현장`
      : `${allItems.length}건`;
  const ymFileSegment = ymList.length === 1
    ? ymList[0]
    : `${ymList[0]}_${ymList[ymList.length - 1]}`;
  const archiveName = `${docFolder}_${ymFileSegment}_${siteSuffix}.zip`;

  return {
    success: true,
    mode: 'zip',
    archiveName,
    mimeType: 'application/zip',
    buffer: zipBuffer,
    targetDir: lastTargetDir,
    fileCount: allItems.length,
    siteCount: sites.length,
    monthCount: ymList.length,
  };
}

module.exports = {
  getDesktopDirectories,
  expandYmRange,
  collectSettlementFiles,
  downloadSettlementDocs,
  extractSiteMatchTokens,
  doesFileMatchSite,
  matchesAnySite,
  matchesDocType,
};
