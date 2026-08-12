const { BigQuery } = require('@google-cloud/bigquery');
const path = require('path');

const keyFile = path.join(__dirname, '../server/config/work-jindan-194620a46d59.json');
const bq = new BigQuery({
  projectId: 'work-jindan',
  keyFilename: keyFile,
});

async function checkJuly() {
  const query = `
    SELECT
      id,
      report_date,
      sample_date,
      site_name,
      category,
      bod, ss, tn, tp, mlss
    FROM \`daily_log_system.water_quality\`
    WHERE (CAST(report_date AS STRING) LIKE '2026-07%' OR CAST(sample_date AS STRING) LIKE '2026-07%')
  `;

  const [rows] = await bq.query({ query, location: 'asia-northeast3' });
  console.log('Total July rows:', rows.length);
  console.log('Sample rows (first 10):');
  console.log(rows.slice(0, 10));

  // 날짜별 분포 확인
  const dateCounts = {};
  rows.forEach(r => {
    const d = r.sample_date ? r.sample_date.value || String(r.sample_date) : r.report_date ? r.report_date.value || String(r.report_date) : 'unknown';
    dateCounts[d] = (dateCounts[d] || 0) + 1;
  });
  console.log('Date distribution:', dateCounts);
}

checkJuly().catch(console.error);
