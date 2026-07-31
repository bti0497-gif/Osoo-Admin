const path = require('path');
const { drive } = require(path.join(__dirname, '../server/services/driveService.cjs'));

async function traceParentHierarchy(folderId) {
  let curr = folderId;
  console.log(`=== Tracing Parent Hierarchy for ${folderId} ===`);
  while (curr) {
    try {
      const res = await drive.files.get({ fileId: curr, fields: 'id, name, parents' });
      console.log(` -> Folder ID: ${res.data.id}, Name: ${res.data.name}, Parents: ${res.data.parents?.join(',')}`);
      curr = res.data.parents ? res.data.parents[0] : null;
    } catch (err) {
      console.error('Error fetching folder:', err.message);
      break;
    }
  }
}

traceParentHierarchy('1jsx2LMhNUh_kVIBYcoGXAHMAwydv6Of6').catch(console.error);
