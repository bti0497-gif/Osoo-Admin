'use strict';

/**
 * settlementDocDownloadService.cjs
 * =====================================================================
 * 계산서·입금표 Drive 및 로컬 점검준비 폴더 월별·현장별 선택 다운로드 서비스
 * - 1개 현장 개별 다운로드 및 로컬 점검준비 폴더 자동 저장 지원
 * - 2개 이상 현장 JSZip 압축 다운로드 지원
 * - 방향별 현장명(서울/부산/상행/하행) 정밀 매칭 지원
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

function extractSiteMatchTokens(siteInput) {
  const name = typeof siteInput === 'string'
    ? siteInput
    : (siteInput?.name || siteInput?.site_name || siteInput?.shortName || siteInput?.id || '');
  if (!name) return null;

  const raw = String(name).trim();
  let direction = '';
  if (/서울/i.test(raw)) direction = '서울';
  else if (/부산/i.test(raw)) direction = '부산';
  else if (/상행/i.test(raw)) direction = '상행';
  else if (/하행/i.test(raw)) direction = '하행';
  else if (/순천/i.test(raw)) direction = '순천';
  else if (/춘천/i.test(raw)) direction = '춘천';
  else if (/양양/i.test(raw)) direction = '양양';

  const stem = raw
    .replace(/[\s\-_/()（）\[\]]/g, '')
    .replace(/휴게소/g, '')
    .replace(/방향/g, '')
    .replace(/서울|부산|상행|하행|순천|춘천|양양/g, '');

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
    const oppDirections = {
      '서울': ['부산'],
      '부산': ['서울'],
      '상행': ['하행'],
      '하행': ['상행'],
    };
    const opposites = oppDirections[tokens.direction] || [];
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
  const normalizedYm = String(targetYm || '').replace(/[^0-9]/g, '');
  if (!/^\d{6}$/.test(normalizedYm)) {
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

async function downloadSettlementDocs({ docType = 'invoice', targetYm, sites = [], format = 'auto' }) {
  const { items, targetDir, targetYm: ym, docType: dt, docFolder } = await collectSettlementFiles({
    docType,
    targetYm,
    sites,
  });

  if (items.length === 0) {
    const docLabel = dt === 'deposit' ? '입금표' : '계산서';
    const siteMsg = sites.length > 0 ? `선택한 ${sites.length}개 현장의 ` : '';
    return {
      success: false,
      error: `해당 연월(${ym})에 ${siteMsg}${docLabel} 파일을 찾을 수 없습니다.`,
      targetDir,
    };
  }

  if (format === 'json') {
    return {
      success: true,
      mode: 'json',
      docType: dt,
      targetYm: ym,
      targetDir,
      count: items.length,
      siteCount: sites.length,
      files: items.map((item) => ({
        name: item.name,
        mimeType: item.mimeType,
        size: item.size,
        base64: item.buffer.toString('base64'),
      })),
    };
  }

  if (items.length === 1 && (sites.length === 1 || format === 'single')) {
    const single = items[0];
    return {
      success: true,
      mode: 'single',
      fileName: single.name,
      mimeType: single.mimeType,
      buffer: single.buffer,
      targetDir,
    };
  }

  const zip = new JSZip();
  const folderInZip = `${docFolder}_${ym}`;
  for (const item of items) {
    zip.file(`${folderInZip}/${item.name}`, item.buffer);
  }
  const zipBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  const siteSuffix = sites.length > 0 ? `${sites.length}개현장` : `${items.length}건`;
  const archiveName = `${docFolder}_${ym}_${siteSuffix}.zip`;

  return {
    success: true,
    mode: 'zip',
    archiveName,
    mimeType: 'application/zip',
    buffer: zipBuffer,
    targetDir,
    fileCount: items.length,
    siteCount: sites.length,
  };
}

module.exports = {
  getDesktopDirectories,
  collectSettlementFiles,
  downloadSettlementDocs,
  extractSiteMatchTokens,
  doesFileMatchSite,
  matchesAnySite,
  matchesDocType,
};
