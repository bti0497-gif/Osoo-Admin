'use strict';

/**
 * scripts/cleanupAndMigrateSettlementFolders.cjs
 * =====================================================================
 * Google Drive 상의 '월정산' 하위 파일들을 '월정산/YYYYMM/' (월별 폴더) 직하위로
 * 이동시키고 현장별/카테고리별 불필요 서브폴더들을 해제/정리하는 cleanup 스크립트.
 */

const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '../.env') });
dotenv.config({ path: path.join(__dirname, '../.env.local') });

const {
  drive,
  isDriveConfigured,
  getDriveRootFolderId,
  getOrCreateFolder,
  getSingleSettlementRootFolder,
} = require('../server/services/driveService.cjs');

function parseTargetYm(fileName, parentNames = []) {
  let targetYm = '';

  const dateMatch = fileName.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (dateMatch) {
    targetYm = `${dateMatch[1]}${dateMatch[2]}`;
  }

  if (!targetYm) {
    const ymMatch = fileName.match(/(20\d{2})(0[1-9]|1[0-2])/);
    if (ymMatch) {
      targetYm = ymMatch[0];
    }
  }

  if (!targetYm) {
    for (const pName of parentNames) {
      const pYm = pName.match(/(20\d{2})(0[1-9]|1[0-2])/);
      if (pYm) {
        targetYm = pYm[0];
        break;
      }
    }
  }

  if (!targetYm) {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    targetYm = `${yyyy}${mm}`;
  }

  return targetYm;
}

async function moveFileToFolder(fileId, currentParentId, targetFolderId) {
  if (currentParentId === targetFolderId) return;
  await drive.files.update({
    fileId,
    addParents: targetFolderId,
    removeParents: currentParentId,
    fields: 'id, parents',
    supportsAllDrives: true,
  });
}

async function runCleanupAndMigration() {
  console.log('=== Google Drive 월정산 (월별 폴더 직하위) 마이그레이션 시작 ===');
  if (!isDriveConfigured() || !drive) {
    console.error('Google Drive 인증 실패');
    return;
  }

  const rootMonthly = await getSingleSettlementRootFolder();
  console.log(`단일 표준 루트 '월정산' 폴더: ${rootMonthly.id}`);

  const ymFolderCache = new Map();

  async function getTargetYmFolder(targetYm) {
    if (!ymFolderCache.has(targetYm)) {
      const folder = await getOrCreateFolder(rootMonthly.id, targetYm);
      ymFolderCache.set(targetYm, folder.id);
    }
    return ymFolderCache.get(targetYm);
  }

  let totalFilesMoved = 0;

  async function processFolderRecursively(folderId, parentNames = []) {
    const res = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: 'files(id, name, mimeType, parents)',
      pageSize: 1000,
      supportsAllDrives: true,
    });

    const items = res.data.files || [];
    for (const item of items) {
      if (item.mimeType === 'application/vnd.google-apps.folder') {
        await processFolderRecursively(item.id, [...parentNames, item.name]);
        // Try deleting empty subfolder after processing children
        try {
          await drive.files.delete({ fileId: item.id, supportsAllDrives: true });
          console.log(`[하위 서브폴더 삭제] ${item.name} (${item.id})`);
        } catch (e) {
          // ignore permission errors
        }
      } else {
        const targetYm = parseTargetYm(item.name, parentNames);
        const targetFolderId = await getTargetYmFolder(targetYm);
        if (folderId !== targetFolderId) {
          console.log(`[이동] ${item.name} ➔ 월정산/${targetYm}/`);
          await moveFileToFolder(item.id, folderId, targetFolderId);
          totalFilesMoved++;
        }
      }
    }
  }

  await processFolderRecursively(rootMonthly.id, ['월정산']);

  console.log(`\n=== 마이그레이션 완료 ===`);
  console.log(`- 이동된 총 파일 수: ${totalFilesMoved}개`);
}

runCleanupAndMigration().catch(console.error);
