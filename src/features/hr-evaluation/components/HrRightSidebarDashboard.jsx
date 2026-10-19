import React from 'react';
import { HrSidebarScoreCard } from './sidebar/HrSidebarScoreCard';
import { HrSidebarAttendanceSummary } from './sidebar/HrSidebarAttendanceSummary';
import { HrSidebarRewardPenaltyManager } from './sidebar/HrSidebarRewardPenaltyManager';

/**
 * 우측 고정 사이드바: 개별 근무자 인사고과 대시보드 (360px, 우측 전체 높이 통으로 사용)
 */
export function HrRightSidebarDashboard({
  year,
  month,
  workerEvaluation,
  scoringSettings,
  onAddRewardPenalty,
  onRemoveRewardPenalty,
  onUpdateComment,
  onToggleConfirm,
  onViewApology,
  onUpdateApologyDoc,
}) {
  if (!workerEvaluation) return null;

  const {
    finalPercentage = 100,
    gradeInfo,
    rank,
    totalWorkers,
    workDays,
    regularOffDays,
    totalLeaveDays,
    leaveBreakdown,
    lateCount,
    earlyLeaveCount,
    autoLogoutCount,
    finalAttendancePenalty,
    excusedPenaltyTotal,
    netRewardPenalty,
    evaluatorComment,
    isConfirmed,
    confirmedAt,
  } = workerEvaluation;

  return (
    <aside style={styles.sidebar}>
      <div style={styles.scrollBody}>
        {/* 1. 종합 인사고과 점수 카드 */}
        <HrSidebarScoreCard
          year={year}
          month={month}
          finalPercentage={finalPercentage}
          gradeInfo={gradeInfo}
          rank={rank}
          totalWorkers={totalWorkers}
          isConfirmed={isConfirmed}
          finalAttendancePenalty={finalAttendancePenalty}
          netRewardPenalty={netRewardPenalty}
        />

        {/* 2. 정량 근태 요약 카드 */}
        <HrSidebarAttendanceSummary
          workDays={workDays}
          regularOffDays={regularOffDays}
          totalLeaveDays={totalLeaveDays}
          lateCount={lateCount}
          earlyLeaveCount={earlyLeaveCount}
          autoLogoutCount={autoLogoutCount}
          excusedPenaltyTotal={excusedPenaltyTotal}
          leaveBreakdown={leaveBreakdown}
        />

        {/* 3. 관리자 상벌점 (포상 · 징계) 및 시말서 스캔본 관리 */}
        <HrSidebarRewardPenaltyManager
          workerEvaluation={workerEvaluation}
          scoringSettings={scoringSettings}
          onAddRewardPenalty={onAddRewardPenalty}
          onRemoveRewardPenalty={onRemoveRewardPenalty}
          onViewApology={onViewApology}
          onUpdateApologyDoc={onUpdateApologyDoc}
        />

        {/* 4. 월말 인사고과 종합 의견 및 확정 섹션 */}
        <section style={{ ...styles.card, marginTop: 'auto' }}>
          <div style={styles.sectionTitleRow}>
            <span style={styles.sectionTitle}>📝 월말 인사고과 종합 의견</span>
            {confirmedAt && <span style={styles.confirmedTime}>확정: {confirmedAt}</span>}
          </div>

          <textarea
            rows={2}
            value={evaluatorComment}
            onChange={(e) => onUpdateComment(e.target.value)}
            placeholder="해당 현장관리자의 월간 근태, 수질/설비 관리 상태, 특이사항 등 종합 평가 의견을 입력하세요..."
            style={styles.commentTextarea}
          />

          <button
            type="button"
            onClick={() => onToggleConfirm()}
            style={{
              ...styles.confirmBtn,
              backgroundColor: isConfirmed ? '#0f172a' : '#16a34a',
            }}
          >
            {isConfirmed ? '🔄 이달 인사고과 확정 완료 (클릭 시 확정 취소)' : '✅ 이달 인사고과 확정'}
          </button>
        </section>
      </div>
    </aside>
  );
}

const styles = {
  sidebar: {
    width: '360px',
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    minHeight: 0,
    backgroundColor: '#ffffff',
    borderRadius: '10px',
    border: '1px solid #e2e8f0',
    overflow: 'hidden',
  },
  scrollBody: {
    flex: 1,
    overflowY: 'auto',
    padding: '12px 14px',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    boxSizing: 'border-box',
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: '10px',
    border: '1px solid #e2e8f0',
    padding: '10px 12px',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
  },
  sectionTitleRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    fontSize: '12px',
    fontWeight: 700,
    color: '#0f172a',
  },
  confirmedTime: {
    fontSize: '10px',
    color: '#16a34a',
    fontWeight: 700,
  },
  commentTextarea: {
    width: '100%',
    padding: '7px 9px',
    borderRadius: '6px',
    border: '1px solid #cbd5e1',
    fontSize: '11.5px',
    color: '#0f172a',
    lineHeight: 1.45,
    resize: 'none',
    boxSizing: 'border-box',
    outline: 'none',
    fontFamily: 'inherit',
  },
  confirmBtn: {
    width: '100%',
    padding: '7px 12px',
    borderRadius: '6px',
    border: 'none',
    color: '#ffffff',
    fontSize: '12px',
    fontWeight: 700,
    cursor: 'pointer',
    textAlign: 'center',
    transition: 'all 0.15s ease',
  },
};

