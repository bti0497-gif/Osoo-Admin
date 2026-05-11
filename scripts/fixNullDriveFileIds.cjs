const { getBigQueryClient, DATASET_ID } = require('../server/services/bigQueryClientService.cjs');

async function fixNullDriveFileIds() {
  const bq = getBigQueryClient();
  if (!bq) {
    console.error('❌ BigQuery 연결 실패');
    return;
  }

  console.log('🔧 BigQuery NULL drive_file_id 수정 시작...');
  console.log('');

  // 2026년 4월 drive_file_id IS NULL인 데이터 조회
  const selectQuery = `
    SELECT local_id, site_name, report_date, certificate_file_name
    FROM \`${DATASET_ID}.certificate_water_quality\`
    WHERE EXTRACT(YEAR FROM report_date) = 2026
      AND EXTRACT(MONTH FROM report_date) = 4
      AND drive_file_id IS NULL
  `;

  try {
    const [rows] = await bq.query({ query: selectQuery });
    console.log(`📊 대상 레코드: ${rows.length}개`);
    
    if (rows.length === 0) {
      console.log('✅ NULL인 drive_file_id가 없습니다.');
      return;
    }

    // 샘플 출력
    console.log('');
    console.log('📋 샘플 데이터:');
    rows.slice(0, 5).forEach((row, i) => {
      console.log(`   ${i+1}. ${row.site_name} | ${row.report_date?.value || row.report_date} | local_id: ${row.local_id}`);
    });
    console.log('');

    // 업데이트 쿼리 - 임시 drive_file_id 부여
    const updateQuery = `
      UPDATE \`${DATASET_ID}.certificate_water_quality\`
      SET drive_file_id = CONCAT('TEMP_', CAST(local_id AS STRING))
      WHERE EXTRACT(YEAR FROM report_date) = 2026
        AND EXTRACT(MONTH FROM report_date) = 4
        AND drive_file_id IS NULL
    `;

    console.log('📝 업데이트 실행 중...');
    const [updateResult] = await bq.query({ query: updateQuery });
    
    console.log('✅ 업데이트 완료!');
    console.log(`   영향받은 행: ${updateResult?.numDmlAffectedRows || 'N/A'}`);
    
    // 확인 쿼리
    const verifyQuery = `
      SELECT 
        COUNT(*) as total,
        COUNTIF(drive_file_id IS NULL) as null_count,
        COUNTIF(drive_file_id LIKE 'TEMP_%') as temp_count
      FROM \`${DATASET_ID}.certificate_water_quality\`
      WHERE EXTRACT(YEAR FROM report_date) = 2026
        AND EXTRACT(MONTH FROM report_date) = 4
    `;
    
    const [verifyRows] = await bq.query({ query: verifyQuery });
    console.log('');
    console.log('📊 최종 상태:');
    console.log(`   전체: ${verifyRows[0].total}개`);
    console.log(`   NULL: ${verifyRows[0].null_count}개`);
    console.log(`   TEMP_: ${verifyRows[0].temp_count}개`);

  } catch (err) {
    console.error('❌ 오류:', err.message);
    console.error(err);
  }
}

fixNullDriveFileIds();
