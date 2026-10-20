import React, { useState, useMemo } from 'react';
import { DAY_TYPE_OPTIONS, DAY_TYPE_MAP } from '../constants/hrEvaluationConstants';

const DOW_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

/**
 * 📋 목록 보기 워크스페이스
 * - 1일~말일 전체 일자 행을 테이블로 표시하며 인라인 편집 지원
 * - 근무/휴무 구분(드롭다운), 출퇴근 시각 및 상태, 쉬게 된 사유(input), 지각 사유(input), 조퇴·미로그아웃 사유(input), 자동벌점, 참작면제(체크박스), 확정벌점
 */
export function HrListWorkspace({
  year,
  month,
  workerEvaluation,
  selectedDate,
  onSelectDate,
  onUpdateDayRecord,
}) {
  const [filterMode, setFilterMode] = useState('all'); // 'all' | 'penalty' | 'leave' | 'reason'
  const dailyList = useMemo(() => workerEvaluation?.dailyList || [], [workerEvaluation]);

  const filteredDays = useMemo(() => {
    return dailyList.filter((rec) => {
      if (filterMode === 'penalty') return rec.autoPenaltyPoints < 0;
      if (filterMode === 'leave') {
        const dt = DAY_TYPE_MAP[rec.dayType];
        return dt?.isLeave || rec.dayType === 'absent';
      }
      if (filterMode === 'reason') {
        return Boolean(rec.leaveReason || rec.lateReason || rec.earlyLeaveReason);
      }
      return true;
    });
  }, [dailyList, filterMode]);

  return (
    <div style={styles.container}>
      {/* 상단 필터 및 안내 바 */}
      <div style={styles.topBar}>
        <div style={styles.titleInfo}>
          <span style={styles.titleText}>
            📋 {year}년 {month}월 일자별 상세 기록표 · <strong>{workerEvaluation?.siteName}</strong> ({workerEvaluation?.workerName})
          </span>
          <span style={styles.subHint}>각 행에서 근무형태와 사유, 벌점 참작 여부를 바로 수정하면 우측 점수와 전국 순위에 즉시 반영됩니다.</span>
        </div>

        <div style={styles.filterGroup}>
          {[
            { id: 'all', label: `전체 (${dailyList.length}일)` },
            { id: 'penalty', label: `지각·조퇴·벌점 (${dailyList.filter((d) => d.autoPenaltyPoints < 0).length}건)` },
            { id: 'leave', label: `월차·연차·휴가 (${dailyList.filter((d) => DAY_TYPE_MAP[d.dayType]?.isLeave || d.dayType === 'absent').length}건)` },
            { id: 'reason', label: `사유 기록됨 (${dailyList.filter((d) => d.leaveReason || d.lateReason || d.earlyLeaveReason).length}건)` },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilterMode(tab.id)}
              style={{
                ...styles.filterBtn,
                ...(filterMode === tab.id ? styles.filterBtnActive : {}),
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* 인라인 편집 테이블 영역 */}
      <div style={styles.tableScrollArea}>
        <table style={styles.table}>
          <colgroup>
            <col style={{ width: '8%' }} />
            <col style={{ width: '11%' }} />
            <col style={{ width: '14%' }} />
            <col style={{ width: '17%' }} />
            <col style={{ width: '15%' }} />
            <col style={{ width: '17%' }} />
            <col style={{ width: '6%' }} />
            <col style={{ width: '6%' }} />
            <col style={{ width: '6%' }} />
          </colgroup>
          <thead style={styles.thead}>
            <tr>
              <th style={styles.th}>일자(요일)</th>
              <th style={styles.th}>근무/휴무 구분</th>
              <th style={styles.th}>출퇴근 시각 · 상태</th>
              <th style={styles.th}>쉬게 된 사유 (휴무/휴가)</th>
              <th style={styles.th}>지각 사유</th>
              <th style={styles.th}>조퇴 · 미로그아웃 사유</th>
              <th style={styles.th}>자동벌점</th>
              <th style={styles.th}>참작면제</th>
              <th style={styles.th}>확정벌점</th>
            </tr>
          </thead>
          <tbody>
            {filteredDays.map((rec) => {
              const dtMeta = DAY_TYPE_MAP[rec.dayType] || DAY_TYPE_MAP.work;
              const isSelected = rec.date === selectedDate;
              const isSun = rec.dow === 0;
              const isSat = rec.dow === 6;

              return (
                <tr
                  key={rec.date}
                  onClick={() => onSelectDate(rec.date)}
                  style={{
                    ...styles.tr,
                    backgroundColor: isSelected
                      ? '#eff6ff'
                      : rec.dayType === 'regular_off'
                        ? '#f8fafc'
                        : '#ffffff',
                  }}
                >
                  {/* 1. 일자(요일) */}
                  <td
                    style={{
                      ...styles.td,
                      textAlign: 'center',
                      fontWeight: 700,
                      color: isSun ? '#dc2626' : isSat ? '#2563eb' : '#0f172a',
                    }}
                  >
                    {String(rec.day).padStart(2, '0')}일 ({DOW_LABELS[rec.dow]})
                  </td>

                  {/* 2. 근무/휴무 구분 드롭다운 */}
                  <td style={{ ...styles.td, textAlign: 'center' }}>
                    <select
                      value={rec.dayType}
                      onChange={(e) => onUpdateDayRecord(rec.date, { dayType: e.target.value })}
                      style={{
                        ...styles.dayTypeSelect,
                        backgroundColor: dtMeta.bg,
                        color: dtMeta.color,
                        borderColor: dtMeta.border,
                      }}
                    >
                      {DAY_TYPE_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </td>

                  {/* 3. 출퇴근 시각 및 상태 */}
                  <td style={{ ...styles.td, textAlign: 'center' }}>
                    {rec.checkIn !== '-' || rec.checkOut !== '-' ? (
                      <div style={styles.timeCellWrap}>
                        <span style={{ ...styles.monoTime, whiteSpace: 'nowrap' }}>
                          {rec.checkIn} →{' '}
                          <strong style={{ color: rec.autoLogout ? '#ea580c' : '#0f172a' }}>
                            {(rec.autoLogout ? '20:00' : (rec.checkOut || '-')).replace(/\s*\([^)]*\)/g, '').trim()}
                          </strong>
                        </span>
                        {rec.penaltyBadges?.length > 0 && (
                          <div style={styles.miniBadgeRow}>
                            {rec.penaltyBadges.map((b, idx) => {
                              const cleanLabel = (b.label || '').replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ').trim();
                              return (
                                <span
                                  key={idx}
                                  style={{
                                    ...styles.miniBadge,
                                    backgroundColor: b.bg,
                                    color: b.color,
                                    whiteSpace: 'nowrap',
                                  }}
                                >
                                  {cleanLabel}
                                </span>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    ) : (
                      <span style={{ color: '#94a3b8', fontSize: '12px' }}>- ({dtMeta.shortLabel}) -</span>
                    )}
                  </td>

                  {/* 4. 쉬게 된 사유 */}
                  <td style={styles.td}>
                    <input
                      type="text"
                      value={rec.leaveReason || ''}
                      onChange={(e) => onUpdateDayRecord(rec.date, { leaveReason: e.target.value })}
                      placeholder={dtMeta.isLeave ? '쉬게 된 사유 입력...' : '휴무/휴가 사유'}
                      style={{
                        ...styles.inlineInput,
                        backgroundColor: dtMeta.isLeave && !rec.leaveReason ? '#fffbeb' : '#ffffff',
                        borderColor: dtMeta.isLeave && !rec.leaveReason ? '#fcd34d' : '#cbd5e1',
                      }}
                    />
                  </td>

                  {/* 5. 지각 사유 */}
                  <td style={styles.td}>
                    <input
                      type="text"
                      value={rec.lateReason || ''}
                      onChange={(e) => onUpdateDayRecord(rec.date, { lateReason: e.target.value })}
                      placeholder={rec.lateType ? '지각 사유 입력...' : '지각 사유'}
                      style={{
                        ...styles.inlineInput,
                        backgroundColor: rec.lateType && !rec.lateReason ? '#fff7ed' : '#ffffff',
                        borderColor: rec.lateType && !rec.lateReason ? '#fdba74' : '#cbd5e1',
                      }}
                    />
                  </td>

                  {/* 6. 조퇴·미로그아웃 사유 */}
                  <td style={styles.td}>
                    <input
                      type="text"
                      value={rec.earlyLeaveReason || ''}
                      onChange={(e) => onUpdateDayRecord(rec.date, { earlyLeaveReason: e.target.value })}
                      placeholder={rec.earlyType ? '조퇴/미체크 사유 입력...' : '조퇴·미로그아웃 사유'}
                      style={{
                        ...styles.inlineInput,
                        backgroundColor: rec.earlyType && !rec.earlyLeaveReason ? '#fff1f2' : '#ffffff',
                        borderColor: rec.earlyType && !rec.earlyLeaveReason ? '#fda4af' : '#cbd5e1',
                      }}
                    />
                  </td>

                  {/* 7. 자동벌점 */}
                  <td
                    style={{
                      ...styles.td,
                      textAlign: 'center',
                      fontWeight: 700,
                      color: rec.autoPenaltyPoints < 0 ? '#ea580c' : '#94a3b8',
                    }}
                  >
                    {rec.autoPenaltyPoints < 0 ? `${rec.autoPenaltyPoints}점` : '0'}
                  </td>

                  {/* 8. 참작면제 체크박스 */}
                  <td style={{ ...styles.td, textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      disabled={rec.autoPenaltyPoints === 0}
                      checked={Boolean(rec.isPenaltyExcused)}
                      onChange={(e) =>
                        onUpdateDayRecord(rec.date, { isPenaltyExcused: e.target.checked })
                      }
                      title="체크 시 당일 자동벌점을 참작 면제(0점)합니다"
                      style={{
                        width: '15px',
                        height: '15px',
                        cursor: rec.autoPenaltyPoints === 0 ? 'not-allowed' : 'pointer',
                      }}
                    />
                  </td>

                  {/* 9. 확정벌점 (인라인 조정 가능) */}
                  <td style={{ ...styles.td, textAlign: 'center' }}>
                    <input
                      type="number"
                      max={0}
                      min={-15}
                      disabled={rec.isPenaltyExcused}
                      value={rec.finalPenaltyPoints}
                      onChange={(e) =>
                        onUpdateDayRecord(rec.date, { finalPenaltyPoints: Number(e.target.value) })
                      }
                      style={{
                        ...styles.penaltyInput,
                        color: rec.finalPenaltyPoints < 0 ? '#dc2626' : '#15803d',
                        backgroundColor: rec.isPenaltyExcused ? '#f1f5f9' : '#ffffff',
                      }}
                    />
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
  topBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: '10px',
    padding: '10px 14px',
    backgroundColor: '#f8fafc',
    borderBottom: '1px solid #e2e8f0',
  },
  titleInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  titleText: {
    fontSize: '13px',
    color: '#0f172a',
  },
  subHint: {
    fontSize: '11px',
    color: '#64748b',
  },
  filterGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    flexWrap: 'wrap',
  },
  filterBtn: {
    padding: '5px 10px',
    borderRadius: '16px',
    border: '1px solid #cbd5e1',
    backgroundColor: '#ffffff',
    color: '#475569',
    fontSize: '11.5px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  filterBtnActive: {
    backgroundColor: '#0f172a',
    color: '#ffffff',
    borderColor: '#0f172a',
  },
  tableScrollArea: {
    flex: 1,
    minHeight: 0,
    overflow: 'auto',
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
    padding: '9px 8px',
    textAlign: 'center',
    borderBottom: '2px solid #1e293b',
    whiteSpace: 'nowrap',
  },
  tr: {
    borderBottom: '1px solid #e2e8f0',
    transition: 'background-color 0.1s ease',
  },
  td: {
    padding: '6px 8px',
    verticalAlign: 'middle',
  },
  dayTypeSelect: {
    width: '100%',
    padding: '4px 6px',
    borderRadius: '6px',
    border: '1px solid',
    fontSize: '11.5px',
    fontWeight: 700,
    cursor: 'pointer',
    outline: 'none',
  },
  timeCellWrap: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '2px',
  },
  monoTime: {
    fontFamily: 'monospace',
    fontSize: '11px',
    color: '#334155',
  },
  miniBadgeRow: {
    display: 'flex',
    gap: '3px',
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  miniBadge: {
    fontSize: '9.5px',
    fontWeight: 700,
    padding: '1px 5px',
    borderRadius: '4px',
  },
  inlineInput: {
    width: '100%',
    padding: '5px 8px',
    borderRadius: '5px',
    border: '1px solid #cbd5e1',
    fontSize: '11.5px',
    color: '#0f172a',
    boxSizing: 'border-box',
    outline: 'none',
  },
  penaltyInput: {
    width: '54px',
    padding: '4px 6px',
    borderRadius: '5px',
    border: '1px solid #cbd5e1',
    fontSize: '12px',
    fontWeight: 700,
    textAlign: 'center',
    outline: 'none',
  },
};
