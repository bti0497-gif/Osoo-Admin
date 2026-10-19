import React from 'react';
import { GRADE_CRITERIA } from '../constants/hrEvaluationConstants';
import { HrRankingTable } from './ranking/HrRankingTable';

/**
 * 🏆 전체 현장 순위 워크스페이스
 * - [📅 당월 순위] / [📊 연간 누적 순위] 전환 토글 지원
 * - 상단 통계 요약, 검색 및 등급별 필터링
 */
export function HrRankingWorkspace({
  year,
  month,
  rankingPeriodMode = 'monthly',
  onChangePeriodMode,
  rankedEvaluations = [],
  annualRankedList = [],
  filteredRankingList = [],
  filteredAnnualRankingList = [],
  selectedWorkerId,
  onSelectWorker,
  onSwitchViewMode,
  rankingSearch,
  onChangeSearch,
  rankingGradeFilter,
  onChangeGradeFilter,
}) {
  const isAnnual = rankingPeriodMode === 'annual';
  const activeDataset = isAnnual ? annualRankedList : rankedEvaluations;
  const activeList = isAnnual ? filteredAnnualRankingList : filteredRankingList;

  // 등급별 인원 카운트
  const gradeCounts = GRADE_CRITERIA.reduce((acc, g) => {
    acc[g.grade] = activeDataset.filter((item) =>
      isAnnual ? item.annualGrade === g.grade : item.grade === g.grade
    ).length;
    return acc;
  }, {});

  const avgScore =
    activeDataset.length > 0
      ? (
          activeDataset.reduce(
            (sum, item) => sum + (isAnnual ? item.annualAvgScore : item.finalPercentage),
            0
          ) / activeDataset.length
        ).toFixed(1)
      : '0.0';

  const confirmedCount = activeDataset.filter((item) =>
    isAnnual ? item.isAnnualConfirmed : item.isConfirmed
  ).length;

  return (
    <div style={styles.container}>
      {/* 1. 상단 컨트롤 및 요약 바 */}
      <div style={styles.topHeader}>
        <div style={styles.summaryRow}>
          {/* 기간 토글: 당월 순위 vs 연간 누적 순위 */}
          <div style={styles.periodToggleWrap}>
            <button
              type="button"
              onClick={() => onChangePeriodMode('monthly')}
              style={{
                ...styles.periodBtn,
                ...(!isAnnual ? styles.periodBtnActive : {}),
              }}
            >
              📅 당월 순위 ({month}월)
            </button>
            <button
              type="button"
              onClick={() => onChangePeriodMode('annual')}
              style={{
                ...styles.periodBtn,
                ...(isAnnual ? styles.periodBtnActive : {}),
              }}
            >
              📊 연간 누적 순위 ({year}년)
            </button>
          </div>

          <div style={styles.titleBlock}>
            <span style={styles.mainTitle}>
              {isAnnual
                ? `🏆 ${year}년 전국 현장관리자 연간 누적 고과 순위표 (연봉협상 기준)`
                : `🏆 ${year}년 ${month}월 전국 현장관리자 당월 인사고과 순위표`}
            </span>
            <span style={styles.subText}>
              전체 <strong>{activeDataset.length}개 현장</strong> · {isAnnual ? '연간 평균 고과' : '평균 고과'}{' '}
              <strong>{avgScore}%</strong> · {isAnnual ? '연간 확정' : '확정 완료'}{' '}
              <strong>
                {confirmedCount}/{activeDataset.length}명
              </strong>
            </span>
          </div>

          {/* 검색창 */}
          <div style={styles.searchWrap}>
            <input
              type="text"
              value={rankingSearch}
              onChange={(e) => onChangeSearch(e.target.value)}
              placeholder="현장명 또는 근무자명 검색..."
              style={styles.searchInput}
            />
            {rankingSearch && (
              <button
                type="button"
                onClick={() => onChangeSearch('')}
                style={styles.clearBtn}
              >
                초기화
              </button>
            )}
          </div>
        </div>

        {/* 등급별 필터 탭 */}
        <div style={styles.gradeTabsRow}>
          <button
            type="button"
            onClick={() => onChangeGradeFilter('ALL')}
            style={{
              ...styles.gradeFilterBtn,
              ...(rankingGradeFilter === 'ALL' ? styles.gradeFilterBtnActive : {}),
            }}
          >
            전체 현장 ({activeDataset.length})
          </button>

          {GRADE_CRITERIA.map((g) => {
            const isActive = rankingGradeFilter === g.grade;
            return (
              <button
                key={g.grade}
                type="button"
                onClick={() => onChangeGradeFilter(g.grade)}
                style={{
                  ...styles.gradeFilterBtn,
                  backgroundColor: isActive ? g.color : g.bg,
                  color: isActive ? '#ffffff' : g.color,
                  borderColor: isActive ? g.color : g.border,
                }}
              >
                {g.grade}등급 · {g.shortLabel} ({gradeCounts[g.grade] || 0})
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. 순위 테이블 영역 */}
      <HrRankingTable
        isAnnual={isAnnual}
        activeList={activeList}
        selectedWorkerId={selectedWorkerId}
        onSelectWorker={onSelectWorker}
        onSwitchViewMode={onSwitchViewMode}
      />
    </div>
  );
}

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    minHeight: 0,
    backgroundColor: '#ffffff',
    borderRadius: '10px',
    border: '1px solid #e2e8f0',
    overflow: 'hidden',
  },
  topHeader: {
    padding: '10px 14px',
    backgroundColor: '#f8fafc',
    borderBottom: '1px solid #e2e8f0',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  summaryRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: '8px',
  },
  periodToggleWrap: {
    display: 'inline-flex',
    backgroundColor: '#e2e8f0',
    padding: '2px',
    borderRadius: '7px',
    gap: '2px',
  },
  periodBtn: {
    padding: '4px 9px',
    borderRadius: '5px',
    border: 'none',
    backgroundColor: 'transparent',
    color: '#475569',
    fontSize: '11.5px',
    fontWeight: 700,
    cursor: 'pointer',
    transition: 'all 0.12s ease',
  },
  periodBtnActive: {
    backgroundColor: '#0f172a',
    color: '#ffffff',
    boxShadow: '0 1px 2px rgba(0,0,0,0.15)',
  },
  titleBlock: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    flexWrap: 'wrap',
  },
  mainTitle: {
    fontSize: '13px',
    fontWeight: 800,
    color: '#0f172a',
  },
  subText: {
    fontSize: '11.5px',
    color: '#475569',
  },
  searchWrap: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  searchInput: {
    padding: '5px 10px',
    borderRadius: '6px',
    border: '1px solid #cbd5e1',
    fontSize: '12px',
    minWidth: '190px',
    outline: 'none',
  },
  clearBtn: {
    padding: '5px 8px',
    borderRadius: '6px',
    border: '1px solid #cbd5e1',
    backgroundColor: '#ffffff',
    fontSize: '11px',
    cursor: 'pointer',
  },
  gradeTabsRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '5px',
    flexWrap: 'wrap',
  },
  gradeFilterBtn: {
    padding: '4px 10px',
    borderRadius: '14px',
    border: '1px solid #cbd5e1',
    backgroundColor: '#ffffff',
    color: '#334155',
    fontSize: '11.5px',
    fontWeight: 700,
    cursor: 'pointer',
  },
  gradeFilterBtnActive: {
    backgroundColor: '#0f172a',
    color: '#ffffff',
    borderColor: '#0f172a',
  },
};
