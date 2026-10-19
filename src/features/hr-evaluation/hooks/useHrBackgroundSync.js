import { useState, useRef, useCallback, useEffect } from 'react';
import { HrEvaluationModel } from '../models/HrEvaluationModel';

function dispatchSyncStatus(state, text) {
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(new CustomEvent('osoo:sync-status', { detail: { state, text } }));
  }
}

/**
 * 🔄 로컬 캐시(Optimistic UI) + 백그라운드 서버(BigQuery/Drive) 동기화 큐 훅
 */
export function useHrBackgroundSync({
  year,
  month,
  monthlyRecordsMap,
  scoringSettings,
  annualMetaState,
  workers,
}) {
  const [syncStatus, setSyncStatus] = useState('idle'); // 'idle' | 'pending' | 'syncing' | 'error'
  const [pendingCount, setPendingCount] = useState(0);
  const [lastSyncedTime, setLastSyncedTime] = useState(() => {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  });

  const pendingQueueRef = useRef({
    dailyRecords: new Map(), // key: dateStr_workerId => record
    monthlyEvaluations: new Map(), // key: workerId => evalData
    scoringSettings: null,
  });

  const debounceTimerRef = useRef(null);

  /**
   * 백그라운드 서버 동기화 실행 (Queue Flush)
   */
  const flushQueue = useCallback(async () => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }

    const queue = pendingQueueRef.current;
    const dailyList = Array.from(queue.dailyRecords.values());
    const monthlyList = Array.from(queue.monthlyEvaluations.values());
    const settings = queue.scoringSettings;

    if (dailyList.length === 0 && monthlyList.length === 0 && !settings) {
      setSyncStatus('idle');
      setPendingCount(0);
      return;
    }

    setSyncStatus('syncing');
    dispatchSyncStatus('syncing', '서버 저장 중...');

    try {
      const payload = {
        year,
        month,
        dailyRecords: dailyList,
        monthlyEvaluations: monthlyList,
        scoringSettings: settings,
      };

      const res = await HrEvaluationModel.syncHrBatch(payload);

      if (res && res.success !== false) {
        // 성공적으로 전송 완료된 항목 큐에서 제거
        queue.dailyRecords.clear();
        queue.monthlyEvaluations.clear();
        queue.scoringSettings = null;

        const now = new Date();
        const stamp = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        setLastSyncedTime(stamp);
        setSyncStatus('idle');
        setPendingCount(0);
        dispatchSyncStatus('saved', '저장되었습니다.');
      } else {
        setSyncStatus('error');
        dispatchSyncStatus('error', '서버 저장 실패');
      }
    } catch (err) {
      console.warn('[useHrBackgroundSync] flushQueue 실패:', err);
      setSyncStatus('error');
      dispatchSyncStatus('error', '서버 저장 실패');
    }
  }, [year, month]);

  /**
   * 변경 사항 발생 시 큐에 적재하고 2.5초 디바운스 타이머 가동
   */
  const enqueueChange = useCallback(
    ({ type, data }) => {
      setSyncStatus('pending');

      if (type === 'dailyRecord') {
        const key = `${data.work_date}_${data.worker_id || data.site_id}`;
        pendingQueueRef.current.dailyRecords.set(key, data);
      } else if (type === 'monthlyEvaluation') {
        const key = data.worker_id || data.site_id;
        pendingQueueRef.current.monthlyEvaluations.set(key, data);
      } else if (type === 'scoringSettings') {
        pendingQueueRef.current.scoringSettings = data;
      }

      const totalPending =
        pendingQueueRef.current.dailyRecords.size +
        pendingQueueRef.current.monthlyEvaluations.size +
        (pendingQueueRef.current.scoringSettings ? 1 : 0);
      setPendingCount(totalPending);

      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      // 사용자 입력 멈춤 2.5초 후 자동 전송
      debounceTimerRef.current = setTimeout(() => {
        flushQueue();
      }, 2500);
    },
    [flushQueue]
  );

  /**
   * 즉시 수동 저장 버튼 클릭 핸들러
   */
  const handleManualSaveNow = useCallback(async () => {
    // 만약 큐가 비어있더라도 현재 상태 전체를 강제 동기화
    if (pendingCount === 0 && monthlyRecordsMap) {
      setSyncStatus('syncing');
      dispatchSyncStatus('syncing', '서버 저장 중...');
      try {
        const dailyList = [];
        const monthlyList = [];

        Object.keys(monthlyRecordsMap).forEach((wId) => {
          const wRec = monthlyRecordsMap[wId];
          const workerInfo = workers?.find((w) => w.workerId === wId) || {};
          if (wRec?.dailyRecords) {
            Object.values(wRec.dailyRecords).forEach((d) => {
              dailyList.push({
                work_date: d.date,
                site_id: workerInfo.siteId || wId,
                site_name: workerInfo.siteName || '',
                worker_id: wId,
                worker_name: workerInfo.workerName || '',
                day_type: d.dayType,
                login_time: d.checkIn,
                logout_time: d.checkOut,
                is_auto_logout: d.autoLogout,
                leave_reason: d.leaveReason,
                late_reason: d.lateReason,
                early_leave_reason: d.earlyLeaveReason,
                auto_penalty_points: d.autoPenaltyPoints,
                is_penalty_excused: d.isPenaltyExcused,
                final_penalty_points: d.finalPenaltyPoints,
              });
            });
          }

          const annualMeta = annualMetaState?.[wId] || {};
          monthlyList.push({
            site_id: workerInfo.siteId || wId,
            site_name: workerInfo.siteName || '',
            worker_id: wId,
            worker_name: workerInfo.workerName || '',
            rewardPenaltyList: wRec?.rewardPenaltyList || [],
            evaluator_comment: wRec?.evaluatorComment || '',
            is_confirmed: Boolean(wRec?.isConfirmed),
            annual_recommendation: annualMeta.salaryRecommendation || '적정유지',
            annual_comment: annualMeta.annualComment || '',
            is_annual_confirmed: Boolean(annualMeta.isAnnualConfirmed),
          });
        });

        await HrEvaluationModel.syncHrBatch({
          year,
          month,
          dailyRecords: dailyList,
          monthlyEvaluations: monthlyList,
          scoringSettings,
        });

        const now = new Date();
        const stamp = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        setLastSyncedTime(stamp);
        setSyncStatus('idle');
        setPendingCount(0);
        dispatchSyncStatus('saved', '저장되었습니다.');
      } catch (err) {
        console.warn('[useHrBackgroundSync] 전체 수동 동기화 실패:', err);
        setSyncStatus('error');
        dispatchSyncStatus('error', '서버 저장 실패');
      }
      return;
    }

    await flushQueue();
  }, [pendingCount, monthlyRecordsMap, flushQueue, year, month, scoringSettings, annualMetaState, workers]);

  /**
   * 시말서 스캔본 Google Drive 비동기 업로드
   */
  const uploadApologyDocToDrive = useCallback(
    async (penaltyItemId, apologyPayload) => {
      setSyncStatus('syncing');
      dispatchSyncStatus('syncing', 'Drive 업로드 중...');
      try {
        const driveRes = await HrEvaluationModel.uploadApologyScan(apologyPayload);
        if (driveRes && driveRes.success) {
          setSyncStatus('idle');
          dispatchSyncStatus('saved', 'Drive 업로드 완료');
          return driveRes;
        }
      } catch (err) {
        console.warn('[useHrBackgroundSync] uploadApologyDocToDrive 실패:', err);
        dispatchSyncStatus('error', 'Drive 업로드 실패');
      }
      setSyncStatus('idle');
      return null;
    },
    []
  );

  // 컴포넌트 언마운트 시 남아있는 큐 정리
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  return {
    syncStatus,
    pendingCount,
    lastSyncedTime,
    enqueueChange,
    handleManualSaveNow,
    uploadApologyDocToDrive,
  };
}
