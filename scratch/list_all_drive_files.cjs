const path = require('path');
const { drive } = require(path.join(__dirname, '../server/services/driveService.cjs'));

async function listAllFiles() {
  console.log('=== Listing ALL files in Google Drive ===');
  const res = await drive.files.list({
    q: "trashed=false",
    fields: 'files(id, name, mimeType, parents, modifiedTime, size)',
    pageSize: 500
  });

  console.log(`Total files in Drive: ${res.data.files.length}`);
  const monthMap = {};
  res.data.files.forEach(f => {
    console.log(` - File: [${f.name}] (${f.mimeType}, modified: ${f.modifiedTime})`);
  });
}

listAllFiles().catch(console.error);
