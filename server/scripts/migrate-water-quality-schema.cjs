/**
 * BigQuery water_quality 테이블 스키마 마이그레이션 스크립트
 * 
 * 기존: 개별 항목 칼럼 (bod, ss, tn, tp, mlss, total_coliform 등)
 * 신규: items, results 문자열 칼럼
 * 
 * 실행: node migrate-water-quality-schema.cjs
 */
const { BigQuery } = require('@google-cloud/bigquery');
const path = require('path');

const bq = new BigQuery({
  projectId: 'work-jindan',
  keyFilename: path.join(__dirname, '../config/work-jindan-194620a46d59.json'),
});

const DATASET = 'wastewater_data';
const OLD_TABLE = 'certificate_water_quality';
const NEW_TABLE = 'certificate_water_quality_v2';

// 리전 자동 탐지
async function findDatasetRegion() {
  const regions = ['asia-northeast1', 'asia-northeast2', 'asia-northeast3', 'asia-east1', 'asia-east2', 'asia-southeast1'];
  
  for (const region of regions) {
    try {
      const query = `SELECT 1 FROM \`${DATASET}.${OLD_TABLE}\` LIMIT 1`;
      await bq.query({ query, location: region });
      console.log(`✅ 데이터셋 리전 발견: ${region}`);
      return region;
    } catch (err) {
      if (err.message.includes('was not found in location')) continue;
      throw err;
    }
  }
  throw new Error('데이터셋을 찾을 수 없습니다.');
}

// 새 테이블 생성
async function createNewTable(region) {
  const createTableQuery = `
    CREATE OR REPLACE TABLE \`${DATASET}.${NEW_TABLE}\` (
      site_name STRING,
      site_name_raw STRING,
      report_date DATE,
      items STRING,
      results STRING,
      source_pdf_name STRING,
      source_page_index INT64,
      uploaded_at TIMESTAMP
    )
    PARTITION BY DATE(uploaded_at)
    OPTIONS(
      description='수질성적서 데이터 (간소화된 스키마)'
    )
  `;
  
  await bq.query({ query: createTableQuery, location: region });
  console.log(`✅ 새 테이블 생성: ${NEW_TABLE}`);
}

// 기존 데이터 마이그레이션
async function migrateData(region) {
  const insertQuery = `
    INSERT INTO \`${DATASET}.${NEW_TABLE}\` (
      site_name, site_name_raw, report_date,
      items, results,
      source_pdf_name, source_page_index,
      uploaded_at
    )
    SELECT
      site_name,
      site_name_raw,
      report_date,
      -- items 문자열 생성
      CONCAT(
        IF(bod IS NOT NULL, 'BOD', ''),
        IF(ss IS NOT NULL, IF(bod IS NOT NULL, ',SS', 'SS'), ''),
        IF(tn IS NOT NULL, IF(bod IS NOT NULL OR ss IS NOT NULL, ',TN', 'TN'), ''),
        IF(tp IS NOT NULL, IF(bod IS NOT NULL OR ss IS NOT NULL OR tn IS NOT NULL, ',TP', 'TP'), ''),
        IF(total_coliform IS NOT NULL, IF(bod IS NOT NULL OR ss IS NOT NULL OR tn IS NOT NULL OR tp IS NOT NULL, ',총대장균군', '총대장균군'), ''),
        IF(mlss IS NOT NULL, 'MLSS', '')
      ) AS items,
      -- results 문자열 생성
      CONCAT(
        IF(bod IS NOT NULL, CAST(bod AS STRING), ''),
        IF(ss IS NOT NULL, IF(bod IS NOT NULL, CONCAT(',', CAST(ss AS STRING)), CAST(ss AS STRING)), ''),
        IF(tn IS NOT NULL, IF(bod IS NOT NULL OR ss IS NOT NULL, CONCAT(',', CAST(tn AS STRING)), CAST(tn AS STRING)), ''),
        IF(tp IS NOT NULL, IF(bod IS NOT NULL OR ss IS NOT NULL OR tn IS NOT NULL, CONCAT(',', CAST(tp AS STRING)), CAST(tp AS STRING)), ''),
        IF(total_coliform IS NOT NULL, IF(bod IS NOT NULL OR ss IS NOT NULL OR tn IS NOT NULL OR tp IS NOT NULL, CONCAT(',', CAST(total_coliform AS STRING)), CAST(total_coliform AS STRING)), ''),
        IF(mlss IS NOT NULL, CAST(mlss AS STRING), '')
      ) AS results,
      source_pdf_name,
      source_page_index,
      uploaded_at
    FROM \`${DATASET}.${OLD_TABLE}\`
    WHERE site_name IS NOT NULL
  `;
  
  const [job] = await bq.query({ query: insertQuery, location: region });
  console.log(`✅ 데이터 마이그레이션 완료`);
  
  // 통계 확인
  const statsQuery = `SELECT COUNT(*) as count FROM \`${DATASET}.${NEW_TABLE}\``;
  const [rows] = await bq.query({ query: statsQuery, location: region });
  console.log(`📊 마이그레이션된 레코드: ${rows[0].count}개`);
}

// 테이블 교체 (원본 -> 백업, 신규 -> 원본)
async function swapTables(region) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const backupTable = `${OLD_TABLE}_backup_${timestamp}`;
  
  // 1. 원본을 백업
  const backupQuery = `CREATE TABLE \`${DATASET}.${backupTable}\` AS SELECT * FROM \`${DATASET}.${OLD_TABLE}\``;
  await bq.query({ query: backupQuery, location: region });
  console.log(`✅ 원본 백업: ${backupTable}`);
  
  // 2. 원본 삭제
  const dropQuery = `DROP TABLE IF EXISTS \`${DATASET}.${OLD_TABLE}\``;
  await bq.query({ query: dropQuery, location: region });
  console.log(`✅ 원본 테이블 삭제`);
  
  // 3. 신규를 원본 이름으로 변경
  const renameQuery = `CREATE TABLE \`${DATASET}.${OLD_TABLE}\` AS SELECT * FROM \`${DATASET}.${NEW_TABLE}\``;
  await bq.query({ query: renameQuery, location: region });
  console.log(`✅ 신규 테이블을 원본 이름으로 변경`);
  
  // 4. 임시 테이블 삭제
  const dropNewQuery = `DROP TABLE IF EXISTS \`${DATASET}.${NEW_TABLE}\``;
  await bq.query({ query: dropNewQuery, location: region });
  console.log(`✅ 임시 테이블 삭제`);
}

// 실행
async function run() {
  try {
    console.log('🚀 BigQuery 스키마 마이그레이션 시작...\n');
    
    const region = await findDatasetRegion();
    console.log(`📍 리전: ${region}\n`);
    
    console.log('📦 새 테이블 생성 중...');
    await createNewTable(region);
    
    console.log('📦 데이터 마이그레이션 중...');
    await migrateData(region);
    
    console.log('📦 테이블 교체 중...');
    await swapTables(region);
    
    console.log('✅ 마이그레이션 완료!');
    
  } catch (err) {
    console.error('❌ 마이그레이션 실패:', err.message);
    process.exit(1);
  }
}

run();
