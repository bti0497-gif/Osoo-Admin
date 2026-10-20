import React from 'react';

/**
 * 우측 사이드바 1. 종합 인사고과 점수 카드
 */
export function HrSidebarScoreCard({
  year,
  month,
  finalPercentage = 100,
  gradeInfo,
  rank = 1,
  totalWorkers = 1,
  isConfirmed,
  finalAttendancePenalty = 0,
  netRewardPenalty = 0,
}) {
  const safeGrade = gradeInfo || {
    grade: 'S',
    label: 'S등급 · 최우수',
    color: '#6d28d9',
    bg: '#ede9fe',
    border: '#c4b5fd',
  };

  const safeTotalWorkers = Math.max(Number(rank) || 1, Number(totalWorkers) || 1);
  const safeRank = Math.min(Number(rank) || 1, safeTotalWorkers);

  return (
    <section
      style={{
        ...styles.scoreCard,
        borderColor: safeGrade.border,
        background: `linear-gradient(145deg, #ffffff 0%, ${safeGrade.bg}66 100%)`,
      }}
    >
      <div style={styles.scoreHeaderLine}>
        <span style={styles.scoreCaption}>
          {year}년 {month}월 종합 인사고과 점수
        </span>
        <span
          style={{
            ...styles.confirmStatusBadge,
            backgroundColor: isConfirmed ? '#dcfce7' : '#fef3c7',
            color: isConfirmed ? '#15803d' : '#b45309',
            border: `1px solid ${isConfirmed ? '#86efac' : '#fcd34d'}`,
          }}
        >
          {isConfirmed ? '✅ 고과확정' : '📝 평가중'}
        </span>
      </div>

      <div style={styles.scoreTopRow}>
        <div style={{ ...styles.bigPercentage, color: safeGrade.color }}>
          {finalPercentage.toFixed(1)}
          <span style={styles.percentSymbol}>%</span>
        </div>
        <div style={styles.badgesCol}>
          <span
            style={{
              ...styles.gradePill,
              backgroundColor: safeGrade.color,
              color: '#ffffff',
            }}
          >
            {safeGrade.label}
          </span>
          <span style={styles.rankBadge}>
            🏆 전체 {safeTotalWorkers}개 현장 중 <strong>{safeRank}위</strong>
          </span>
        </div>
      </div>

      {/* 프로그레스 바 */}
      <div style={styles.progressTrack}>
        <div
          style={{
            ...styles.progressFill,
            width: `${Math.min(100, Math.max(0, finalPercentage))}%`,
            backgroundColor: safeGrade.color,
          }}
        />
      </div>

      {/* 점수 구성 공식 요약 */}
      <div style={styles.formulaBox}>
        <div style={styles.formulaItem}>
          <span style={styles.formulaLabel}>기본점수</span>
          <strong style={styles.formulaVal}>100</strong>
        </div>
        <span style={styles.formulaOp}>+</span>
        <div style={styles.formulaItem}>
          <span style={styles.formulaLabel}>근태벌점(확정)</span>
          <strong
            style={{
              ...styles.formulaVal,
              color: finalAttendancePenalty < 0 ? '#dc2626' : '#16a34a',
            }}
          >
            {finalAttendancePenalty}
          </strong>
        </div>
        <span style={styles.formulaOp}>+</span>
        <div style={styles.formulaItem}>
          <span style={styles.formulaLabel}>관리자 상벌점</span>
          <strong
            style={{
              ...styles.formulaVal,
              color:
                netRewardPenalty > 0
                  ? '#2563eb'
                  : netRewardPenalty < 0
                    ? '#dc2626'
                    : '#475569',
            }}
          >
            {netRewardPenalty > 0 ? `+${netRewardPenalty}` : netRewardPenalty}
          </strong>
        </div>
        <span style={styles.formulaOp}>=</span>
        <div style={styles.formulaItem}>
          <span style={styles.formulaLabel}>최종 백분율</span>
          <strong style={{ ...styles.formulaVal, color: gradeInfo.color }}>
            {finalPercentage.toFixed(1)}%
          </strong>
        </div>
      </div>
    </section>
  );
}

const styles = {
  scoreCard: {
    borderRadius: '10px',
    border: '1.5px solid',
    padding: '12px 14px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    boxShadow: '0 2px 6px rgba(0,0,0,0.04)',
    boxSizing: 'border-box',
  },
  scoreHeaderLine: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  scoreCaption: {
    fontSize: '11.5px',
    fontWeight: 700,
    color: '#334155',
  },
  confirmStatusBadge: {
    fontSize: '10px',
    fontWeight: 800,
    padding: '2px 6px',
    borderRadius: '999px',
  },
  scoreTopRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '8px',
  },
  bigPercentage: {
    fontSize: '30px',
    fontWeight: 900,
    letterSpacing: '-1px',
    lineHeight: 1,
  },
  percentSymbol: {
    fontSize: '16px',
    fontWeight: 700,
    marginLeft: '2px',
  },
  badgesCol: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: '4px',
  },
  gradePill: {
    fontSize: '11px',
    fontWeight: 800,
    padding: '3px 8px',
    borderRadius: '999px',
  },
  rankBadge: {
    fontSize: '10.5px',
    color: '#475569',
  },
  progressTrack: {
    height: '6px',
    backgroundColor: '#e2e8f0',
    borderRadius: '999px',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: '999px',
    transition: 'width 0.25s ease',
  },
  formulaBox: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#ffffff',
    borderRadius: '6px',
    padding: '5px 8px',
    border: '1px solid #e2e8f0',
    marginTop: '2px',
  },
  formulaItem: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  formulaLabel: {
    fontSize: '9.5px',
    color: '#64748b',
  },
  formulaVal: {
    fontSize: '11px',
    fontWeight: 800,
    color: '#0f172a',
  },
  formulaOp: {
    fontSize: '11px',
    color: '#94a3b8',
    fontWeight: 700,
  },
};
