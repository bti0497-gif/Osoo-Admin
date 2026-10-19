import React, { useState } from 'react';
import { DAY_TYPE_OPTIONS, DAY_TYPE_MAP } from '../../constants/hrEvaluationConstants';

const WEEKDAYS = ['월', '화', '수', '목', '금', '토', '일'];

const getInitialReasonType = (record) => {
  if (!record) return 'leaveReason';
  if (record.leaveReason || record.dayType !== 'work') return 'leaveReason';
  if (record.lateReason || record.lateType) return 'lateReason';
  if (record.earlyLeaveReason || record.earlyType || record.autoLogout) return 'earlyLeaveReason';
  return 'leaveReason';
};

/**
 * 📝 선택 일자 상세 근무형태 및 사유 편집 패널
 */
export function HrCalendarDayDetailPanel({
  activeDay,
  onUpdateDayRecord,
  styles,
}) {
  const [userSelected, setUserSelected] = useState(() => ({
    date: activeDay?.date,
    dayType: activeDay?.dayType,
    type: null,
  }));

  if (!activeDay) return null;

  // 일자(date) 또는 근무형태(dayType)가 변경되었거나 사용자가 수동 선택하지 않은 경우 자동 결정
  const selectedReasonType =
    userSelected.date === activeDay.date &&
    userSelected.dayType === activeDay.dayType &&
    userSelected.type
      ? userSelected.type
      : getInitialReasonType(activeDay);

  const handleSelectReasonType = (newType) => {
    setUserSelected({
      date: activeDay.date,
      dayType: activeDay.dayType,
      type: newType,
    });
  };

  const activeDayMeta = DAY_TYPE_MAP[activeDay.dayType] || DAY_TYPE_MAP.work;
  const hasLeave = Boolean(activeDay.leaveReason && activeDay.leaveReason.trim());
  const hasLate = Boolean(activeDay.lateReason && activeDay.lateReason.trim());
  const hasEarly = Boolean(activeDay.earlyLeaveReason && activeDay.earlyLeaveReason.trim());

  const reasonOptions = [
    { value: 'leaveReason', label: `🏖️ 휴무 사유 (연차·월차·경조사 등)${hasLeave ? ' (입력됨)' : ''}` },
    { value: 'lateReason', label: `⏰ 지각 사유${hasLate ? ' (입력됨)' : ''}` },
    { value: 'earlyLeaveReason', label: `🚪 조퇴 / 자동퇴근 사유${hasEarly ? ' (입력됨)' : ''}` },
  ];

  const getInputLabel = () => {
    if (selectedReasonType === 'leaveReason') {
      return `🏖️ 쉬게 된 사유 (${activeDayMeta.isLeave ? '필수 기재 권장' : '월차·연차·경조사·병가 등'})`;
    }
    if (selectedReasonType === 'lateReason') {
      return `⏰ 지각 사유 (출근 시각: ${activeDay.checkIn || '미입력'})`;
    }
    return `🚪 조퇴 · 20시 자동퇴근 사유 (퇴근 시각: ${activeDay.checkOut || '미입력'})`;
  };

  const getPlaceholder = () => {
    if (selectedReasonType === 'leaveReason') {
      return '예: 자녀 병원 진료 동행, 가족 경조사, 정기 건강검진, 개인 연차 등';
    }
    if (selectedReasonType === 'lateReason') {
      return '예: 고속도로 사고 정체, 차량 고장 긴급정비 등 (지각 사유)';
    }
    return '예: 야간 배관 점검 후 PC 로그아웃 누락, 오후 치과 진료 등 (조퇴/자동퇴근 사유)';
  };

  return (
    <div style={styles.detailPanel}>
      <div style={styles.detailHeader}>
        <div style={styles.detailTitleGroup}>
          <span style={styles.detailDateBadge}>
            {activeDay.date} ({WEEKDAYS[(activeDay.dow + 6) % 7]}요일)
          </span>
          <span style={styles.detailTitle}>선택 일자 상세 근무형태 · 사유 기록 및 벌점 참작</span>
        </div>
        <div style={styles.detailScoreStatus}>
          <span>
            자동벌점: <strong>{activeDay.autoPenaltyPoints}점</strong>
          </span>
          <span style={{ color: '#cbd5e1' }}>|</span>
          <span>
            확정벌점:{' '}
            <strong style={{ color: activeDay.finalPenaltyPoints < 0 ? '#dc2626' : '#16a34a' }}>
              {activeDay.finalPenaltyPoints}점
            </strong>
          </span>
        </div>
      </div>

      {/* 근무형태 빠른 선택 버튼 바 */}
      <div style={styles.typeSelectorRow}>
        <span style={styles.fieldLabel}>근무/휴무 형태:</span>
        <div style={styles.typeButtonsWrap}>
          {DAY_TYPE_OPTIONS.map((opt) => {
            const active = activeDay.dayType === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => onUpdateDayRecord(activeDay.date, { dayType: opt.value })}
                style={{
                  ...styles.typeBtn,
                  backgroundColor: active ? opt.color : opt.bg,
                  color: active ? '#ffffff' : opt.color,
                  borderColor: active ? opt.color : opt.border,
                  fontWeight: active ? 700 : 600,
                }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* 사유 구분 드롭다운 + 와이드 텍스트박스 + 벌점 참작 체크박스 */}
      <div style={styles.consolidatedReasonRow || styles.inputsGrid}>
        {/* 좌측: 사유 구분 드롭다운 */}
        <div style={styles.reasonSelectCol}>
          <label style={styles.inputLabel}>사유 구분:</label>
          <select
            value={selectedReasonType}
            onChange={(e) => handleSelectReasonType(e.target.value)}
            style={styles.reasonSelect}
            aria-label="기록할 사유 구분 선택"
          >
            {reasonOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* 중앙: 선택된 구분에 대한 와이드 텍스트 입력창 */}
        <div style={styles.reasonInputCol}>
          <label style={styles.inputLabel}>{getInputLabel()}</label>
          <input
            type="text"
            value={activeDay[selectedReasonType] || ''}
            onChange={(e) =>
              onUpdateDayRecord(activeDay.date, { [selectedReasonType]: e.target.value })
            }
            placeholder={getPlaceholder()}
            style={styles.reasonTextInput || styles.textInput}
          />
        </div>

        {/* 우측: 벌점 면제 참작 체크박스 */}
        <div style={styles.excuseCol}>
          <label style={styles.excuseCheckboxLabel}>
            <input
              type="checkbox"
              checked={Boolean(activeDay.isPenaltyExcused)}
              onChange={(e) =>
                onUpdateDayRecord(activeDay.date, { isPenaltyExcused: e.target.checked })
              }
              style={styles.checkbox}
            />
            <span>사유 참작하여 당일 벌점 면제 (0점 처리)</span>
          </label>
          <span style={styles.excuseSubText}>
            체크 시 자동벌점({activeDay.autoPenaltyPoints}점)이 면제되어 우측 인사고과 점수와 순위가 즉시 상승합니다.
          </span>
        </div>
      </div>
    </div>
  );
}
