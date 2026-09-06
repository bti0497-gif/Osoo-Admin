'use strict';

const normalize = (name) => String(name).replace(/\s/g, '').toLowerCase();
const columns = [
  ['monthlyPurchase', '구입량'], ['monthlyUsage', '사용량'],
  ['yearUsage', '년간누계'], ['endInventory', '잔량'],
];
function buildLedgerBindings(summary) {
  const definitions = [
    ['medicines', '포도당', ['포도당']],
    ['medicines', '중탄산', ['중탄산나트륨', '중탄산']],
    ['medicines', '팩', ['팩(PAC)', 'PAC', '응집제']],
    ['medicines', '폴리머', ['폴리머']],
    ['medicines', '알민산', ['알민산나트륨', '알미늄산소다', '알루미늄소다']],
    ['kits', '암모니아', ['암모니아성질소(NH3-N)', '암모니아성질소']],
    ['kits', '질산', ['질산성질소(NO3-N)', '질산성질소']],
    ['kits', '인', ['인산염인(PO4-P)', '인산염인']],
    ['kits', '알칼리', ['알칼리도(ALK)', '알칼리도']],
  ];
  return definitions.flatMap(([group, prefix, aliases]) => {
    const matches = Object.entries(summary[group] || {}).filter(([name]) => aliases.map(normalize).includes(normalize(name)));
    if (matches.length !== 1) throw new Error(`${prefix}: 조회 품목이 없거나 중복됩니다 (${matches.length}건)`);
    const [sourceName, values] = matches[0];
    const suffixes = group === 'kits' ? ['구매', '사용', '누계', '잔량'] : ['구입량', '사용량', '누계', '잔량'];
    return columns.map(([key, header], i) => {
      const raw = values[key];
      if (raw === undefined || (raw !== null && !Number.isFinite(Number(raw)))) throw new Error(`${sourceName}: ${key} 조회값이 없습니다`);
      return { bookmark: prefix + suffixes[i], header, sourceName, sourceColumn: key,
        value: raw === null ? '' : Number(raw).toLocaleString('en-US', { maximumFractionDigits: 6 }) };
    });
  });
}

function buildSludgeEvents(rows, year, month) {
  const prefix = `${year}-${String(month).padStart(2, '0')}-`;
  const events = new Map();
  for (const row of rows) {
    if (row.type !== '슬러지') continue;
    const date = String(row.date?.value || row.date || '').slice(0, 10);
    if (!date.startsWith(prefix)) continue;
    const value = row.sludge_export ?? row.sludgeExport ?? row.raw_value;
    if (value == null || Number(value) === 0) continue;
    if (!Number.isFinite(Number(value)) || Number(value) < 0) throw new Error(`슬러지 ${date}: 잘못된 반출량`);
    if (events.has(date)) throw new Error(`슬러지 ${date}: 중복 반출 행 확인 필요`);
    events.set(date, { dayNum: Number(date.slice(-2)), vendor: '국민환경', time: '',
      weight: Number(value).toLocaleString('en-US', { maximumFractionDigits: 6 }) });
  }
  return [...events.values()];
}
module.exports = { buildLedgerBindings, buildSludgeEvents };
