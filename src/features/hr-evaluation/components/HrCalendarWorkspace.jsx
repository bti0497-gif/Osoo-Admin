import React, { useMemo } from 'react';
import { DAY_TYPE_MAP } from '../constants/hrEvaluationConstants';
import { hrCalendarWorkspaceStyles as styles } from './calendar/hrCalendarWorkspaceStyles';
import { HrCalendarDayDetailPanel } from './calendar/HrCalendarDayDetailPanel';

const WEEKDAYS = ['월', '화', '수', '목', '금', '토', '일'];

/**
 * 📅 달력 보기 워크스페이스
 * - 월~일 7열 달력 그리드 (출퇴근 시각, 근무/휴무 배지, 지각/조퇴/자동퇴근 벌점 배지, 기록된 사유 표시)
 * - 하단 선택 일자 상세 근무·사유 기록 패널 (즉시 수정·반영)
 */
export function HrCalendarWorkspace({
  year,
  month,
  workerEvaluation,
  onSelectDate,
  selectedDayRecord,
  onUpdateDayRecord,
}) {
  const dailyList = useMemo(() => workerEvaluation?.dailyList || [], [workerEvaluation]);

  // 월요일 시작 기준 앞뒤 빈 칸 계산
  const calendarCells = useMemo(() => {
    const firstDate = new Date(year, month - 1, 1);
    const firstDow = firstDate.getDay(); // 0(일) ~ 6(토)
    const leadingEmptyCount = firstDow === 0 ? 6 : firstDow - 1;

    const cells = [];
    for (let i = 0; i < leadingEmptyCount; i++) {
      cells.push({ isEmpty: true, key: `empty_start_${i}` });
    }
    for (const rec of dailyList) {
      cells.push({ isEmpty: false, key: rec.date, record: rec });
    }
    const trailingCount = (7 - (cells.length % 7)) % 7;
    for (let i = 0; i < trailingCount; i++) {
      cells.push({ isEmpty: true, key: `empty_end_${i}` });
    }
    return cells;
  }, [year, month, dailyList]);

  const activeDay = selectedDayRecord || dailyList[0] || null;

  return (
    <div style={styles.container}>
      {/* 상단 타이틀 바 */}
      <div style={styles.legendBar}>
        <div style={styles.legendLeft}>
          <span style={styles.legendTitle}>
            📅 {year}년 {month}월 · <strong>{workerEvaluation?.siteName}</strong> ({workerEvaluation?.workerName} {workerEvaluation?.position})
          </span>
          <span style={styles.legendHint}>날짜 셀을 클릭하면 하단 상세 패널에서 근무형태·사유·벌점참작을 즉시 수정할 수 있습니다.</span>
        </div>
      </div>

      {/* 달력 본문 (내부 스크롤) */}
      <div style={styles.calendarScrollArea}>
        {/* 요일 헤더 */}
        <div style={styles.weekdayGrid}>
          {WEEKDAYS.map((w, idx) => (
            <div
              key={w}
              style={{
                ...styles.weekdayCell,
                color: idx === 5 ? '#2563eb' : idx === 6 ? '#dc2626' : '#334155',
              }}
            >
              {w}요일
            </div>
          ))}
        </div>

        {/* 7열 날짜 셀 그리드 */}
        <div style={styles.daysGrid}>
          {calendarCells.map((cell) => {
            if (cell.isEmpty) {
              return <div key={cell.key} style={styles.emptyCell} />;
            }

            const rec = cell.record;
            const isSelected = rec.date === activeDay?.date;
            const dtMeta = DAY_TYPE_MAP[rec.dayType] || DAY_TYPE_MAP.work;
            const isSun = rec.dow === 0;
            const isSat = rec.dow === 6;
            const hasPenalty = rec.autoPenaltyPoints < 0;
            const hasReasons = Boolean(rec.leaveReason || rec.lateReason || rec.earlyLeaveReason);

            return (
              <div
                key={rec.date}
                onClick={() => onSelectDate(rec.date)}
                style={{
                  ...styles.dayCell,
                  backgroundColor: isSelected ? '#eff6ff' : dtMeta.bg,
                  border: isSelected
                    ? '2px solid #2563eb'
                    : rec.isPenaltyExcused
                    ? '1.5px dashed #16a34a'
                    : hasPenalty
                    ? '1.5px solid #f87171'
                    : `1px solid ${dtMeta.border}`,
                }}
              >
                {/* 상단: 일자 + 형태 뱃지 */}
                <div style={styles.cellTopRow}>
                  <span
                    style={{
                      ...styles.dayNumber,
                      color: isSun ? '#dc2626' : isSat ? '#2563eb' : '#0f172a',
                    }}
                  >
                    {rec.day}일
                  </span>
                  <span
                    style={{
                      ...styles.dayTypeBadge,
                      backgroundColor: dtMeta.color,
                      color: '#ffffff',
                    }}
                  >
                    {dtMeta.shortLabel}
                  </span>
                </div>

                {/* 출퇴근 시각 */}
                {rec.dayType === 'work' ? (
                  <div style={{ ...styles.timeRow, whiteSpace: 'nowrap' }}>
                    <span
                      style={{
                        ...styles.timeText,
                        color: rec.lateType ? '#dc2626' : '#334155',
                        fontWeight: rec.lateType ? 700 : 500,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {rec.checkIn}
                    </span>
                    <span style={styles.timeArrow}>→</span>
                    <span
                      style={{
                        ...styles.timeText,
                        color: rec.autoLogout || rec.earlyType ? '#dc2626' : '#334155',
                        fontWeight: rec.autoLogout || rec.earlyType ? 700 : 500,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {(rec.autoLogout ? '20:00' : (rec.checkOut || '-')).replace(/\s*\([^)]*\)/g, '').trim()}
                    </span>
                  </div>
                ) : (
                  <div style={styles.noTimeRow}>{dtMeta.label}</div>
                )}

                {/* 벌점 및 참작 배지 */}
                {hasPenalty && (
                  <div style={styles.penaltyRow}>
                    {rec.penaltyBadges.map((b, i) => {
                      const cleanLabel = (b.label || '').replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ').trim();
                      return (
                        <span
                          key={i}
                          style={{
                            ...styles.penaltyBadge,
                            backgroundColor: rec.isPenaltyExcused ? '#f1f5f9' : b.bg,
                            color: rec.isPenaltyExcused ? '#64748b' : b.color,
                            textDecoration: rec.isPenaltyExcused ? 'line-through' : 'none',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {cleanLabel}
                        </span>
                      );
                    })}
                    {rec.isPenaltyExcused && (
                      <span style={styles.excusedBadge}>참작면제(0점)</span>
                    )}
                  </div>
                )}

                {/* 기록된 사유 요약 */}
                {hasReasons && (
                  <div style={styles.reasonBox}>
                    {rec.leaveReason && (
                      <div style={styles.reasonLine} title={rec.leaveReason}>
                        <strong style={{ color: '#1d4ed8' }}>[휴무]</strong> {rec.leaveReason}
                      </div>
                    )}
                    {rec.lateReason && (
                      <div style={styles.reasonLine} title={rec.lateReason}>
                        <strong style={{ color: '#d97706' }}>[지각]</strong> {rec.lateReason}
                      </div>
                    )}
                    {rec.earlyLeaveReason && (
                      <div style={styles.reasonLine} title={rec.earlyLeaveReason}>
                        <strong style={{ color: '#e11d48' }}>[퇴근]</strong> {rec.earlyLeaveReason}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 하단 고정: 선택 일자 상세 근무·사유 기록 패널 */}
      <HrCalendarDayDetailPanel
        activeDay={activeDay}
        onUpdateDayRecord={onUpdateDayRecord}
        styles={styles}
      />
    </div>
  );
}
