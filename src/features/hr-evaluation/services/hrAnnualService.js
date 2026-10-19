/**
 * hrAnnualService.js
 * - 1월~12월 연간 근태 및 인사고과 데이터 집계 서비스
 * - 연간 평균 점수, 종합 등급, 누적 순위 산출
 * - 연간 상벌점 타임라인 및 연봉협상 의견 영속화 관리
 */

import {
  DAY_TYPE_MAP,
  getGradeInfo,
  generateWorkerMonthlyRecord,
} from '../constants/hrEvaluationConstants';
import {
  ANNUAL_EVAL_STORAGE_PREFIX,
  getDefaultSalaryRecommendation,
  getDefaultAnnualComment,
} from '../constants/hrAnnualConstants';

const STORAGE_KEY_PREFIX = 'osoo_hr_evaluation_v1';

/**
 * 단일 근무자의 월간 기록으로부터 정량 근태 요약 및 인사고과 점수를 계산합니다.
 */
export function calculateWorkerMonthlySummary(worker, workerRecord, scoringSettings = null) {
  const dailyList = Object.values(workerRecord?.dailyRecords || {}).sort((a, b) => a.day - b.day);
  const rewardPenaltyList = workerRecord?.rewardPenaltyList || [];

  let workDays = 0;
  let regularOffDays = 0;
  let totalLeaveDays = 0;
  const leaveBreakdown = {
    monthly_leave: 0,
    annual_leave: 0,
    half_leave: 0,
    family_leave: 0,
    sick_leave: 0,
    official_leave: 0,
    absent: 0,
  };

  let lateCount = 0;
  let earlyLeaveCount = 0;
  let autoLogoutCount = 0;
  let rawAutoPenaltyTotal = 0;
  let excusedPenaltyTotal = 0;
  let finalAttendancePenalty = 0;

  for (const rec of dailyList) {
    const dtMeta = DAY_TYPE_MAP[rec.dayType] || DAY_TYPE_MAP.work;

    if (rec.dayType === 'work') {
      workDays += 1;
    } else if (rec.dayType === 'half_am' || rec.dayType === 'half_pm') {
      workDays += 0.5;
      totalLeaveDays += 0.5;
      leaveBreakdown.half_leave += 1;
    } else if (rec.dayType === 'regular_off') {
      regularOffDays += 1;
    } else if (rec.dayType === 'absent') {
      leaveBreakdown.absent += 1;
    } else if (dtMeta.isLeave) {
      totalLeaveDays += dtMeta.leaveWeight;
      if (leaveBreakdown[rec.dayType] !== undefined) {
        leaveBreakdown[rec.dayType] += 1;
      }
    }

    if (rec.lateType && rec.dayType !== 'absent') {
      lateCount += 1;
    }
    if (rec.earlyType === '조기퇴근') {
      earlyLeaveCount += 1;
    } else if (rec.earlyType === '20시자동퇴근') {
      autoLogoutCount += 1;
    }

    const autoPts = Number(rec.autoPenaltyPoints) || 0;
    const finalPts = Number(rec.finalPenaltyPoints) || 0;
    rawAutoPenaltyTotal += autoPts;
    if (rec.isPenaltyExcused && autoPts < 0) {
      excusedPenaltyTotal += Math.abs(autoPts);
    }
    finalAttendancePenalty += finalPts;
  }

  let rewardTotal = 0;
  let adminPenaltyTotal = 0;
  let rewardCount = 0;
  let penaltyCount = 0;

  for (const item of rewardPenaltyList) {
    const pts = Number(item.points) || 0;
    if (pts >= 0) {
      rewardTotal += pts;
      rewardCount += 1;
    } else {
      adminPenaltyTotal += pts;
      penaltyCount += 1;
    }
  }

  const netRewardPenalty = rewardTotal + adminPenaltyTotal;
  const rawScore = 100 + finalAttendancePenalty + netRewardPenalty;
  const finalPercentage = Number(Math.max(0, Math.min(100, rawScore)).toFixed(1));
  const gradeInfo = getGradeInfo(finalPercentage, scoringSettings?.gradeCriteria);

  return {
    workerId: worker.workerId,
    siteId: worker.siteId,
    siteName: worker.siteName,
    workerName: worker.workerName,
    position: worker.position,
    phone: worker.phone,
    workDays,
    regularOffDays,
    totalLeaveDays,
    leaveBreakdown,
    lateCount,
    earlyLeaveCount,
    autoLogoutCount,
    rawAutoPenaltyTotal,
    excusedPenaltyTotal,
    finalAttendancePenalty,
    rewardTotal,
    adminPenaltyTotal,
    netRewardPenalty,
    rewardCount,
    penaltyCount,
    rawScore,
    finalPercentage,
    grade: gradeInfo.grade,
    gradeInfo,
    isConfirmed: Boolean(workerRecord?.isConfirmed),
    confirmedAt: workerRecord?.confirmedAt || null,
    evaluatorComment: workerRecord?.evaluatorComment || '',
    rewardPenaltyList,
    dailyList,
  };
}

/**
 * 특정 연도에 대해 특정 근무자의 1월~12월 원본 레코드를 취합합니다.
 */
export function getWorkerMonthRecord(worker, year, targetMonth, currentEditingMonth, currentMonthWorkerRecord) {
  if (targetMonth === currentEditingMonth && currentMonthWorkerRecord) {
    return currentMonthWorkerRecord;
  }

  const storageKey = `${STORAGE_KEY_PREFIX}_${year}_${targetMonth}`;
  try {
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed && parsed[worker.workerId]) {
        return parsed[worker.workerId];
      }
    }
  } catch (err) {
    console.warn('[hrAnnualService] localStorage 로드 실패:', err);
  }

  return generateWorkerMonthlyRecord(worker, year, targetMonth);
}

/**
 * 저장된 연간 평가 메타데이터(연봉협상 의견 등)를 로드합니다.
 */
export function loadAnnualWorkerMeta(year, workerId) {
  const key = `${ANNUAL_EVAL_STORAGE_PREFIX}_${year}_${workerId}`;
  try {
    const saved = localStorage.getItem(key);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (err) {
    console.warn('[hrAnnualService] loadAnnualWorkerMeta 오류:', err);
  }
  return null;
}

/**
 * 연간 평가 메타데이터를 저장합니다.
 */
export function saveAnnualWorkerMeta(year, workerId, meta) {
  const key = `${ANNUAL_EVAL_STORAGE_PREFIX}_${year}_${workerId}`;
  try {
    localStorage.setItem(key, JSON.stringify(meta));
  } catch (err) {
    console.warn('[hrAnnualService] saveAnnualWorkerMeta 오류:', err);
  }
}

/**
 * 단일 근무자의 1년(1월~12월) 데이터를 완전 집계합니다.
 */
export function calculateWorkerAnnualSummary(
  worker,
  year,
  currentMonth,
  currentMonthWorkerRecord,
  annualMetaState = {},
  scoringSettings = null,
  monthCache = null
) {
  const monthlySummaries = [];
  const allTimelineItems = [];

  let sumPercentage = 0;
  let annualWorkDays = 0;
  let annualRegularOffDays = 0;
  let annualTotalLeaveDays = 0;
  const annualLeaveBreakdown = {
    monthly_leave: 0,
    annual_leave: 0,
    half_leave: 0,
    family_leave: 0,
    sick_leave: 0,
    official_leave: 0,
    absent: 0,
  };

  let annualLateCount = 0;
  let annualEarlyLeaveCount = 0;
  let annualAutoLogoutCount = 0;
  let annualFinalAttendancePenalty = 0;
  let annualExcusedPenaltyTotal = 0;
  let annualRewardTotal = 0;
  let annualPenaltyTotal = 0;
  let annualRewardCount = 0;
  let annualPenaltyCount = 0;

  for (let m = 1; m <= 12; m++) {
    let mRec = null;
    if (m === currentMonth && currentMonthWorkerRecord) {
      mRec = currentMonthWorkerRecord;
    } else if (monthCache) {
      mRec = monthCache[m]?.[worker?.workerId] || null;
    } else {
      mRec = getWorkerMonthRecord(worker, year, m, currentMonth, currentMonthWorkerRecord);
    }

    if (!mRec && worker) {
      mRec = generateWorkerMonthlyRecord(worker, year, m);
    }
    const mSum = calculateWorkerMonthlySummary(worker, mRec, scoringSettings);
    mSum.month = m;
    monthlySummaries.push(mSum);

    sumPercentage += mSum.finalPercentage;
    annualWorkDays += mSum.workDays;
    annualRegularOffDays += mSum.regularOffDays;
    annualTotalLeaveDays += mSum.totalLeaveDays;

    Object.keys(annualLeaveBreakdown).forEach((key) => {
      annualLeaveBreakdown[key] += mSum.leaveBreakdown?.[key] || 0;
    });

    annualLateCount += mSum.lateCount;
    annualEarlyLeaveCount += mSum.earlyLeaveCount;
    annualAutoLogoutCount += mSum.autoLogoutCount;
    annualFinalAttendancePenalty += mSum.finalAttendancePenalty;
    annualExcusedPenaltyTotal += mSum.excusedPenaltyTotal;
    annualRewardTotal += mSum.rewardTotal;
    annualPenaltyTotal += mSum.adminPenaltyTotal;
    annualRewardCount += mSum.rewardCount;
    annualPenaltyCount += mSum.penaltyCount;

    // 상벌점 타임라인 수집 (월 정보 부착)
    (mSum.rewardPenaltyList || []).forEach((item) => {
      allTimelineItems.push({
        ...item,
        month: m,
      });
    });
  }

  // 날짜 내림차순 정렬 (최신 순)
  allTimelineItems.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  const annualAvgScore = Number((sumPercentage / 12).toFixed(1));
  const annualGradeInfo = getGradeInfo(annualAvgScore, scoringSettings?.gradeCriteria);
  const annualNetRewardPenalty = annualRewardTotal + annualPenaltyTotal;
  const annualAttendanceIssuesCount = annualLateCount + annualEarlyLeaveCount + annualAutoLogoutCount;

  // 영속화된 메타데이터 병합
  const savedMeta = annualMetaState[worker.workerId] || loadAnnualWorkerMeta(year, worker.workerId) || {};
  const salaryRecommendation =
    savedMeta.salaryRecommendation || getDefaultSalaryRecommendation(annualGradeInfo.grade);
  const annualComment =
    savedMeta.annualComment !== undefined
      ? savedMeta.annualComment
      : getDefaultAnnualComment(worker, annualGradeInfo.grade, annualAvgScore, 1, 14);
  const isAnnualConfirmed = Boolean(savedMeta.isAnnualConfirmed);
  const annualConfirmedAt = savedMeta.annualConfirmedAt || null;

  return {
    workerId: worker.workerId,
    siteId: worker.siteId,
    siteName: worker.siteName,
    workerName: worker.workerName,
    position: worker.position,
    phone: worker.phone,
    year,
    monthlySummaries,
    annualAvgScore,
    annualGrade: annualGradeInfo.grade,
    annualGradeInfo,
    annualWorkDays,
    annualRegularOffDays,
    annualTotalLeaveDays,
    annualLeaveBreakdown,
    annualLateCount,
    annualEarlyLeaveCount,
    annualAutoLogoutCount,
    annualAttendanceIssuesCount,
    annualFinalAttendancePenalty,
    annualExcusedPenaltyTotal,
    annualRewardTotal,
    annualPenaltyTotal,
    annualNetRewardPenalty,
    annualRewardCount,
    annualPenaltyCount,
    annualRewardPenaltyTimeline: allTimelineItems,
    salaryRecommendation,
    annualComment,
    isAnnualConfirmed,
    annualConfirmedAt,
  };
}

/**
 * 전체 현장 근무자들의 연간 누적 고과 순위를 계산합니다.
 */
export function calculateAllWorkersAnnualRanking(workers, year, currentMonth, monthlyRecordsMap, annualMetaState = {}, scoringSettings = null) {
  if (!Array.isArray(workers) || workers.length === 0) {
    return { rankedList: [], workerMap: {} };
  }

  // 12개 월의 localStorage 데이터를 사전에 1회만 일괄 파싱하여 반복 I/O 및 대량 JSON 파싱 메모리 누수 방지
  const monthCache = {};
  for (let m = 1; m <= 12; m++) {
    if (m === currentMonth && monthlyRecordsMap) {
      monthCache[m] = monthlyRecordsMap;
    } else {
      const storageKey = `${STORAGE_KEY_PREFIX}_${year}_${m}`;
      try {
        const saved = localStorage.getItem(storageKey);
        monthCache[m] = saved ? JSON.parse(saved) : null;
      } catch {
        monthCache[m] = null;
      }
    }
  }

  const summaries = workers.map((w) =>
    calculateWorkerAnnualSummary(w, year, currentMonth, monthlyRecordsMap?.[w.workerId], annualMetaState, scoringSettings, monthCache)
  );

  // 연간 평균 고과점수 내림차순 -> 실근무일수 내림차순 -> 현장명 가나다순 정렬
  const sorted = [...summaries].sort((a, b) => {
    if (b.annualAvgScore !== a.annualAvgScore) return b.annualAvgScore - a.annualAvgScore;
    if (b.annualWorkDays !== a.annualWorkDays) return b.annualWorkDays - a.annualWorkDays;
    return a.siteName.localeCompare(b.siteName, 'ko');
  });

  const totalWorkers = sorted.length;
  const rankedList = sorted.map((item, index) => {
    const rank = index + 1;
    // 기본 코멘트에 실제 순위 반영
    let finalComment = item.annualComment;
    if (!item.isAnnualConfirmed && (!item.annualComment || item.annualComment.includes('1위'))) {
      finalComment = getDefaultAnnualComment(
        item,
        item.annualGradeInfo.grade,
        item.annualAvgScore,
        rank,
        totalWorkers
      );
    }
    return {
      ...item,
      annualRank: rank,
      totalWorkers,
      annualComment: finalComment,
    };
  });

  const workerMap = Object.fromEntries(rankedList.map((item) => [item.workerId, item]));
  return {
    rankedList,
    workerMap,
  };
}
