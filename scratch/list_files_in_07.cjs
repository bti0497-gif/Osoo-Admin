const path = require('path');
const { drive } = require(path.join(__dirname, '../server/services/driveService.cjs'));
const MONTH_07_FOLDER_ID = '07'; // We will search for folder named '07' under 2026

async function listAllFilesIn07() {
  // 1. Find 2026 folder under '성적서'
  const certRootRes = await drive.files.list({
    q: "name='성적서' and mimeType='application/vnd.google-apps.folder' and trashed=false",
    fields: 'files(id, name)'
  });
  const certRoot = certRootRes.data.files[0];
  console.log('Cert Root:', certRoot);

  const yearRes = await drive.files.list({
    q: `'${certRoot.id}' in parents and name='2026' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id, name)'
  });
  const year2026 = yearRes.data.files[0];
  console.log('2026 Folder:', year2026);

  const monthRes = await drive.files.list({
    q: `'${year2026.id}' in parents and (name='07' or name='7' or name='07월' or name='7월') and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id, name)'
  });
  console.log('Month 07 Folders:', monthRes.data.files);

  for (const mf of monthRes.data.files) {
    const filesRes = await drive.files.list({
      q: `'${mf.id}' in parents and trashed=false`,
      fields: 'files(id, name, mimeType, modifiedTime, size)'
    });
    console.log(`\nFiles inside Month Folder [${mf.name}] (${filesRes.data.files.length} files):`);
    filesRes.data.files.forEach(f => console.log(` - ${f.name} (${f.mimeType}, ${f.size} bytes, modified: ${f.modifiedTime})`));
  }
}

listAllFilesIn07().catch(console.error);
