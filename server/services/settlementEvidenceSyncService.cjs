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
  const m = String(month);
  const patterns = [
    targetYm,                  // 202610
    `${year}-${mm}`,           // 2026-10
    `${year}.${mm}`,           // 2026.10
    `${year}_${mm}`,           // 2026_10
    `${year}년 ${mm}월`,
    `${year}년${mm}월`,
    `${year}년 ${m}월`,
    `${year}년${m}월`,
    `${year}. ${mm}`,
    `${year}. ${m}`,
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

function safeCopyFile(sourcePath, targetPath) {
  if (!sourcePath || !fs.existsSync(sourcePath)) return null;
  try {
    if (fs.existsSync(targetPath)) {
      const stat = fs.statSync(targetPath);
      if (stat.size > 0) return targetPath;
    }
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.copyFileSync(sourcePath, targetPath);
    return targetPath;
  } catch (err) {
    console.warn(`[evidenceSync] 로컬 파일 복사 실패 (${path.basename(targetPath)}):`, err.message);
    return null;
  }
}

const GENERAL_PHOTO_KEYWORDS = [
  '슬러지', '반출', '청소', '필증', '약품', '입고',
  '포도당', '중탄산', '차염', '응집제', 'pac', '키트',
];
const TEST_PHOTO_KEYWORDS = ['수질분석', '실험', '수질측정'];

/**
 * 수질분석 사진 중 가장 빠른 날짜 1일치(1회분, 최대 4종) 선별
 */
function selectEarliestTestPhotos(candidateFiles) {
  if (!candidateFiles || candidateFiles.length === 0) return [];

  // 파일명에서 날짜 추출 (YYYY-MM-DD 또는 YYYYMMDD 또는 YYYY.MM.DD)
  const withDate = candidateFiles.map((f) => {
    const m = f.name.match(/(20\d{2}[-._]?\d{2}[-._]?\d{2})/);
    const dateStr = m ? m[1].replace(/[-._]/g, '-') : null;
    return { ...f, dateStr };
  }).filter((f) => Boolean(f.dateStr));

  if (withDate.length === 0) return [];

  // 날짜 오름차순 정렬 후 가장 빠른 날짜(1일치) 선택
  const dates = Array.from(new Set(withDate.map((f) => f.dateStr))).sort();
  const earliestDate = dates[0];
  const firstDayFiles = withDate.filter((f) => f.dateStr === earliestDate);

  // 4대 수질 항목 키워드
  const ITEM_KEYWORDS = [
    '알칼리도',
    '암모니아',
    '오르토인산염',
    '질산성',
    '질산',
    '인산염',
    'mlss',
    'ph',
    '탁도',
  ];

  const selectedMap = new Map();
  const fallbackList = [];

  for (const f of firstDayFiles) {
    const lower = f.name.toLowerCase();
    const matchedItem = ITEM_KEYWORDS.find((kw) => lower.includes(kw));

    if (matchedItem) {
      // _2.jpg, 2.jpg, (1).jpg 등 중복 촬영본 판별
      const isDuplicateNum = /(?:_?2|\(1\))\.(?:jpe?g|png)$/i.test(f.name);
      if (!selectedMap.has(matchedItem)) {
        selectedMap.set(matchedItem, f);
      } else if (!isDuplicateNum && /(?:_?2|\(1\))\.(?:jpe?g|png)$/i.test(selectedMap.get(matchedItem).name)) {
        // 기존에 2번 중복본이 등록되어 있었다면 1번 원본으로 교체
        selectedMap.set(matchedItem, f);
      }
    } else {
      fallbackList.push(f);
    }
  }

  const selected = Array.from(selectedMap.values());
  // 4대 항목 외 사진이 있고 4장 미만인 경우 보충 (중복 제외)
  if (selected.length < 4) {
    for (const fb of fallbackList) {
      if (selected.length >= 4) break;
      if (!/(?:_?2|\(1\))\.(?:jpe?g|png)$/i.test(fb.name)) {
        selected.push(fb);
      }
    }
  }

  return selected;
}

/**
 * 선별된 1일치 수질사진 외의 불필요한 과거 수질사진 정리
 */
function cleanupExtraneousTestPhotos(dirPath, allowedFileNames) {
  if (!fs.existsSync(dirPath)) return;
  try {
    const entries = fs.readdirSync(dirPath);
    for (const name of entries) {
      const fullPath = path.join(dirPath, name);
      if (!fs.statSync(fullPath).isFile()) continue;
      if (name.includes('수질분석') || name.includes('실험') || name.includes('수질측정')) {
        if (!allowedFileNames.has(name)) {
          try {
            fs.unlinkSync(fullPath);
          } catch (_) {}
        }
      }
    }
  } catch (_) {}
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
    settlementPhoto: path.join(primaryDesktop, '점검준비', '정산서', targetYm),
    photoTest: path.join(primaryDesktop, '월정산', `${siteTokens.stem || '현장'}마감자료`, targetYm, '1_실험사진'),
    photoSludge: path.join(primaryDesktop, '월정산', `${siteTokens.stem || '현장'}마감자료`, targetYm, '2_슬러지사진'),
    photoClean: path.join(primaryDesktop, '월정산', `${siteTokens.stem || '현장'}마감자료`, targetYm, '3_청소필증'),
    photoChemical: path.join(primaryDesktop, '월정산', `${siteTokens.stem || '현장'}마감자료`, targetYm, '4_약품입고'),
    photoKit: path.join(primaryDesktop, '월정산', `${siteTokens.stem || '현장'}마감자료`, targetYm, '5_키트입고'),
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
  const waterAnalysisCandidates = [];

  async function processEvidenceDriveFile(f) {
    const lowerName = f.name.toLowerCase();
    const isCert = lowerName.includes('성적서') || lowerName.includes('mlss') || lowerName.includes('시험성적서');
    const isDeposit = lowerName.includes('입금표') || lowerName.includes('입금증');
    const isStatement = lowerName.includes('명세서') || lowerName.includes('거래명세서');
    const isInvoice = lowerName.includes('계산서') || lowerName.includes('매출');

    const isImage = (f.mimeType && f.mimeType.startsWith('image/')) || /\.(jpe?g|png|gif|bmp|webp|heic)$/i.test(f.name);
    const isWaterAnalysis = TEST_PHOTO_KEYWORDS.some((kw) => lowerName.includes(kw));

    let processed = false;

    if (isCert) {
      const res = await safeDownloadFile(f.id, path.join(localDirs.cert, f.name));
      if (res) processed = true;
    } else if (isDeposit) {
      const res = await safeDownloadFile(f.id, path.join(localDirs.deposit, f.name));
      if (res) processed = true;
    } else if (isStatement) {
      const res1 = await safeDownloadFile(f.id, path.join(localDirs.statement, f.name));
      const res2 = await safeDownloadFile(f.id, path.join(localDirs.cheongjuStatement, f.name));
      if (res1 || res2) processed = true;
    } else if (isInvoice) {
      const res = await safeDownloadFile(f.id, path.join(localDirs.invoice, f.name));
      if (res) processed = true;
    } else if (isImage && isWaterAnalysis) {
      // 수질분석/실험 사진은 즉시 다운로드하지 않고 후보군에 수집 (가장 빠른 1일치 선별용)
      waterAnalysisCandidates.push(f);
    } else if (isImage && GENERAL_PHOTO_KEYWORDS.some((kw) => lowerName.includes(kw))) {
      // 일반 현장 사진 다운로드
      const mainPhotoPath = path.join(localDirs.photo, f.name);
      const resMain = await safeDownloadFile(f.id, mainPhotoPath);
      if (resMain) {
        processed = true;
        safeCopyFile(resMain, path.join(localDirs.settlementPhoto, f.name));

        // 슬러지/반출 관련 파일 -> 2_슬러지사진
        if (lowerName.includes('슬러지') || lowerName.includes('반출')) {
          safeCopyFile(resMain, path.join(localDirs.photoSludge, f.name));
        }

        // 청소/필증 관련 파일 -> 3_청소필증
        if (lowerName.includes('청소') || lowerName.includes('필증')) {
          safeCopyFile(resMain, path.join(localDirs.photoClean, f.name));
        }

        // 약품/입고/포도당/중탄산/차염/응집제/pac 관련 파일 -> 4_약품입고
        if (['약품', '입고', '포도당', '중탄산', '차염', '응집제', 'pac'].some((kw) => lowerName.includes(kw))) {
          safeCopyFile(resMain, path.join(localDirs.photoChemical, f.name));
        }

        // 키트입고 관련 파일 -> 5_키트입고
        if (lowerName.includes('키트')) {
          safeCopyFile(resMain, path.join(localDirs.photoKit, f.name));
        }
      }
    }

    return processed;
  }

  try {
    // 1. Google Drive '월정산/YYYYMM' 폴더 확인 (계산서, 매출계산서, 입금표, 명세서, 사진)
    try {
      const monthlyRoot = await getSingleSettlementRootFolder();
      if (monthlyRoot?.id) {
        const monthlyFolder = await findFolderInParent(monthlyRoot.id, targetYm);
        if (monthlyFolder?.id) {
          const files = (await listFilesFolder(monthlyFolder.id))
            .filter((f) => f.mimeType !== 'application/vnd.google-apps.folder');

          for (const f of files) {
            if (!matchesSiteAndDirection(f.name, siteTokens)) continue;
            const ok = await processEvidenceDriveFile(f);
            if (ok) syncedCount++;
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
        if (f.mimeType === 'application/vnd.google-apps.folder') return false;
        if (!matchesSiteAndDirection(f.name, siteTokens)) return false;
        return matchesMonth(f.name, targetYm, numYear, numMonth);
      });

      for (const f of matchedFiles) {
        const ok = await processEvidenceDriveFile(f);
        if (ok) syncedCount++;
      }
    }

    // 3. 수질분석 사진 처리: 가장 빠른 날짜 1일치(1회분, 최대 4종)만 선별 다운로드
    if (waterAnalysisCandidates.length > 0) {
      const uniqueCandidates = Array.from(new Map(waterAnalysisCandidates.map((f) => [f.id, f])).values());
      const selectedTestFiles = selectEarliestTestPhotos(uniqueCandidates);
      console.log(`[evidenceSync] [${siteName || '전체'}] 수질분석 후보 ${uniqueCandidates.length}개 중 가장 빠른 1일치 ${selectedTestFiles.length}개 선별 완료`);

      const allowedNames = new Set(selectedTestFiles.map((f) => f.name));

      for (const f of selectedTestFiles) {
        const testSubPath = path.join(localDirs.photoTest, f.name);
        const resTest = await safeDownloadFile(f.id, testSubPath);
        if (resTest) {
          syncedCount++;
          // 기존 서비스 호환을 위해 localDirs.photo 루트 및 settlementPhoto 에도 1회분만 복사
          safeCopyFile(resTest, path.join(localDirs.photo, f.name));
          safeCopyFile(resTest, path.join(localDirs.settlementPhoto, f.name));
        }
      }

      // 혹시 로컬 폴더에 이전에 다운로드되었던 다른 날짜의 수질분석 사진이 있다면 1회분만 남기고 정리
      cleanupExtraneousTestPhotos(localDirs.photo, allowedNames);
      cleanupExtraneousTestPhotos(localDirs.settlementPhoto, allowedNames);
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
  safeCopyFile,
  selectEarliestTestPhotos,
};
