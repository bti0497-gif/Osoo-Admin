const path = require('path');
const { searchFilesByPrefix } = require(path.join(__dirname, '../server/services/driveService.cjs'));

async function checkJulyDriveFiles() {
  console.log('=== Checking Google Drive Files for 2026-07 ===');
  try {
    const files = await searchFilesByPrefix('2026', '07');
    console.log(`Found ${files ? files.length : 0} files in Drive for 2026-07:`);
    if (files) {
      files.forEach(f => console.log(` - File: ${f.name}, Modified: ${f.modifiedTime}, ID: ${f.id}`));
    }
  } catch (err) {
    console.error('Drive error:', err.message, err.stack);
  }
}

checkJulyDriveFiles();
