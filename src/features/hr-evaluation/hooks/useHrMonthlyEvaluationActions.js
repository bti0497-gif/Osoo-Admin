import { useCallback } from 'react';
import { computeAutoPenalty, getTodayKST } from '../constants/hrEvaluationConstants';

/**
 * 🛠️ 월간 근태 일별 기록 및 관리자 상벌점/평가의견 수정 액션 훅
 */
export function useHrMonthlyEvaluationActions({
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
}) {
  // 특정 근무자의 특정 날짜 기록 수정 핸들러
  const updateDayRecord = useCallback(
    (dateStr, patch, targetWorkerId = selectedWorker?.workerId) => {
      if (!targetWorkerId || !dateStr) return;

      setMonthlyRecordsMap((prev) => {
        const workerRec = prev[targetWorkerId];
        if (!workerRec || !workerRec.dailyRecords[dateStr]) return prev;

        const currentDay = workerRec.dailyRecords[dateStr];
        const nextDayType = patch.dayType !== undefined ? patch.dayType : currentDay.dayType;

        let nextCheckIn = patch.checkIn !== undefined ? patch.checkIn : currentDay.checkIn;
        let nextCheckOut = patch.checkOut !== undefined ? patch.checkOut : currentDay.checkOut;
        let nextAutoLogout = patch.autoLogout !== undefined ? patch.autoLogout : currentDay.autoLogout;

        if (patch.dayType !== undefined && patch.dayType !== currentDay.dayType) {
          if (nextDayType === 'work') {
            if (nextCheckIn === '-') nextCheckIn = '08:50';
          } else if (nextDayType === 'early_leave') {
            if (nextCheckIn === '-') nextCheckIn = '08:50';
            if (nextCheckOut === '-') nextCheckOut = '14:30';
            nextAutoLogout = false;
          } else if (nextDayType === 'half_am') {
            nextCheckIn = '13:50';
            if (nextCheckOut === '-') nextCheckOut = '18:05';
          } else if (nextDayType === 'half_pm') {
            if (nextCheckIn === '-') nextCheckIn = '08:50';
            nextCheckOut = '13:30';
            nextAutoLogout = false;
          } else {
            nextCheckIn = '-';
            nextCheckOut = '-';
            nextAutoLogout = false;
          }
        }

        const todayKst = getTodayKST();
        const isDateAfterToday = dateStr > todayKst;
        const hasCheckRecord = (nextCheckIn && nextCheckIn !== '-') || (nextCheckOut && nextCheckOut !== '-');
        const nextHasManualOverride = patch.hasManualOverride !== undefined
          ? Boolean(patch.hasManualOverride)
          : true;
        const nextIsFuture = isDateAfterToday && !hasCheckRecord && !nextHasManualOverride;

        const penaltyInfo = nextIsFuture
          ? { autoPenaltyPoints: 0, lateType: null, earlyType: null, penaltyBadges: [] }
          : computeAutoPenalty(
              {
                dayType: nextDayType,
                checkIn: nextCheckIn,
                checkOut: nextCheckOut,
                autoLogout: nextAutoLogout,
                isFuture: nextIsFuture,
              },
              scoringSettings.autoPenalty,
              scoringSettings.workHours
            );

        const nextIsExcused =
          patch.isPenaltyExcused !== undefined ? Boolean(patch.isPenaltyExcused) : currentDay.isPenaltyExcused;

        let nextFinalPenalty = (nextIsFuture || nextIsExcused) ? 0 : penaltyInfo.autoPenaltyPoints;
        if (patch.finalPenaltyPoints !== undefined && !nextIsExcused && !nextIsFuture) {
          const parsed = Number(patch.finalPenaltyPoints);
          if (!Number.isNaN(parsed)) {
            nextFinalPenalty = parsed > 0 ? -parsed : parsed;
          }
        }

        const updatedDay = {
          ...currentDay,
          ...patch,
          dayType: nextDayType,
          checkIn: nextCheckIn,
          checkOut: nextCheckOut,
          autoLogout: nextIsFuture ? false : nextAutoLogout,
          autoPenaltyPoints: nextIsFuture ? 0 : penaltyInfo.autoPenaltyPoints,
          isPenaltyExcused: nextIsExcused,
          finalPenaltyPoints: nextFinalPenalty,
          penaltyBadges: nextIsFuture ? [] : penaltyInfo.penaltyBadges,
          lateType: nextIsFuture ? null : penaltyInfo.lateType,
          earlyType: nextIsFuture ? null : penaltyInfo.earlyType,
          hasManualOverride: nextHasManualOverride,
          isFuture: nextIsFuture,
        };

        // 백그라운드 큐에 변경 등록
        enqueueChange({
          type: 'dailyRecord',
          data: {
            work_date: dateStr,
            site_id: selectedWorker?.siteId || targetWorkerId,
            site_name: selectedWorker?.siteName || '',
            worker_id: targetWorkerId,
            worker_name: selectedWorker?.workerName || '',
            day_type: nextDayType,
            login_time: nextCheckIn,
            logout_time: nextCheckOut,
            is_auto_logout: nextAutoLogout,
            leave_reason: updatedDay.leaveReason || '',
            late_reason: updatedDay.lateReason || '',
            early_leave_reason: updatedDay.earlyLeaveReason || '',
            auto_penalty_points: penaltyInfo.autoPenaltyPoints,
            is_penalty_excused: nextIsExcused,
            final_penalty_points: nextFinalPenalty,
          },
        });

        return {
          ...prev,
          [targetWorkerId]: {
            ...workerRec,
            dailyRecords: {
              ...workerRec.dailyRecords,
              [dateStr]: updatedDay,
            },
          },
        };
      });
    },
    [selectedWorker, scoringSettings, enqueueChange, setMonthlyRecordsMap]
  );

  // 관리자 상벌점 추가 (시말서 스캔본 doc 포함)
  const addRewardPenalty = useCallback(
    ({ category, title, points, reason, date, apologyDoc }) => {
      const targetWorkerId = selectedWorker?.workerId;
      if (!targetWorkerId) return;

      const numericPoints = Number(points) || 0;
      const signedPoints =
        category === 'penalty' ? -Math.abs(numericPoints || 2) : Math.abs(numericPoints || 2);

      const newItem = {
        id: `rp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        date: date || selectedDate || `${year}-${String(month).padStart(2, '0')}-15`,
        category,
        title: (title || '').trim() || (category === 'reward' ? '관리자 포상' : '관리자 감점'),
        points: signedPoints,
        reason: (reason || '').trim() || '-',
        author: currentUser?.name || '중앙관리자',
        apologyDoc: apologyDoc || null,
      };

      setMonthlyRecordsMap((prev) => {
        const workerRec = prev[targetWorkerId];
        if (!workerRec) return prev;
        const nextList = [newItem, ...(workerRec.rewardPenaltyList || [])];

        enqueueChange({
          type: 'monthlyEvaluation',
          data: {
            site_id: selectedWorker?.siteId || targetWorkerId,
            site_name: selectedWorker?.siteName || '',
            worker_id: targetWorkerId,
            worker_name: selectedWorker?.workerName || '',
            rewardPenaltyList: nextList,
            evaluator_comment: workerRec.evaluatorComment || '',
            is_confirmed: Boolean(workerRec.isConfirmed),
          },
        });

        return {
          ...prev,
          [targetWorkerId]: {
            ...workerRec,
            rewardPenaltyList: nextList,
          },
        };
      });

      // 시말서 스캔본이 첨부되었으면 Google Drive 백그라운드 업로드 병렬 진행
      if (apologyDoc?.dataUrl) {
        uploadApologyDocToDrive(newItem.id, {
          siteName: selectedWorker?.siteName,
          workerName: selectedWorker?.workerName,
          date: newItem.date,
          fileName: apologyDoc.fileName,
          mimeType: apologyDoc.fileType,
          dataUrl: apologyDoc.dataUrl,
        }).then((driveRes) => {
          if (driveRes?.driveFileId) {
            setMonthlyRecordsMap((prev) => {
              const workerRec = prev[targetWorkerId];
              if (!workerRec) return prev;
              const updatedList = (workerRec.rewardPenaltyList || []).map((it) =>
                it.id === newItem.id
                  ? { ...it, apologyDoc: { ...it.apologyDoc, driveFileId: driveRes.driveFileId, drivePath: driveRes.drivePath } }
                  : it
              );
              return { ...prev, [targetWorkerId]: { ...workerRec, rewardPenaltyList: updatedList } };
            });
          }
        });
      }
    },
    [
      selectedWorker,
      selectedDate,
      year,
      month,
      currentUser,
      enqueueChange,
      uploadApologyDocToDrive,
      setMonthlyRecordsMap,
    ]
  );

  // 관리자 상벌점 삭제
  const removeRewardPenalty = useCallback(
    (rewardPenaltyId) => {
      const targetWorkerId = selectedWorker?.workerId;
      if (!targetWorkerId || !rewardPenaltyId) return;

      setMonthlyRecordsMap((prev) => {
        const workerRec = prev[targetWorkerId];
        if (!workerRec) return prev;
        const nextList = (workerRec.rewardPenaltyList || []).filter((item) => item.id !== rewardPenaltyId);

        enqueueChange({
          type: 'monthlyEvaluation',
          data: {
            site_id: selectedWorker?.siteId || targetWorkerId,
            site_name: selectedWorker?.siteName || '',
            worker_id: targetWorkerId,
            worker_name: selectedWorker?.workerName || '',
            rewardPenaltyList: nextList,
            evaluator_comment: workerRec.evaluatorComment || '',
            is_confirmed: Boolean(workerRec.isConfirmed),
          },
        });

        return {
          ...prev,
          [targetWorkerId]: {
            ...workerRec,
            rewardPenaltyList: nextList,
          },
        };
      });
    },
    [selectedWorker, enqueueChange, setMonthlyRecordsMap]
  );

  // 특정 상벌점 항목의 시말서 파일 업데이트/추후첨부 (Drive 업로드 연계)
  const updateApologyDoc = useCallback(
    (penaltyId, apologyDoc, targetWorkerId = selectedWorker?.workerId) => {
      if (!penaltyId || !targetWorkerId) return;

      setMonthlyRecordsMap((prev) => {
        const workerRec = prev[targetWorkerId];
        if (!workerRec) return prev;
        const updatedList = (workerRec.rewardPenaltyList || []).map((item) =>
          item.id === penaltyId ? { ...item, apologyDoc } : item
        );

        enqueueChange({
          type: 'monthlyEvaluation',
          data: {
            site_id: selectedWorker?.siteId || targetWorkerId,
            site_name: selectedWorker?.siteName || '',
            worker_id: targetWorkerId,
            worker_name: selectedWorker?.workerName || '',
            rewardPenaltyList: updatedList,
            evaluator_comment: workerRec.evaluatorComment || '',
            is_confirmed: Boolean(workerRec.isConfirmed),
          },
        });

        return {
          ...prev,
          [targetWorkerId]: {
            ...workerRec,
            rewardPenaltyList: updatedList,
          },
        };
      });

      setSelectedApologyPenalty((prev) => {
        if (prev && prev.id === penaltyId) {
          return { ...prev, apologyDoc };
        }
        return prev;
      });

      // Drive 백그라운드 업로드
      if (apologyDoc?.dataUrl) {
        uploadApologyDocToDrive(penaltyId, {
          siteName: selectedWorker?.siteName,
          workerName: selectedWorker?.workerName,
          date: apologyDoc.uploadedAt?.slice(0, 10),
          fileName: apologyDoc.fileName,
          mimeType: apologyDoc.fileType,
          dataUrl: apologyDoc.dataUrl,
        }).then((driveRes) => {
          if (driveRes?.driveFileId) {
            setMonthlyRecordsMap((prev) => {
              const workerRec = prev[targetWorkerId];
              if (!workerRec) return prev;
              const updatedList = (workerRec.rewardPenaltyList || []).map((it) =>
                it.id === penaltyId
                  ? { ...it, apologyDoc: { ...it.apologyDoc, driveFileId: driveRes.driveFileId, drivePath: driveRes.drivePath } }
                  : it
              );
              return { ...prev, [targetWorkerId]: { ...workerRec, rewardPenaltyList: updatedList } };
            });
          }
        });
      }
    },
    [selectedWorker, enqueueChange, uploadApologyDocToDrive, setMonthlyRecordsMap, setSelectedApologyPenalty]
  );

  // 월간 종합 평가 의견 수정
  const updateEvaluatorComment = useCallback(
    (comment) => {
      const targetWorkerId = selectedWorker?.workerId;
      if (!targetWorkerId) return;

      setMonthlyRecordsMap((prev) => {
        const workerRec = prev[targetWorkerId];
        if (!workerRec) return prev;

        enqueueChange({
          type: 'monthlyEvaluation',
          data: {
            site_id: selectedWorker?.siteId || targetWorkerId,
            site_name: selectedWorker?.siteName || '',
            worker_id: targetWorkerId,
            worker_name: selectedWorker?.workerName || '',
            rewardPenaltyList: workerRec.rewardPenaltyList || [],
            evaluator_comment: comment,
            is_confirmed: Boolean(workerRec.isConfirmed),
          },
        });

        return {
          ...prev,
          [targetWorkerId]: {
            ...workerRec,
            evaluatorComment: comment,
          },
        };
      });
    },
    [selectedWorker, enqueueChange, setMonthlyRecordsMap]
  );

  // 월말 고과 확정 / 확정 취소 토글
  const toggleConfirmEvaluation = useCallback(
    (targetWorkerId = selectedWorker?.workerId) => {
      if (!targetWorkerId) return;
      const nowStamp = new Date().toISOString().slice(0, 16).replace('T', ' ');

      setMonthlyRecordsMap((prev) => {
        const workerRec = prev[targetWorkerId];
        if (!workerRec) return prev;
        const nextConfirmed = !workerRec.isConfirmed;

        enqueueChange({
          type: 'monthlyEvaluation',
          data: {
            site_id: selectedWorker?.siteId || targetWorkerId,
            site_name: selectedWorker?.siteName || '',
            worker_id: targetWorkerId,
            worker_name: selectedWorker?.workerName || '',
            rewardPenaltyList: workerRec.rewardPenaltyList || [],
            evaluator_comment: workerRec.evaluatorComment || '',
            is_confirmed: nextConfirmed,
          },
        });

        return {
          ...prev,
          [targetWorkerId]: {
            ...workerRec,
            isConfirmed: nextConfirmed,
            confirmedAt: nextConfirmed ? nowStamp : null,
          },
        };
      });
    },
    [selectedWorker, enqueueChange, setMonthlyRecordsMap]
  );

  return {
    updateDayRecord,
    addRewardPenalty,
    removeRewardPenalty,
    updateApologyDoc,
    updateEvaluatorComment,
    toggleConfirmEvaluation,
  };
}
