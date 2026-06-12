/**
 * BigQuery 수질데이터 (water_quality) 조회 서비스
 * 테이블: daily_log_system.water_quality
 * 용도: 전문업체 성적서 파싱 데이터 저장/조회
 */
const { BigQuery } = require('@google-cloud/bigquery');
const path = require('path');

// BigQuery 클라이언트 설정
const getBigQueryClient = () => {
  const keyFile = path.join(__dirname, '../config/work-jindan-194620a46d59.json');
  return new BigQuery({
    projectId: 'work-jindan',
    keyFilename: keyFile,
  });
};

const DATASET = 'daily_log_system';
const TABLE = 'water_quality';

// 주요 리전 목록 (데이터셋 탐색용)
const REGIONS = [
  'asia-northeast1',
  'asia-northeast2',
  'asia-northeast3',
  'asia-east1',
  'asia-east2',
  'asia-southeast1',
  'us-central1',
  'us-east1',
  'europe-west1',
];

// 캐시된 리전 (한번 찾으면 재사용)
let cachedRegion = null;

/**
 * 리전 자동 탐지
 */
async function findDatasetRegion() {
  if (cachedRegion) return cachedRegion;

  const bq = getBigQueryClient();

  for (const region of REGIONS) {
    try {
      const query = `SELECT 1 FROM \`${DATASET}.${TABLE}\` LIMIT 1`;
      await bq.query({ query, location: region });
      cachedRegion = region;
      console.log(`[certificateWaterQualityService] 데이터셋 리전 발견: ${region}`);
      return region;
    } catch (err) {
      if (err.message.includes('was not found in location')) continue;
      throw err;
    }
  }

  throw new Error(`데이터셋 ${DATASET}을 찾을 수 없습니다.`);
}

/**
 * 월별/현장별 수질데이터 조회
 */
async function queryWaterQualityData(year, month, siteName = null) {
  const region = await findDatasetRegion();
  const bq = getBigQueryClient();

  // 날짜 범위 계산
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const endDate = month === 12
    ? `${year + 1}-01-01`
    : `${year}-${String(month + 1).padStart(2, '0')}-01`;

  let query = `
    SELECT
      id,
      uploaded_at,
      report_date,
      category,
      site_name,
      site_name_raw,
      bod,
      ss,
      tn,
      tp,
      mlss,
      total_coliform,
      drive_file_name,
      source_pdf_name
    FROM (
      SELECT *,
        ROW_NUMBER() OVER (
          PARTITION BY report_date, site_name
          ORDER BY uploaded_at DESC
        ) AS rn
      FROM \`${DATASET}.${TABLE}\`
      WHERE report_date >= @startDate
        AND report_date < @endDate
        ${siteName && siteName !== 'all' ? 'AND site_name = @siteName' : ''}
    )
    WHERE rn = 1
  `;

  const params = {
    startDate,
    endDate,
  };

  if (siteName && siteName !== 'all') {
    params.siteName = siteName;
  }

  query += ` ORDER BY report_date DESC, site_name`;


  const [rows] = await bq.query({
    query,
    params,
    location: region,
  });

  return rows;
}

/**
 * 현장 목록 조회 (distinct)
 */
async function getSiteList() {
  const region = await findDatasetRegion();
  const bq = getBigQueryClient();

  const query = `
    SELECT DISTINCT site_name
    FROM \`${DATASET}.${TABLE}\`
    WHERE site_name IS NOT NULL
    ORDER BY site_name
  `;

  const [rows] = await bq.query({
    query,
    location: region,
  });

  return rows.map(r => r.site_name);
}

module.exports = {
  queryWaterQualityData,
  getSiteList,
};
