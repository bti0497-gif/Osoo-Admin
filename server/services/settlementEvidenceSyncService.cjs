'use strict';

/**
 * settlementEvidenceSyncService.cjs
 * =====================================================================
 * 정산 증빙자료(계산서, 명세서, 입금표, 성적서/MLSS, 현장사진) 통합 동기화 서비스
 *
 * [핵심 원칙]
 * 1. 로컬 바탕화면(점검준비/월정산/월별마감자료)에 파일이 이미 있으면 로컬 우선 사용
 * 2. 로컬에 없으면 Google Drive에서 해당 월(YYYYMM/YYYY-MM) 및 현장 증빙을 자동 검색·다운로드
 * 3. Drive에도 파일이 없으면 에러를 발생시키지 않고 빈 상태(SKIP/템플릿 유지)로 안전하게 진행
 * 4. 모든 중앙관리자 PC에서 일관되게 동작하도록 보장
 * =====================================================================
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const {
  drive,
  isDriveConfigured,
  getSingleSettlementRootFolder,
  findFolderInParent,
  listFilesFolder,
  downloadDriveFileBuffer,
} = require('./driveService.cjs');

const DIRECTION_KEYWORDS = [
  '서울', '부산', '상행', '하행', '순천', '춘천', '양양',
  '목포', '창원', '양평', '상주', '울산', '평택', '포항', '인천', '대전', '강릉', '제천',
];

const OPPOSITE_DIRECTIONS = {
  서울: ['부산', '목포', '순천', '창원'],
  부산: ['서울', '춘천', '양평', '인천'],
  춘천: ['부산'],
  양양: ['서울', '인천'],
  목포: ['서울'],
  창원: ['양평', '서울'],
  양평: ['창원', '부산'],
  상행: ['하행'],
  하행: ['상행'],
  강릉: ['인천'],
  인천: ['강릉', '부산'],
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

function getPrimaryDesktop() {
  return getDesktopDirectories()[0];
}

function parseSiteTokens(siteInput) {
  const raw = typeof siteInput === 'string'
    ? siteInput
    : (siteInput?.name || siteInput?.site_name || siteInput?.shortName || siteInput?.id || '');
  if (!raw) return { raw: '', stem: '', direction: '' };

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

function matchesSiteAndDirection(fileName, siteTokens) {
  if (!siteTokens || !siteTokens.stem) return true;
  const lower = fileName.toLowerCase().replace(/[\s\-_/()（）\[\]]/g, '');
  const stemLower = siteTokens.stem.toLowerCase();
  if (!lower.includes(stemLower)) return false;

  if (siteTokens.direction) {
    const opposites = OPPOSITE_DIRECTIONS[siteTokens.direction] || [];
    for (const opp of opposites) {
      if (lower.includes(opp.toLowerCase())) return false;
    }
  }
  return true;
}

function matchesMonth(fileName, targetYm, year, month) {
  const name = String(fileName || '');
  const mm = String(month).padStart(2, '0');
  const patterns = [
    targetYm,                  // 202610
    `${year}-${mm}`,           // 2026-10
    `${year}.${mm}`,           // 2026.10
    `${year}_${mm}`,           // 2026_10
  ];
  return patterns.some(p => name.includes(p));
}

async function safeDownloadFile(fileId, targetPath) {
  try {
    if (fs.existsSync(targetPath)) {
      const stat = fs.statSync(targetPath);
      if (stat.size > 0) return targetPath;
    }
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    const buffer = await downloadDriveFileBuffer(fileId);
    fs.writeFileSync(targetPath, buffer);
    console.log(`[evidenceSync] Drive 파일 다운로드 완료: ${path.basename(targetPath)} (${buffer.length} bytes)`);
    return targetPath;
  } catch (err) {
    console.warn(`[evidenceSync] 파일 다운로드 실패 (${path.basename(targetPath)}):`, err.message);
    return null;
  }
}

/**
 * 현장별/연월별 정산 증빙 일괄 자동 동기화
 */
async function ensureSettlementEvidence({ siteName, year, month, targetYm: explicitYm }) {
  const numYear = Number(year) || new Date().getFullYear();
  const numMonth = Number(month) || (new Date().getMonth() + 1);
  const targetYm = explicitYm || `${numYear}${String(numMonth).padStart(2, '0')}`;
  const siteTokens = parseSiteTokens(siteName);

  const desktopDirs = getDesktopDirectories();
  const primaryDesktop = desktopDirs[0];

  // 로컬 대상 디렉토리 설정
  const localDirs = {
    invoice: path.join(primaryDesktop, '점검준비', '계산서', targetYm),
    deposit: path.join(primaryDesktop, '점검준비', '입금표', targetYm),
    statement: path.join(primaryDesktop, '점검준비', '명세서', targetYm),
    cheongjuStatement: path.join(primaryDesktop, '수정본', '월별마감자료', targetYm, '6_명세서'),
    cert: path.join(primaryDesktop, '점검준비', '성적서', targetYm),
    photo: path.join(primaryDesktop, '월정산', `${siteTokens.stem || '현장'}마감자료`, targetYm),
  };

  Object.values(localDirs).forEach((dir) => {
    try { fs.mkdirSync(dir, { recursive: true }); } catch (_) {}
  });

  if (!isDriveConfigured() || !drive) {
    console.log('[evidenceSync] Drive 미연동 상태: 로컬 파일만 사용합니다.');
    return { targetYm, siteName, syncedCount: 0 };
  }

  console.log(`[evidenceSync] [${siteName || '전체'}] ${targetYm} 증빙 동기화 검사 시작...`);
  let syncedCount = 0;

  try {
    // 1. Google Drive '월정산/YYYYMM' 폴더 확인 (계산서, 매출계산서, 입금표, 명세서)
    try {
      const monthlyRoot = await getSingleSettlementRootFolder();
      if (monthlyRoot?.id) {
        const monthlyFolder = await findFolderInParent(monthlyRoot.id, targetYm);
        if (monthlyFolder?.id) {
          const files = (await listFilesFolder(monthlyFolder.id))
            .filter((f) => f.mimeType !== 'application/vnd.google-apps.folder');

          for (const f of files) {
            if (!matchesSiteAndDirection(f.name, siteTokens)) continue;

            const isDeposit = f.name.includes('입금표') || f.name.includes('입금증');
            const isStatement = f.name.includes('명세서') || f.name.includes('거래명세서');
            const isInvoice = f.name.includes('계산서') || f.name.includes('매출');

            if (isDeposit) {
              const res = await safeDownloadFile(f.id, path.join(localDirs.deposit, f.name));
              if (res) syncedCount++;
            } else if (isStatement) {
              const res1 = await safeDownloadFile(f.id, path.join(localDirs.statement, f.name));
              const res2 = await safeDownloadFile(f.id, path.join(localDirs.cheongjuStatement, f.name));
              if (res1 || res2) syncedCount++;
            } else if (isInvoice) {
              const res = await safeDownloadFile(f.id, path.join(localDirs.invoice, f.name));
              if (res) syncedCount++;
            }
          }
        }
      }
    } catch (folderErr) {
      console.warn('[evidenceSync] 월정산 폴더 동기화 경고:', folderErr.message);
    }

    // 2. Google Drive 파일 검색 쿼리 (현장 키워드 기반 일괄 탐색)
    if (siteTokens.stem) {
      const query = `name contains '${siteTokens.stem}' and trashed = false`;
      const searchRes = await drive.files.list({
        q: query,
        fields: 'files(id, name, mimeType, size)',
        pageSize: 150,
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
      });

      const matchedFiles = (searchRes.data.files || []).filter((f) => {
        if (!matchesSiteAndDirection(f.name, siteTokens)) return false;
        return matchesMonth(f.name, targetYm, numYear, numMonth);
      });

      for (const f of matchedFiles) {
        const isCert = f.name.includes('성적서') || f.name.includes('mlss') || f.name.includes('시험성적서');
        const isDeposit = f.name.includes('입금표') || f.name.includes('입금증');
        const isStatement = f.name.includes('명세서') || f.name.includes('거래명세서');
        const isInvoice = f.name.includes('계산서') || f.name.includes('매출');

        if (isCert) {
          const res = await safeDownloadFile(f.id, path.join(localDirs.cert, f.name));
          if (res) syncedCount++;
        } else if (isDeposit) {
          const res = await safeDownloadFile(f.id, path.join(localDirs.deposit, f.name));
          if (res) syncedCount++;
        } else if (isStatement) {
          const res1 = await safeDownloadFile(f.id, path.join(localDirs.statement, f.name));
          const res2 = await safeDownloadFile(f.id, path.join(localDirs.cheongjuStatement, f.name));
          if (res1 || res2) syncedCount++;
        } else if (isInvoice) {
          const res = await safeDownloadFile(f.id, path.join(localDirs.invoice, f.name));
          if (res) syncedCount++;
        }
      }
    }

    console.log(`[evidenceSync] [${siteName || '전체'}] ${targetYm} 동기화 완료: ${syncedCount}개 파일 처리됨`);
  } catch (err) {
    console.warn(`[evidenceSync] 동기화 중 오류 (로컬 파일로 계속 진행):`, err.message);
  }

  return { targetYm, siteName, syncedCount };
}

module.exports = {
  ensureSettlementEvidence,
  getDesktopDirectories,
  getPrimaryDesktop,
  parseSiteTokens,
  matchesSiteAndDirection,
};
