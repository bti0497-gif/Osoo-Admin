import React from 'react';

/**
 * 1월 ~ 12월 월별 고과 성적 및 상벌 한눈에 보기 테이블 컴포넌트
 */
export function HrAnnualMonthlyTable({ year, currentMonth, monthlySummaries, onSelectMonth }) {
  return (
    <div style={styles.tableSection}>
      <div style={styles.sectionHeader}>
        <div style={styles.sectionTitleRow}>
          <span style={styles.sectionIcon}>📅</span>
          <span style={styles.sectionTitle}>
            {year}년 1월 ~ 12월 월별 고과 성적 및 상벌 내역 한눈에 보기
          </span>
          <span style={styles.sectionNotice}>
            (행 또는 [상세보기] 클릭 시 해당 월 달력 화면으로 즉시 이동)
          </span>
        </div>
      </div>

      <div style={styles.tableScrollWrap}>
        <table style={styles.table}>
          <colgroup>
            <col style={{ width: '7%' }} />
            <col style={{ width: '7%' }} />
            <col style={{ width: '7%' }} />
            <col style={{ width: '12%' }} />
            <col style={{ width: '9%' }} />
            <col style={{ width: '8%' }} />
            <col style={{ width: '8%' }} />
            <col style={{ width: '20%' }} />
            <col style={{ width: '8%' }} />
            <col style={{ width: '7%' }} />
            <col style={{ width: '7%' }} />
          </colgroup>
          <thead>
            <tr style={styles.theadRow}>
              <th style={styles.th}>월별</th>
              <th style={styles.th}>실근무</th>
              <th style={styles.th}>정기휴무</th>
              <th style={styles.th}>휴가사용</th>
              <th style={styles.th}>지각/조퇴/자동</th>
              <th style={styles.th}>근태벌점</th>
              <th style={styles.th}>상벌점</th>
              <th style={styles.th}>월 최종 고과점수(%)</th>
              <th style={styles.th}>월 등급</th>
              <th style={styles.th}>상태</th>
              <th style={styles.th}>상세보기</th>
            </tr>
          </thead>
          <tbody>
            {monthlySummaries.map((mItem) => {
              const isCurrentEditing = mItem.month === currentMonth;
              const g = mItem.gradeInfo;
              const hasRewards = (mItem.rewardPenaltyList || []).length > 0;
              const rewardSummary = (mItem.rewardPenaltyList || [])
                .map((rp) => `${rp.title}(${rp.points >= 0 ? '+' : ''}${rp.points})`)
                .join(', ');

              return (
                <tr
                  key={mItem.month}
                  onClick={() => onSelectMonth(mItem.month, 'calendar')}
                  style={{
                    ...styles.tr,
                    backgroundColor: isCurrentEditing ? '#eff6ff' : '#ffffff',
                    boxShadow: isCurrentEditing ? 'inset 3px 0 0 #2563eb' : 'none',
                  }}
                >
                  {/* 월 구분 */}
                  <td style={{ ...styles.td, textAlign: 'center' }}>
                    <span
                      style={{
                        ...styles.monthBadge,
                        backgroundColor: isCurrentEditing ? '#2563eb' : '#f1f5f9',
                        color: isCurrentEditing ? '#ffffff' : '#0f172a',
                      }}
                    >
                      {mItem.month}월
                    </span>
                  </td>

                  {/* 실근무일 */}
                  <td style={{ ...styles.td, textAlign: 'center', fontWeight: 600 }}>
                    {mItem.workDays}일
                  </td>

                  {/* 정기휴무일 */}
                  <td style={{ ...styles.td, textAlign: 'center', color: '#64748b' }}>
                    {mItem.regularOffDays}일
                  </td>

                  {/* 휴가사용 */}
                  <td style={{ ...styles.td, textAlign: 'center' }}>
                    {mItem.totalLeaveDays > 0 ? (
                      <div style={styles.leaveCellWrap}>
                        <span style={styles.leavePill}>{mItem.totalLeaveDays}일</span>
                        {mItem.leaveBreakdown?.annual_leave > 0 && (
                          <span style={styles.miniTag}>연차{mItem.leaveBreakdown.annual_leave}</span>
                        )}
                        {mItem.leaveBreakdown?.monthly_leave > 0 && (
                          <span style={styles.miniTag}>월차{mItem.leaveBreakdown.monthly_leave}</span>
                        )}
                        {mItem.leaveBreakdown?.sub_leave > 0 && (
                          <span style={styles.miniTag}>대체휴무{mItem.leaveBreakdown.sub_leave}</span>
                        )}
                      </div>
                    ) : (
                      <span style={{ color: '#cbd5e1' }}>-</span>
                    )}
                  </td>

                  {/* 지각/조퇴/자동 */}
                  {(() => {
                    const mAbnormalTotal =
                      (mItem.lateCount || 0) +
                      (mItem.earlyLeaveCount || 0) +
                      (mItem.autoLogoutCount || 0);
                    const mAbnormalTooltip = `지각 ${mItem.lateCount || 0}건 · 조퇴 ${mItem.earlyLeaveCount || 0}건 · 자동퇴근 ${mItem.autoLogoutCount || 0}건`;
                    return (
                      <td
                        style={{ ...styles.td, textAlign: 'center' }}
                        title={mAbnormalTotal > 0 ? mAbnormalTooltip : '정시 출퇴근 (지각/조퇴/자동 없음)'}
                      >
                        {mAbnormalTotal > 0 ? (
                          <span style={{ color: '#ea580c', fontWeight: 700, fontSize: '12px' }}>
                            {mAbnormalTotal}건
                          </span>
                        ) : (
                          <span style={{ color: '#16a34a', fontWeight: 600, fontSize: '12px' }}>
                            정시
                          </span>
                        )}
                      </td>
                    );
                  })()}

                  {/* 근태벌점 */}
                  <td style={{ ...styles.td, textAlign: 'center' }}>
                    <span
                      style={{
                        fontWeight: 700,
                        color: mItem.finalAttendancePenalty < 0 ? '#dc2626' : '#16a34a',
                      }}
                    >
                      {mItem.finalAttendancePenalty}점
                    </span>
                    {mItem.excusedPenaltyTotal > 0 && (
                      <span style={styles.excusedSmall} title="사유 참작 면제">
                        (+{mItem.excusedPenaltyTotal})
                      </span>
                    )}
                  </td>

                  {/* 관리자 상벌점 */}
                  <td style={{ ...styles.td, textAlign: 'center' }} title={rewardSummary || '내역 없음'}>
                    {hasRewards ? (
                      <span
                        style={{
                          ...styles.rewardPill,
                          backgroundColor:
                            mItem.netRewardPenalty > 0
                              ? '#dbeafe'
                              : mItem.netRewardPenalty < 0
                                ? '#fee2e2'
                                : '#f1f5f9',
                          color:
                            mItem.netRewardPenalty > 0
                              ? '#1d4ed8'
                              : mItem.netRewardPenalty < 0
                                ? '#b91c1c'
                                : '#475569',
                        }}
                      >
                        {mItem.netRewardPenalty >= 0 ? `+${mItem.netRewardPenalty}` : mItem.netRewardPenalty}점
                      </span>
                    ) : (
                      <span style={{ color: '#cbd5e1' }}>0점</span>
                    )}
                  </td>

                  {/* 월 최종 고과점수 & 그래프 바 */}
                  <td style={styles.td}>
                    <div style={styles.scoreBarWrap}>
                      <span style={{ ...styles.scoreText, color: g.color }}>
                        {mItem.finalPercentage.toFixed(1)}%
                      </span>
                      <div style={styles.barTrack}>
                        <div
                          style={{
                            ...styles.barFill,
                            width: `${Math.min(100, Math.max(0, mItem.finalPercentage))}%`,
                            backgroundColor: g.color,
                          }}
                        />
                      </div>
                    </div>
                  </td>

                  {/* 월 등급 */}
                  <td style={{ ...styles.td, textAlign: 'center' }}>
                    <span
                      style={{
                        ...styles.gradeMiniBadge,
                        backgroundColor: g.bg,
                        color: g.color,
                        borderColor: g.border,
                      }}
                    >
                      {g.grade}등급
                    </span>
                  </td>

                  {/* 확정 상태 */}
                  <td style={{ ...styles.td, textAlign: 'center' }}>
                    {mItem.isConfirmed ? (
                      <span style={styles.confirmedPill}>확정</span>
                    ) : (
                      <span style={styles.unconfirmedPill}>작성중</span>
                    )}
                  </td>

                  {/* 상세보기 버튼 */}
                  <td style={{ ...styles.td, textAlign: 'center' }}>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectMonth(mItem.month, 'calendar');
                      }}
                      style={styles.detailBtn}
                      title={`${mItem.month}월 달력/상세 화면으로 이동`}
                    >
                      상세보기 →
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const styles = {
  tableSection: {
    backgroundColor: '#ffffff',
    borderRadius: '10px',
    border: '1px solid #e2e8f0',
    padding: '10px 12px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    flexShrink: 0,
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    flexWrap: 'wrap',
  },
  sectionIcon: {
    fontSize: '15px',
  },
  sectionTitle: {
    fontSize: '13px',
    fontWeight: 800,
    color: '#0f172a',
  },
  sectionNotice: {
    fontSize: '11px',
    color: '#64748b',
  },
  tableScrollWrap: {
    width: '100%',
    overflowX: 'auto',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    tableLayout: 'fixed',
    fontSize: '11.5px',
  },
  theadRow: {
    backgroundColor: '#f8fafc',
    borderBottom: '1.5px solid #cbd5e1',
  },
  th: {
    padding: '7px 4px',
    color: '#475569',
    fontWeight: 700,
    textAlign: 'center',
    fontSize: '11px',
    whiteSpace: 'nowrap',
  },
  tr: {
    borderBottom: '1px solid #f1f5f9',
    cursor: 'pointer',
    transition: 'background-color 0.12s ease',
  },
  td: {
    padding: '6px 4px',
    color: '#1e293b',
    verticalAlign: 'middle',
  },
  monthBadge: {
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: '5px',
    fontWeight: 800,
    fontSize: '11px',
  },
  leaveCellWrap: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '3px',
    flexWrap: 'wrap',
  },
  leavePill: {
    backgroundColor: '#dbeafe',
    color: '#1d4ed8',
    padding: '1px 5px',
    borderRadius: '4px',
    fontWeight: 700,
    fontSize: '10.5px',
  },
  miniTag: {
    backgroundColor: '#f1f5f9',
    color: '#475569',
    padding: '1px 4px',
    borderRadius: '3px',
    fontSize: '9.5px',
  },
  excusedSmall: {
    fontSize: '9.5px',
    color: '#2563eb',
    fontWeight: 700,
    marginLeft: '2px',
  },
  rewardPill: {
    padding: '2px 6px',
    borderRadius: '4px',
    fontWeight: 700,
    fontSize: '10.5px',
    display: 'inline-block',
  },
  scoreBarWrap: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  scoreText: {
    width: '42px',
    textAlign: 'right',
    fontWeight: 800,
    fontSize: '11.5px',
    flexShrink: 0,
  },
  barTrack: {
    flex: 1,
    height: '6px',
    backgroundColor: '#f1f5f9',
    borderRadius: '999px',
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: '999px',
    transition: 'width 0.3s ease',
  },
  gradeMiniBadge: {
    display: 'inline-block',
    padding: '2px 6px',
    borderRadius: '4px',
    fontWeight: 700,
    fontSize: '10.5px',
    border: '1px solid',
  },
  confirmedPill: {
    backgroundColor: '#dcfce7',
    color: '#15803d',
    padding: '2px 6px',
    borderRadius: '4px',
    fontWeight: 700,
    fontSize: '10px',
  },
  unconfirmedPill: {
    backgroundColor: '#f1f5f9',
    color: '#64748b',
    padding: '2px 6px',
    borderRadius: '4px',
    fontWeight: 600,
    fontSize: '10px',
  },
  detailBtn: {
    backgroundColor: '#eff6ff',
    color: '#2563eb',
    border: '1px solid #bfdbfe',
    borderRadius: '4px',
    padding: '3px 7px',
    fontSize: '10.5px',
    fontWeight: 700,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
};
