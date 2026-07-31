const { drive } = require('../server/services/driveService.cjs');

async function inspectAllJulyPhotos() {
  const qFolder = "name = '관리사진' and mimeType = 'application/vnd.google-apps.folder' and trashed = false";
  const folderRes = await drive.files.list({ q: qFolder, fields: 'files(id, name)' });
  const photoRootFolder = folderRes.data.files[0];
  if (!photoRootFolder) return;

  const yyyyFolderRes = await drive.files.list({
    q: `'${photoRootFolder.id}' in parents and name = '2026' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: 'files(id, name)',
  });
  const yearFolder = yyyyFolderRes.data.files[0];
  const mmFolderRes = await drive.files.list({
    q: `'${yearFolder.id}' in parents and (name = '07' or name = '7') and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: 'files(id, name)',
  });
  const monthFolder = mmFolderRes.data.files[0];

  const filesRes = await drive.files.list({
    q: `'${monthFolder.id}' in parents and trashed = false`,
    fields: 'files(id, name, mimeType)',
    pageSize: 1000,
  });

  const allFiles = filesRes.data.files || [];
  console.log(`Total files in 2026/07: ${allFiles.length}`);

  // Sample unique naming patterns
  const sampleNames = allFiles.map(f => f.name);
  
  const testPhotos = sampleNames.filter(n => n.includes('수질분석') || n.includes('실험'));
  const sludgePhotos = sampleNames.filter(n => n.includes('슬러지'));
  const certPhotos = sampleNames.filter(n => n.includes('청소필증'));
  const medPhotos = sampleNames.filter(n => n.includes('약품') || n.includes('PAC') || n.includes('포도당') || n.includes('중탄산'));
  const kitPhotos = sampleNames.filter(n => n.includes('키트'));

  console.log('Sample 수질분석 photos count:', testPhotos.length, 'Sample:', testPhotos.slice(0, 5));
  console.log('Sample 슬러지 photos count:', sludgePhotos.length, 'Sample:', sludgePhotos.slice(0, 5));
  console.log('Sample 청소필증 photos count:', certPhotos.length, 'Sample:', certPhotos.slice(0, 5));
  console.log('Sample 약품 photos count:', medPhotos.length, 'Sample:', medPhotos.slice(0, 5));
  console.log('Sample 키트 photos count:', kitPhotos.length, 'Sample:', kitPhotos.slice(0, 5));

  // Print any file containing '천등산'
  const cheondung = sampleNames.filter(n => n.includes('천등산'));
  console.log('\nALL files containing 천등산:', cheondung);
}

inspectAllJulyPhotos();
