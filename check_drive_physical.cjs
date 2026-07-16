const { google } = require('googleapis');
const path = require('path');
const DRIVE_KEY = path.join(__dirname, 'server/config/google-key.json');
const MONTH_FOLDER_ID = '1bubn0eFWffe_m4l2nJzip1YfYXFPGTvi'; // 2026/02 폴더 ID

const driveAuth = new google.auth.GoogleAuth({
  keyFile: DRIVE_KEY,
  scopes: ['https://www.googleapis.com/auth/drive.readonly'],
});
const drive = google.drive({ version: 'v3', auth: driveAuth });

// 검증하려는 누락 대상 8건의 실제 파일명 목록
const TARGET_FILES = [
  '성적서_20260211_금왕휴게소(평택방향).jpg',
  '성적서_20260211_동명휴게소(부산방향).jpg',
  '성적서_20260211_동명휴게소(춘천방향).jpg',
  '성적서_20260211_외동휴게소(포항).jpg',
  '성적서_20260211_죽암휴게소(부산방향).jpg',
  '성적서_20260211_죽암휴게소(서울방향).jpg',
  '성적서_20260211_횡성휴게소(강릉방향).jpg',
  '성적서_20260211_횡성휴게소(인천방향).jpg',
];

(async () => {
  console.log('2026/02 폴더 내 전체 파일 목록 조회 중...');
  const res = await drive.files.list({
    q: `'${MONTH_FOLDER_ID}' in parents and trashed=false`,
    fields: 'files(id, name, webViewLink, size)',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    pageSize: 1000,
  });

  const filesInFolder = res.data.files || [];
  console.log(`구글 드라이브 02 폴더 내 실제 파일 개수: ${filesInFolder.length}개\n`);

  console.log('=== 누락 대상 8건에 대한 드라이브 교차 확인 ===');
  TARGET_FILES.forEach(target => {
    const found = filesInFolder.find(f => f.name.replace(/\s+/g, '') === target.replace(/\s+/g, ''));
    if (found) {
      console.log(`✅ [존재함] : "${target}"`);
      console.log(`             ID: ${found.id}`);
      console.log(`             크기: ${found.size ? (found.size / 1024).toFixed(1) + ' KB' : '알수없음'}`);
      console.log(`             링크: ${found.webViewLink}\n`);
    } else {
      console.log(`❌ [진짜없음]: "${target}"\n`);
    }
  });

  console.log('=== 드라이브 내에 2026-02-11 날짜가 포함된 다른 모든 파일들 ===');
  const matchedDate = filesInFolder.filter(f => f.name.includes('20260211') || f.name.includes('0211'));
  matchedDate.forEach(f => {
    console.log(`   - ${f.name} (크기: ${f.size || 0} bytes)`);
  });
})().catch(e => console.error(e.message));
