import React from 'react';

/**
 * 우측 사이드바 2. 정량 근태 요약 카드 (4분할 + 휴가 상세 태그)
 */
export function HrSidebarAttendanceSummary({
  workDays = 0,
  regularOffDays = 0,
  totalLeaveDays = 0,
  lateCount = 0,
  earlyLeaveCount = 0,
  autoLogoutCount = 0,
  excusedPenaltyTotal = 0,
  leaveBreakdown = {},
}) {
  const totalAbnormal = (lateCount || 0) + (earlyLeaveCount || 0) + (autoLogoutCount || 0);
  const abnormalTooltip = `지각 ${lateCount || 0}건 · 조퇴 ${earlyLeaveCount || 0}건 · 자동퇴근 ${autoLogoutCount || 0}건`;

  return (
    <section style={styles.card}>
      <div style={styles.sectionTitleRow}>
        <span style={styles.sectionTitle}>📊 정량 근태 요약</span>
        {excusedPenaltyTotal > 0 && (
          <span style={styles.excusedHint}>사유참작 +{excusedPenaltyTotal}점 반영됨</span>
        )}
      </div>

      <div style={styles.quadGrid}>
        <div style={styles.quadBox}>
          <span style={styles.quadLabel}>실근무일수</span>
          <strong style={{ ...styles.quadValue, color: '#0f172a' }}>{workDays}일</strong>
        </div>
        <div style={styles.quadBox}>
          <span style={styles.quadLabel}>정기휴무일</span>
          <strong style={{ ...styles.quadValue, color: '#475569' }}>{regularOffDays}일</strong>
        </div>
        <div style={styles.quadBox}>
          <span style={styles.quadLabel}>휴가사용일</span>
          <strong style={{ ...styles.quadValue, color: '#1d4ed8' }}>{totalLeaveDays}일</strong>
        </div>
        <div style={styles.quadBox} title={abnormalTooltip}>
          <span style={styles.quadLabel}>지각/조퇴/자동</span>
          <strong
            style={{
              ...styles.quadValue,
              color: totalAbnormal > 0 ? '#ea580c' : '#475569',
            }}
          >
            {totalAbnormal}건
          </strong>
        </div>
      </div>

      {/* 휴가 상세 태그 */}
      <div style={styles.leaveTagsWrap}>
        <span style={styles.leaveTagItem}>월차 {leaveBreakdown?.monthly_leave || 0}</span>
        <span style={styles.leaveTagItem}>연차 {leaveBreakdown?.annual_leave || 0}</span>
        <span style={styles.leaveTagItem}>반차 {leaveBreakdown?.half_leave || 0}</span>
        <span style={styles.leaveTagItem}>경조사 {leaveBreakdown?.family_leave || 0}</span>
        <span style={styles.leaveTagItem}>병가 {leaveBreakdown?.sick_leave || 0}</span>
        <span style={styles.leaveTagItem}>공가 {leaveBreakdown?.official_leave || 0}</span>
        {leaveBreakdown?.absent > 0 && (
          <span style={{ ...styles.leaveTagItem, backgroundColor: '#fee2e2', color: '#b91c1c' }}>
            결근 {leaveBreakdown.absent}
          </span>
        )}
      </div>
    </section>
  );
}

const styles = {
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
  excusedHint: {
    fontSize: '10.5px',
    color: '#2563eb',
    fontWeight: 700,
  },
  quadGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
    gap: '4px',
  },
  quadBox: {
    backgroundColor: '#f8fafc',
    borderRadius: '6px',
    border: '1px solid #f1f5f9',
    padding: '6px 4px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '2px',
  },
  quadLabel: {
    fontSize: '9.5px',
    color: '#64748b',
  },
  quadValue: {
    fontSize: '13px',
    fontWeight: 800,
  },
  leaveTagsWrap: {
    display: 'flex',
    alignItems: 'center',
    gap: '3px',
    flexWrap: 'wrap',
    marginTop: '2px',
  },
  leaveTagItem: {
    backgroundColor: '#f1f5f9',
    color: '#475569',
    fontSize: '9.5px',
    fontWeight: 600,
    padding: '2px 5px',
    borderRadius: '4px',
  },
};
