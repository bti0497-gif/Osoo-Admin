const path = require('path');
const { getMonthlyPhotoSummary } = require(path.join(__dirname, '../server/services/photoExportService.cjs'));

async function inspectMeds() {
  console.log('=== Inspecting Medicine Photos for 천등산휴게소(제천방향) ===');
  const summary = await getMonthlyPhotoSummary({ siteName: '천등산휴게소(제천방향)', year: 2026, month: 7, appDataPath: '' });
  console.log('Medicine Photos Count:', summary.medicineInPhotos.count);
  console.log('Medicine Filenames:', summary.medicineInPhotos.files.map(f => f.name));
}

inspectMeds();
