const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {selectSingleEvidence} = require('./cheongjuEvidenceSelection.cjs');
test('canonical monthly name takes precedence over legacy alias', t => {
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cheongju-selection-'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const a=path.join(dir,'명세서_202608_청주 대신.png'),b=path.join(dir,'청주 대신.png');
 fs.writeFileSync(a,'current');fs.writeFileSync(b,'older');
 assert.deepEqual(selectSingleEvidence([b,a],'명세서_202608_','test'),[a]);
});
test('identical renamed files deduplicate, different candidates fail', t => {
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cheongju-selection-'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const a=path.join(dir,'first.png'),b=path.join(dir,'second.png');
 fs.writeFileSync(a,'same');fs.writeFileSync(b,'same');
 assert.deepEqual(selectSingleEvidence([a,b],'명세서_202608_','test'),[a]);
 fs.writeFileSync(b,'different');
 assert.throws(()=>selectSingleEvidence([a,b],'명세서_202608_','test'));
});
