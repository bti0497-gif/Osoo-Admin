const path = require('path');
const { getBigQueryClient, DATASET_ID } = require(path.join(__dirname, '../server/services/bigQueryClientService.cjs'));
const { drive } = require(path.join(__dirname, '../server/services/driveService.cjs'));

async function investigateJulyUpload() {
  console.log('=== 1. BigQuery Inspection for Uploads in July 2026 ===');
  try {
    const bq = getBigQueryClient();
    if (bq) {
      const query = `
        SELECT id, site_id, site_name, date, report_date, category, drive_file_name, source_pdf_name, uploaded_at
        FROM \`${DATASET_ID}.water_quality\`
        WHERE uploaded_at >= '2026-07-01'
           OR date >= '2026-07-01'
        ORDER BY uploaded_at DESC
        LIMIT 100
      `;
      const [rows] = await bq.query({ query });
      console.log(`BigQuery returned ${rows.length} rows uploaded/dated in July 2026:`);
      rows.forEach((r, i) => {
        console.log(`[${i+1}] Date: ${r.date || r.report_date}, Site: ${r.site_name}, Category: ${r.category}, DriveFile: ${r.drive_file_name}, PDF: ${r.source_pdf_name}, UploadedAt: ${r.uploaded_at?.value || r.uploaded_at}`);
      });
    }
  } catch (err) {
    console.error('BigQuery error:', err.message);
  }

  console.log('\n=== 2. Google Drive Inspection for Files Modified in July 2026 ===');
  try {
    const res = await drive.files.list({
      q: "modifiedTime >= '2026-07-01T00:00:00Z' and trashed=false",
      fields: 'files(id, name, mimeType, parents, modifiedTime, size)',
      pageSize: 200
    });
    console.log(`Google Drive returned ${res.data.files.length} files modified in July 2026:`);
    for (const f of res.data.files) {
      let parentName = f.parents ? f.parents.join(',') : 'none';
      console.log(` - File: ${f.name} (ParentId: ${parentName}, Modified: ${f.modifiedTime}, Size: ${f.size})`);
    }
  } catch (err) {
    console.error('Drive error:', err.message);
  }
}

investigateJulyUpload().catch(console.error);
