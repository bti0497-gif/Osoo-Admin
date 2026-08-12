const { BigQuery } = require('@google-cloud/bigquery');
const path = require('path');

const keyFile = path.join(__dirname, '../server/config/work-jindan-194620a46d59.json');
const bq = new BigQuery({
  projectId: 'work-jindan',
  keyFilename: keyFile,
});

async function checkAllMonths() {
  const query = `
    SELECT
      EXTRACT(YEAR FROM COALESCE(sample_date, report_date)) as yr,
      EXTRACT(MONTH FROM COALESCE(sample_date, report_date)) as mo,
      COUNT(DISTINCT site_name) as distinct_sites,
      COUNT(*) as total_rows
    FROM \`daily_log_system.water_quality\`
    GROUP BY yr, mo
    ORDER BY yr DESC, mo DESC
  `;

  const [rows] = await bq.query({ query, location: 'asia-northeast3' });
  console.log('=== 월별 수질 엑셀 데이터의 고유 현장 수 및 데이터 총 행 수 ===');
  console.table(rows);
}

checkAllMonths().catch(console.error);
