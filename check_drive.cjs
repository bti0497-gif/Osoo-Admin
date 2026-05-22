const path = require('path');
const { google } = require('googleapis');

const KEY_FILE = path.join(__dirname, 'server/config/work-jindan-194620a46d59.json');
const auth = new google.auth.GoogleAuth({ keyFile: KEY_FILE, scopes: ['https://www.googleapis.com/auth/drive.readonly'] });

async function main() {
  const drive = google.drive({ version: 'v3', auth: await auth.getClient() });
  const res = await drive.files.list({
    q: `modifiedTime > '2026-05-19T00:00:00' and mimeType != 'application/vnd.google-apps.folder'`,
    fields: 'files(id, name, createdTime, parents)',
    orderBy: 'createdTime desc',
    pageSize: 30,
  });
  const files = res.data.files || [];
  if (files.length === 0) { console.log('오늘 이후 수정된 파일 없음'); return; }
  files.forEach(f => console.log(f.name, '| id:', f.id, '| parents:', f.parents));
}
main().catch(e => console.error('오류:', e.message));
