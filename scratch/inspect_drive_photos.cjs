const path = require('path');
const { drive, getOrCreateFolder, listFilesFolder } = require(path.join(__dirname, '../server/services/driveService.cjs'));

async function main() {
  console.log('=== Google Drive Photo Search Test ===');
  if (!drive) {
    console.error('Drive is null!');
    return;
  }

  // 1. Search for root items
  const rootId = process.env.CERTIFICATE_DRIVE_FOLDER_ID || '1Po-gd-OKlaeGyL-Ppjc6_wKgSLEM4iX4';
  console.log('Root Folder ID:', rootId);

  try {
    const res = await drive.files.list({
      q: `'${rootId}' in parents and trashed = false`,
      fields: 'files(id, name, mimeType)',
      pageSize: 100,
    });
    console.log('Root Items:', res.data.files);

    // 2. Search for any folder or file with "관리사진" or "성적서" or year "2026"
    const searchRes = await drive.files.list({
      q: "name contains '관리사진' or name contains '2026' or name contains '07'",
      fields: 'files(id, name, mimeType, parents)',
      pageSize: 50,
    });
    console.log('Search Results for 2026/07/관리사진:', searchRes.data.files);
  } catch (err) {
    console.error('Error listing drive:', err.message);
  }
}

main();
