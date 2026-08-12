const { BigQuery } = require('@google-cloud/bigquery');
const path = require('path');

const keyFile = path.join(__dirname, '../server/config/work-jindan-194620a46d59.json');
const bq = new BigQuery({
  projectId: 'work-jindan',
  keyFilename: keyFile,
});

async function checkUpload() {
  const query = `
    SELECT
      uploaded_at,
      category,
      COUNT(*) as cnt
    FROM \`daily_log_system.water_quality\`
    WHERE (
      (report_date >= '2026-07-01' AND report_date < '2026-08-01')
      OR (sample_date >= '2026-07-01' AND sample_date < '2026-08-01')
    )
    GROUP BY uploaded_at, category
    ORDER BY uploaded_at DESC
  `;

  const [rows] = await bq.query({ query, location: 'asia-northeast3' });
  console.log('=== 7월 데이터 업로드 일시 및 카테고리별 건수 ===');
  console.table(rows);
}

checkUpload().catch(console.error);
