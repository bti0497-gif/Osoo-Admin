const { BigQuery } = require('@google-cloud/bigquery');
const path = require('path');

const keyFile = path.join(__dirname, '../server/config/work-jindan-194620a46d59.json');
const bq = new BigQuery({
  projectId: 'work-jindan',
  keyFilename: keyFile,
});

async function traceJulyDetails() {
  console.log('=== 1. daily_log_system.water_quality 테이블 전체 7월 데이터 행 상세 ===');
  const q1 = `
    SELECT id, uploaded_at, report_date, sample_date, category, site_name, site_name_raw, source_row_order
    FROM \`daily_log_system.water_quality\`
    WHERE (
      (report_date >= '2026-07-01' AND report_date < '2026-08-01')
      OR (sample_date >= '2026-07-01' AND sample_date < '2026-08-01')
    )
    ORDER BY category, site_name
  `;
  const [rows1] = await bq.query({ query: q1, location: 'asia-northeast3' });
  console.log('7월 total rows:', rows1.length);
  console.table(rows1.map(r => ({
    category: r.category,
    site_name: r.site_name,
    uploaded_at: r.uploaded_at ? r.uploaded_at.value : null,
    report_date: r.report_date ? r.report_date.value : null,
    sample_date: r.sample_date ? r.sample_date.value : null,
    row_order: r.source_row_order
  })));

  console.log('\n=== 2. 혹시 7월 데이터 중 report_date나 sample_date가 7월이 아닌 다른 날짜(NULL 등)로 입력되었을 가능성 조사 ===');
  const q2 = `
    SELECT
      id, uploaded_at, report_date, sample_date, category, site_name, site_name_raw
    FROM \`daily_log_system.water_quality\`
    WHERE uploaded_at >= '2026-07-01' AND uploaded_at < '2026-08-01'
    ORDER BY uploaded_at DESC
    LIMIT 50
  `;
  const [rows2] = await bq.query({ query: q2, location: 'asia-northeast3' });
  console.log('7월에 업로드(uploaded_at)된 행 전체 건수 (LIMIT 50):', rows2.length);
  const dates = {};
  rows2.forEach(r => {
    const d = r.sample_date ? r.sample_date.value : r.report_date ? r.report_date.value : 'NULL';
    dates[d] = (dates[d] || 0) + 1;
  });
  console.log('7월 업로드 행들의 sample_date/report_date 분포:', dates);

  console.log('\n=== 3. 6월 데이터의 category별 건수 및 site_name 목록 비교 ===');
  const q3 = `
    SELECT category, site_name
    FROM \`daily_log_system.water_quality\`
    WHERE (
      (report_date >= '2026-06-01' AND report_date < '2026-07-01')
      OR (sample_date >= '2026-06-01' AND sample_date < '2026-07-01')
    )
  `;
  const [rows3] = await bq.query({ query: q3, location: 'asia-northeast3' });
  const junSitesByCat = {};
  rows3.forEach(r => {
    junSitesByCat[r.category] = junSitesByCat[r.category] || new Set();
    junSitesByCat[r.category].add(r.site_name);
  });
  console.log('6월 excel_5items 현장 수:', junSitesByCat['excel_5items']?.size);
  console.log('6월 excel_mlss 현장 수:', junSitesByCat['excel_mlss']?.size);
}

traceJulyDetails().catch(console.error);
