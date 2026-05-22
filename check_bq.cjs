const { BigQuery } = require('@google-cloud/bigquery');
const path = require('path');
const bq = new BigQuery({ keyFilename: path.join(__dirname, 'server/config/work-jindan-194620a46d59.json') });
bq.query({
  query: `SELECT report_date, site_name, ss, bod, tn, tp, total_coliform, certificate_file_name, drive_file_id, created_at, uploaded_at
          FROM \`daily_log_system.certificate_water_quality\`
          WHERE created_at >= TIMESTAMP('2026-05-22 00:00:00', 'Asia/Seoul')
             OR uploaded_at >= TIMESTAMP('2026-05-22 00:00:00', 'Asia/Seoul')
          ORDER BY created_at DESC LIMIT 30`
}).then(([rows]) => {
  if (rows.length === 0) { console.log('오늘 입력된 데이터 없음 (created_at/uploaded_at KST 기준)'); return; }
  console.log(`오늘 입력된 데이터 건수: ${rows.length}개`);
  rows.forEach(r => console.log(JSON.stringify({
    date: r.report_date?.value || r.report_date,
    site: r.site_name,
    ss: r.ss, bod: r.bod, tn: r.tn, tp: r.tp, coliform: r.total_coliform,
    file: r.certificate_file_name,
    drive_id: r.drive_file_id,
    created_at: r.created_at?.value || r.created_at
  })));
}).catch(e => console.error('오류:', e.message));
