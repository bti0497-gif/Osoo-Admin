const { drive } = require('../server/services/driveService.cjs');

async function findKitPhotos() {
  const qFolder = "name = '관리사진' and mimeType = 'application/vnd.google-apps.folder' and trashed = false";
  const folderRes = await drive.files.list({ q: qFolder, fields: 'files(id, name)' });
  const photoRootFolder = folderRes.data.files[0];
  if (!photoRootFolder) return;

  const yyyyFolderRes = await drive.files.list({
    q: `'${photoRootFolder.id}' in parents and name = '2026' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: 'files(id, name)',
  });
  const yearFolder = yyyyFolderRes.data.files[0];
  const mmFolderRes = await drive.files.list({
    q: `'${yearFolder.id}' in parents and (name = '07' or name = '7') and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: 'files(id, name)',
  });
  const monthFolder = mmFolderRes.data.files[0];

  const filesRes = await drive.files.list({
    q: `'${monthFolder.id}' in parents and trashed = false`,
    fields: 'files(id, name, mimeType)',
    pageSize: 1000,
  });

  const allFiles = filesRes.data.files || [];
  const kitFiles = allFiles.filter(f => f.name.includes('키트'));
  console.log('Files in 2026/07 matching 키트:', kitFiles.map(f => f.name));
}

findKitPhotos();
