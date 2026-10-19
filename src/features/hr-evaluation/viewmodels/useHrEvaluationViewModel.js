import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSiteMaster } from '../../certificate/hooks/useSiteMaster';
import {
  computeAutoPenalty,
  mergeWorkersWithSiteMaster,
  generateWorkerMonthlyRecord,
  getWorkerBoardPosts,
} from '../constants/hrEvaluationConstants';
import { calculateWorkerMonthlySummary } from '../services/hrAnnualService';
import { useHrAnnualEvaluationState } from '../hooks/useHrAnnualEvaluationState';
import { useHrBackgroundSync } from '../hooks/useHrBackgroundSync';
import { useHrMonthlyEvaluationActions } from '../hooks/useHrMonthlyEvaluationActions';
import { HrEvaluationModel } from '../models/HrEvaluationModel';
import {
  buildInitialMonthMap,
  saveMonthMapToStorage,
} from '../services/hrMonthStorageService';
import {
  loadScoringSettings,
  saveScoringSettings,
} from '../constants/hrScoringConstants';
import { filterSitesForUser } from '../../../core/auth/siteAccessHelper';

export function useHrEvaluationViewModel({ currentUser } = {}) {
  const activeUser = currentUser || (() => {
    try {
      const raw = localStorage.getItem('osoo_admin_user_session');
      return raw ? JSON.parse(raw).user : null;
    } catch {
      return null;
    }
  })();

  const { siteMaster, allSites } = useSiteMaster();

  const now = useMemo(() => new Date(), []);
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const workers = useMemo(
    () => mergeWorkersWithSiteMaster(allSites && allSites.length > 0 ? allSites : siteMaster),
    [allSites, siteMaster]
  );

  const assignedWorkers = useMemo(() => {
    return filterSitesForUser(workers, activeUser, (w) => w.siteName || w.workerName || w.workerId);
  }, [workers, activeUser]);

  const [selectedWorkerId, setSelectedWorkerId] = useState(
    () => assignedWorkers[0]?.workerId || workers[0]?.workerId || 'w_cheongju_s'
  );
  const [viewMode, setViewMode] = useState('calendar'); // 'calendar' | 'list' | 'annual' | 'ranking'
  const [selectedDate, setSelectedDate] = useState(() => {
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}-14`;
  });
  const [showBoardRefDrawer, setShowBoardRefDrawer] = useState(false);
  const [serverBoardPosts, setServerBoardPosts] = useState([]);

  // 순위 뷰 필터 및 기간 모드 상태 ('monthly' | 'annual')
  const [rankingPeriodMode, setRankingPeriodMode] = useState('monthly');
  const [rankingSearch, setRankingSearch] = useState('');
  const [rankingGradeFilter, setRankingGradeFilter] = useState('ALL');

  // 모달 상태: 평가 기준 설정 모달 & 시말서 열람 모달
  const [showScoringSettingsModal, setShowScoringSettingsModal] = useState(false);
  const [selectedApologyPenalty, setSelectedApologyPenalty] = useState(null);

  // 점수 설정 상태 (localStorage 로드)
  const [scoringSettings, setScoringSettings] = useState(() => loadScoringSettings());

  // 월간 전체 현장 근무자 기록 상태 (Optimistic Cache)
  const [monthlyRecordsMap, setMonthlyRecordsMap] = useState(() =>
    buildInitialMonthMap(workers, now.getFullYear(), now.getMonth() + 1)
  );

  const effectiveSelectedWorkerId = useMemo(() => {
    if (assignedWorkers.length > 0) {
      const exists = assignedWorkers.some((w) => w.workerId === selectedWorkerId);
      if (!exists) {
        return assignedWorkers[0].workerId;
      }
    }
    return selectedWorkerId;
  }, [assignedWorkers, selectedWorkerId]);

  const selectedWorker = useMemo(
    () => workers.find((w) => w.workerId === effectiveSelectedWorkerId) || workers[0],
    [workers, effectiveSelectedWorkerId]
  );

  // 연간 종합 고과 상태 및 액션 훅 (1월~12월 취합 및 연봉협상 의견/확정 관리)
  const {
    annualMetaState,
    annualRankedList,
    currentWorkerAnnualSummary,
    filteredAnnualRankingList,
    updateAnnualComment,
    updateSalaryRecommendation,
    toggleConfirmAnnualEvaluation,
  } = useHrAnnualEvaluationState({
    workers,
    year,
    month,
    monthlyRecordsMap,
    selectedWorker,
    scoringSettings,
    rankingGradeFilter,
    rankingSearch,
    viewMode,
  });

  // 🔄 백그라운드 큐(Debounce/Queue) 동기화 훅 (BigQuery 서버 + Google Drive)
  const {
    syncStatus,
    pendingCount,
    lastSyncedTime,
    enqueueChange,
    handleManualSaveNow,
    uploadApologyDocToDrive,
  } = useHrBackgroundSync({
    year,
    month,
    monthlyRecordsMap,
    scoringSettings,
    annualMetaState,
    workers,
  });

  // 🛠️ 월간 근태 기록 및 상벌점 수정 액션 훅
  const {
    updateDayRecord,
    addRewardPenalty,
    removeRewardPenalty,
    updateApologyDoc,
    updateEvaluatorComment,
    toggleConfirmEvaluation,
  } = useHrMonthlyEvaluationActions({
    selectedWorker,
    selectedDate,
    year,
    month,
    currentUser,
    scoringSettings,
    setMonthlyRecordsMap,
    setSelectedApologyPenalty,
    enqueueChange,
    uploadApologyDocToDrive,
  });

  // 대상 연월 변경 핸들러 (연월 변경 시 해당 월 캐시 로드)
  const changeYearMonth = useCallback(
    (nextYear, nextMonth) => {
      setYear(nextYear);
      setMonth(nextMonth);
      setMonthlyRecordsMap(buildInitialMonthMap(workers, nextYear, nextMonth));
      const defaultDay = '14';
      setSelectedDate(`${nextYear}-${String(nextMonth).padStart(2, '0')}-${defaultDay}`);
    },
    [workers]
  );

  // 대상 연월 백엔드 BigQuery 및 소통게시판 사유 데이터 조회 (비동기 병합)
  useEffect(() => {
    let isMounted = true;

    HrEvaluationModel.fetchHrData(year, month).then((serverData) => {
      if (!isMounted || !serverData) return;
      if (serverData.boardPosts) setServerBoardPosts(serverData.boardPosts);

      if (serverData.dailyRecords && Object.keys(serverData.dailyRecords).length > 0) {
        setMonthlyRecordsMap((prev) => {
          const next = { ...prev };
          Object.keys(serverData.dailyRecords).forEach((wId) => {
            if (!next[wId]) return;
            next[wId] = {
              ...next[wId],
              dailyRecords: {
                ...next[wId].dailyRecords,
                ...serverData.dailyRecords[wId],
              },
            };
          });
          return next;
        });
      }
    });

    return () => {
      isMounted = false;
    };
  }, [year, month]);

  // 변경사항 localStorage 캐시 동기화
  useEffect(() => {
    saveMonthMapToStorage(year, month, monthlyRecordsMap);
  }, [monthlyRecordsMap, year, month]);

  // 설정 저장 및 현재 월 일별 벌점 일괄 재계산
  const updateScoringSettings = useCallback(
    (newSettings) => {
      saveScoringSettings(newSettings);
      setScoringSettings(newSettings);
      enqueueChange({ type: 'scoringSettings', data: newSettings });

      setMonthlyRecordsMap((prev) => {
        const updated = { ...prev };
        Object.keys(updated).forEach((wId) => {
          const wRec = updated[wId];
          if (!wRec?.dailyRecords) return;
          const nextDaily = { ...wRec.dailyRecords };
          Object.keys(nextDaily).forEach((dStr) => {
            const day = nextDaily[dStr];
            const penaltyInfo = computeAutoPenalty(
              {
                dayType: day.dayType,
                checkIn: day.checkIn,
                checkOut: day.checkOut,
                autoLogout: day.autoLogout,
              },
              newSettings.autoPenalty
            );

            const finalPts = day.isPenaltyExcused ? 0 : penaltyInfo.autoPenaltyPoints;
            nextDaily[dStr] = {
              ...day,
              autoPenaltyPoints: penaltyInfo.autoPenaltyPoints,
              finalPenaltyPoints: finalPts,
              penaltyBadges: penaltyInfo.penaltyBadges,
              lateType: penaltyInfo.lateType,
              earlyType: penaltyInfo.earlyType,
            };
          });
          updated[wId] = { ...wRec, dailyRecords: nextDaily };
        });
        return updated;
      });
    },
    [enqueueChange]
  );

  // 소통게시판 사유글 날짜로 이동
  const selectBoardPostDate = useCallback(
    (post) => {
      if (!post) return;
      const dateStr =
        post.targetDate ||
        `${year}-${String(month).padStart(2, '0')}-${String(post.day).padStart(2, '0')}`;
      if (post.workerId) {
        setSelectedWorkerId(post.workerId);
      }
      setSelectedDate(dateStr);
      if (viewMode === 'ranking') {
        setViewMode('calendar');
      }
    },
    [year, month, viewMode]
  );

  // 현재 월 시뮬레이션 초기화 (원복)
  const resetCurrentMonthSimulation = useCallback(() => {
    const fresh = {};
    for (const w of workers) {
      fresh[w.workerId] = generateWorkerMonthlyRecord(w, year, month);
    }
    setMonthlyRecordsMap(fresh);
    saveMonthMapToStorage(year, month, fresh);
    handleManualSaveNow();
  }, [workers, year, month, handleManualSaveNow]);

  // 전체 현장 실시간 당월 점수 및 전국 순위 계산
  const rankedEvaluations = useMemo(() => {
    const summaries = workers.map((w) =>
      calculateWorkerMonthlySummary(w, monthlyRecordsMap[w.workerId], scoringSettings)
    );

    summaries.sort((a, b) => {
      if (b.finalPercentage !== a.finalPercentage) {
        return b.finalPercentage - a.finalPercentage;
      }
      return b.workingDaysCount - a.workingDaysCount;
    });

    const rankedList = [];
    let currentRank = 1;
    for (let index = 0; index < summaries.length; index++) {
      const item = summaries[index];
      if (index > 0 && item.finalPercentage < summaries[index - 1].finalPercentage) {
        currentRank = index + 1;
      }
      rankedList.push({ ...item, rank: currentRank });
    }
    return rankedList;
  }, [workers, monthlyRecordsMap, scoringSettings]);

  // 중앙관리자 담당 현장 기준 상단 드롭다운 목록 필터링 (전체 순위표는 39개 전체 유지)
  const dropdownEvaluations = useMemo(() => {
    return filterSitesForUser(
      rankedEvaluations,
      activeUser,
      (item) => item.siteName || item.workerName || item.workerId
    );
  }, [rankedEvaluations, activeUser]);


  const currentWorkerEvaluation = useMemo(() => {
    return (
      rankedEvaluations.find((item) => item.workerId === selectedWorker?.workerId) ||
      rankedEvaluations[0] ||
      null
    );
  }, [rankedEvaluations, selectedWorker]);

  // 현재 선택된 날짜의 상세 레코드
  const selectedDayRecord = useMemo(() => {
    const workerRec = monthlyRecordsMap[selectedWorker?.workerId];
    if (!workerRec || !workerRec.dailyRecords) return null;
    return workerRec.dailyRecords[selectedDate] || Object.values(workerRec.dailyRecords)[0] || null;
  }, [monthlyRecordsMap, selectedWorker, selectedDate]);

  // 당월 순위표 필터링
  const filteredRankingList = useMemo(() => {
    return rankedEvaluations.filter((item) => {
      if (rankingGradeFilter !== 'ALL' && item.grade !== rankingGradeFilter) {
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
  }, [rankedEvaluations, rankingGradeFilter, rankingSearch]);

  // 소통게시판 참고글 목록 (서버 데이터 + 로컬 시뮬레이션 병합)
  const boardReasonPosts = useMemo(() => {
    const workerRec = monthlyRecordsMap[selectedWorker?.workerId];
    const generated = getWorkerBoardPosts(selectedWorker, year, month, workerRec);
    if (!serverBoardPosts || serverBoardPosts.length === 0) return generated;
    return [...serverBoardPosts, ...generated];
  }, [selectedWorker, year, month, monthlyRecordsMap, serverBoardPosts]);

  return {
    year,
    setYear,
    month,
    setMonth,
    workers,
    selectedWorkerId: selectedWorker?.workerId || '',
    setSelectedWorkerId,
    selectedWorker,
    viewMode,
    setViewMode,
    selectedDate,
    setSelectedDate,
    selectedDayRecord,
    showBoardRefDrawer,
    setShowBoardRefDrawer,
    boardReasonPosts,
    selectBoardPostDate,
    currentWorkerEvaluation,
    rankedEvaluations,
    dropdownEvaluations,
    filteredRankingList,
    rankingPeriodMode,
    setRankingPeriodMode,
    annualRankedList,
    filteredAnnualRankingList,
    currentWorkerAnnualSummary,
    rankingSearch,
    setRankingSearch,
    rankingGradeFilter,
    setRankingGradeFilter,
    updateDayRecord,
    addRewardPenalty,
    removeRewardPenalty,
    updateEvaluatorComment,
    toggleConfirmEvaluation,
    resetCurrentMonthSimulation,
    updateAnnualComment,
    updateSalaryRecommendation,
    toggleConfirmAnnualEvaluation,
    showScoringSettingsModal,
    setShowScoringSettingsModal,
    selectedApologyPenalty,
    setSelectedApologyPenalty,
    scoringSettings,
    updateScoringSettings,
    updateApologyDoc,
    changeYearMonth,
    // ☁️ 백그라운드 서버/Drive 동기화 상태 및 수동 저장
    syncStatus,
    pendingCount,
    lastSyncedTime,
    handleManualSaveNow,
  };
}
