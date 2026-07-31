const path = require('path');
const { getBigQueryClient, DATASET_ID } = require(path.join(__dirname, '../server/services/bigQueryClientService.cjs'));

async function traceAnhwaRow() {
  console.log('=== Deep Inspection of 안화호웅물 Row in BigQuery ===');
  try {
    const bq = getBigQueryClient();
    const [metadata] = await bq.dataset(DATASET_ID).table('water_quality').getMetadata();
    console.log('Columns in water_quality:', metadata.schema.fields.map(f => f.name));

    const query = `
      SELECT *
      FROM \`${DATASET_ID}.water_quality\`
      WHERE site_name LIKE '%안화%'
         OR site_name LIKE '%호응%'
         OR site_name LIKE '%호웅%'
         OR drive_file_name LIKE '%안화%'
         OR drive_file_name LIKE '%20260719%'
         OR report_date = '2026-07-19'
      ORDER BY uploaded_at DESC
    `;
    const [rows] = await bq.query({ query });
    console.log(`Found ${rows.length} matching rows in BigQuery water_quality:`);
    rows.forEach((r, i) => {
      console.log(`\n--- Row ${i + 1} ---`);
      Object.keys(r).forEach(k => {
        if (r[k] !== null && r[k] !== undefined) {
          console.log(`  ${k}:`, r[k]?.value || r[k]);
        }
      });
    });
  } catch (err) {
    console.error('BigQuery query error:', err.message);
  }
}

traceAnhwaRow().catch(console.error);
