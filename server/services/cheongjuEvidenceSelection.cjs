const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

function selectSingleEvidence(files, prefix, label) {
  const canonical = files.filter(file => path.basename(file).startsWith(prefix));
  const candidates = canonical.length ? canonical : files;
  const distinct = new Map();
  for (const file of candidates) {
    const digest = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
    if (!distinct.has(digest)) distinct.set(digest, file);
  }
  if (distinct.size > 1) throw new Error(`${label}: 서로 다른 증빙 ${distinct.size}장이 발견됐습니다. 파일을 확인해주세요: ${[...distinct.values()].map(file => path.basename(file)).join(', ')}`);
  const selected = [...distinct.values()];
  console.log(`[Cheongju evidence] ${label}: ${JSON.stringify({selected: selected.map(file => path.basename(file)), excluded: files.filter(file => !selected.includes(file)).map(file => path.basename(file))})}`);
  return selected;
}
module.exports = { selectSingleEvidence };
