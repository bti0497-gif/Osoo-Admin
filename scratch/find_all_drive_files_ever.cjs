const path = require('path');
const { drive } = require(path.join(__dirname, '../server/services/driveService.cjs'));

async function findAllUploadedFiles() {
  console.log('=== Deep Search for ALL Uploaded Certificate Files in Google Drive ===');
  try {
    const res = await drive.files.list({
      q: "mimeType != 'application/vnd.google-apps.folder' and trashed = false",
      fields: 'files(id, name, mimeType, parents, modifiedTime, size, webViewLink)',
      pageSize: 500,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });

    console.log(`Total files found in Drive: ${res.data.files.length}`);
    const files = res.data.files;
    
    // Group files by parent folder
    const parentMap = {};
    for (const f of files) {
      const pid = (f.parents && f.parents.length > 0) ? f.parents[0] : 'root';
      if (!parentMap[pid]) parentMap[pid] = [];
      parentMap[pid].push(f);
    }

    for (const [pid, list] of Object.entries(parentMap)) {
      let pName = pid;
      try {
        const pref = await drive.files.get({ fileId: pid, fields: 'id, name' });
        pName = `${pref.data.name} (${pid})`;
      } catch (_) {}
      console.log(`\n--- Parent Folder: ${pName} (${list.length} files) ---`);
      list.forEach(f => {
        console.log(` - File: ${f.name} (ID: ${f.id}, Modified: ${f.modifiedTime}, Size: ${f.size})`);
      });
    }
  } catch (err) {
    console.error('Drive search error:', err.message);
  }
}

findAllUploadedFiles().catch(console.error);
