/**
 * BigQuery 수질데이터 (water_quality) 조회 서비스
 * 테이블: daily_log_system.water_quality
 * 용도: 전문업체 성적서 파싱 데이터 저장/조회
 */
const { BigQuery } = require('@google-cloud/bigquery');
const path = require('path');
const fs = require('fs');
const os = require('os');

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
      sample_date,
      source_row_order,
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
          PARTITION BY report_date, sample_date, site_name,
            COALESCE(CAST(mlss AS STRING), '-1'),
            COALESCE(CAST(ss AS STRING), '-1'),
            COALESCE(CAST(bod AS STRING), '-1'),
            COALESCE(CAST(tn AS STRING), '-1'),
            COALESCE(CAST(tp AS STRING), '-1'),
            COALESCE(CAST(total_coliform AS STRING), '-1')
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

/**
 * 엑셀 파싱 결과를 water_quality 테이블에 배치 삽입
 * @param {Array} rows - { site_name, report_date, ss, bod, tn, tp, mlss, total_coliform, source_type }
 */
async function insertRows(rows, options = {}) {
  const region = await findDatasetRegion();
  const bq = getBigQueryClient();
  const replaceFiveItems = Boolean(options.replaceFiveItems);

  const toNum = (v) => {
    if (v === null || v === undefined || String(v).trim() === '' || String(v).trim() === '-') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  const nowIso = new Date().toISOString().replace('T', ' ').replace('Z', ' UTC');
  const { randomUUID } = require('crypto');

  const normalizeDateLike = (value) => {
    const raw = String(value || '').trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    if (/^\d{8}$/.test(raw)) {
      return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
    }
    return null;
  };

  const warnings = [];
  const insertData = [];

  rows.forEach((row, index) => {
    const reportDate = normalizeDateLike(row.report_date);
    const sampleDate = normalizeDateLike(row.sample_date);

    if (!reportDate) {
      warnings.push(`index ${index}: report_date 형식이 올바르지 않아 제외되었습니다.`);
      return;
    }

    insertData.push({
      id: randomUUID(),
      uploaded_at: nowIso,
      report_date: reportDate,
      sample_date: sampleDate || reportDate,
      source_row_order: Number.isFinite(Number(row.source_row_order)) ? Number(row.source_row_order) : null,
      category: row.source_type || 'excel',
      site_name: row.site_name || null,
      site_name_raw: row.site_name_raw || row.site_name || null,
      ss: toNum(row.ss),
      bod: toNum(row.bod),
      tn: toNum(row.tn),
      tp: toNum(row.tp),
      mlss: toNum(row.mlss),
      total_coliform: toNum(row.total_coliform),
      drive_file_name: null,
      source_pdf_name: row.source_pdf_name || null,
    });
  });

  if (insertData.length === 0) {
    return { inserted: 0, skipped: rows.length, warnings, replacedFiveItems: false };
  }

  const hasFiveItemsRows = insertData.some((row) => row.category === 'excel_5items');
  if (replaceFiveItems && hasFiveItemsRows) {
    const fiveItemKeys = [];
    const seen = new Set();

    for (const row of insertData) {
      if (row.category !== 'excel_5items') continue;
      if (!row.site_name || !row.report_date) continue;
      const key = `${row.site_name}__${row.report_date}`;
      if (seen.has(key)) continue;
      seen.add(key);
      fiveItemKeys.push({ site_name: row.site_name, report_date: row.report_date });
    }

    if (fiveItemKeys.length > 0) {
      const conditions = fiveItemKeys
        .map((_, i) => `(site_name = @site_name_${i} AND report_date = @report_date_${i})`)
        .join(' OR ');

      const params = {};
      for (let i = 0; i < fiveItemKeys.length; i += 1) {
        params[`site_name_${i}`] = fiveItemKeys[i].site_name;
        params[`report_date_${i}`] = fiveItemKeys[i].report_date;
      }

      await bq.query({
        query: `
          DELETE FROM \`${DATASET}.${TABLE}\`
          WHERE category = 'excel_5items'
            AND (${conditions})
        `,
        params,
        location: region,
      });
    }
  }

  const dataset = bq.dataset(DATASET);
  const table = dataset.table(TABLE);
  const tempPath = path.join(os.tmpdir(), `water_quality_${Date.now()}_${Math.random().toString(16).slice(2)}.json`);
  fs.writeFileSync(tempPath, insertData.map((row) => JSON.stringify(row)).join('\n'), 'utf8');
  try {
    await table.load(tempPath, {
      sourceFormat: 'NEWLINE_DELIMITED_JSON',
      writeDisposition: 'WRITE_APPEND',
      location: region,
    });
  } finally {
    try { fs.unlinkSync(tempPath); } catch (_) {}
  }

  return {
    inserted: insertData.length,
    skipped: rows.length - insertData.length,
    warnings,
    replacedFiveItems: replaceFiveItems && hasFiveItemsRows,
  };
}

module.exports = {
  queryWaterQualityData,
  getSiteList,
  insertRows,
};
