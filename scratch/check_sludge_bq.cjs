'use strict';
const { BigQuery } = require('@google-cloud/bigquery');
const path = require('path');

const keyFile = path.join(__dirname, '../server/config/work-jindan-194620a46d59.json');
const bq = new BigQuery({ projectId: 'work-jindan', keyFilename: keyFile });

async function check() {
  const query = `
    SELECT date, site_name, type, raw_value, calculated_flow, sludge_export
    FROM \`daily_log_system.flow_readings\`
    WHERE date >= '2026-07-01' AND date <= '2026-07-31'
      AND type = '슬러지'
    ORDER BY site_name, date
  `;
  const [rows] = await bq.query({ query, location: 'asia-northeast3' });
  console.log('Query returned rows count:', rows.length);
  for (const r of rows) {
    if (r.sludge_export > 0 || r.raw_value > 0) {
      console.log(`${r.date?.value || r.date} | ${r.site_name} | raw:${r.raw_value} | calc:${r.calculated_flow} | export:${r.sludge_export}`);
    }
  }
}

check().catch(console.error);
