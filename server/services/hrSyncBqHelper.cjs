'use strict';

/**
 * hrSyncBqHelper.cjs
 * ─────────────────────────────────────────────────────────────────────
 * BigQuery MERGE UPSERT 쿼리 헬퍼
 */

const { DATASET_ID } = require('./bigQueryClientService.cjs');

async function upsertDailyRecords(bq, ym, dailyRecords, nowStamp) {
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
      console.warn(`[hrSyncBqHelper] daily record upsert warning (${recordId}):`, qErr.message);
    }
  }
}

async function upsertMonthlyEvaluations(bq, ym, monthlyEvaluations, nowStamp) {
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
      console.warn(`[hrSyncBqHelper] monthly eval upsert warning (${evalId}):`, qErr.message);
    }
  }
}

module.exports = {
  upsertDailyRecords,
  upsertMonthlyEvaluations,
};
