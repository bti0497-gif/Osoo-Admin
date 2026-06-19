/**
 * Google Cloud Services (BigQuery & Google Drive) Client and Wrappers
 */

const { BigQuery } = require('@google-cloud/bigquery');
const { google } = require('googleapis');
const { Readable } = require('stream');
const path = require('path');
const fs = require('fs');

// 로컬 환경변수 파일 로드 (.env.local)
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

const BQ_KEY_FILE = path.join(__dirname, '../server/config/work-jindan-194620a46d59.json');
const DRIVE_KEY_FILE = path.join(__dirname, '../server/config/google-key.json');

const BQ_DATASET = 'daily_log_system';
const BQ_TABLE = 'water_quality';

const CERTIFICATE_DRIVE_FOLDER_ID = 
  String(process.env.CERTIFICATE_DRIVE_FOLDER_ID || process.env.GOOGLE_DRIVE_FOLDER_ID || '1Po-gd-OKlaeGyL-Ppjc6_wKgSLEM4iX4').trim();

// 1. BigQuery 클라이언트 빌드
let bigqueryInstance = null;
function getBigQueryClient() {
  if (bigqueryInstance) return bigqueryInstance;
  if (!fs.existsSync(BQ_KEY_FILE)) {
    console.error('[GoogleServices] BigQuery 키 파일이 존재하지 않습니다:', BQ_KEY_FILE);
    throw new Error('BigQuery Credentials 키 파일 없음');
  }
  bigqueryInstance = new BigQuery({ keyFilename: BQ_KEY_FILE });
  return bigqueryInstance;
}

// 2. Google Drive 클라이언트 빌드 (기존 OAuth 지원 서비스를 활용)
function getDriveClient() {
  const driveService = require('../server/services/driveService.cjs');
  if (driveService.drive) {
    return driveService.drive;
  }
  console.error('[GoogleServices] Google Drive 클라이언트 구성 실패');
  throw new Error('Google Drive 클라이언트가 구성되지 않았습니다.');
}

// Helper: 문자열을 숫자로 안전 변환
function toNullableNumber(value) {
  if (value === undefined || value === null || value === '') return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

// Helper: 날짜 정규화
function normalizeDateLike(value) {
  const raw = String(value || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  if (/^\d{8}$/.test(raw)) {
    return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
  }
  return '';
}

/**
 * BigQuery 데이터 벌크 인서트 (DML DELETE 후 INSERT로 덮어쓰기)
 */
async function insertToBigQuery(records, sourcePdfName = null) {
  if (!records || records.length === 0) return { success: true, inserted: 0 };
  
  const bq = getBigQueryClient();
  const nowIso = new Date().toISOString();
  let successCount = 0;
  const errorsList = [];

  console.log(`[GoogleServices] BigQuery 벌크 업로드 시작 (레코드 ${records.length}건)`);

  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    const rawRecord = r.record || r;
    const reportDate = normalizeDateLike(rawRecord.report_date);

    if (!reportDate) {
      errorsList.push({ row: i, error: 'report_date 누락 또는 포맷 오류' });
      continue;
    }

    const siteName = String(rawRecord.site_name || '').trim();
    if (!siteName) {
      errorsList.push({ row: i, error: 'site_name 누락' });
      continue;
    }

    const rowId = `${reportDate}-${siteName}-${Date.now()}-${i}`;

    try {
      // 1. 기존 동일 날짜/현장 데이터 삭제 (중복 방지)
      await bq.query({
        query: `
          DELETE FROM \`${BQ_DATASET}.${BQ_TABLE}\`
          WHERE report_date = DATE(@reportDate)
            AND site_name = @siteName
            AND (
              @sourcePdfName IS NULL
              OR source_pdf_name IS NULL
              OR source_pdf_name = @sourcePdfName
            )
        `,
        params: {
          reportDate,
          siteName,
          sourcePdfName
        },
        types: {
          reportDate: 'STRING',
          siteName: 'STRING',
          sourcePdfName: 'STRING'
        }
      });
      
      // 2. 새 레코드 삽입
      await bq.query({
        query: `
          INSERT INTO \`${BQ_DATASET}.${BQ_TABLE}\` (
            id, uploaded_at, report_date, category, site_id, site_name,
            ss, bod, tn, tp, total_coliform, mlss, do, ph,
            source_pdf_name, is_synced
          )
          VALUES (
            @id, @uploaded_at, DATE(@report_date), @category, @site_id, @site_name,
            @ss, @bod, @tn, @tp, @total_coliform, @mlss, @do, @ph,
            @source_pdf_name, @is_synced
          )
        `,
        params: {
          id: rowId,
          uploaded_at: nowIso,
          category: rawRecord.category || '성적서',
          site_id: rawRecord.site_id || null,
          site_name: siteName,
          report_date: reportDate,
          ss: toNullableNumber(rawRecord.ss),
          bod: toNullableNumber(rawRecord.bod),
          tn: toNullableNumber(rawRecord.tn !== undefined ? rawRecord.tn : rawRecord.t_n),
          tp: toNullableNumber(rawRecord.tp !== undefined ? rawRecord.tp : rawRecord.t_p),
          total_coliform: toNullableNumber(rawRecord.total_coliform !== undefined ? rawRecord.total_coliform : rawRecord.coliform),
          mlss: toNullableNumber(rawRecord.mlss),
          do: toNullableNumber(rawRecord.do),
          ph: toNullableNumber(rawRecord.ph),
          source_pdf_name: sourcePdfName,
          is_synced: 0,
        },
        types: {
          id: 'STRING',
          uploaded_at: 'TIMESTAMP',
          category: 'STRING',
          site_id: 'STRING',
          site_name: 'STRING',
          report_date: 'STRING',
          ss: 'FLOAT64',
          bod: 'FLOAT64',
          tn: 'FLOAT64',
          tp: 'FLOAT64',
          total_coliform: 'FLOAT64',
          mlss: 'FLOAT64',
          do: 'FLOAT64',
          ph: 'FLOAT64',
          source_pdf_name: 'STRING',
          is_synced: 'INT64',
        }
      });
      successCount++;
    } catch (err) {
      console.error(`[GoogleServices] BigQuery 레코드 #${i} 삽입 실패:`, err.message);
      errorsList.push({ row: i, siteName, error: err.message });
    }
  }

  return {
    success: errorsList.length === 0,
    inserted: successCount,
    failed: errorsList.length,
    errors: errorsList
  };
}

/**
 * Google Drive 이미지 업로드 및 해당 BigQuery 행에 파일 링크 UPDATE
 */
async function uploadImagesToDrive(images, onProgress) {
  if (!images || images.length === 0) return { success: true, uploaded: 0 };

  const drive = getDriveClient();
  const bq = getBigQueryClient();
  const results = [];
  let successCount = 0;

  console.log(`[GoogleServices] Google Drive 업로드 시작 (이미지 ${images.length}개)`);

  for (let i = 0; i < images.length; i++) {
    const image = images[i];
    const { filename, content } = image;
    
    // 파일명 파싱 (날짜 및 현장명 매핑용)
    // 형식 예: "성적서_20260522_현장명.jpg"
    let parsedDate = null;
    let parsedSiteName = null;
    
    const parts = filename.replace(/\.[^/.]+$/, "").split('_');
    if (parts.length >= 3) {
      const datePart = parts[1]; // yyyymmdd
      parsedSiteName = parts.slice(2).join('_').trim();
      parsedDate = normalizeDateLike(datePart);
    }

    try {
      // Base64 → Stream
      const buffer = Buffer.from(content, 'base64');
      const stream = Readable.from(buffer);

      const fileMetadata = {
        name: filename,
        parents: [CERTIFICATE_DRIVE_FOLDER_ID],
      };

      const media = {
        mimeType: 'image/jpeg',
        body: stream,
      };

      // 1. Google Drive 파일 업로드
      const response = await drive.files.create({
        resource: fileMetadata,
        media: media,
        fields: 'id, name, webViewLink',
        supportsAllDrives: true,
      });

      const driveFileId = response.data.id;
      const driveWebViewLink = response.data.webViewLink;

      let dbUpdated = false;
      let updateError = null;

      // 2. BigQuery 연동 행에 드라이브 링크 업데이트
      if (parsedDate && parsedSiteName) {
        try {
          const [updateResult] = await bq.query({
            query: `
              UPDATE \`${BQ_DATASET}.${BQ_TABLE}\`
              SET
                category = '성적서',
                drive_file_name = @filename
              WHERE report_date = DATE(@reportDate)
                AND site_name = @siteName
            `,
            params: {
              filename,
              reportDate: parsedDate,
              siteName: parsedSiteName,
            },
            types: {
              filename: 'STRING',
              reportDate: 'STRING',
              siteName: 'STRING',
            }
          });
          dbUpdated = true;
          console.log(`[GoogleServices] BigQuery 업데이트 성공: ${parsedSiteName} (${parsedDate})`);
        } catch (dbErr) {
          console.error(`[GoogleServices] BigQuery 업데이트 실패: ${filename}`, dbErr.message);
          updateError = dbErr.message;
        }
      }

      const uploadResult = {
        filename,
        fileId: driveFileId,
        webViewLink: driveWebViewLink,
        dbUpdated,
        updateError,
        success: true,
      };
      
      results.push(uploadResult);
      successCount++;
      
      if (onProgress) {
        onProgress(i + 1, images.length, uploadResult);
      }
      
      console.log(`[GoogleServices] Drive 업로드 완료: ${filename} (ID: ${driveFileId})`);
    } catch (err) {
      console.error(`[GoogleServices] Drive 업로드 실패 (${filename}):`, err.message);
      const uploadResult = {
        filename,
        success: false,
        error: err.message,
      };
      results.push(uploadResult);
      if (onProgress) {
        onProgress(i + 1, images.length, uploadResult);
      }
    }
  }

  return {
    success: successCount === images.length,
    uploaded: successCount,
    failed: images.length - successCount,
    results,
  };
}

module.exports = {
  insertToBigQuery,
  uploadImagesToDrive,
};
