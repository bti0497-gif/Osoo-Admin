const {test} = require('node:test');
const assert = require('node:assert/strict');
const {buildLedgerBindings,buildSludgeEvents} = require('./cheongjuBindingData.cjs');
function fixture() {
 const values={monthlyPurchase:12.5,monthlyUsage:3.25,yearUsage:103.25,endInventory:9.25};
 return {medicines:Object.fromEntries(['포도당','중탄산나트륨','팩(PAC)','폴리머','알민산나트륨'].map(n=>[n,{...values}])),
 kits:Object.fromEntries(['암모니아성질소(NH3-N)','질산성질소(NO3-N)','알칼리도(ALK)','인산염인(PO4-P)'].map(n=>[n,{...values}]))};
}
test('36 named cells keep purchase/usage/year/inventory independent',()=>{
 const b=buildLedgerBindings(fixture());assert.equal(b.length,36);
 assert.deepEqual(b.slice(0,4).map(x=>x.value),['12.5','3.25','103.25','9.25']);
 assert.equal(new Set(b.map(x=>x.bookmark)).size,36);
});
test('missing or ambiguous source is never a hardcoded success',()=>{
 const s=fixture();delete s.medicines['포도당'];assert.throws(()=>buildLedgerBindings(s));
 const t=fixture();t.medicines.PAC=t.medicines['팩(PAC)'];assert.throws(()=>buildLedgerBindings(t));
});
test('null inventory remains blank, numeric zero is retained',()=>{
 const s=fixture();s.medicines['포도당'].endInventory=null;s.medicines['중탄산나트륨'].endInventory=0;
 const b=buildLedgerBindings(s);assert.equal(b[3].value,'');assert.equal(b[7].value,'0');
});
test('sludge uses actual date and export, excludes meter values/other months',()=>{
 const rows=[{date:'2026-08-05',type:'슬러지',sludge_export:12.5},
 {date:'2026-08-05',type:'유입유량계',raw_value:20000},{date:'2026-07-11',type:'슬러지',sludge_export:43}];
 assert.deepEqual(buildSludgeEvents(rows,2026,8).map(x=>[x.dayNum,x.weight,x.time]),[[5,'12.5','']]);
 assert.deepEqual(buildSludgeEvents([],2026,8),[]);
 assert.throws(()=>buildSludgeEvents([rows[0],rows[0]],2026,8));
});
