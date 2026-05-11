const { getBigQueryClient, DATASET_ID } = require('../server/services/bigQueryClientService.cjs');

async function checkSourcePayload() {
  const bq = getBigQueryClient();
  if (!bq) {
    console.error('❌ BigQuery 연결 실패');
    return;
  }

  console.log('🔍 source_payload_json 구조 확인...');
  console.log('');

  // 2026년 4월 데이터 중 source_payload_json 확인
  const query = `
    SELECT 
      local_id,
      site_name,
      report_date,
      certificate_file_name,
      drive_file_id,
      source_payload_json,
      JSON_EXTRACT_SCALAR(source_payload_json, '$.certificate_file.file_name') as json_file_name,
      JSON_EXTRACT_SCALAR(source_payload_json, '$.certificate_file.category') as json_category,
      JSON_EXTRACT_SCALAR(source_payload_json, '$.certificate_file.drive_file_id') as json_drive_id
    FROM \`${DATASET_ID}.certificate_water_quality\`
    WHERE EXTRACT(YEAR FROM report_date) = 2026
      AND EXTRACT(MONTH FROM report_date) = 4
    ORDER BY local_id DESC
    LIMIT 5
  `;

  try {
    const [rows] = await bq.query({ query });
    console.log(`📊 샘플 데이터 (${rows.length}개):`);
    console.log('');
    
    rows.forEach((row, i) => {
      console.log(`--- 레코드 ${i+1} ---`);
      console.log(`  local_id: ${row.local_id}`);
      console.log(`  site_name: ${row.site_name}`);
      console.log(`  report_date: ${row.report_date?.value || row.report_date}`);
      console.log(`  certificate_file_name: ${row.certificate_file_name}`);
      console.log(`  drive_file_id: ${row.drive_file_id}`);
      console.log(`  json_file_name: ${row.json_file_name}`);
      console.log(`  json_category: ${row.json_category}`);
      console.log(`  json_drive_id: ${row.json_drive_id}`);
      console.log(`  source_payload_json (앞 200자): ${String(row.source_payload_json || '').substring(0, 200)}`);
      console.log('');
    });

    // NULL 값 카운트
    const countQuery = `
      SELECT 
        COUNT(*) as total,
        COUNTIF(certificate_file_name IS NOT NULL) as has_file_name,
        COUNTIF(certificate_file_name IS NULL AND source_payload_json IS NOT NULL) as null_file_but_has_json,
        COUNTIF(certificate_file_name IS NULL AND source_payload_json IS NULL) as both_null
      FROM \`${DATASET_ID}.certificate_water_quality\`
      WHERE EXTRACT(YEAR FROM report_date) = 2026
        AND EXTRACT(MONTH FROM report_date) = 4
    `;
    
    const [countRows] = await bq.query({ query: countQuery });
    console.log('📈 2026년 4월 전체 통계:');
    console.log(`   전체: ${countRows[0].total}개`);
    console.log(`   certificate_file_name 있음: ${countRows[0].has_file_name}개`);
    console.log(`   file_name NULL + JSON 있음: ${countRows[0].null_file_but_has_json}개`);
    console.log(`   둘 다 NULL: ${countRows[0].both_null}개`);

  } catch (err) {
    console.error('❌ 오류:', err.message);
  }
}

checkSourcePayload();
