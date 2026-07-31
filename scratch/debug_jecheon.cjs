const path = require('path');
const { getMonthlyPhotoSummary } = require(path.join(__dirname, '../server/services/photoExportService.cjs'));

async function debugJecheon() {
  console.log('=== Testing getMonthlyPhotoSummary for 천등산휴게소(제천방향) ===');
  const summary = await getMonthlyPhotoSummary({ siteName: '천등산휴게소(제천방향)', year: 2026, month: 7, appDataPath: '' });
  console.log('Result for 천등산휴게소(제천방향):', JSON.stringify(summary, null, 2));
}

debugJecheon();
