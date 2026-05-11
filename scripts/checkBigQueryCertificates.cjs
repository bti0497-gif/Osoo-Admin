const { getBigQueryClient, DATASET_ID } = require('../server/services/bigQueryClientService.cjs');

async function checkCertificates() {
  const bq = getBigQueryClient();
  if (!bq) {
    console.error('❌ BigQuery 연결 실패');
    return;
  }

  console.log('🔍 BigQuery 데이터셋:', DATASET_ID);
  console.log('🔍 테이블: certificate_water_quality');
  console.log('');

  // 2026년 4월 데이터 카운트
  const countQuery = `
    SELECT 
      COUNT(*) as total_count,
      COUNTIF(drive_file_id IS NOT NULL) as with_drive_file,
      COUNTIF(drive_file_id IS NULL) as without_drive_file
    FROM \`${DATASET_ID}.certificate_water_quality\`
    WHERE EXTRACT(YEAR FROM report_date) = 2026
      AND EXTRACT(MONTH FROM report_date) = 4
  `;

  try {
    const [countResult] = await bq.query({ query: countQuery });
    console.log('📊 2026년 4월 성적서 데이터:');
    console.log('   전체:', countResult[0].total_count, '개');
    console.log('   drive_file_id 있음:', countResult[0].with_drive_file, '개');
    console.log('   drive_file_id 없음:', countResult[0].without_drive_file, '개');
    console.log('');

    // 상세 데이터 샘플 조회
    if (countResult[0].total_count > 0) {
      const detailQuery = `
        SELECT 
          local_id,
          site_name,
          report_date,
          drive_file_id,
          certificate_file_name,
          certificate_category,
          LEFT(JSON_EXTRACT_SCALAR(source_payload_json, '$.certificate_file.drive_file_id'), 20) as json_drive_file_id
        FROM \`${DATASET_ID}.certificate_water_quality\`
        WHERE EXTRACT(YEAR FROM report_date) = 2026
          AND EXTRACT(MONTH FROM report_date) = 4
        ORDER BY report_date DESC
        LIMIT 10
      `;
      
      const [detailResult] = await bq.query({ query: detailQuery });
      console.log('📋 샘플 데이터 (최신 10개):');
      detailResult.forEach((row, i) => {
        console.log(`   ${i+1}. ${row.site_name} | ${row.report_date?.value || row.report_date} | drive_file: ${row.drive_file_id ? 'O' : 'X'} | json_drive: ${row.json_drive_file_id ? 'O' : 'X'}`);
      });
    } else {
      console.log('⚠️  2026년 4월 데이터가 없습니다!');
      
      // 다른 월 데이터 확인
      const otherMonthsQuery = `
        SELECT 
          EXTRACT(YEAR FROM report_date) as year,
          EXTRACT(MONTH FROM report_date) as month,
          COUNT(*) as count
        FROM \`${DATASET_ID}.certificate_water_quality\`
        WHERE EXTRACT(YEAR FROM report_date) = 2026
        GROUP BY year, month
        ORDER BY month
      `;
      
      const [otherResult] = await bq.query({ query: otherMonthsQuery });
      console.log('');
      console.log('📅 2026년 다른 월 데이터:');
      otherResult.forEach(row => {
        console.log(`   ${row.year}년 ${row.month}월: ${row.count}개`);
      });
    }

  } catch (err) {
    console.error('❌ 쿼리 오류:', err.message);
  }
}

checkCertificates();
