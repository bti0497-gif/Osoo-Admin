const path = require('path');
const { drive } = require(path.join(__dirname, '../server/services/driveService.cjs'));

async function findFileGlobally() {
  console.log('=== Global Drive File Search ===');
  const res = await drive.files.list({
    q: "name contains '안화' or name contains '성적서_20260719'",
    fields: 'files(id, name, parents, modifiedTime, size)',
    spaces: 'drive',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });

  console.log(`Found ${res.data.files.length} matching files in Drive:`);
  for (const f of res.data.files) {
    let parentNames = [];
    if (f.parents && f.parents.length > 0) {
      for (const pid of f.parents) {
        try {
          const pref = await drive.files.get({ fileId: pid, fields: 'id, name' });
          parentNames.push(`${pref.data.name} (${pid})`);
        } catch (_) {}
      }
    }
    console.log(` - File: ${f.name}`);
    console.log(`   Parents: ${parentNames.join(', ')}`);
    console.log(`   Modified: ${f.modifiedTime}, Size: ${f.size}`);
  }
}

findFileGlobally().catch(console.error);
