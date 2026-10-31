'use strict';

/**
 * settlementTemplateDriveService.cjs
 * =====================================================================
 * Google Drive 정산양식 통합 관리 서비스
 *
 * 1. 구글 드라이브 내 '정산양식' 전용 폴더 관리
 * 2. 양식 생성/조회 시 로컬에 양식이 없으면 드라이브에서 자동 동기화(다운로드)
 * 3. 양식 업로드/교체 시 로컬 AppData 저장과 동시에 드라이브 '정산양식' 폴더로 자동 업로드
 * 4. 모든 중앙관리자가 별도 베포본 업데이트 없이 최신 양식(횡성휴게소 등 포함)을 공유/작성 가능
 */

const fs = require('fs');
const path = require('path');
const driveService = require('./driveService.cjs');

const TEMPLATE_FOLDER_NAME = '정산양식';

const MIME_MAP = {
  '.hwp': 'application/x-hwp',
  '.hwpx': 'application/hwp+zip',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.xlsm': 'application/vnd.ms-excel.sheet.macroEnabled.12',
  '.xls': 'application/vnd.ms-excel',
};

function getMimeType(fileName) {
  const ext = path.extname(fileName || '').toLowerCase();
  return MIME_MAP[ext] || 'application/octet-stream';
}

function getWritableTemplateDir() {
  const appDataRoot = process.env.APP_DATA_PATH ||
    (process.env.APPDATA ? path.join(process.env.APPDATA, 'Osoo_Admin_App') : path.join(__dirname, '../templates/settlement'));
  const targetDir = path.join(appDataRoot, 'templates', 'settlement');
  if (!fs.existsSync(targetDir)) {
    try { fs.mkdirSync(targetDir, { recursive: true }); } catch (e) {
      console.warn('[settlementTemplateDrive] AppData 템플릿 폴더 생성 실패:', e.message);
    }
  }
  return targetDir;
}

let cachedTemplateFolderId = null;

/**
 * 구글 드라이브 내 '정산양식' 폴더 객체 조회 또는 생성
 */
async function getOrCreateTemplateFolder() {
  if (cachedTemplateFolderId) {
    return { id: cachedTemplateFolderId, name: TEMPLATE_FOLDER_NAME };
  }

  const rootId = driveService.getDriveRootFolderId();
  if (!rootId) {
    throw new Error('Google Drive 루트 폴더 ID가 설정되지 않았습니다.');
  }

  const folder = await driveService.getOrCreateFolder(rootId, TEMPLATE_FOLDER_NAME);
  cachedTemplateFolderId = folder.id;
  return folder;
}

/**
 * 구글 드라이브 '정산양식' 폴더 내 모든 파일 목록 조회
 */
async function listDriveTemplates() {
  try {
    const folder = await getOrCreateTemplateFolder();
    return await driveService.listFilesFolder(folder.id);
  } catch (err) {
    console.warn('[settlementTemplateDrive] 드라이브 양식 목록 조회 실패:', err.message);
    return [];
  }
}

/**
 * 구글 드라이브 '정산양식' 폴더에 양식 버퍼 업로드 (동기화)
 */
async function uploadTemplateToDrive({ fileName, buffer, mimeType }) {
  try {
    if (!driveService.isDriveConfigured()) {
      console.warn('[settlementTemplateDrive] 드라이브 미설정으로 업로드 건너뜀');
      return null;
    }
    const folder = await getOrCreateTemplateFolder();
    const resolvedMime = mimeType || getMimeType(fileName);

    const uploaded = await driveService.uploadBufferToFolder({
      folderId: folder.id,
      fileName,
      buffer,
      mimeType: resolvedMime,
    });
    console.log(`[settlementTemplateDrive] 드라이브 양식 업로드 완료: ${fileName} (${buffer.length} bytes)`);
    return uploaded;
  } catch (err) {
    console.error(`[settlementTemplateDrive] 드라이브 양식 업로드 실패 (${fileName}):`, err.message);
    return null;
  }
}

/**
 * 특정 파일명에 대해 구글 드라이브에서 양식을 찾아 로컬 AppData에 다운로드
 * @param {string} fileName - 템플릿 파일명
 * @param {string[]} aliases - 대체 파일명 목록
 * @returns {Promise<string|null>} 다운로드된 로컬 파일 경로 또는 null
 */
async function ensureTemplateFromDrive(fileName, aliases = []) {
  if (!fileName) return null;
  const targetDir = getWritableTemplateDir();
  const safeName = path.basename(fileName);
  const targetLocalPath = path.join(targetDir, safeName);

  // 로컬에 이미 존재하면 바로 반환
  if (fs.existsSync(targetLocalPath)) {
    return targetLocalPath;
  }

  for (const alias of aliases) {
    const aliasLocalPath = path.join(targetDir, alias);
    if (fs.existsSync(aliasLocalPath)) {
      try {
        fs.copyFileSync(aliasLocalPath, targetLocalPath);
        return targetLocalPath;
      } catch (_) {
        return aliasLocalPath;
      }
    }
  }

  if (!driveService.isDriveConfigured()) {
    return null;
  }

  try {
    const driveFiles = await listDriveTemplates();
    if (!driveFiles || driveFiles.length === 0) return null;

    const namesToSearch = [safeName, ...aliases].map(n => n.toLowerCase().replace(/\s+/g, ''));
    const matched = driveFiles.find(f => {
      const driveClean = (f.name || '').toLowerCase().replace(/\s+/g, '');
      return namesToSearch.includes(driveClean);
    });

    if (matched) {
      console.log(`[settlementTemplateDrive] 드라이브에서 양식 다운로드 시작: ${matched.name} (id: ${matched.id})`);
      const buffer = await driveService.downloadDriveFileBuffer(matched.id);
      fs.writeFileSync(targetLocalPath, buffer);

      // 별칭 파일도 함께 로컬에 캐시 복사
      for (const alias of aliases) {
        const aliasPath = path.join(targetDir, alias);
        if (!fs.existsSync(aliasPath)) {
          try { fs.copyFileSync(targetLocalPath, aliasPath); } catch (_) {}
        }
      }

      console.log(`[settlementTemplateDrive] 양식 로컬 캐시 완료: ${targetLocalPath} (${buffer.length} bytes)`);
      return targetLocalPath;
    }
  } catch (err) {
    console.warn(`[settlementTemplateDrive] 드라이브 양식 동기화 실패 (${fileName}):`, err.message);
  }

  return null;
}

/**
 * 드라이브 '정산양식' 폴더의 모든 양식을 로컬 AppData 캐시로 일괄 동기화
 */
async function syncAllTemplatesFromDrive() {
  if (!driveService.isDriveConfigured()) return { synced: 0, total: 0 };

  try {
    const driveFiles = await listDriveTemplates();
    const targetDir = getWritableTemplateDir();
    let synced = 0;

    for (const file of driveFiles) {
      const localPath = path.join(targetDir, file.name);
      let needsDownload = !fs.existsSync(localPath);

      if (!needsDownload && file.size) {
        const localStat = fs.statSync(localPath);
        if (Number(localStat.size) !== Number(file.size)) {
          needsDownload = true;
        }
      }

      if (needsDownload) {
        try {
          console.log(`[settlementTemplateDrive] 동기화 다운로드: ${file.name}`);
          const buffer = await driveService.downloadDriveFileBuffer(file.id);
          fs.writeFileSync(localPath, buffer);
          synced++;
        } catch (e) {
          console.warn(`[settlementTemplateDrive] 개별 양식 다운로드 실패 (${file.name}):`, e.message);
        }
      }
    }

    return { synced, total: driveFiles.length };
  } catch (err) {
    console.error('[settlementTemplateDrive] 전체 양식 동기화 오류:', err.message);
    return { synced: 0, total: 0, error: err.message };
  }
}

/**
 * 초기 시딩용: 로컬에 있는 기본 양식들을 구글 드라이브 '정산양식' 폴더로 업로드
 */
async function seedLocalTemplatesToDrive(sourceDirs = []) {
  if (!driveService.isDriveConfigured()) return { uploaded: 0 };

  try {
    const folder = await getOrCreateTemplateFolder();
    const driveFiles = await driveService.listFilesFolder(folder.id);
    const driveFileNames = new Set(driveFiles.map(f => f.name));

    let uploaded = 0;
    const allDirs = [
      ...sourceDirs,
      path.join(__dirname, '../templates/settlement'),
      getWritableTemplateDir(),
    ];

    const seen = new Set();
    for (const dir of allDirs) {
      if (!fs.existsSync(dir)) continue;
      const entries = fs.readdirSync(dir);
      for (const entry of entries) {
        if (seen.has(entry)) continue;
        seen.add(entry);

        const ext = path.extname(entry).toLowerCase();
        if (!['.hwp', '.hwpx', '.xlsx', '.xlsm', '.xls', '.json'].includes(ext)) continue;
        if (driveFileNames.has(entry)) continue;

        const fullPath = path.join(dir, entry);
        if (fs.statSync(fullPath).isDirectory()) continue;

        try {
          const buffer = fs.readFileSync(fullPath);
          await driveService.uploadBufferToFolder({
            folderId: folder.id,
            fileName: entry,
            buffer,
            mimeType: getMimeType(entry),
          });
          driveFileNames.add(entry);
          uploaded++;
          console.log(`[settlementTemplateDrive] 시드 양식 드라이브 업로드 완료: ${entry}`);
        } catch (err) {
          console.warn(`[settlementTemplateDrive] 시드 업로드 실패 (${entry}):`, err.message);
        }
      }
    }

    return { uploaded };
  } catch (err) {
    console.error('[settlementTemplateDrive] 시드 양식 업로드 실패:', err.message);
    return { uploaded: 0, error: err.message };
  }
}

module.exports = {
  TEMPLATE_FOLDER_NAME,
  getOrCreateTemplateFolder,
  listDriveTemplates,
  uploadTemplateToDrive,
  ensureTemplateFromDrive,
  syncAllTemplatesFromDrive,
  seedLocalTemplatesToDrive,
};
