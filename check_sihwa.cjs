const { BigQuery } = require('@google-cloud/bigquery');
const path = require('path');
const bq = new BigQuery({ keyFilename: path.join(__dirname, 'server/config/work-jindan-194620a46d59.json') });

bq.query({
  query: `
    SELECT
      CAST(report_date AS STRING) AS rd,
      site_name,
      site_name_raw,
      category,
      drive_file_name,
      source_pdf_name,
      uploaded_at
    FROM \`daily_log_system.water_quality\`
    WHERE site_name LIKE @s OR site_name_raw LIKE @s
    ORDER BY rd, uploaded_at DESC
  `,
  params: { s: '%시화호%' },
  types: { s: 'STRING' },
  location: 'asia-northeast3',
}).then(([rows]) => {
  console.log('시화호 관련 행:', rows.length, '건\n');
  rows.forEach(r => console.log(JSON.stringify({
    rd: r.rd,
    site: r.site_name,
    raw: r.site_name_raw,
    cat: r.category,
    drive_file: r.drive_file_name,
    source_pdf: r.source_pdf_name,
    uploaded_at: r.uploaded_at,
  }, null, 0)));
}).catch(e => console.error('오류:', e.message));
