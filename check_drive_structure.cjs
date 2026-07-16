const { google } = require('googleapis');
const path = require('path');
const DRIVE_KEY = path.join(__dirname, 'server/config/google-key.json');
const CERT_ROOT = '1Po-gd-OKlaeGyL-Ppjc6_wKgSLEM4iX4';

const driveAuth = new google.auth.GoogleAuth({
  keyFile: DRIVE_KEY,
  scopes: ['https://www.googleapis.com/auth/drive.readonly'],
});
const drive = google.drive({ version: 'v3', auth: driveAuth });

async function listSubfolders(parentId) {
  const res = await drive.files.list({
    q: `mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`,
    fields: 'files(id, name)',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });
  return res.data.files || [];
}

(async () => {
  console.log('1. 성적서 루트 폴더 내부:');
  const level1 = await listSubfolders(CERT_ROOT);
  level1.forEach(f => console.log(`   - [${f.name}] ID: ${f.id}`));

  const certFolder = level1.find(f => f.name === '성적서');
  if (!certFolder) return;

  console.log('\n2. 성적서/ 폴더 내부 (연도):');
  const level2 = await listSubfolders(certFolder.id);
  level2.forEach(f => console.log(`   - [${f.name}] ID: ${f.id}`));

  const yearFolder = level2.find(f => f.name === '2026');
  if (!yearFolder) return;

  console.log('\n3. 성적서/2026/ 폴더 내부 (월):');
  const level3 = await listSubfolders(yearFolder.id);
  level3.forEach(f => console.log(`   - [${f.name}] ID: ${f.id}`));
})().catch(e => console.error(e.message));
