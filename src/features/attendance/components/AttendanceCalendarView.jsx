import { useEffect } from 'react';
import { useAttendanceCalendar } from '../viewmodels/useAttendanceCalendar.js';

const DAY_LABELS = ['월', '화', '수', '목', '금', '토', '일'];

/**
 * 출결 달력 View
 * - selectedSite !== 'all' && period !== 'daily' 일 때 렌더링
 */
export function AttendanceCalendarView({ selectedDate, selectedSite, period, siteName }) {
  const { calendarDays, rowsByDate, loading, error, fetchData } = useAttendanceCalendar({
    selectedDate,
    selectedSite,
    period,
  });

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const isWeekly = period === 'weekly';
  const [year, month] = selectedDate.split('-').map(Number);

  return (
    <div style={styles.wrapper}>
      {/* 헤더 */}
      <div style={styles.calHeader}>
        <span style={styles.calTitle}>
          {siteName || selectedSite} &nbsp;·&nbsp;
          {isWeekly ? `${selectedDate} 주간` : `${year}년 ${month}월`}
        </span>
        {loading && <span style={styles.loadingText}>조회 중...</span>}
        {error && <span style={styles.errorText}>⚠ {error}</span>}
      </div>

      {/* 요일 헤더 */}
      <div style={{ ...styles.grid, gridTemplateColumns: 'repeat(7, 1fr)' }}>
        {DAY_LABELS.map((d, i) => (
          <div key={d} style={{ ...styles.dayLabel, color: i === 5 ? '#3b82f6' : i === 6 ? '#ef4444' : '#475569' }}>
            {d}
          </div>
        ))}
      </div>

      {/* 날짜 그리드 */}
      {isWeekly ? (
        <div style={{ ...styles.grid, gridTemplateColumns: 'repeat(7, 1fr)', flex: 1 }}>
          {calendarDays.map((dateStr) => (
            <DayCell key={dateStr} dateStr={dateStr} rows={rowsByDate[dateStr] || []} currentMonth={month} period="weekly" />
          ))}
        </div>
      ) : (
        <div style={{ ...styles.grid, gridTemplateColumns: 'repeat(7, 1fr)', flex: 1 }}>
          {calendarDays.map((dateStr) => (
            <DayCell key={dateStr} dateStr={dateStr} rows={rowsByDate[dateStr] || []} currentMonth={month} period="monthly" />
          ))}
        </div>
      )}
    </div>
  );
}

// ── 날짜 셀 ─────────────────────────────────────────────────────

function DayCell({ dateStr, rows, currentMonth, period }) {
  const d = new Date(dateStr + 'T00:00:00');
  const dayNum = d.getDate();
  const dayOfWeek = d.getDay(); // 0=일
  const isOtherMonth = period === 'monthly' && d.getMonth() + 1 !== currentMonth;
  const isToday = dateStr === todayStr();
  const isSat = dayOfWeek === 6;
  const isSun = dayOfWeek === 0;

  const hasPrimary = rows.length > 0;

  // 셀 상태 결정 (첫 번째 행 기준)
  const primary = rows[0];
  const cellState = hasPrimary ? getCellState(primary) : 'rest';

  const borderColor = {
    normal: '#86efac',
    abnormal: '#fb923c',
    remote: '#f87171',
    working: '#60a5fa',
    rest: '#e2e8f0',
  }[cellState];

  const bgColor = {
    normal: '#f0fdf4',
    abnormal: '#fff7ed',
    remote: '#fef2f2',
    working: '#eff6ff',
    rest: isOtherMonth ? '#f8fafc' : '#fff',
  }[cellState];

  return (
    <div style={{
      ...styles.cell,
      border: `2px solid ${borderColor}`,
      background: bgColor,
      opacity: isOtherMonth ? 0.45 : 1,
      outline: isToday ? '2px solid #2563eb' : 'none',
      outlineOffset: '-2px',
    }}>
      {/* 날짜 번호 */}
      <div style={{
        ...styles.cellDay,
        color: isSun ? '#ef4444' : isSat ? '#3b82f6' : '#334155',
        fontWeight: isToday ? 700 : 500,
      }}>
        {dayNum}
        {isToday && <span style={styles.todayDot} />}
      </div>

      {/* 출결 정보 */}
      {hasPrimary ? (
        <div style={styles.cellBody}>
          <div style={styles.timeRow}>
            <span style={styles.timeIn}>{primary.login_time ? primary.login_time.slice(0, 5) : '-'}</span>
            <span style={styles.timeArrow}>→</span>
            <span style={styles.timeOut}>
              {primary.logout_time
                ? primary.logout_time.slice(0, 5)
                : primary.login_time ? <span style={{ color: '#3b82f6' }}>근무중</span> : '-'}
            </span>
          </div>
          <div style={styles.badgeRow}>
            {JudgeBadge(primary)}
            {AccessBadge(primary)}
          </div>
          {rows.length > 1 && (
            <div style={styles.extraRows}>+{rows.length - 1}건</div>
          )}
        </div>
      ) : (
        <div style={styles.restLabel}>휴무</div>
      )}
    </div>
  );
}

// ── 배지 ────────────────────────────────────────────────────────

function JudgeBadge(row) {
  let label, color;
  if (!row.login_time) { label = '미출근'; color = '#94a3b8'; }
  else if (row.auto_logout) { label = '비정상'; color = '#f97316'; }
  else if (row.logout_time) { label = '정상'; color = '#22c55e'; }
  else { label = '근무중'; color = '#3b82f6'; }
  return <span key="j" style={{ ...styles.badge, background: `${color}22`, color }}>{label}</span>;
}

function AccessBadge(row) {
  if (!row.login_time) return null;
  const remoteProgram = (
    row.remote_session_type &&
    row.remote_session_type !== 'local' &&
    row.remote_session_type !== 'none'
  ) ? row.remote_session_type : (row.remote_session_evidence || null);

  const isRemote = Boolean(row.remote_session_detected || remoteProgram);
  const color = isRemote ? '#ef4444' : '#22c55e';
  const label = isRemote ? '원격' : '정상';
  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center' }}>
      <span key="a" style={{ ...styles.badge, background: `${color}22`, color }}>
        {label}
      </span>
      {isRemote && remoteProgram && (
        <span style={{ fontSize: '9px', color: '#ef4444', fontWeight: 600, marginTop: '1px' }}>
          {remoteProgram}
        </span>
      )}
    </div>
  );
}

// ── 셀 상태 ─────────────────────────────────────────────────────

function getCellState(row) {
  if (!row.login_time) return 'rest';
  if (row.remote_session_detected) return 'remote';
  if (row.auto_logout) return 'abnormal';
  if (!row.logout_time) return 'working';
  return 'normal';
}

function todayStr() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

// ── 스타일 ───────────────────────────────────────────────────────

const styles = {
  wrapper: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    gap: '4px',
  },
  calHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '4px',
  },
  calTitle: {
    fontSize: '14px',
    fontWeight: 700,
    color: '#1e293b',
  },
  loadingText: {
    fontSize: '12px',
    color: '#64748b',
  },
  errorText: {
    fontSize: '12px',
    color: '#dc2626',
  },
  grid: {
    display: 'grid',
    gap: '4px',
  },
  dayLabel: {
    textAlign: 'center',
    fontSize: '12px',
    fontWeight: 700,
    padding: '4px 0',
    background: '#f1f5f9',
    borderRadius: '4px',
  },
  cell: {
    borderRadius: '6px',
    padding: '6px 7px',
    minHeight: '80px',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    boxSizing: 'border-box',
  },
  cellDay: {
    fontSize: '13px',
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  },
  todayDot: {
    width: '5px',
    height: '5px',
    borderRadius: '50%',
    background: '#2563eb',
    display: 'inline-block',
  },
  cellBody: {
    display: 'flex',
    flexDirection: 'column',
    gap: '3px',
    flex: 1,
  },
  timeRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '3px',
    fontSize: '11px',
    fontFamily: 'monospace',
    color: '#475569',
  },
  timeIn: { color: '#16a34a', fontWeight: 600 },
  timeArrow: { color: '#94a3b8' },
  timeOut: { color: '#dc2626', fontWeight: 600 },
  badgeRow: {
    display: 'flex',
    gap: '3px',
    flexWrap: 'wrap',
  },
  badge: {
    display: 'inline-block',
    padding: '1px 6px',
    borderRadius: '8px',
    fontSize: '10px',
    fontWeight: 700,
  },
  extraRows: {
    fontSize: '10px',
    color: '#94a3b8',
    textAlign: 'right',
  },
  restLabel: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '11px',
    color: '#cbd5e1',
    fontWeight: 500,
  },
};
