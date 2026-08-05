const { BigQuery } = require('@google-cloud/bigquery');
const path = require('path');

const keyFile = path.join(__dirname, '..', 'server', 'config', 'work-jindan-194620a46d59.json');
const bq = new BigQuery({
  projectId: 'work-jindan',
  keyFilename: keyFile,
});

async function main() {
  try {
    const [rows] = await bq.query({
      query: `
        SELECT date, site_name, location, item_name, item_code, result_numeric, result_value
        FROM \`work-jindan.daily_log_system.qntech_water_quality\`
        ORDER BY date DESC
        LIMIT 20
      `,
      location: 'asia-northeast3',
    });
    console.log('qntech_water_quality rows count:', rows.length);
    console.log(JSON.stringify(rows, null, 2));
  } catch (err) {
    console.error('BigQuery error:', err.message);
  }
}

main();
