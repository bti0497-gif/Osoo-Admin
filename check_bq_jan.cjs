const { BigQuery } = require('@google-cloud/bigquery');
const path = require('path');
const bq = new BigQuery({ keyFilename: path.join(__dirname, 'server/config/work-jindan-194620a46d59.json') });
bq.query({
  query: `SELECT report_date, site_name, ss, bod, certificate_file_name, drive_file_id
          FROM \`daily_log_system.certificate_water_quality\`
          WHERE report_date >= '2026-01-01' AND report_date < '2026-02-01'
          ORDER BY report_date, site_name LIMIT 50`
}).then(([rows]) => {
  if (rows.length === 0) { console.log('1월 데이터 없음 → 재업로드 필요'); return; }
  console.log('1월 데이터 총', rows.length, '건');
  rows.forEach(r => console.log(JSON.stringify({
    date: r.report_date?.value || r.report_date,
    site: r.site_name,
    ss: r.ss, bod: r.bod,
    file: r.certificate_file_name,
    drive_id: r.drive_file_id,
  })));
}).catch(e => console.error('오류:', e.message));
