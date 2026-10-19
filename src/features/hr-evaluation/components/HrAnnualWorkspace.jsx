import React from 'react';
import { HrAnnualSummaryCards } from './annual/HrAnnualSummaryCards';
import { HrAnnualMonthlyTable } from './annual/HrAnnualMonthlyTable';
import { HrAnnualEvaluationSection } from './annual/HrAnnualEvaluationSection';

/**
 * 📊 연간 종합 고과 (연봉협상 자료) 메인 워크스페이스
 */
export function HrAnnualWorkspace({
  year,
  month,
  annualSummary,
  onSelectMonth,
  onUpdateAnnualComment,
  onUpdateSalaryRecommendation,
  onToggleConfirmAnnual,
  onViewApology,
}) {
  if (!annualSummary) {
    return (
      <div style={styles.emptyContainer}>
        <span>연간 데이터를 집계하는 중입니다...</span>
      </div>
    );
  }

  const {
    workerName,
    siteName,
    position,
    isAnnualConfirmed,
    annualRewardPenaltyTimeline = [],
    annualRewardCount = 0,
    annualPenaltyCount = 0,
    monthlySummaries = [],
    salaryRecommendation,
    annualComment,
    annualConfirmedAt,
  } = annualSummary;

  return (
    <div style={styles.container}>
      {/* 0. 상단 헤더 타이틀 바 */}
      <div style={styles.headerBlock}>
        <div style={styles.titleRow}>
          <div style={styles.titleLeft}>
            <span style={styles.titleBadge}>📊 {year}년 연간 종합 고과</span>
            <h2 style={styles.mainTitle}>
              {siteName} · {workerName} ({position}) 연봉협상용 종합 고과표
            </h2>
          </div>
          <div style={styles.titleRight}>
            <span
              style={{
                ...styles.confirmedStatusBadge,
                backgroundColor: isAnnualConfirmed ? '#dcfce7' : '#fef3c7',
                color: isAnnualConfirmed ? '#15803d' : '#b45309',
                borderColor: isAnnualConfirmed ? '#86efac' : '#fcd34d',
              }}
            >
              {isAnnualConfirmed ? '✅ 연간 고과 최종확정 완료' : '📝 연간 고과 작성중 (미확정)'}
            </span>
          </div>
        </div>
        <p style={styles.subDesc}>
          1월부터 12월까지의 월별 근태·정량 고과 실적과 상벌점 이력을 한눈에 비교하고, 연말/연초 연봉협상 및 인사평가에 필요한 최종 의견을 확정합니다.
        </p>
      </div>

      {/* 1. 상단 연간 핵심 요약 카드 (4열 그리드) */}
      <HrAnnualSummaryCards annualSummary={annualSummary} />

      {/* 2. 1월 ~ 12월 월별 고과 성적 및 상벌 한눈에 보기 테이블 */}
      <HrAnnualMonthlyTable
        year={year}
        currentMonth={month}
        monthlySummaries={monthlySummaries}
        onSelectMonth={onSelectMonth}
      />

      {/* 3. 하단 2단 구성: 연간 상벌 타임라인 (좌) + 연봉협상 종합의견서 (우) */}
      <HrAnnualEvaluationSection
        annualRewardPenaltyTimeline={annualRewardPenaltyTimeline}
        annualRewardCount={annualRewardCount}
        annualPenaltyCount={annualPenaltyCount}
        salaryRecommendation={salaryRecommendation}
        onUpdateSalaryRecommendation={onUpdateSalaryRecommendation}
        annualComment={annualComment}
        onUpdateAnnualComment={onUpdateAnnualComment}
        isAnnualConfirmed={isAnnualConfirmed}
        annualConfirmedAt={annualConfirmedAt}
        onToggleConfirmAnnual={onToggleConfirmAnnual}
        onViewApology={onViewApology}
      />
    </div>
  );
}

const styles = {
  container: {
    width: '100%',
    height: '100%',
    minWidth: 0,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    overflowY: 'auto',
    paddingRight: '4px',
    boxSizing: 'border-box',
  },
  emptyContainer: {
    padding: '40px',
    textAlign: 'center',
    color: '#64748b',
    fontSize: '14px',
  },
  headerBlock: {
    backgroundColor: '#ffffff',
    borderRadius: '10px',
    border: '1px solid #e2e8f0',
    padding: '10px 14px',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    flexShrink: 0,
  },
  titleRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
  },
  titleLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flexWrap: 'wrap',
  },
  titleBadge: {
    backgroundColor: '#eff6ff',
    color: '#1d4ed8',
    padding: '2px 8px',
    borderRadius: '6px',
    fontSize: '11px',
    fontWeight: 800,
    border: '1px solid #bfdbfe',
  },
  mainTitle: {
    margin: 0,
    fontSize: '15px',
    fontWeight: 800,
    color: '#0f172a',
  },
  titleRight: {
    display: 'flex',
    alignItems: 'center',
  },
  confirmedStatusBadge: {
    fontSize: '11px',
    fontWeight: 800,
    padding: '3px 10px',
    borderRadius: '999px',
    border: '1px solid',
  },
  subDesc: {
    margin: 0,
    fontSize: '11.5px',
    color: '#64748b',
    lineHeight: 1.4,
  },
};
