const { BigQuery } = require('@google-cloud/bigquery');
const path = require('path');

const keyFile = path.join(__dirname, '../server/config/work-jindan-194620a46d59.json');
const bq = new BigQuery({
  projectId: 'work-jindan',
  keyFilename: keyFile,
});

async function investigate() {
  console.log('=== 1. BigQuery daily_log_system.water_quality 7월 전체 Raw Count (ROW_NUMBER 미적용) ===');
  const rawQuery = `
    SELECT
      report_date,
      sample_date,
      category,
      site_name,
      site_name_raw,
      uploaded_at,
      source_pdf_name
    FROM \`daily_log_system.water_quality\`
    WHERE (
      (report_date >= '2026-07-01' AND report_date < '2026-08-01')
      OR (sample_date >= '2026-07-01' AND sample_date < '2026-08-01')
    )
  `;
  const [rawRows] = await bq.query({ query: rawQuery, location: 'asia-northeast3' });
  console.log('7월 rawRows 총 개수:', rawRows.length);

  // category 별 개수
  const catCount = {};
  rawRows.forEach(r => {
    catCount[r.category] = (catCount[r.category] || 0) + 1;
  });
  console.log('7월 category 별 raw 개수:', catCount);

  console.log('\n=== 2. BigQuery 전체 날짜 범위 (report_date / sample_date) 데이터 건수 ===');
  const allDateQuery = `
    SELECT
      EXTRACT(YEAR FROM COALESCE(sample_date, report_date)) as yr,
      EXTRACT(MONTH FROM COALESCE(sample_date, report_date)) as mo,
      category,
      COUNT(*) as cnt
    FROM \`daily_log_system.water_quality\`
    GROUP BY yr, mo, category
    ORDER BY yr DESC, mo DESC
  `;
  const [allDateRows] = await bq.query({ query: allDateQuery, location: 'asia-northeast3' });
  console.table(allDateRows);

  console.log('\n=== 3. qntech_water_quality 테이블 7월 데이터 확인 ===');
  try {
    const qnQuery = `
      SELECT COUNT(*) as cnt
      FROM \`daily_log_system.qntech_water_quality\`
      WHERE (
        (report_date >= '2026-07-01' AND report_date < '2026-08-01')
        OR (sample_date >= '2026-07-01' AND sample_date < '2026-08-01')
      )
    `;
    const [qnRows] = await bq.query({ query: qnQuery, location: 'asia-northeast3' });
    console.log('qntech_water_quality 7월 건수:', qnRows[0]?.cnt);
  } catch (e) {
    console.log('qntech_water_quality 조회 실패:', e.message);
  }
}

investigate().catch(console.error);
