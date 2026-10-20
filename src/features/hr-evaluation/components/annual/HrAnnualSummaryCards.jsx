import React, { useState, useEffect } from 'react';
import { hrAnnualSummaryStyles as styles } from './hrAnnualSummaryStyles';

/**
 * 연간 상단 핵심 요약 4열 카드
 * 1) 연간 평균 고과 & 전국 순위
 * 2) 연간 총 근무/휴무 집계
 * 3) 연간 근태 감점 합계
 * 4) 연간 상벌점(포상/징계) 누적
 */
export function HrAnnualSummaryCards({ annualSummary }) {
  const [activeDetailToast, setActiveDetailToast] = useState(null);

  useEffect(() => {
    if (!activeDetailToast) return;
    const timer = setTimeout(() => {
      setActiveDetailToast(null);
    }, 4500);
    return () => clearTimeout(timer);
  }, [activeDetailToast]);

  if (!annualSummary) return null;

  const {
    annualAvgScore = 100,
    annualGrade = 'S',
    annualGradeInfo,
    annualRank = 1,
    totalWorkers = 1,
    annualWorkDays = 0,
    annualRegularOffDays = 0,
    annualTotalLeaveDays = 0,
    annualLeaveBreakdown = {},
    annualAttendanceIssuesCount = 0,
    annualFinalAttendancePenalty = 0,
    annualExcusedPenaltyTotal = 0,
    annualLateCount = 0,
    annualEarlyLeaveCount = 0,
    annualAutoLogoutCount = 0,
    annualRewardTotal = 0,
    annualPenaltyTotal = 0,
    annualNetRewardPenalty = 0,
    annualRewardCount = 0,
    annualPenaltyCount = 0,
  } = annualSummary;

  const safeGrade = annualGradeInfo || {
    grade: annualGrade || 'S',
    color: '#6d28d9',
    bg: '#ede9fe',
    border: '#c4b5fd',
    shortLabel: '최우수',
  };

  const safeWorkersCount = Math.max(Number(annualRank) || 1, Number(totalWorkers) || 1);
  const safeAnnualRank = Math.min(Number(annualRank) || 1, safeWorkersCount);

  const openDetailToast = (type) => {
    if (type === 'attendance') {
      setActiveDetailToast({
        icon: '⚠️',
        title: '연간 근태 감점 세부 내역',
        rows: [
          {
            label: '확정 근태 벌점',
            value: `${annualFinalAttendancePenalty}점`,
            color: annualFinalAttendancePenalty < 0 ? '#dc2626' : '#16a34a',
          },
          {
            label: '사유참작 면제',
            value: `+${annualExcusedPenaltyTotal}점 (면제 적용됨)`,
            color: '#2563eb',
          },
          {
            label: '지각 횟수',
            value: `${annualLateCount}건`,
            color: annualLateCount > 0 ? '#ea580c' : '#475569',
          },
          {
            label: '조퇴 횟수',
            value: `${annualEarlyLeaveCount}건`,
            color: annualEarlyLeaveCount > 0 ? '#ea580c' : '#475569',
          },
          {
            label: '20시 자동퇴근',
            value: `${annualAutoLogoutCount}건`,
            color: annualAutoLogoutCount > 0 ? '#dc2626' : '#475569',
          },
          {
            label: '총 이상 출퇴근',
            value: `${annualAttendanceIssuesCount}건`,
            color: '#0f172a',
          },
        ],
      });
    } else if (type === 'rewardPenalty') {
      setActiveDetailToast({
        icon: '🎖️',
        title: '연간 상벌점(포상/징계) 세부 내역',
        rows: [
          {
            label: '연간 순 가감점',
            value: `${annualNetRewardPenalty >= 0 ? '+' : ''}${annualNetRewardPenalty}점`,
            color:
              annualNetRewardPenalty > 0
                ? '#2563eb'
                : annualNetRewardPenalty < 0
                  ? '#dc2626'
                  : '#475569',
          },
          {
            label: '포상(상점) 누적',
            value: `+${annualRewardTotal}점 (${annualRewardCount}건)`,
            color: '#2563eb',
          },
          {
            label: '징계(벌점) 누적',
            value: `${annualPenaltyTotal}점 (${annualPenaltyCount}건)`,
            color: '#dc2626',
          },
        ],
      });
    } else if (type === 'workLeave') {
      setActiveDetailToast({
        icon: '🗓️',
        title: '연간 근무 및 휴가 세부 내역',
        rows: [
          { label: '실근무 일수', value: `${annualWorkDays}일`, color: '#0f172a' },
          { label: '정기 휴무 일수', value: `${annualRegularOffDays}일`, color: '#475569' },
          { label: '총 휴가 사용일', value: `${annualTotalLeaveDays}일`, color: '#1d4ed8' },
          {
            label: '휴가 세부 내역',
            value: `연차 ${annualLeaveBreakdown?.annual_leave || 0}일 · 월차 ${annualLeaveBreakdown?.monthly_leave || 0}일 · 대체휴무 ${annualLeaveBreakdown?.sub_leave || 0}일 · 경조 ${annualLeaveBreakdown?.family_leave || 0}일 · 병가 ${annualLeaveBreakdown?.sick_leave || 0}일`,
            color: '#334155',
          },
        ],
      });
    }
  };

  return (
    <div style={styles.summaryGrid}>
      {/* 카드 1: 연간 평균 고과점수 & 종합 등급 & 전국 순위 */}
      <div style={styles.summaryCard}>
        <div style={styles.cardHeader}>
          <span style={styles.cardIcon}>🏆</span>
          <span style={styles.cardTitle}>연간 평균 고과 & 전국 순위</span>
        </div>
        <div style={styles.cardMainStat}>
          <span style={{ ...styles.bigNumber, color: safeGrade.color, whiteSpace: 'nowrap' }}>
            {Number(annualAvgScore).toFixed(1)}%
          </span>
          <span
            style={{
              ...styles.gradePill,
              backgroundColor: safeGrade.bg,
              color: safeGrade.color,
              borderColor: safeGrade.border,
              whiteSpace: 'nowrap',
            }}
          >
            {safeGrade.grade}등급 · {safeGrade.shortLabel}
          </span>
        </div>
        <div style={{ ...styles.cardFooter, whiteSpace: 'nowrap' }}>
          전국 <strong>{safeWorkersCount}개 현장</strong> 중{' '}
          <strong style={{ color: '#1d4ed8' }}>{safeAnnualRank}위</strong> (상위{' '}
          {((safeAnnualRank / safeWorkersCount) * 100).toFixed(0)}%)
        </div>
      </div>

      {/* 카드 2: 연간 총 근무/휴무 집계 */}
      <div style={styles.summaryCard}>
        <div style={styles.cardHeader}>
          <span style={styles.cardIcon}>🗓️</span>
          <span style={styles.cardTitle}>연간 총 근무 / 휴무 집계</span>
        </div>
        <div style={styles.cardMainStat}>
          <span style={{ ...styles.bigNumber, whiteSpace: 'nowrap' }}>{annualWorkDays}일</span>
          <span style={{ ...styles.statUnit, whiteSpace: 'nowrap' }}>실근무</span>
          <span style={styles.divider}>/</span>
          <span style={{ ...styles.subStatText, whiteSpace: 'nowrap' }}>휴무 {annualRegularOffDays}일</span>
        </div>
        <div style={styles.cardFooterRow}>
          <span style={{ ...styles.leaveMainBadge, whiteSpace: 'nowrap' }}>
            총 휴가 {annualTotalLeaveDays}일
          </span>
          <button
            type="button"
            onClick={() => openDetailToast('workLeave')}
            style={styles.detailBtn}
            title="연간 근무/휴무 및 휴가 세부 내역 보기"
          >
            🔍 세부사항
          </button>
        </div>
      </div>

      {/* 카드 3: 연간 근태 감점 합계 */}
      <div style={styles.summaryCard}>
        <div style={styles.cardHeader}>
          <span style={styles.cardIcon}>⚠️</span>
          <span style={styles.cardTitle}>연간 근태 감점 합계</span>
        </div>
        <div style={styles.cardMainStat}>
          <span
            style={{
              ...styles.bigNumber,
              color: annualFinalAttendancePenalty < 0 ? '#dc2626' : '#16a34a',
              whiteSpace: 'nowrap',
            }}
          >
            {annualFinalAttendancePenalty}점
          </span>
          <span style={{ ...styles.statUnit, whiteSpace: 'nowrap' }}>확정 벌점</span>
        </div>
        <div style={styles.cardFooterRow}>
          <span style={{ ...styles.footerSubNote, whiteSpace: 'nowrap' }}>
            이상 {annualAttendanceIssuesCount}건 (참작 +{annualExcusedPenaltyTotal}점)
          </span>
          <button
            type="button"
            onClick={() => openDetailToast('attendance')}
            style={styles.detailBtn}
            title="지각, 조퇴, 20시자동 및 참작면제 세부 내역 보기"
          >
            🔍 세부사항
          </button>
        </div>
      </div>

      {/* 카드 4: 연간 상벌점(포상/징계) 누적 */}
      <div style={styles.summaryCard}>
        <div style={styles.cardHeader}>
          <span style={styles.cardIcon}>🎖️</span>
          <span style={styles.cardTitle}>연간 상벌점(포상/징계) 누적</span>
        </div>
        <div style={styles.cardMainStat}>
          <span
            style={{
              ...styles.bigNumber,
              color:
                annualNetRewardPenalty > 0
                  ? '#2563eb'
                  : annualNetRewardPenalty < 0
                    ? '#dc2626'
                    : '#64748b',
              whiteSpace: 'nowrap',
            }}
          >
            {annualNetRewardPenalty >= 0 ? `+${annualNetRewardPenalty}` : annualNetRewardPenalty}점
          </span>
          <span style={{ ...styles.statUnit, whiteSpace: 'nowrap' }}>순 가감점</span>
        </div>
        <div style={styles.cardFooterRow}>
          <span style={{ ...styles.footerSubNote, whiteSpace: 'nowrap' }}>
            포상 {annualRewardCount}건 / 징계 {annualPenaltyCount}건
          </span>
          <button
            type="button"
            onClick={() => openDetailToast('rewardPenalty')}
            style={styles.detailBtn}
            title="포상 및 징계 상세 내역 보기"
          >
            🔍 세부사항
          </button>
        </div>
      </div>

      {/* 세부사항 토스트 / 팝오버 팝업 */}
      {activeDetailToast && (
        <aside
          role="dialog"
          aria-label={activeDetailToast.title}
          style={styles.toastCard}
        >
          <div style={styles.toastHeader}>
            <div style={styles.toastTitleGroup}>
              <span style={{ fontSize: '15px' }}>{activeDetailToast.icon}</span>
              <strong style={styles.toastTitle}>{activeDetailToast.title}</strong>
            </div>
            <button
              type="button"
              onClick={() => setActiveDetailToast(null)}
              style={styles.toastCloseBtn}
              title="닫기"
            >
              ✕
            </button>
          </div>
          <div style={styles.toastBody}>
            {activeDetailToast.rows.map((row, idx) => (
              <div key={idx} style={styles.toastRow}>
                <span style={styles.toastLabel}>{row.label}</span>
                <strong style={{ ...styles.toastValue, color: row.color || '#0f172a' }}>
                  {row.value}
                </strong>
              </div>
            ))}
          </div>
          <div style={styles.toastFooter}>
            <span style={styles.toastAutoCloseText}>⏱️ 4.5초 후 자동으로 닫힙니다.</span>
          </div>
        </aside>
      )}
    </div>
  );
}
