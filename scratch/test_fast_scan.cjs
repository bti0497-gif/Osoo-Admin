const path = require('path');
const { drive } = require(path.join(__dirname, '../server/services/driveService.cjs'));

function extractSiteKeywords(siteName) {
  const name = String(siteName || '').trim();
  if (!name) return [];

  const tokens = new Set([name]);
  const match = name.match(/^([^(]+)(?:\(([^)]+)\))?/);
  if (match) {
    if (match[1]) {
      const base = match[1].trim();
      tokens.add(base);
      tokens.add(base.replace(/휴게소|처리장|사업소|하수|정수/g, '').trim());
    }
    if (match[2]) {
      const sub = match[2].trim();
      tokens.add(sub);
      tokens.add(sub.replace(/방향|휴게소/g, '').trim());
    }
  }
  return Array.from(tokens).filter((t) => t && t.length >= 2);
}

async function fastScan(siteName, yyyy, mm) {
  if (!drive) return { count: 0, files: [] };

  const keywords = extractSiteKeywords(siteName);
  console.log(`[FastScan] Querying photos for '${siteName}', Keywords:`, keywords);

  // 1. 관리사진 폴더 ID 탐색
  const qFolder = "name = '관리사진' and mimeType = 'application/vnd.google-apps.folder' and trashed = false";
  const folderRes = await drive.files.list({ q: qFolder, fields: 'files(id, name)' });
  const photoRootFolder = folderRes.data.files[0];
  if (!photoRootFolder) {
    console.log('관리사진 루트 폴더를 찾을 수 없음');
    return [];
  }

  // 2. 관리사진 / YYYY / MM 폴더 탐색
  const yyyyFolderRes = await drive.files.list({
    q: `'${photoRootFolder.id}' in parents and name = '${yyyy}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: 'files(id, name)',
  });
  const yearFolder = yyyyFolderRes.data.files[0];
  if (!yearFolder) return [];

  const mmFolderRes = await drive.files.list({
    q: `'${yearFolder.id}' in parents and (name = '${mm}' or name = '${String(Number(mm))}') and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: 'files(id, name)',
  });
  const monthFolder = mmFolderRes.data.files[0];
  if (!monthFolder) return [];

  // 3. 해당 연월 폴더 내 모든 파일 리스팅 (단 1회의 쿼리)
  const filesRes = await drive.files.list({
    q: `'${monthFolder.id}' in parents and trashed = false`,
    fields: 'files(id, name, mimeType)',
    pageSize: 500,
  });

  const allFiles = filesRes.data.files || [];
  console.log(`[FastScan] Total files in ${yyyy}/${mm} folder:`, allFiles.length);

  // 4. 현장 키워드가 포함된 파일 피터링
  const matched = allFiles.filter((f) => {
    return keywords.some((kw) => f.name.includes(kw));
  });

  console.log(`[FastScan] Matched ${matched.length} files for '${siteName}':`, matched.map(f => f.name));
  return matched;
}

async function main() {
  await fastScan('천등산휴게소(평택방향)', '2026', '07');
  await fastScan('홍천휴게소(양양방향)', '2026', '07');
  await fastScan('안동휴게소(부산방향)', '2026', '07');
}

main();
