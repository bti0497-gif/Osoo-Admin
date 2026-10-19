import { useState, useMemo, useCallback } from 'react';
import {
  calculateAllWorkersAnnualRanking,
  calculateWorkerAnnualSummary,
  saveAnnualWorkerMeta,
} from '../services/hrAnnualService';

/**
 * 📊 연간 종합 인사고과 상태 및 액션 훅
 */
export function useHrAnnualEvaluationState({
  workers,
  year,
  month,
  monthlyRecordsMap,
  selectedWorker,
  scoringSettings,
  rankingGradeFilter,
  rankingSearch,
  viewMode = 'calendar',
}) {
  // 연간 평가 메타 상태 (연봉협상 의견, 확정 여부 등)
  const [annualMetaState, setAnnualMetaState] = useState({});

  const isAnnualOrRanking = viewMode === 'annual' || viewMode === 'ranking';

  // 연간 종합 고과 및 순위 계산 (1월~12월 취합) - 연간/순위 화면에서만 전체 현장 계산 진행 (캘린더 진입 0ms 고속 로딩)
  const annualRankingResult = useMemo(() => {
    if (!isAnnualOrRanking) {
      return { rankedList: [], workerMap: {} };
    }
    return calculateAllWorkersAnnualRanking(
      workers,
      year,
      month,
      monthlyRecordsMap,
      annualMetaState,
      scoringSettings
    );
  }, [isAnnualOrRanking, workers, year, month, monthlyRecordsMap, annualMetaState, scoringSettings]);

  const annualRankedList = annualRankingResult.rankedList;

  const currentWorkerAnnualSummary = useMemo(() => {
    if (selectedWorker?.workerId && annualRankingResult.workerMap[selectedWorker.workerId]) {
      return annualRankingResult.workerMap[selectedWorker.workerId];
    }
    if (selectedWorker) {
      return calculateWorkerAnnualSummary(
        selectedWorker,
        year,
        month,
        monthlyRecordsMap?.[selectedWorker.workerId],
        annualMetaState,
        scoringSettings
      );
    }
    return annualRankedList[0] || null;
  }, [annualRankingResult, annualRankedList, selectedWorker, year, month, monthlyRecordsMap, annualMetaState, scoringSettings]);

  // 연간 총평 코멘트 수정
  const updateAnnualComment = useCallback(
    (comment, targetWorkerId = selectedWorker?.workerId) => {
      if (!targetWorkerId) return;
      setAnnualMetaState((prev) => {
        const cur = prev[targetWorkerId] || {};
        const next = { ...cur, annualComment: comment };
        saveAnnualWorkerMeta(year, targetWorkerId, next);
        return { ...prev, [targetWorkerId]: next };
      });
    },
    [selectedWorker, year]
  );

  // 연봉협상 권고 구분 수정
  const updateSalaryRecommendation = useCallback(
    (val, targetWorkerId = selectedWorker?.workerId) => {
      if (!targetWorkerId) return;
      setAnnualMetaState((prev) => {
        const cur = prev[targetWorkerId] || {};
        const next = { ...cur, salaryRecommendation: val };
        saveAnnualWorkerMeta(year, targetWorkerId, next);
        return { ...prev, [targetWorkerId]: next };
      });
    },
    [selectedWorker, year]
  );

  // 연간 인사고과 최종 확정 토글
  const toggleConfirmAnnualEvaluation = useCallback(
    (targetWorkerId = selectedWorker?.workerId) => {
      if (!targetWorkerId) return;
      const nowStamp = new Date().toISOString().slice(0, 16).replace('T', ' ');

      setAnnualMetaState((prev) => {
        const cur = prev[targetWorkerId] || {};
        const nextConfirmed = !cur.isAnnualConfirmed;
        const next = {
          ...cur,
          isAnnualConfirmed: nextConfirmed,
          annualConfirmedAt: nextConfirmed ? nowStamp : null,
        };
        saveAnnualWorkerMeta(year, targetWorkerId, next);
        return { ...prev, [targetWorkerId]: next };
      });
    },
    [selectedWorker, year]
  );

  // 연간 순위표 필터링
  const filteredAnnualRankingList = useMemo(() => {
    return annualRankedList.filter((item) => {
      if (rankingGradeFilter !== 'ALL' && item.annualGrade !== rankingGradeFilter) {
        return false;
      }
      if (rankingSearch.trim()) {
        const q = rankingSearch.trim().toLowerCase();
        const matchSite = item.siteName.toLowerCase().includes(q);
        const matchName = item.workerName.toLowerCase().includes(q);
        if (!matchSite && !matchName) return false;
      }
      return true;
    });
  }, [annualRankedList, rankingGradeFilter, rankingSearch]);

  return {
    annualMetaState,
    setAnnualMetaState,
    annualRankedList,
    currentWorkerAnnualSummary,
    filteredAnnualRankingList,
    updateAnnualComment,
    updateSalaryRecommendation,
    toggleConfirmAnnualEvaluation,
  };
}
