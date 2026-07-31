const path = require('path');
const { getBigQueryClient, DATASET_ID } = require(path.join(__dirname, '../server/services/bigQueryClientService.cjs'));

async function listAllBqRows() {
  console.log('=== All Rows in BigQuery water_quality ===');
  try {
    const bq = getBigQueryClient();
    const query = `
      SELECT id, report_date, category, site_name, drive_file_name, source_pdf_name, uploaded_at
      FROM \`${DATASET_ID}.water_quality\`
      ORDER BY uploaded_at DESC
      LIMIT 50
    `;
    const [rows] = await bq.query({ query });
    console.log(`Found ${rows.length} total rows in BigQuery water_quality:`);
    rows.forEach((r, i) => {
      console.log(`[${i+1}] ReportDate: ${r.report_date}, Category: ${r.category}, Site: ${r.site_name}, File: ${r.drive_file_name}, PDF: ${r.source_pdf_name}, Uploaded: ${r.uploaded_at?.value || r.uploaded_at}`);
    });
  } catch (err) {
    console.error('BigQuery query error:', err.message);
  }
}

listAllBqRows().catch(console.error);
