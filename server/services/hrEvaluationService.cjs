'use strict';

/**
 * hrEvaluationService.cjs
 * ─────────────────────────────────────────────────────────────────────
 * 인사고과(근태 일별기록, 월별/연간 평가, 기준설정, 시말서 Drive 업로드) 서비스
 * - BigQuery MERGE / 조회 + 로컬 캐시 폴백
 * - Google Drive 시말서 스캔본 업로드 + 로컬 파일 폴백
 */

const path = require('path');
const fs = require('fs');
const { getBigQueryClient, DATASET_ID } = require('./bigQueryClientService.cjs');
const {
  drive,
  isDriveConfigured,
  getDriveRootFolderId,
  getOrCreateFolderPath,
  uploadBufferToFolder,
} = require('./driveService.cjs');

const BASE_DIR = path.join(__dirname, '..');
const appDataPath = path.join(process.env.APPDATA || BASE_DIR, 'Osoo_Admin_App');
const HR_CACHE_DIR = path.join(appDataPath, 'hr_cache');
const APOLOGY_UPLOADS_DIR = path.join(appDataPath, 'uploads', 'apology');

for (const dir of [HR_CACHE_DIR, APOLOGY_UPLOADS_DIR]) {
  if (!fs.existsSync(dir)) {
    try { fs.mkdirSync(dir, { recursive: true }); } catch (_) {}
  }
}

let tablesEnsured = false;

/**
 * BigQuery 테이블 자동 생성
 */
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
    try {
      await bq.query({ query: sql });
    } catch (err) {
      console.warn('[HrEvaluationService] BigQuery 테이블 생성/확인 알림:', err.message);
    }
  }

  tablesEnsured = true;
  return true;
}

/**
 * 로컬 캐시 파일 경로
 */
function getLocalCachePath(year, month) {
  const ym = `${year}_${String(month).padStart(2, '0')}`;
  return path.join(HR_CACHE_DIR, `hr_${ym}.json`);
}

/**
 * 로컬 캐시 저장
 */
function saveLocalCache(year, month, data) {
  try {
    const file = getLocalCachePath(year, month);
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.warn('[HrEvaluationService] 로컬 캐시 쓰기 실패:', err.message);
  }
}

/**
 * 로컬 캐시 읽기
 */
function readLocalCache(year, month) {
  try {
    const file = getLocalCachePath(year, month);
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    }
  } catch (err) {
    console.warn('[HrEvaluationService] 로컬 캐시 읽기 실패:', err.message);
  }
  return null;
}

/**
 * 인사고과 데이터 조회 (BigQuery + 로컬 캐시 병합)
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
  };

  const bq = getBigQueryClient();
  if (!bq) {
    return { ...localData, isFromBigQuery: false };
  }

  try {
    await ensureHrTables();

    // 1. 일별 근무/사유 레코드 조회
    const [dailyRows] = await bq.query({
      query: `SELECT * FROM \`${DATASET_ID}.hr_daily_work_records\` WHERE year_month = @ym`,
      params: { ym },
    });

    const dailyRecordsMap = { ...(localData.dailyRecords || {}) };
    for (const r of dailyRows) {
      const wId = r.worker_id || r.site_id;
      if (!dailyRecordsMap[wId]) dailyRecordsMap[wId] = {};
      dailyRecordsMap[wId][r.work_date] = {
        date: r.work_date,
        dayType: r.day_type,
        checkIn: r.login_time || '-',
        checkOut: r.logout_time || '-',
        autoLogout: Boolean(r.is_auto_logout),
        leaveReason: r.leave_reason || '',
        lateReason: r.late_reason || '',
        earlyLeaveReason: r.early_leave_reason || '',
        autoPenaltyPoints: Number(r.auto_penalty_points) || 0,
        isPenaltyExcused: Boolean(r.is_penalty_excused),
        finalPenaltyPoints: Number(r.final_penalty_points) || 0,
      };
    }

    // 2. 월간/연간 평가 메타 레코드 조회
    const [monthlyRows] = await bq.query({
      query: `SELECT * FROM \`${DATASET_ID}.hr_monthly_evaluations\` WHERE year_month = @ym`,
      params: { ym },
    });

    const monthlyEvalsMap = { ...(localData.monthlyEvaluations || {}) };
    for (const m of monthlyRows) {
      const wId = m.worker_id || m.site_id;
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

    // 3. 점수 설정 조회
    let scoringSettings = localData.scoringSettings;
    const [settingsRows] = await bq.query({
      query: `SELECT * FROM \`${DATASET_ID}.hr_scoring_settings\` WHERE settings_id = 'default' LIMIT 1`,
    });
    if (settingsRows && settingsRows[0]?.settings_json) {
      try {
        scoringSettings = JSON.parse(settingsRows[0].settings_json);
      } catch (_) {}
    }

    // 4. 소통게시판 사유 글 조회
    let boardPosts = [];
    try {
      const [bRows] = await bq.query({
        query: `SELECT id, title, author, target_site, created_at, content FROM \`${DATASET_ID}.posts\`
                WHERE is_deleted = FALSE AND (
                  category LIKE '%사유%' OR title LIKE '%사유%' OR content LIKE '%사유%'
                  OR category LIKE '%근태%' OR category LIKE '%외출%' OR category LIKE '%휴가%'
                ) ORDER BY created_at DESC LIMIT 50`,
      });
      boardPosts = bRows.map((p) => ({
        id: p.id,
        title: p.title,
        author: p.author,
        targetSite: p.target_site,
        createdAt: p.created_at?.value || p.created_at,
        content: p.content,
      }));
    } catch (_) {}

    const result = {
      yearMonth: ym,
      dailyRecords: dailyRecordsMap,
      monthlyEvaluations: monthlyEvalsMap,
      scoringSettings,
      boardPosts,
      isFromBigQuery: true,
    };

    saveLocalCache(year, month, result);
    return result;
  } catch (err) {
    console.error('[HrEvaluationService] getHrEvaluationData 에러:', err.message);
    return { ...localData, isFromBigQuery: false, error: err.message };
  }
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

  // 먼저 로컬 캐시 파일에 갱신
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

    // 1. 일별 레코드 MERGE / UPSERT
    for (const d of dailyRecords) {
      if (!d) continue;
      const wDate = d.work_date || d.workDate;
      const wId = d.worker_id || d.workerId || d.site_id || d.siteId;
      if (!wDate || !wId) continue;
      const recordId = `${wDate}_${wId}`;
      const query = `
        MERGE INTO \`${DATASET_ID}.hr_daily_work_records\` T
        USING (SELECT
          @record_id AS record_id,
          @year_month AS year_month,
          @work_date AS work_date,
          @site_id AS site_id,
          @site_name AS site_name,
          @worker_id AS worker_id,
          @worker_name AS worker_name,
          @day_type AS day_type,
          @login_time AS login_time,
          @logout_time AS logout_time,
          @is_auto_logout AS is_auto_logout,
          @leave_reason AS leave_reason,
          @late_reason AS late_reason,
          @early_leave_reason AS early_leave_reason,
          @auto_penalty_points AS auto_penalty_points,
          @is_penalty_excused AS is_penalty_excused,
          @final_penalty_points AS final_penalty_points,
          TIMESTAMP(@updated_at) AS updated_at
        ) S
        ON T.record_id = S.record_id
        WHEN MATCHED THEN
          UPDATE SET
            day_type = S.day_type,
            login_time = S.login_time,
            logout_time = S.logout_time,
            is_auto_logout = S.is_auto_logout,
            leave_reason = S.leave_reason,
            late_reason = S.late_reason,
            early_leave_reason = S.early_leave_reason,
            auto_penalty_points = S.auto_penalty_points,
            is_penalty_excused = S.is_penalty_excused,
            final_penalty_points = S.final_penalty_points,
            updated_at = S.updated_at
        WHEN NOT MATCHED THEN
          INSERT ROW;
      `;
      const params = {
        record_id: recordId,
        year_month: ym,
        work_date: wDate,
        site_id: d.site_id || d.siteId || '',
        site_name: d.site_name || d.siteName || '',
        worker_id: d.worker_id || d.workerId || '',
        worker_name: d.worker_name || d.workerName || '',
        day_type: d.day_type || d.dayType || 'work',
        login_time: d.login_time || d.checkIn || '-',
        logout_time: d.logout_time || d.checkOut || '-',
        is_auto_logout: Boolean(d.is_auto_logout || d.autoLogout),
        leave_reason: d.leave_reason || d.leaveReason || '',
        late_reason: d.late_reason || d.lateReason || '',
        early_leave_reason: d.early_leave_reason || d.earlyLeaveReason || '',
        auto_penalty_points: Number(d.auto_penalty_points || d.autoPenaltyPoints) || 0,
        is_penalty_excused: Boolean(d.is_penalty_excused || d.isPenaltyExcused),
        final_penalty_points: Number(d.final_penalty_points || d.finalPenaltyPoints) || 0,
        updated_at: nowStamp,
      };
      try {
        await bq.query({ query, params });
      } catch (qErr) {
        console.warn(`[HrEvaluationService] BigQuery daily record upsert warning (${recordId}):`, qErr.message);
      }
    }

    // 2. 월간 평가 레코드 MERGE / UPSERT
    for (const m of monthlyEvaluations) {
      if (!m) continue;
      const wId = m.worker_id || m.workerId || m.site_id || m.siteId;
      if (!wId) continue;
      const evalId = `${ym}_${wId}`;
      const query = `
        MERGE INTO \`${DATASET_ID}.hr_monthly_evaluations\` T
        USING (SELECT
          @eval_id AS eval_id,
          @year_month AS year_month,
          @site_id AS site_id,
          @site_name AS site_name,
          @worker_id AS worker_id,
          @worker_name AS worker_name,
          @final_percentage AS final_percentage,
          @grade AS grade,
          @rewards_penalties_json AS rewards_penalties_json,
          @evaluator_comment AS evaluator_comment,
          @is_confirmed AS is_confirmed,
          @annual_recommendation AS annual_recommendation,
          @annual_comment AS annual_comment,
          @is_annual_confirmed AS is_annual_confirmed,
          TIMESTAMP(@updated_at) AS updated_at
        ) S
        ON T.eval_id = S.eval_id
        WHEN MATCHED THEN
          UPDATE SET
            final_percentage = S.final_percentage,
            grade = S.grade,
            rewards_penalties_json = S.rewards_penalties_json,
            evaluator_comment = S.evaluator_comment,
            is_confirmed = S.is_confirmed,
            annual_recommendation = S.annual_recommendation,
            annual_comment = S.annual_comment,
            is_annual_confirmed = S.is_annual_confirmed,
            updated_at = S.updated_at
        WHEN NOT MATCHED THEN
          INSERT ROW;
      `;
      const params = {
        eval_id: evalId,
        year_month: ym,
        site_id: m.site_id || m.siteId || '',
        site_name: m.site_name || m.siteName || '',
        worker_id: m.worker_id || m.workerId || '',
        worker_name: m.worker_name || m.workerName || '',
        final_percentage: Number(m.final_percentage || m.finalPercentage) || 100,
        grade: m.grade || 'S',
        rewards_penalties_json: JSON.stringify(m.rewardPenaltyList || m.rewardsPenaltiesJson || []),
        evaluator_comment: m.evaluator_comment || m.evaluatorComment || '',
        is_confirmed: Boolean(m.is_confirmed || m.isConfirmed),
        annual_recommendation: m.annual_recommendation || m.annualRecommendation || '적정유지',
        annual_comment: m.annual_comment || m.annualComment || '',
        is_annual_confirmed: Boolean(m.is_annual_confirmed || m.isAnnualConfirmed),
        updated_at: nowStamp,
      };
      try {
        await bq.query({ query, params });
      } catch (qErr) {
        console.warn(`[HrEvaluationService] BigQuery monthly eval upsert warning (${evalId}):`, qErr.message);
      }
    }

    // 3. 점수 설정 UPSERT
    if (scoringSettings) {
      const query = `
        MERGE INTO \`${DATASET_ID}.hr_scoring_settings\` T
        USING (SELECT
          'default' AS settings_id,
          @settings_json AS settings_json,
          TIMESTAMP(@updated_at) AS updated_at
        ) S
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

  const y = date.slice(0, 4);
  const m = date.slice(5, 7);
  const nowStamp = new Date().toISOString().slice(0, 16).replace('T', ' ');

  // Base64 버퍼 변환
  let fileBuffer = null;
  if (dataUrl && dataUrl.includes('base64,')) {
    const base64Data = dataUrl.split('base64,')[1];
    fileBuffer = Buffer.from(base64Data, 'base64');
  } else {
    fileBuffer = Buffer.from(`시말서 공식 문서 - ${siteName} (${workerName}) ${date}`, 'utf8');
  }

  // 로컬 uploads 디렉터리에 상시 보존
  const safeFileName = `${date}_${siteName}_${workerName}_${fileName}`.replace(/[/\\?%*:|"<>]/g, '_');
  const localFilePath = path.join(APOLOGY_UPLOADS_DIR, safeFileName);
  try {
    fs.writeFileSync(localFilePath, fileBuffer);
  } catch (err) {
    console.warn('[HrEvaluationService] 로컬 시말서 파일 쓰기 경고:', err.message);
  }

  const defaultDrivePath = `/오수처리장_인사고과/시말서/${y}년/${m}월/${safeFileName}`;
  let driveFileId = `local_apology_${Date.now()}`;
  let webViewLink = `/uploads/apology/${encodeURIComponent(safeFileName)}`;

  // Google Drive API 업로드 시도
  if (isDriveConfigured()) {
    try {
      const rootFolderId = getDriveRootFolderId();
      const folderPath = ['인사고과_시말서', `${y}년`, `${m}월`];
      const targetFolder = await getOrCreateFolderPath(rootFolderId, folderPath);

      if (targetFolder && targetFolder.id) {
        const uploadRes = await uploadBufferToFolder(targetFolder.id, safeFileName, fileBuffer, mimeType);
        if (uploadRes && uploadRes.id) {
          driveFileId = uploadRes.id;
          webViewLink = uploadRes.webViewLink || webViewLink;
        }
      }
    } catch (driveErr) {
      console.warn('[HrEvaluationService] Google Drive 업로드 예외 (로컬 폴백 사용):', driveErr.message);
    }
  }

  return {
    success: true,
    driveFileId,
    drivePath: defaultDrivePath,
    webViewLink,
    fileName: safeFileName,
    uploadedAt: nowStamp,
  };
}

module.exports = {
  ensureHrTables,
  getHrEvaluationData,
  syncHrBatchToBigQuery,
  uploadApologyScanToDrive,
};
