'use strict';

/**
 * hrEvaluationService.cjs
 * ─────────────────────────────────────────────────────────────────────
 * 인사고과(근태 일별기록, 월별/연간 평가, 기준설정, 시말서 Drive 업로드) 서비스
 * - 실제 BigQuery 출결 테이블(daily_log_system.attendance) 및 소통게시판 연동
 * - Google Sheets(Wastewater_Member, Wastewater_Sites) 실제 인원/현장 매핑
 * - BigQuery MERGE / 조회 + 로컬 캐시 폴백
 * - Google Drive 시말서 스캔본 업로드 + 로컬 파일 폴백
 */

const path = require('path');
const fs = require('fs');
const { getBigQueryClient, DATASET_ID } = require('./bigQueryClientService.cjs');
const { getMonthlyAttendance } = require('./attendanceQueryService.cjs');
const boardService = require('./boardService.cjs');
const {
  getActiveWorkers,
  buildDailyRecordsMap,
} = require('./hrDataBuilderService.cjs');
const {
  upsertDailyRecords,
  upsertMonthlyEvaluations,
} = require('./hrSyncBqHelper.cjs');
const {
  uploadBufferToFolder,
  getOrCreateFolderPath,
  getDriveRootFolderId,
  isDriveConfigured,
} = require('./driveService.cjs');

const BASE_DIR = path.join(__dirname, '..');
const appDataPath = path.join(process.env.APPDATA || BASE_DIR, 'Osoo_Admin_App');
const HR_CACHE_DIR = path.join(appDataPath, 'hr_cache_v3_clean');
const APOLOGY_UPLOADS_DIR = path.join(appDataPath, 'uploads', 'apology');

for (const dir of [HR_CACHE_DIR, APOLOGY_UPLOADS_DIR]) {
  if (!fs.existsSync(dir)) {
    try { fs.mkdirSync(dir, { recursive: true }); } catch (_) {}
  }
}

let tablesEnsured = false;

async function ensureHrTables() {
  if (tablesEnsured) return true;
  const bq = getBigQueryClient();
  if (!bq) return false;
  const queries = [
    `CREATE TABLE IF NOT EXISTS \`${DATASET_ID}.hr_daily_work_records\` (record_id STRING, year_month STRING, work_date STRING, site_id STRING, site_name STRING, worker_id STRING, worker_name STRING, day_type STRING, login_time STRING, logout_time STRING, is_auto_logout BOOL, leave_reason STRING, late_reason STRING, early_leave_reason STRING, auto_penalty_points INT64, is_penalty_excused BOOL, final_penalty_points INT64, updated_at TIMESTAMP)`,
    `CREATE TABLE IF NOT EXISTS \`${DATASET_ID}.hr_monthly_evaluations\` (eval_id STRING, year_month STRING, site_id STRING, site_name STRING, worker_id STRING, worker_name STRING, final_percentage FLOAT64, grade STRING, rewards_penalties_json STRING, evaluator_comment STRING, is_confirmed BOOL, annual_recommendation STRING, annual_comment STRING, is_annual_confirmed BOOL, updated_at TIMESTAMP)`,
    `CREATE TABLE IF NOT EXISTS \`${DATASET_ID}.hr_scoring_settings\` (settings_id STRING, settings_json STRING, updated_at TIMESTAMP)`
  ];
  for (const sql of queries) {
    try { await bq.query({ query: sql }); } catch (_) {}
  }
  tablesEnsured = true;
  return true;
}

function getLocalCachePath(year, month) {
  return path.join(HR_CACHE_DIR, `hr_real_${year}_${String(month).padStart(2, '0')}.json`);
}

function saveLocalCache(year, month, data) {
  try { fs.writeFileSync(getLocalCachePath(year, month), JSON.stringify(data, null, 2), 'utf8'); } catch (_) {}
}

function readLocalCache(year, month) {
  try {
    const file = getLocalCachePath(year, month);
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (_) {}
  return null;
}


/**
 * 실제 데이터 기반 인사고과 조회 (100% BigQuery 출결 + 구글시트 회원/현장 + 소통게시판)
 */
async function getHrEvaluationData(params = {}) {
  const now = new Date();
  const year = Number(params.year) || (params.yearMonth ? Number(params.yearMonth.split('-')[0]) : now.getFullYear());
  const month = Number(params.month) || (params.yearMonth ? Number(params.yearMonth.split('-')[1]) : (now.getMonth() + 1));
  const ym = `${year}-${String(month).padStart(2, '0')}`;

  const localData = readLocalCache(year, month) || {
    dailyRecords: {},
    monthlyEvaluations: {},
    scoringSettings: null,
    workers: [],
    boardPosts: [],
  };

  const bq = getBigQueryClient();

  try {
    const workers = await getActiveWorkers();

    let attendanceRows = [];
    if (bq) {
      try {
        attendanceRows = await getMonthlyAttendance(ym);
      } catch (attErr) {
        console.warn(`[HrEvaluationService] ${ym} BigQuery 출결 조회 경고:`, attErr.message);
      }
    }

    let manualDailyRows = [];
    let monthlyRows = [];
    let scoringSettings = localData.scoringSettings;

    if (bq) {
      await ensureHrTables();

      try {
        const [dRows] = await bq.query({
          query: `SELECT * FROM \`${DATASET_ID}.hr_daily_work_records\` WHERE year_month = @ym`,
          params: { ym },
        });
        manualDailyRows = dRows || [];
      } catch (_) {}

      try {
        const [mRows] = await bq.query({
          query: `SELECT * FROM \`${DATASET_ID}.hr_monthly_evaluations\` WHERE year_month = @ym`,
          params: { ym },
        });
        monthlyRows = mRows || [];
      } catch (_) {}

      try {
        const [sRows] = await bq.query({
          query: `SELECT * FROM \`${DATASET_ID}.hr_scoring_settings\` WHERE settings_id = 'default' LIMIT 1`,
        });
        if (sRows?.[0]?.settings_json) {
          scoringSettings = JSON.parse(sRows[0].settings_json);
        }
      } catch (_) {}
    }

    let boardPosts = [];
    try {
      const allPosts = await boardService.getPosts('admin');
      boardPosts = (allPosts || [])
        .filter((p) => !p.is_deleted)
        .map((p) => ({
          id: String(p.id),
          title: String(p.title || ''),
          author: String(p.author || ''),
          authorRole: String(p.author_role || ''),
          targetSite: String(p.target_site || ''),
          targetSites: Array.isArray(p.target_sites)
            ? p.target_sites
            : Array.isArray(p.visible_sites)
            ? p.visible_sites
            : p.target_site
            ? [p.target_site]
            : [],
          visibleSites: Array.isArray(p.visible_sites) ? p.visible_sites : [],
          createdAt: p.created_at?.value || p.created_at || '',
          content: String(p.content || ''),
          category: String(p.category || ''),
        }));
    } catch (bErr) {
      console.warn('[HrEvaluationService] 소통게시판 조회 경고:', bErr.message);
    }

    const dailyRecordsMap = buildDailyRecordsMap({
      workers,
      year,
      month,
      attendanceRows,
      manualDailyRows,
      scoringRules: scoringSettings?.autoPenalty,
    });

    const monthlyEvalsMap = {};
    for (const m of monthlyRows) {
      const wId = String(m.worker_id || m.site_id || '').trim();
      if (!wId) continue;
      let rps = [];
      try {
        if (m.rewards_penalties_json) rps = JSON.parse(m.rewards_penalties_json);
      } catch (_) {}

      monthlyEvalsMap[wId] = {
        evaluatorComment: m.evaluator_comment || '',
        isConfirmed: Boolean(m.is_confirmed),
        rewardPenaltyList: rps,
        annualRecommendation: m.annual_recommendation || '적정유지',
        annualComment: m.annual_comment || '',
        isAnnualConfirmed: Boolean(m.is_annual_confirmed),
      };
    }

    const result = {
      yearMonth: ym,
      workers,
      dailyRecords: dailyRecordsMap,
      monthlyEvaluations: monthlyEvalsMap,
      scoringSettings,
      boardPosts,
      isFromBigQuery: Boolean(bq),
    };

    saveLocalCache(year, month, result);
    return result;
  } catch (err) {
    console.error('[HrEvaluationService] getHrEvaluationData 에러:', err.message);
    return { ...localData, isFromBigQuery: false, error: err.message };
  }
}

/**
 * 연간 전체(1월~12월) 실제 BigQuery 출결 및 평가 데이터 조회
 */
async function getHrAnnualData(params = {}) {
  const now = new Date();
  const year = Number(params.year) || now.getFullYear();
  const bq = getBigQueryClient();
  const workers = await getActiveWorkers();

  let attendanceRows = [];
  let manualDailyRows = [];
  let monthlyRows = [];
  let scoringSettings = null;

  if (bq) {
    await ensureHrTables();
    try {
      const startDate = `${year}-01-01`;
      const endDate = `${year}-12-31`;
      const [att] = await bq.query({
        query: `
          SELECT
            ANY_VALUE(t.id) AS id,
            t.site_id,
            ANY_VALUE(t.site_name) AS site_name,
            t.member_id,
            ANY_VALUE(t.member_name) AS member_name,
            CAST(t.date AS STRING) AS date,
            FORMAT_TIME('%H:%M:%S', MIN(t.login_time)) AS login_time,
            FORMAT_TIME('%H:%M:%S', MAX(t.logout_time)) AS logout_time,
            LOGICAL_AND(COALESCE(t.location_matched, TRUE)) AS location_matched,
            LOGICAL_OR(COALESCE(t.remote_session_detected, FALSE)) AS remote_session_detected,
            MAX(t.remote_session_type) AS remote_session_type,
            MAX(t.remote_session_evidence) AS remote_session_evidence,
            LOGICAL_OR(COALESCE(t.auto_logout, FALSE) OR (t.logout_time IS NOT NULL AND EXTRACT(HOUR FROM t.logout_time) = 20 AND EXTRACT(MINUTE FROM t.logout_time) = 0)) AS auto_logout,
            MAX(t.uploaded_at) AS uploaded_at
          FROM \`${DATASET_ID}.attendance\` AS t
          WHERE t.date BETWEEN @startDate AND @endDate
          GROUP BY t.date, t.site_id, t.member_id
        `,
        params: { startDate, endDate },
      });
      attendanceRows = att || [];
    } catch (e) {
      console.warn('[HrEvaluationService] getHrAnnualData 출결 조회 경고:', e.message);
    }

    try {
      const [dRows] = await bq.query({
        query: `SELECT * FROM \`${DATASET_ID}.hr_daily_work_records\` WHERE year_month LIKE @yPattern`,
        params: { yPattern: `${year}-%` },
      });
      manualDailyRows = dRows || [];
    } catch (_) {}

    try {
      const [mRows] = await bq.query({
        query: `SELECT * FROM \`${DATASET_ID}.hr_monthly_evaluations\` WHERE year_month LIKE @yPattern`,
        params: { yPattern: `${year}-%` },
      });
      monthlyRows = mRows || [];
    } catch (_) {}

    try {
      const [sRows] = await bq.query({
        query: `SELECT * FROM \`${DATASET_ID}.hr_scoring_settings\` WHERE settings_id = 'default' LIMIT 1`,
      });
      if (sRows?.[0]?.settings_json) scoringSettings = JSON.parse(sRows[0].settings_json);
    } catch (_) {}
  }

  const monthsData = {};
  for (let m = 1; m <= 12; m++) {
    const ym = `${year}-${String(m).padStart(2, '0')}`;
    const mAtt = attendanceRows.filter((r) => String(r.date || '').startsWith(ym));
    const mDaily = manualDailyRows.filter((r) => String(r.year_month || '').startsWith(ym));
    const mEvals = monthlyRows.filter((r) => String(r.year_month || '').startsWith(ym));

    const dailyRecordsMap = buildDailyRecordsMap({
      workers,
      year,
      month: m,
      attendanceRows: mAtt,
      manualDailyRows: mDaily,
      scoringRules: scoringSettings?.autoPenalty,
    });

    const monthWorkersRecord = {};
    for (const w of workers) {
      const wId = w.workerId;
      const mRow = mEvals.find((er) => String(er.worker_id || er.site_id) === wId);
      let rps = [];
      try {
        if (mRow?.rewards_penalties_json) rps = JSON.parse(mRow.rewards_penalties_json);
      } catch (_) {}

      monthWorkersRecord[wId] = {
        workerId: wId,
        dailyRecords: dailyRecordsMap[wId] || {},
        rewardPenaltyList: rps,
        evaluatorComment: mRow?.evaluator_comment || '',
        isConfirmed: Boolean(mRow?.is_confirmed),
        confirmedAt: mRow?.updated_at?.value || mRow?.updated_at || null,
        annualRecommendation: mRow?.annual_recommendation || '적정유지',
        annualComment: mRow?.annual_comment || '',
        isAnnualConfirmed: Boolean(mRow?.is_annual_confirmed),
      };
    }

    monthsData[m] = monthWorkersRecord;
  }

  return {
    year,
    workers,
    monthsData,
    scoringSettings,
    isFromBigQuery: Boolean(bq),
  };
}

/**
 * 백그라운드 큐 배치 동기화 (BigQuery 업서트 + 로컬 캐시)
 */
async function syncHrBatchToBigQuery(payload = {}) {
  const now = new Date();
  const year = Number(payload.year) || (payload.yearMonth ? Number(payload.yearMonth.split('-')[0]) : now.getFullYear());
  const month = Number(payload.month) || (payload.yearMonth ? Number(payload.yearMonth.split('-')[1]) : (now.getMonth() + 1));
  let dailyRecords = [];
  if (Array.isArray(payload.dailyRecords)) {
    dailyRecords = payload.dailyRecords;
  } else if (payload.dailyRecords && typeof payload.dailyRecords === 'object') {
    dailyRecords = Object.values(payload.dailyRecords).flatMap((w) =>
      w && typeof w === 'object' && !w.work_date && !w.workDate ? Object.values(w) : [w]
    );
  }

  let monthlyEvaluations = [];
  if (Array.isArray(payload.monthlyEvaluations)) {
    monthlyEvaluations = payload.monthlyEvaluations;
  } else if (payload.monthlyEvaluations && typeof payload.monthlyEvaluations === 'object') {
    monthlyEvaluations = Object.values(payload.monthlyEvaluations);
  }

  const { scoringSettings } = payload;
  const ym = `${year}-${String(month).padStart(2, '0')}`;
  const nowStamp = now.toISOString();

  const existing = readLocalCache(year, month) || { dailyRecords: {}, monthlyEvaluations: {} };
  for (const d of dailyRecords) {
    if (!d) continue;
    const wId = d.worker_id || d.workerId || d.site_id || d.siteId;
    const wDate = d.work_date || d.workDate;
    if (!wId || !wDate) continue;
    if (!existing.dailyRecords[wId]) existing.dailyRecords[wId] = {};
    existing.dailyRecords[wId][wDate] = d;
  }
  for (const m of monthlyEvaluations) {
    if (!m) continue;
    const wId = m.worker_id || m.workerId || m.site_id || m.siteId;
    if (wId) existing.monthlyEvaluations[wId] = m;
  }
  if (scoringSettings) {
    existing.scoringSettings = scoringSettings;
  }
  saveLocalCache(year, month, existing);

  const bq = getBigQueryClient();
  if (!bq) {
    return { success: true, count: dailyRecords.length + monthlyEvaluations.length, serverCached: true };
  }

  try {
    await ensureHrTables();
    await upsertDailyRecords(bq, ym, dailyRecords, nowStamp);
    await upsertMonthlyEvaluations(bq, ym, monthlyEvaluations, nowStamp);

    if (scoringSettings) {
      const query = `
        MERGE INTO \`${DATASET_ID}.hr_scoring_settings\` T
        USING (SELECT 'default' AS settings_id, @settings_json AS settings_json, TIMESTAMP(@updated_at) AS updated_at) S
        ON T.settings_id = S.settings_id
        WHEN MATCHED THEN
          UPDATE SET settings_json = S.settings_json, updated_at = S.updated_at
        WHEN NOT MATCHED THEN
          INSERT ROW;
      `;
      await bq.query({
        query,
        params: {
          settings_json: JSON.stringify(scoringSettings),
          updated_at: nowStamp,
        },
      });
    }

    return { success: true, count: dailyRecords.length + monthlyEvaluations.length, updated_at: nowStamp };
  } catch (err) {
    console.error('[HrEvaluationService] syncHrBatchToBigQuery 에러:', err.message);
    return { success: false, error: err.message, serverCached: true };
  }
}

/**
 * 시말서 스캔본 Google Drive 업로드 (로컬 파일 폴백 포함)
 */
async function uploadApologyScanToDrive(payload = {}) {
  const {
    siteName = '현장',
    workerName = '근무자',
    date = new Date().toISOString().slice(0, 10),
    fileName = '시말서_스캔본.pdf',
    mimeType = 'application/pdf',
    dataUrl,
  } = payload;

  if (!dataUrl) {
    throw new Error('업로드할 파일 데이터(dataUrl)가 전달되지 않았습니다.');
  }

  const base64Data = dataUrl.replace(/^data:.*,/, '');
  const buffer = Buffer.from(base64Data, 'base64');
  const [yearStr, monthStr] = date.split('-');
  const finalFileName = `시말서_${siteName}_${workerName}_${date.replace(/-/g, '')}.pdf`;

  if (isDriveConfigured()) {
    try {
      const rootFolderId = await getDriveRootFolderId();
      const targetFolderId = await getOrCreateFolderPath(rootFolderId, [
        '인사고과_증빙서류',
        '시말서',
        `${yearStr}년`,
        `${monthStr}월`,
      ]);

      const driveFile = await uploadBufferToFolder(
        buffer,
        finalFileName,
        mimeType,
        targetFolderId
      );

      return {
        success: true,
        driveFileId: driveFile.id,
        drivePath: `/인사고과_증빙서류/시말서/${yearStr}년/${monthStr}월/${finalFileName}`,
        fileName: finalFileName,
        fileSize: `${(buffer.length / 1024).toFixed(0)} KB`,
        uploadedAt: new Date().toISOString(),
      };
    } catch (driveErr) {
      console.warn('[HrEvaluationService] Drive 업로드 실패, 로컬 폴더로 대체 저장:', driveErr.message);
    }
  }

  const localFilePath = path.join(APOLOGY_UPLOADS_DIR, finalFileName);
  fs.writeFileSync(localFilePath, buffer);

  return {
    success: true,
    localPath: localFilePath,
    fileName: finalFileName,
    fileSize: `${(buffer.length / 1024).toFixed(0)} KB`,
    uploadedAt: new Date().toISOString(),
  };
}

module.exports = {
  getHrEvaluationData,
  getHrAnnualData,
  syncHrBatchToBigQuery,
  uploadApologyScanToDrive,
};
