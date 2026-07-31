const path = require('path');
const { drive } = require(path.join(__dirname, '../server/services/driveService.cjs'));
const CERTIFICATE_ROOT_FOLDER_ID = '1Po-gd-OKlaeGyL-Ppjc6_wKgSLEM4iX4';

async function listFolders(parentId) {
  const res = await drive.files.list({
    q: [
      "mimeType='application/vnd.google-apps.folder'",
      `'${String(parentId)}' in parents`,
      'trashed=false',
    ].join(' and '),
    fields: 'files(id, name)',
    spaces: 'drive',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    pageSize: 200,
  });
  return res.data.files || [];
}

async function inspectDriveFolders() {
  console.log('=== Inspecting Drive Folders under Root ===');
  const rootFolders = await listFolders(CERTIFICATE_ROOT_FOLDER_ID);
  console.log('Root subfolders:', rootFolders);

  for (const root of [CERTIFICATE_ROOT_FOLDER_ID, ...rootFolders.map(f => f.id)]) {
    const years = await listFolders(root);
    for (const y of years) {
      console.log(`Year folder [${y.name}] (id: ${y.id}):`);
      const months = await listFolders(y.id);
      console.log(`  Month folders:`, months.map(m => m.name));
    }
  }
}

inspectDriveFolders().catch(console.error);
