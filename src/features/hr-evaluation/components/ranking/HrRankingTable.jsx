import React from 'react';

function renderRankBadge(rank) {
  if (rank === 1) {
    return (
      <span style={{ ...styles.rankPill, backgroundColor: '#fef3c7', color: '#b45309', border: '1px solid #fcd34d' }}>
        🥇 1위
      </span>
    );
  }
  if (rank === 2) {
    return (
      <span style={{ ...styles.rankPill, backgroundColor: '#f1f5f9', color: '#334155', border: '1px solid #cbd5e1' }}>
        🥈 2위
      </span>
    );
  }
  if (rank === 3) {
    return (
      <span style={{ ...styles.rankPill, backgroundColor: '#ffedd5', color: '#c2410c', border: '1px solid #fdba74' }}>
        🥉 3위
      </span>
    );
  }
  return <span style={styles.rankNormal}>{rank}위</span>;
}

/**
 * 전국 현장 순위 테이블 (월간 / 연간 겸용)
 */
export function HrRankingTable({
  isAnnual,
  activeList = [],
  selectedWorkerId,
  onSelectWorker,
  onSwitchViewMode,
}) {
  return (
    <div style={styles.tableScrollArea}>
      <table style={styles.table}>
        <colgroup>
          <col style={{ width: '6%' }} />
          <col style={{ width: '17%' }} />
          <col style={{ width: '11%' }} />
          <col style={{ width: '6%' }} />
          <col style={{ width: '7%' }} />
          <col style={{ width: '8%' }} />
          <col style={{ width: '8%' }} />
          <col style={{ width: '7%' }} />
          <col style={{ width: '11%' }} />
          <col style={{ width: '6%' }} />
          <col style={{ width: '5%' }} />
          <col style={{ width: '8%' }} />
        </colgroup>
        <thead style={styles.thead}>
          <tr>
            <th style={styles.th}>순위</th>
            <th style={{ ...styles.th, textAlign: 'left', paddingLeft: '10px' }}>현장명</th>
            <th style={styles.th}>근무자</th>
            <th style={styles.th}>{isAnnual ? '연간실근무' : '실근무'}</th>
            <th style={styles.th}>{isAnnual ? '연간휴가' : '휴가'}</th>
            <th style={styles.th}>지각/미체크</th>
            <th style={styles.th}>근태벌점</th>
            <th style={styles.th}>상벌점</th>
            <th style={styles.th}>{isAnnual ? '연간평균(%)' : '최종점수(%)'}</th>
            <th style={styles.th}>등급</th>
            <th style={styles.th}>상태</th>
            <th style={styles.th}>상세이동</th>
          </tr>
        </thead>
        <tbody>
          {activeList.map((item) => {
            const isSelected = item.workerId === selectedWorkerId;
            const rankVal = isAnnual ? item.annualRank : item.rank;
            const gInfo = isAnnual ? item.annualGradeInfo : item.gradeInfo;
            const safeGInfo = gInfo || {
              grade: isAnnual ? item.annualGrade || 'S' : item.grade || 'S',
              color: '#15803d',
              bg: '#dcfce7',
              border: '#86efac',
            };
            const scoreVal = isAnnual ? item.annualAvgScore : item.finalPercentage;
            const workDaysVal = isAnnual ? item.annualWorkDays : item.workDays;
            const leaveDaysVal = isAnnual ? item.annualTotalLeaveDays : item.totalLeaveDays;
            const abnormalTotal = isAnnual
              ? item.annualAttendanceIssuesCount || 0
              : (item.lateCount || 0) + (item.earlyLeaveCount || 0) + (item.autoLogoutCount || 0);
            const abnormalTooltip = isAnnual
              ? `연간 지각 ${item.annualLateCount || 0}건 · 조퇴 ${item.annualEarlyLeaveCount || 0}건 · 자동퇴근 ${item.annualAutoLogoutCount || 0}건 (총 ${abnormalTotal}건)`
              : `지각 ${item.lateCount || 0}건 · 조퇴 ${item.earlyLeaveCount || 0}건 · 자동퇴근 ${item.autoLogoutCount || 0}건 (총 ${abnormalTotal}건)`;
            const attPenaltyVal = isAnnual ? item.annualFinalAttendancePenalty : item.finalAttendancePenalty;
            const excusedVal = isAnnual ? item.annualExcusedPenaltyTotal : item.excusedPenaltyTotal;
            const netRewardVal = isAnnual ? item.annualNetRewardPenalty : item.netRewardPenalty;
            const isConfirmedVal = isAnnual ? item.isAnnualConfirmed : item.isConfirmed;

            return (
              <tr
                key={item.workerId}
                onClick={() => onSelectWorker(item.workerId)}
                style={{
                  ...styles.tr,
                  backgroundColor: isSelected ? '#dbeafe' : '#ffffff',
                  fontWeight: isSelected ? 600 : 400,
                }}
              >
                {/* 순위 */}
                <td style={{ ...styles.td, textAlign: 'center' }}>
                  {renderRankBadge(rankVal)}
                </td>

                {/* 현장명 */}
                <td
                  style={{ ...styles.td, fontWeight: 700, color: '#0f172a', paddingLeft: '10px' }}
                  title={item.siteName}
                >
                  {item.siteName}
                </td>

                {/* 근무자명 */}
                <td style={{ ...styles.td, textAlign: 'center' }}>
                  <span style={{ fontWeight: 700, color: '#1e293b' }}>{item.workerName}</span>{' '}
                  <span style={{ fontSize: '10.5px', color: '#64748b' }}>
                    ({item.position === '현장소장' ? '소장' : '관리'})
                  </span>
                </td>

                {/* 실근무 */}
                <td style={{ ...styles.td, textAlign: 'center', fontWeight: 600 }}>
                  {workDaysVal}일
                </td>

                {/* 휴가 */}
                <td style={{ ...styles.td, textAlign: 'center' }}>
                  {leaveDaysVal > 0 ? (
                    <span style={styles.leavePill}>{leaveDaysVal}일</span>
                  ) : (
                    <span style={{ color: '#94a3b8' }}>-</span>
                  )}
                </td>

                {/* 지각/조퇴/자동 */}
                <td
                  style={{ ...styles.td, textAlign: 'center' }}
                  title={abnormalTotal > 0 ? abnormalTooltip : '정시 출퇴근 (지각/조퇴/자동 없음)'}
                >
                  {abnormalTotal > 0 ? (
                    <span style={{ color: '#ea580c', fontWeight: 700, fontSize: '12px' }}>
                      {abnormalTotal}건
                    </span>
                  ) : (
                    <span style={{ color: '#16a34a', fontWeight: 600, fontSize: '12px' }}>
                      정시
                    </span>
                  )}
                </td>

                {/* 근태벌점 */}
                <td style={{ ...styles.td, textAlign: 'center' }}>
                  <span
                    style={{
                      fontWeight: 700,
                      color: attPenaltyVal < 0 ? '#dc2626' : '#16a34a',
                    }}
                  >
                    {attPenaltyVal}점
                  </span>
                  {excusedVal > 0 && (
                    <span style={{ fontSize: '10px', color: '#2563eb', marginLeft: '2px' }}>
                      (+{excusedVal})
                    </span>
                  )}
                </td>

                {/* 관리자 상벌점 */}
                <td style={{ ...styles.td, textAlign: 'center' }}>
                  <span
                    style={{
                      fontWeight: 700,
                      color:
                        netRewardVal > 0
                          ? '#2563eb'
                          : netRewardVal < 0
                            ? '#dc2626'
                            : '#64748b',
                    }}
                  >
                    {netRewardVal > 0 ? `+${netRewardVal}` : netRewardVal}점
                  </span>
                </td>

                {/* 최종 점수 & 바 */}
                <td style={styles.td}>
                  <div style={styles.scoreCellWrap}>
                    <span style={{ ...styles.scoreNumber, color: safeGInfo.color }}>
                      {Number(scoreVal || 0).toFixed(1)}%
                    </span>
                    <div style={styles.progressTrack}>
                      <div
                        style={{
                          ...styles.progressFill,
                          width: `${Math.min(100, Math.max(0, scoreVal || 0))}%`,
                          backgroundColor: safeGInfo.color,
                        }}
                      />
                    </div>
                  </div>
                </td>

                {/* 등급 */}
                <td style={{ ...styles.td, textAlign: 'center' }}>
                  <span
                    style={{
                      ...styles.gradeBadge,
                      backgroundColor: safeGInfo.bg,
                      color: safeGInfo.color,
                      border: `1px solid ${safeGInfo.border}`,
                    }}
                  >
                    {safeGInfo.grade}등급
                  </span>
                </td>

                {/* 상태 */}
                <td style={{ ...styles.td, textAlign: 'center' }}>
                  {isConfirmedVal ? (
                    <span style={styles.confirmedBadge}>확정</span>
                  ) : (
                    <span style={styles.unconfirmedBadge}>작성중</span>
                  )}
                </td>

                {/* 상세이동 버튼 */}
                <td style={{ ...styles.td, textAlign: 'center' }}>
                  <div style={styles.jumpBtnGroup}>
                    {isAnnual ? (
                      <>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectWorker(item.workerId);
                            onSwitchViewMode('annual');
                          }}
                          title="연간 종합 고과 화면으로 이동"
                          style={{ ...styles.jumpBtn, backgroundColor: '#eff6ff', color: '#1d4ed8' }}
                        >
                          연간고과
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectWorker(item.workerId);
                            onSwitchViewMode('calendar');
                          }}
                          title="달력 보기로 이동"
                          style={styles.jumpBtn}
                        >
                          달력
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectWorker(item.workerId);
                            onSwitchViewMode('calendar');
                          }}
                          title="달력 보기로 이동"
                          style={styles.jumpBtn}
                        >
                          달력
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectWorker(item.workerId);
                            onSwitchViewMode('list');
                          }}
                          title="목록 보기로 이동"
                          style={styles.jumpBtn}
                        >
                          목록
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}

          {activeList.length === 0 && (
            <tr>
              <td colSpan={12} style={styles.emptyCell}>
                검색 조건에 해당하는 현장 근무자가 없습니다.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

const styles = {
  tableScrollArea: {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
    overflowX: 'hidden',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '12px',
    tableLayout: 'fixed',
  },
  thead: {
    position: 'sticky',
    top: 0,
    zIndex: 2,
  },
  th: {
    backgroundColor: '#0f172a',
    color: '#ffffff',
    fontWeight: 600,
    padding: '8px 4px',
    textAlign: 'center',
    borderBottom: '2px solid #1e293b',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    boxSizing: 'border-box',
    fontSize: '11.5px',
  },
  tr: {
    borderBottom: '1px solid #e2e8f0',
    cursor: 'pointer',
    transition: 'background-color 0.12s ease',
  },
  td: {
    padding: '8px 4px',
    verticalAlign: 'middle',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    boxSizing: 'border-box',
  },
  rankPill: {
    display: 'inline-block',
    padding: '2px 6px',
    borderRadius: '10px',
    fontSize: '11px',
    fontWeight: 800,
  },
  rankNormal: {
    fontWeight: 700,
    color: '#475569',
    fontSize: '11.5px',
  },
  leavePill: {
    display: 'inline-block',
    padding: '1px 6px',
    borderRadius: '8px',
    backgroundColor: '#dbeafe',
    color: '#1d4ed8',
    fontSize: '11px',
    fontWeight: 700,
  },
  scoreCellWrap: {
    display: 'flex',
    alignItems: 'center',
    gap: '5px',
    padding: '0 4px',
  },
  scoreNumber: {
    fontWeight: 800,
    fontSize: '12px',
    minWidth: '40px',
    textAlign: 'right',
  },
  progressTrack: {
    flex: 1,
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
  gradeBadge: {
    display: 'inline-block',
    padding: '2px 6px',
    borderRadius: '6px',
    fontSize: '11px',
    fontWeight: 800,
  },
  confirmedBadge: {
    display: 'inline-block',
    padding: '2px 5px',
    borderRadius: '5px',
    backgroundColor: '#dcfce7',
    color: '#15803d',
    fontSize: '10.5px',
    fontWeight: 700,
  },
  unconfirmedBadge: {
    display: 'inline-block',
    padding: '2px 5px',
    borderRadius: '5px',
    backgroundColor: '#f1f5f9',
    color: '#64748b',
    fontSize: '10.5px',
    fontWeight: 600,
  },
  jumpBtnGroup: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '3px',
  },
  jumpBtn: {
    padding: '3px 5px',
    borderRadius: '4px',
    border: '1px solid #cbd5e1',
    backgroundColor: '#ffffff',
    color: '#1e293b',
    fontSize: '10.5px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  emptyCell: {
    padding: '40px',
    textAlign: 'center',
    color: '#94a3b8',
    fontSize: '13px',
  },
};
