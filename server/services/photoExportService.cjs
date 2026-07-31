'use strict';

/**
 * photoExportService.cjs
 * =====================================================================
 * 현장별 월정산 사진 (실험사진 4장, 슬러지사진, 청소필증, 약품입고사진, 키트입고사진)
 * 조회 및 로컬 폴더 일괄 다운로드 서비스
 */

const path = require('path');
const fs = require('fs');
const {
  isDriveConfigured,
  getDriveRootFolderId,
  getOrCreateFolderPath,
  listFilesFolder,
  downloadDriveFileBuffer,
} = require('./driveService.cjs');
const {
  waterAnalysisPhotoSegments,
  medicinePhotoSegments,
  sludgePhotoSegments,
} = require('./drivePathService.cjs');

const BASE_MEDICINES = ['포도당', '중탄산나트륨', '팩(PAC)'];
const BASE_KITS = ['암모니아성질소', 'NH3-N', '질산성질소', 'NO3-N', '인산염인', 'PO4-P', '알칼리도', 'ALK'];
const TARGET_TEST_ITEMS = ['암모니아성 질소', '질산성 질소', '오르토 인산염', '알칼리도'];

function sanitizeName(name) {
  return String(name || '').replace(/[\\/:*?"<>|]/g, '_').trim();
}

function normalizeDateStr(dateValue) {
  const s = String(dateValue || '').replace(/[._]/g, '-').trim();
  const m = s.match(/^(\d{4})-?(\d{2})-?(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return '';
}

/**
 * 특정 현장 및 연월의 사진 보유 현황(미리보기) 조회
 */
async function getMonthlyPhotoSummary({ siteName, year, month, appDataPath }) {
  const yyyy = String(year);
  const mm = String(month).padStart(2, '0');
  const yearMonth = `${yyyy}-${mm}`;

  const summary = {
    siteName,
    yearMonth,
    testPhotos: { date: null, count: 0, files: [] },
    sludgePhotos: { count: 0, files: [] },
    cleaningCertificates: { count: 0, files: [] },
    medicineInPhotos: { count: 0, files: [] },
    kitInPhotos: { count: 0, files: [] },
  };

  const fileMap = new Map();

  function addFile(category, item) {
    const key = `${category}:${item.name}:${item.date || ''}`;
    if (!fileMap.has(key)) {
      fileMap.set(key, item);
    }
  }

  // 1. 로컬 appData 스캔
  scanLocalAppData(appDataPath, yyyy, mm, addFile);

  // 2. Google Drive 스캔 (설정된 경우)
  if (isDriveConfigured()) {
    try {
      await scanGoogleDrive(siteName, yyyy, mm, addFile);
    } catch (err) {
      console.warn('[photoExportService] Drive 스캔 경고:', err.message);
    }
  }

  // 3. 수집된 파일들을 카테고리별로 정렬 및 구성
  const allFiles = Array.from(fileMap.values());

  // (1) 수질 분석/실험 사진: 가장 빠른 날짜 1일치 (최대 4종 항목)
  const testCandidates = allFiles.filter((f) => f.category === 'testPhoto');
  if (testCandidates.length > 0) {
    const dates = Array.from(new Set(testCandidates.map((f) => f.date).filter(Boolean))).sort();
    const earliestDate = dates[0];
    if (earliestDate) {
      const firstDayFiles = testCandidates.filter((f) => f.date === earliestDate);
      summary.testPhotos = {
        date: earliestDate,
        count: firstDayFiles.length,
        files: firstDayFiles,
      };
    }
  }

  // (2) 슬러지 사진
  const sludgeFiles = allFiles.filter((f) => f.category === 'sludge');
  summary.sludgePhotos = {
    count: sludgeFiles.length,
    files: sludgeFiles,
  };

  // (3) 청소필증
  const certFiles = allFiles.filter((f) => f.category === 'cleaningCertificate');
  summary.cleaningCertificates = {
    count: certFiles.length,
    files: certFiles,
  };

  // (4) 약품입고 사진 & (5) 키트입고 사진
  const medInFiles = allFiles.filter((f) => f.category === 'medicineIn');
  const kitInFiles = allFiles.filter((f) => f.category === 'kitIn');

  summary.medicineInPhotos = { count: medInFiles.length, files: medInFiles };
  summary.kitInPhotos = { count: kitInFiles.length, files: kitInFiles };

  return summary;
}

/**
 * 로컬 appData 디렉토리 스캔
 */
function scanLocalAppData(appDataPath, yyyy, mm, addFile) {
  if (!appDataPath) return;

  // (A) 수질분석 실험사진
  const testRoot = path.join(appDataPath, '사진관리', '수질분석');
  if (fs.existsSync(testRoot)) {
    try {
      const yearDir = path.join(testRoot, yyyy);
      if (fs.existsSync(yearDir)) {
        const files = fs.readdirSync(yearDir);
        for (const file of files) {
          const ext = path.extname(file).toLowerCase();
          if (!['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) continue;
          const match = file.match(/^(\d{4}-\d{2}-\d{2})-(.+)$/);
          if (match) {
            const date = match[1];
            if (date.startsWith(`${yyyy}-${mm}`)) {
              addFile('testPhoto', {
                category: 'testPhoto',
                name: file,
                date,
                localPath: path.join(yearDir, file),
                driveFileId: null,
              });
            }
          }
        }
      }
    } catch (_) {}
  }

  // (B) 슬러지사진 & 청소필증
  const sludgeRoot = path.join(appDataPath, '사진관리', '슬러지', yyyy);
  if (fs.existsSync(sludgeRoot)) {
    try {
      const files = fs.readdirSync(sludgeRoot);
      for (const file of files) {
        const ext = path.extname(file).toLowerCase();
        if (!['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) continue;
        const stem = path.basename(file, ext);
        const match = stem.match(/^(\d{8}|\d{4}-\d{2}-\d{2})-(.+)$/);
        if (match) {
          const rawDate = match[1];
          const date = normalizeDateStr(rawDate);
          if (date.startsWith(`${yyyy}-${mm}`)) {
            const isCert = stem.includes('청소필증');
            addFile(isCert ? 'cleaningCertificate' : 'sludge', {
              category: isCert ? 'cleaningCertificate' : 'sludge',
              name: file,
              date,
              localPath: path.join(sludgeRoot, file),
              driveFileId: null,
            });
          }
        }
      }
    } catch (_) {}
  }

  // (C) 약품입고 & 키트입고 사진
  const medRoot = path.join(appDataPath, '사진관리', '약품입고', yyyy);
  if (fs.existsSync(medRoot)) {
    try {
      const files = fs.readdirSync(medRoot);
      for (const file of files) {
        const ext = path.extname(file).toLowerCase();
        if (!['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) continue;
        const stem = path.basename(file, ext);
        let m = stem.match(/^(\d{8}|\d{4}-\d{2}-\d{2})[\+-](.+)$/);
        if (m) {
          const date = normalizeDateStr(m[1]);
          if (date.startsWith(`${yyyy}-${mm}`)) {
            const itemName = m[2];
            const isKit = BASE_KITS.some((k) => itemName.includes(k));
            const cat = isKit ? 'kitIn' : 'medicineIn';
            addFile(cat, {
              category: cat,
              name: file,
              date,
              itemName,
              localPath: path.join(medRoot, file),
              driveFileId: null,
            });
          }
        }
      }
    } catch (_) {}
  }
}

function parseSiteInfo(siteName) {
  const name = String(siteName || '').trim();
  const match = name.match(/^([^(]+)(?:\(([^)]+)\))?/);
  const baseName = match && match[1] ? match[1].replace(/휴게소|처리장|사업소|하수|정수/g, '').trim() : name;
  const direction = match && match[2] ? match[2].replace(/방향/g, '').trim() : '';
  return { fullName: name, baseName, direction };
}

function matchesSiteFile(fileName, siteInfo) {
  if (!fileName || !siteInfo.baseName) return false;
  if (!fileName.includes(siteInfo.baseName)) return false;

  // 방향 정보가 있는 현장 (예: 제천방향, 평택방향, 부산방향, 서울방향 등)
  if (siteInfo.direction) {
    const dirMatch = fileName.match(/\(([^)]+)\)/) || fileName.match(/_([^_()]+방향)/);
    if (dirMatch) {
      const fileDir = dirMatch[1].replace(/방향/g, '').trim();
      if (fileDir && fileDir !== siteInfo.direction) {
        // 서로 다른 방향 파일인 경우 제외
        const commonDirs = ['평택', '제천', '부산', '서울', '양양', '상주', '포항', '춘천', '광주', '대구', '대전', '인천'];
        if (commonDirs.includes(fileDir) || commonDirs.includes(siteInfo.direction)) {
          return false;
        }
      }
    }
  }
  return true;
}

/**
 * Google Drive 구조 초고속 스캔
 */
async function scanGoogleDrive(siteName, yyyy, mm, addFile) {
  const { drive } = require('./driveService.cjs');
  if (!drive) return;

  const siteInfo = parseSiteInfo(siteName);
  if (!siteInfo.baseName) return;

  try {
    // 1) '관리사진' 루트 폴더 탐색
    const qFolder = "name = '관리사진' and mimeType = 'application/vnd.google-apps.folder' and trashed = false";
    const folderRes = await drive.files.list({ q: qFolder, fields: 'files(id, name)' });
    const photoRootFolder = folderRes.data.files[0];
    if (!photoRootFolder) return;

    // 2) 관리사진 / YYYY / MM 폴더 탐색
    const yyyyFolderRes = await drive.files.list({
      q: `'${photoRootFolder.id}' in parents and name = '${yyyy}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      fields: 'files(id, name)',
    });
    const yearFolder = yyyyFolderRes.data.files[0];
    if (!yearFolder) return;

    const mmFolderRes = await drive.files.list({
      q: `'${yearFolder.id}' in parents and (name = '${mm}' or name = '${String(Number(mm))}') and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      fields: 'files(id, name)',
    });
    const monthFolder = mmFolderRes.data.files[0];
    if (!monthFolder) return;

    // 3) 해당 연월 폴더 내 모든 파일 리스팅 (단 1회의 쿼리)
    const filesRes = await drive.files.list({
      q: `'${monthFolder.id}' in parents and trashed = false`,
      fields: 'files(id, name, mimeType)',
      pageSize: 1000,
    });

    const allFiles = filesRes.data.files || [];

    // 4) 현장 키워드가 포함된 파일 피터링 및 카테고리 자동 분류
    for (const f of allFiles) {
      if (!f.name || !matchesSiteFile(f.name, siteInfo)) continue;

      const ext = path.extname(f.name).toLowerCase();
      if (!['.jpg', '.jpeg', '.png', '.webp'].includes(ext) && !f.mimeType?.startsWith('image/')) continue;

      // 날짜 추출 (YYYY-MM-DD)
      const dateMatch = f.name.match(/(\d{4}-\d{2}-\d{2})/);
      const dateStr = dateMatch ? dateMatch[1] : `${yyyy}-${mm}-01`;

      let category = 'testPhoto';
      if (f.name.includes('수질분석') || f.name.includes('실험')) {
        category = 'testPhoto';
      } else if (f.name.includes('슬러지')) {
        category = 'sludge';
      } else if (f.name.includes('청소필증')) {
        category = 'cleaningCertificate';
      } else if (f.name.includes('키트입고') || f.name.includes('키트사진') || (f.name.includes('키트') && !f.name.includes('수질분석'))) {
        category = 'kitIn';
      } else if (f.name.includes('약품') || f.name.includes('거래명세서') || (BASE_MEDICINES.some((m) => f.name.includes(m)) && !f.name.includes('수질분석'))) {
        category = 'medicineIn';
      }

      addFile(category, {
        category,
        name: f.name,
        date: dateStr,
        localPath: null,
        driveFileId: f.id,
      });
    }
  } catch (err) {
    console.warn('[photoExportService] scanGoogleDrive 오류:', err.message);
  }
}

const os = require('os');

function getDesktopPath() {
  const home = os.homedir();
  const candidates = [
    path.join(home, 'OneDrive', '바탕 화면'),
    path.join(home, 'OneDrive', 'Desktop'),
    path.join(home, '바탕 화면'),
    path.join(home, 'Desktop'),
  ];
  for (const cand of candidates) {
    if (fs.existsSync(cand)) return cand;
  }
  return path.join(home, 'Desktop');
}

/**
 * 일괄 다운로드 실행 (지정된 targetDirectory 또는 바탕화면 내에 서브 폴더 구성 및 저장)
 */
function getDesktopPath() {
  const home = require('os').homedir();
  const candidates = [
    path.join(home, 'OneDrive', '바탕 화면'),
    path.join(home, 'OneDrive', 'Desktop'),
    path.join(home, 'OneDrive - Personal', '바탕 화면'),
    path.join(home, 'OneDrive - Personal', 'Desktop'),
    path.join(home, '바탕 화면'),
    path.join(home, 'Desktop'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return path.join(home, 'Desktop');
}

async function executeBatchDownload({ siteName, year, month, selectedCategories = [], targetDirectory, appDataPath }) {
  const saveTargetDir = targetDirectory && fs.existsSync(targetDirectory)
    ? targetDirectory
    : getDesktopPath();

  if (!fs.existsSync(saveTargetDir)) {
    fs.mkdirSync(saveTargetDir, { recursive: true });
  }

  const yyyy = String(year);
  const mm = String(month).padStart(2, '0');

  // 1. 전체 데이터 수집
  const summary = await getMonthlyPhotoSummary({ siteName, year, month, appDataPath });

  // 2. 최상위 수집 폴더 생성: {saveTargetDir}/{siteName}_{YYYY}년{MM}월_사진모음/
  //    같은 폴더가 이미 존재하면 (1), (2) ... 번호를 붙여 새 폴더를 생성하여
  //    기존 폴더의 중요 파일이 손실되지 않도록 보호
  const baseNameRaw = `${sanitizeName(siteName)}_${yyyy}년${mm}월_사진모음`;
  let baseFolderName = baseNameRaw;
  let baseFolderPath = path.join(saveTargetDir, baseFolderName);
  let suffix = 1;
  while (fs.existsSync(baseFolderPath)) {
    baseFolderName = `${baseNameRaw}(${suffix})`;
    baseFolderPath = path.join(saveTargetDir, baseFolderName);
    suffix += 1;
  }
  fs.mkdirSync(baseFolderPath, { recursive: true });
  console.log(`[photoExportService] 저장 폴더 생성: ${baseFolderPath}`);

  let totalSaved = 0;
  const categoryDirMap = {
    testPhoto: { name: '1_실험사진', files: summary.testPhotos.files },
    sludge: { name: '2_슬러지사진', files: summary.sludgePhotos.files },
    cleaningCertificate: { name: '3_청소필증', files: summary.cleaningCertificates.files },
    medicineIn: { name: '4_약품입고', files: summary.medicineInPhotos.files },
    kitIn: { name: '5_키트입고', files: summary.kitInPhotos.files },
  };

  for (const catKey of selectedCategories) {
    const catInfo = categoryDirMap[catKey];
    if (!catInfo || !catInfo.files || catInfo.files.length === 0) continue;

    const subDirPath = path.join(baseFolderPath, catInfo.name);
    if (!fs.existsSync(subDirPath)) {
      fs.mkdirSync(subDirPath, { recursive: true });
    }

    for (let i = 0; i < catInfo.files.length; i += 1) {
      const fileItem = catInfo.files[i];
      let fileBuffer = null;

      // 1) 로컬 경로에 파일이 있으면 로컬에서 읽음
      if (fileItem.localPath && fs.existsSync(fileItem.localPath)) {
        try {
          fileBuffer = fs.readFileSync(fileItem.localPath);
        } catch (_) {}
      }

      // 2) 로컬에 없고 Drive File ID가 있으면 Google Drive에서 다운로드
      if (!fileBuffer && fileItem.driveFileId && isDriveConfigured()) {
        try {
          fileBuffer = await downloadDriveFileBuffer(fileItem.driveFileId);
        } catch (err) {
          console.warn(`[photoExportService] Drive 파일 다운로드 실패 (${fileItem.name}):`, err.message);
        }
      }

      if (fileBuffer && fileBuffer.length > 0) {
        const destFileName = fileItem.name.includes(fileItem.date) || !fileItem.date
          ? fileItem.name
          : `${fileItem.date}_${fileItem.name}`;
        const destFilePath = path.join(subDirPath, destFileName);
        fs.writeFileSync(destFilePath, fileBuffer);
        totalSaved += 1;
      }
    }
  }

  return {
    success: true,
    savedFolderPath: baseFolderPath,
    totalSaved,
  };
}

module.exports = {
  getMonthlyPhotoSummary,
  executeBatchDownload,
};
