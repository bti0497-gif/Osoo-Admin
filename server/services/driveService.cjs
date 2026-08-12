'use strict';

/**
 * driveService.cjs
 * =====================================================================
 * Google Drive API 통합 서비스
 * (Service Account & OAuth2 인증 지원, 단일 월정산 루트 폴더 보장, 락 메커니즘 지원)
 */

const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');

const DRIVE_SCOPES = ['https://www.googleapis.com/auth/drive'];

function findOAuthClientKeyFile() {
  const candidates = [
    path.join(__dirname, '../config/client_secret.json'),
    path.join(process.cwd(), 'server/config/client_secret.json'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function findServiceAccountKeyFile() {
  const candidates = [
    path.join(__dirname, '../config/google-key.json'),
    path.join(process.cwd(), 'server/config/google-key.json'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function createDriveAuth() {
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
  let clientId = process.env.GOOGLE_CLIENT_ID;
  let clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  const oauthKeyFile = findOAuthClientKeyFile();
  if (oauthKeyFile && fs.existsSync(oauthKeyFile)) {
    try {
      const raw = JSON.parse(fs.readFileSync(oauthKeyFile, 'utf8'));
      const creds = raw.web || raw.installed;
      if (creds) {
        clientId = clientId || creds.client_id;
        clientSecret = clientSecret || creds.client_secret;
      }
    } catch (e) {}
  }

  if (clientId && clientSecret && refreshToken) {
    console.log('[DriveService] OAuth2 사용자 인증 모드 사용 (Quota 제한 없음)');
    const oauth2 = new google.auth.OAuth2(clientId, clientSecret);
    oauth2.setCredentials({ refresh_token: refreshToken });
    return { auth: oauth2, mode: 'oauth' };
  }

  const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
  const privateKey = process.env.GOOGLE_PRIVATE_KEY
    ? process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n')
    : null;

  if (clientEmail && privateKey) {
    const jwtAuth = new google.auth.JWT({
      email: clientEmail,
      key: privateKey,
      scopes: DRIVE_SCOPES,
    });
    return { auth: jwtAuth, mode: 'env' };
  }

  const saKeyFile = findServiceAccountKeyFile();
  if (saKeyFile && fs.existsSync(saKeyFile)) {
    console.log('[DriveService] Service Account 키 사용:', saKeyFile);
    const saAuth = new google.auth.GoogleAuth({
      keyFile: saKeyFile,
      scopes: DRIVE_SCOPES,
    });
    return { auth: saAuth, mode: 'service_account' };
  }

  console.warn('[DriveService] 구글 드라이브 인증 키 파일을 찾을 수 없습니다.');
  return { auth: null, mode: 'none' };
}

const { auth, mode: driveAuthMode } = createDriveAuth();
const drive = auth ? google.drive({ version: 'v3', auth }) : null;

function escapeDriveQueryValue(value) {
  return String(value || '').replace(/'/g, "\'");
}

function getDriveRootFolderId() {
  return String(process.env.GOOGLE_DRIVE_FOLDER_ID || '').trim();
}

function isDriveConfigured() {
  return Boolean(drive && getDriveRootFolderId());
}

const folderCreationLocks = new Map();

async function getOrCreateFolder(parentFolderId, folderName) {
  if (!drive) throw new Error('Google Drive 인증 정보가 설정되지 않았습니다.');
  const normalizedParentId = String(parentFolderId || '').trim();
  const normalizedName = String(folderName || '').trim();

  if (!normalizedParentId) throw new Error('Google Drive parentFolderId가 비어 있습니다.');
  if (!normalizedName) throw new Error('Google Drive folder name이 비어 있습니다.');

  const lockKey = `${normalizedParentId}:${normalizedName}`;
  if (folderCreationLocks.has(lockKey)) {
    return await folderCreationLocks.get(lockKey);
  }

  const promise = (async () => {
    try {
      const res = await drive.files.list({
        q: [
          "mimeType='application/vnd.google-apps.folder'",
          `name='${escapeDriveQueryValue(normalizedName)}'`,
          `'${normalizedParentId}' in parents`,
          'trashed=false'
        ].join(' and '),
        fields: 'files(id, name, webViewLink, createdTime)',
        spaces: 'drive',
        includeItemsFromAllDrives: true,
        supportsAllDrives: true,
        pageSize: 10
      });

      const files = res.data.files || [];
      if (files.length > 0) {
        files.sort((a, b) => new Date(a.createdTime || 0) - new Date(b.createdTime || 0));
        return files[0];
      }

      const folder = await drive.files.create({
        resource: {
          name: normalizedName,
          mimeType: 'application/vnd.google-apps.folder',
          parents: [normalizedParentId]
        },
        fields: 'id, name, webViewLink',
        supportsAllDrives: true
      });

      return folder.data;
    } finally {
      folderCreationLocks.delete(lockKey);
    }
  })();

  folderCreationLocks.set(lockKey, promise);
  return await promise;
}

async function findFolderInParent(parentFolderId, folderName) {
  if (!drive) return null;
  const normalizedParentId = String(parentFolderId || '').trim();
  const normalizedName = String(folderName || '').trim();
  if (!normalizedParentId || !normalizedName) return null;

  const response = await drive.files.list({
    q: [
      "mimeType='application/vnd.google-apps.folder'",
      `name='${escapeDriveQueryValue(normalizedName)}'`,
      `'${normalizedParentId}' in parents`,
      'trashed=false',
    ].join(' and '),
    fields: 'files(id, name, webViewLink)',
    spaces: 'drive',
    includeItemsFromAllDrives: true,
    supportsAllDrives: true,
    pageSize: 1,
  });

  return response.data.files?.[0] || null;
}

async function findFileInFolder(parentFolderId, fileName) {
  if (!drive) return null;
  const normalizedParentId = String(parentFolderId || '').trim();
  const normalizedName = String(fileName || '').trim();
  if (!normalizedParentId || !normalizedName) return null;

  const response = await drive.files.list({
    q: `'${normalizedParentId}' in parents and trashed=false`,
    fields: 'files(id, name, webViewLink, webContentLink)',
    spaces: 'drive',
    includeItemsFromAllDrives: true,
    supportsAllDrives: true,
    pageSize: 1000
  });

  const files = response.data.files || [];
  const targetClean = normalizedName.replace(/\s+/g, '');
  return files.find(f => f.name.replace(/\s+/g, '') === targetClean) || null;
}

async function getOrCreateFolderPath(rootFolderId, segments = []) {
  let currentFolder = { id: rootFolderId, name: '', webViewLink: '' };

  for (const segment of segments) {
    currentFolder = await getOrCreateFolder(currentFolder.id, segment);
  }

  return currentFolder;
}

async function getSingleSettlementRootFolder() {
  const rootFolderId = getDriveRootFolderId();
  if (!rootFolderId) throw new Error('Google Drive 루트 폴더 ID가 설정되어 있지 않습니다.');
  return await getOrCreateFolder(rootFolderId, '월정산');
}

async function uploadBufferToFolder({ folderId, fileName, buffer, mimeType }) {
  if (!drive) throw new Error('Google Drive 인증 정보가 설정되지 않았습니다.');
  if (!folderId) throw new Error('Google Drive folder ID가 필요합니다.');
  if (!fileName) throw new Error('Google Drive file name이 필요합니다.');

  const { Readable } = require('stream');
  const existingFile = await findFileInFolder(folderId, fileName);
  const mediaBody = Readable.from(buffer);
  const response = existingFile
    ? await drive.files.update({
        fileId: existingFile.id,
        media: { mimeType: mimeType || 'application/octet-stream', body: mediaBody },
        fields: 'id, name, webViewLink, webContentLink',
        supportsAllDrives: true
      })
    : await drive.files.create({
        resource: { name: fileName, parents: [folderId] },
        media: { mimeType: mimeType || 'application/octet-stream', body: mediaBody },
        fields: 'id, name, webViewLink, webContentLink',
        supportsAllDrives: true
      });

  return response.data;
}

function boardUploadsSegments() {
  return ['Board_Uploads'];
}

async function getOrCreateBoardUploadsFolder() {
  const parentFolderId = getDriveRootFolderId();

  try {
    const folder = await getOrCreateFolderPath(parentFolderId, boardUploadsSegments());
    return folder.id;
  } catch (error) {
    console.error('Error getting/creating Board_Uploads folder:', error);
    throw error;
  }
}

async function listFilesFolder(folderId) {
  if (!drive) return [];
  const normalizedParentId = String(folderId || '').trim();
  if (!normalizedParentId) return [];

  const response = await drive.files.list({
    q: `'${normalizedParentId}' in parents and trashed=false`,
    fields: 'files(id, name, mimeType, size, webViewLink, webContentLink, createdTime)',
    spaces: 'drive',
    includeItemsFromAllDrives: true,
    supportsAllDrives: true,
    pageSize: 1000
  });

  return response.data.files || [];
}

async function downloadDriveFileBuffer(fileId) {
  if (!drive) throw new Error('Google Drive 인증 정보가 없습니다.');
  const response = await drive.files.get(
    { fileId: String(fileId), alt: 'media', supportsAllDrives: true },
    { responseType: 'arraybuffer' }
  );
  return Buffer.from(response.data);
}

module.exports = {
  drive,
  driveAuthMode,
  isDriveConfigured,
  getDriveRootFolderId,
  getOrCreateFolder,
  findFolderInParent,
  findFileInFolder,
  getOrCreateFolderPath,
  getSingleSettlementRootFolder,
  uploadBufferToFolder,
  getOrCreateBoardUploadsFolder,
  listFilesFolder,
  downloadDriveFileBuffer,
};
