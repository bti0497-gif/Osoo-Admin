const path = require('path');
const { getMonthlyPhotoSummary } = require(path.join(__dirname, '../server/services/photoExportService.cjs'));

async function test() {
  console.log('=== Testing getMonthlyPhotoSummary for 천등산휴게소(평택방향) ===');
  const summary1 = await getMonthlyPhotoSummary({ siteName: '천등산휴게소(평택방향)', year: 2026, month: 7, appDataPath: '' });
  console.log('Result for 천등산휴게소(평택방향):', {
    testPhotos: summary1.testPhotos,
    sludgePhotos: summary1.sludgePhotos,
    cleaningCertificates: summary1.cleaningCertificates,
    medicineInPhotos: summary1.medicineInPhotos,
    kitInPhotos: summary1.kitInPhotos,
  });

  console.log('\n=== Testing getMonthlyPhotoSummary for 홍천휴게소(양양방향) ===');
  const summary2 = await getMonthlyPhotoSummary({ siteName: '홍천휴게소(양양방향)', year: 2026, month: 7, appDataPath: '' });
  console.log('Result for 홍천휴게소(양양방향):', {
    testPhotos: summary2.testPhotos,
    sludgePhotos: summary2.sludgePhotos,
    cleaningCertificates: summary2.cleaningCertificates,
    medicineInPhotos: summary2.medicineInPhotos,
    kitInPhotos: summary2.kitInPhotos,
  });

  console.log('\n=== Testing getMonthlyPhotoSummary for 안동휴게소(부산방향) ===');
  const summary3 = await getMonthlyPhotoSummary({ siteName: '안동휴게소(부산방향)', year: 2026, month: 7, appDataPath: '' });
  console.log('Result for 안동휴게소(부산방향):', {
    testPhotos: summary3.testPhotos,
    sludgePhotos: summary3.sludgePhotos,
    cleaningCertificates: summary3.cleaningCertificates,
    medicineInPhotos: summary3.medicineInPhotos,
    kitInPhotos: summary3.kitInPhotos,
  });
}

test();
