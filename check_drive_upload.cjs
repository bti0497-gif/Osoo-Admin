const path = require('path');
const fs = require('fs');
const FormData = require('form-data');
const http = require('http');

const testFileName = '성적서_20260401_횡성휴게소(인천방향).jpg';
const fakeImageBuffer = Buffer.from('fake image content for test');

const form = new FormData();
form.append('files', fakeImageBuffer, { filename: testFileName, contentType: 'image/jpeg' });

const options = {
  hostname: '127.0.0.1',
  port: 8901,
  path: '/api/certificates/manual-upload-file',
  method: 'POST',
  headers: {
    ...form.getHeaders(),
    'x-user-role': 'super_admin',
    'x-user-name': 'admin',
  },
};

const req = http.request(options, res => {
  let data = '';
  res.on('data', c => data += c);
  res.on('end', () => {
    console.log('Status:', res.statusCode);
    try { console.log('Body:', JSON.stringify(JSON.parse(data), null, 2)); }
    catch (_) { console.log('Body:', data.substring(0, 500)); }
  });
});
req.on('error', e => console.error('연결 오류:', e.message));
form.pipe(req);
