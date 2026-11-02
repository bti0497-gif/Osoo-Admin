const path = require('path');
const fs = require('fs');
const {
  drive,
  isDriveConfigured,
  getSingleSettlementRootFolder,
  getOrCreateFolder,
  findFileInFolder,
  uploadBufferToFolder,
  downloadDriveFileBuffer,
} = require('./driveService.cjs');
const { getEvidenceCacheDir } = require('./settlementEvidenceSyncService.cjs');

const SOURCE_MANIFEST_FILE = '_uploaded_source_files.json';

/**
 * 정산 증빙 원본 파일 업로드 이력을 로컬 캐시 및 Google Drive에 기록합니다.
 */
async function recordUploadedSettlementSourceFile({ fileName, documentType = 'invoice', targetYm = '', ...meta }) {
  const cleanFileName = String(fileName || '').trim();
  if (!cleanFileName) return;

  const nowIso = new Date().toISOString();
  const entry = {
    fileName: cleanFileName,
    documentType,
    targetYm,
    updatedAt: nowIso,
    ...meta,
  };

  // 1) 로컬 캐시 메타 디렉토리에 기록
  try {
    const metaDir = getEvidenceCacheDir('meta', targetYm || 'common');
    const localPath = path.join(metaDir, SOURCE_MANIFEST_FILE);
    let localManifest = { files: {} };
    if (fs.existsSync(localPath)) {
      try {
        localManifest = JSON.parse(fs.readFileSync(localPath, 'utf8')) || { files: {} };
      } catch (_) {}
    }
    localManifest.files = localManifest.files || {};
    localManifest.files[cleanFileName] = entry;
    fs.writeFileSync(localPath, JSON.stringify(localManifest, null, 2), 'utf8');
  } catch (localErr) {
    console.warn('[recordUploadedSettlementSourceFile] 로컬 캐시 기록 실패:', localErr.message);
  }

  // 2) Google Drive 매니페스트에 기록 (다른 PC와 실시간 공유)
  if (isDriveConfigured()) {
    try {
      const monthlyRoot = await getSingleSettlementRootFolder();
      if (monthlyRoot?.id) {
        let parentFolderId = monthlyRoot.id;
        if (targetYm) {
          const ymFolder = await getOrCreateFolder(monthlyRoot.id, targetYm);
          if (ymFolder?.id) parentFolderId = ymFolder.id;
        }

        let driveManifest = { files: {} };
        const existingFile = await findFileInFolder(parentFolderId, SOURCE_MANIFEST_FILE);
        if (existingFile?.id) {
          try {
            const buf = await downloadDriveFileBuffer(existingFile.id);
            if (buf && buf.length > 0) {
              driveManifest = JSON.parse(buf.toString('utf8')) || { files: {} };
            }
          } catch (_) {}
        }

        driveManifest.files = driveManifest.files || {};
        driveManifest.files[cleanFileName] = entry;

        const manifestBuf = Buffer.from(JSON.stringify(driveManifest, null, 2), 'utf8');
        await uploadBufferToFolder({
          folderId: parentFolderId,
          fileName: SOURCE_MANIFEST_FILE,
          buffer: manifestBuf,
          mimeType: 'application/json',
        });
      }
    } catch (driveErr) {
      console.warn('[recordUploadedSettlementSourceFile] Drive 매니페스트 저장 실패:', driveErr.message);
    }
  }
}

/**
 * 정산 증빙 원본 파일명(계산서/입금표 PDF)이 이미 업로드된 이력이 있는지 검사합니다:
 * 1) 로컬 캐시 메타 디렉토리
 * 2) Google Drive 월정산/{targetYm} 및 월정산 루트 폴더
 */
async function checkUploadedSettlementSourceFile({ fileName, documentType = 'invoice', targetYm = '' }) {
  const cleanFileName = String(fileName || '').trim();
  if (!cleanFileName) return { exists: false };

  // 1) 로컬 캐시 확인 (targetYm 및 common)
  const candidateDirs = [
    targetYm ? getEvidenceCacheDir('meta', targetYm) : null,
    getEvidenceCacheDir('meta', 'common'),
  ].filter(Boolean);

  for (const dir of candidateDirs) {
    try {
      const localPath = path.join(dir, SOURCE_MANIFEST_FILE);
      if (fs.existsSync(localPath)) {
        const localManifest = JSON.parse(fs.readFileSync(localPath, 'utf8')) || {};
        if (localManifest.files && localManifest.files[cleanFileName]) {
          return { exists: true, source: 'local_cache' };
        }
      }
    } catch (_) {}
  }

  // 2) Google Drive 매니페스트 확인
  if (isDriveConfigured()) {
    try {
      const monthlyRoot = await getSingleSettlementRootFolder();
      if (monthlyRoot?.id) {
        const folderIdsToCheck = [monthlyRoot.id];
        if (targetYm) {
          const ymFolder = await findFileInFolder(monthlyRoot.id, targetYm);
          if (ymFolder?.id) folderIdsToCheck.unshift(ymFolder.id);
        }

        for (const folderId of folderIdsToCheck) {
          const existingFile = await findFileInFolder(folderId, SOURCE_MANIFEST_FILE);
          if (existingFile?.id) {
            try {
              const buf = await downloadDriveFileBuffer(existingFile.id);
              if (buf && buf.length > 0) {
                const driveManifest = JSON.parse(buf.toString('utf8')) || {};
                if (driveManifest.files && driveManifest.files[cleanFileName]) {
                  return { exists: true, source: 'drive_manifest' };
                }
              }
            } catch (_) {}
          }
        }
      }
    } catch (driveErr) {
      console.warn('[checkUploadedSettlementSourceFile] Drive 매니페스트 확인 실패:', driveErr.message);
    }
  }

  return { exists: false };
}

module.exports = {
  recordUploadedSettlementSourceFile,
  checkUploadedSettlementSourceFile,
};
