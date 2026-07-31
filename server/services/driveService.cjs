const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../../.env.local') });
const { boardUploadsSegments } = require('./drivePathService.cjs');

const KEY_FILE = path.join(__dirname, '../config/google-key.json');
const WORKSPACE_ROOT = path.join(__dirname, '../..');
const OAUTH_SCOPES = [
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/spreadsheets',
];

function findOAuthClientSecretFile() {
  const candidates = [
    path.join(__dirname, '../config/client_secret.json'),
    path.join(__dirname, '../config'),
    WORKSPACE_ROOT,
    process.env.APPDATA ? path.join(process.env.APPDATA, 'Osoo-Admin', 'config') : '',
    process.env.APPDATA ? path.join(process.env.APPDATA, 'Osoo_Admin_App') : '',
    process.resourcesPath ? process.resourcesPath : '',
    process.resourcesPath ? path.join(process.resourcesPath, 'server', 'config') : '',
    process.resourcesPath ? path.join(process.resourcesPath, 'app.asar.unpacked', 'server', 'config') : '',
  ].filter(Boolean);

  for (const item of candidates) {
    if (fs.existsSync(item)) {
      try {
        const stat = fs.statSync(item);
        if (stat.isFile()) return item;
        const files = fs.readdirSync(item);
        const match = files.find((name) => /^client_secret.*\.json$/i.test(String(name || '').trim()));
        if (match) return path.join(item, match);
      } catch (_) {}
    }
  }
  return '';
}

function loadOAuthClientConfig() {
  const envClientId = String(process.env.GOOGLE_CLIENT_ID || '').trim();
  const envClientSecret = String(process.env.GOOGLE_CLIENT_SECRET || '').trim();
  const envRedirectUri = String(process.env.GOOGLE_REDIRECT_URI || '').trim();

  if (envClientId && envClientSecret) {
    return {
      clientId: envClientId,
      clientSecret: envClientSecret,
      redirectUri: envRedirectUri || 'http://localhost'
    };
  }

  const fallbackFile = findOAuthClientSecretFile();
  if (!fallbackFile || !fs.existsSync(fallbackFile)) {
    return null;
  }

  try {
    const raw = JSON.parse(fs.readFileSync(fallbackFile, 'utf8'));
    const installed = raw.installed || raw.web || {};
    const redirectUris = Array.isArray(installed.redirect_uris) ? installed.redirect_uris : [];
    const clientId = String(installed.client_id || '').trim();
    const clientSecret = String(installed.client_secret || '').trim();
    const redirectUri = String(envRedirectUri || redirectUris[0] || 'http://localhost').trim();
    if (!clientId || !clientSecret) return null;
    return { clientId, clientSecret, redirectUri };
  } catch (_) {
    return null;
  }
}

function findServiceAccountKeyFile() {
  const candidates = [
    path.join(__dirname, '../config/google-key.json'),
    path.join(__dirname, '../config/work-jindan-194620a46d59.json'),
    process.env.APPDATA ? path.join(process.env.APPDATA, 'Osoo-Admin', 'config', 'google-key.json') : '',
    process.env.APPDATA ? path.join(process.env.APPDATA, 'Osoo-Admin', 'config', 'work-jindan-194620a46d59.json') : '',
    process.resourcesPath ? path.join(process.resourcesPath, 'server', 'config', 'google-key.json') : '',
    process.resourcesPath ? path.join(process.resourcesPath, 'server', 'config', 'work-jindan-194620a46d59.json') : '',
  ].filter(Boolean);

  for (const file of candidates) {
    if (fs.existsSync(file)) return file;
  }

  // 폴백: server/config 내의 모든 json 파일 탐색
  const configDir = path.join(__dirname, '../config');
  if (fs.existsSync(configDir)) {
    try {
      const files = fs.readdirSync(configDir);
      const match = files.find(f => /^(google-key|work-jindan).*\.json$/i.test(f));
      if (match) return path.join(configDir, match);
    } catch (_) {}
  }
  return '';
}

function createDriveAuth() {
  const refreshToken = String(process.env.GOOGLE_REFRESH_TOKEN || '').trim();
  const oauthClient = loadOAuthClientConfig();
  if (oauthClient && refreshToken) {
    const oauth2 = new google.auth.OAuth2(
      oauthClient.clientId,
      oauthClient.clientSecret,
      oauthClient.redirectUri
    );
    oauth2.setCredentials({ refresh_token: refreshToken });
    return { auth: oauth2, mode: 'oauth' };
  }

  const keyFile = findServiceAccountKeyFile();
  if (keyFile) {
    console.log('[DriveService] Service Account 인증 키 발견:', keyFile);
    const saAuth = new google.auth.GoogleAuth({
      keyFile,
      scopes: OAUTH_SCOPES,
    });
    return { auth: saAuth, mode: 'service_account' };
  }

  console.warn('[DriveService] 구글 드라이브 인증 키 파일을 찾을 수 없습니다.');
  return { auth: null, mode: 'none' };
}

const { auth, mode: driveAuthMode } = createDriveAuth();
const drive = auth ? google.drive({ version: 'v3', auth }) : null;

function escapeDriveQueryValue(value) {
  return String(value || '').replace(/'/g, "\\'");
}

function getDriveRootFolderId() {
  return String(process.env.GOOGLE_DRIVE_FOLDER_ID || '').trim();
}

function isDriveConfigured() {
  return Boolean(
    drive &&
    getDriveRootFolderId()
  );
}

async function getOrCreateFolder(parentFolderId, folderName) {
  if (!drive) throw new Error('Google Drive 인증 정보가 설정되지 않았습니다.');
  const normalizedParentId = String(parentFolderId || '').trim();
  const normalizedName = String(folderName || '').trim();
  if (!normalizedParentId) throw new Error('Google Drive parent folder ID가 비어 있습니다.');
  if (!normalizedName) throw new Error('Google Drive folder name이 비어 있습니다.');

  const res = await drive.files.list({
    q: [
      "mimeType='application/vnd.google-apps.folder'",
      `name='${escapeDriveQueryValue(normalizedName)}'`,
      `'${normalizedParentId}' in parents`,
      'trashed=false'
    ].join(' and '),
    fields: 'files(id, name, webViewLink)',
    spaces: 'drive',
    includeItemsFromAllDrives: true,
    supportsAllDrives: true,
    pageSize: 10
  });

  if ((res.data.files || []).length > 0) {
    return res.data.files[0];
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
  uploadBufferToFolder,
  getOrCreateBoardUploadsFolder,
  listFilesFolder,
  downloadDriveFileBuffer,
};
