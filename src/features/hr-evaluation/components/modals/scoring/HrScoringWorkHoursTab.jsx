import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  timeToMinutes,
  minutesToTime,
  calcPenaltyIntervals,
  DEFAULT_SCORING_SETTINGS,
} from '../../../constants/hrScoringConstants';
import { hrScoringWorkHoursStyles as tabStyles } from './hrScoringWorkHoursStyles';

const MIN_MINUTES = 360; // 06:00
const MAX_MINUTES = 1320; // 22:00
const TOTAL_SPAN = MAX_MINUTES - MIN_MINUTES; // 960 minutes

const HOUR_TICKS = [
  { min: 360, label: '06:00' },
  { min: 480, label: '08:00' },
  { min: 600, label: '10:00' },
  { min: 720, label: '12:00' },
  { min: 840, label: '14:00' },
  { min: 960, label: '16:00' },
  { min: 1080, label: '18:00' },
  { min: 1200, label: '20:00' },
  { min: 1320, label: '22:00' },
];

/**
 * 🕒 인사고과 출퇴근 지정시간 듀얼 슬라이더 설정 탭
 */
export function HrScoringWorkHoursTab({ formData, onChangeWorkHours }) {
  const workHours = formData?.workHours || DEFAULT_SCORING_SETTINGS.workHours;
  const workStartTime = workHours.workStartTime || '09:00';
  const workEndTime = workHours.workEndTime || '17:00';

  const startMin = timeToMinutes(workStartTime);
  const endMin = timeToMinutes(workEndTime);

  const trackRef = useRef(null);
  const [draggingHandle, setDraggingHandle] = useState(null); // 'start' | 'end' | null

  // 마우스 / 터치 좌표 -> 스냅된 분(minutes) 계산
  const getMinutesFromPointer = useCallback(
    (clientX) => {
      if (!trackRef.current) return startMin;
      const rect = trackRef.current.getBoundingClientRect();
      const trackWidth = rect.width;
      if (trackWidth <= 0) return startMin;

      const offsetX = Math.max(0, Math.min(trackWidth, clientX - rect.left));
      const ratio = offsetX / trackWidth;
      const rawMin = MIN_MINUTES + ratio * TOTAL_SPAN;
      return Math.round(rawMin / 10) * 10;
    },
    [startMin]
  );

  // 드래그 중 실시간 업데이트
  useEffect(() => {
    if (!draggingHandle) return;

    const handlePointerMove = (e) => {
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const snapped = getMinutesFromPointer(clientX);

      if (draggingHandle === 'start') {
        const maxAllowed = endMin - 60; // 최소 1시간 차이
        const clamped = Math.max(MIN_MINUTES, Math.min(maxAllowed, snapped));
        onChangeWorkHours('workStartTime', minutesToTime(clamped));
      } else if (draggingHandle === 'end') {
        const minAllowed = startMin + 60; // 최소 1시간 차이
        const clamped = Math.max(minAllowed, Math.min(MAX_MINUTES, snapped));
        onChangeWorkHours('workEndTime', minutesToTime(clamped));
      }
    };

    const handlePointerUp = () => {
      setDraggingHandle(null);
    };

    window.addEventListener('mousemove', handlePointerMove);
    window.addEventListener('mouseup', handlePointerUp);
    window.addEventListener('touchmove', handlePointerMove);
    window.addEventListener('touchend', handlePointerUp);

    return () => {
      window.removeEventListener('mousemove', handlePointerMove);
      window.removeEventListener('mouseup', handlePointerUp);
      window.removeEventListener('touchmove', handlePointerMove);
      window.removeEventListener('touchend', handlePointerUp);
    };
  }, [draggingHandle, startMin, endMin, getMinutesFromPointer, onChangeWorkHours]);

  // 트랙 빈 영역 클릭 시 더 가까운 핸들로 이동
  const handleTrackPointerDown = (e) => {
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clickedMin = getMinutesFromPointer(clientX);

    const distToStart = Math.abs(clickedMin - startMin);
    const distToEnd = Math.abs(clickedMin - endMin);

    if (distToStart <= distToEnd) {
      const maxAllowed = endMin - 60;
      const clamped = Math.max(MIN_MINUTES, Math.min(maxAllowed, clickedMin));
      onChangeWorkHours('workStartTime', minutesToTime(clamped));
      setDraggingHandle('start');
    } else {
      const minAllowed = startMin + 60;
      const clamped = Math.max(minAllowed, Math.min(MAX_MINUTES, clickedMin));
      onChangeWorkHours('workEndTime', minutesToTime(clamped));
      setDraggingHandle('end');
    }
  };

  // 미세 조정 버튼 핸들러
  const handleAdjustStart = (deltaMinutes) => {
    const next = startMin + deltaMinutes;
    const maxAllowed = endMin - 60;
    const clamped = Math.max(MIN_MINUTES, Math.min(maxAllowed, next));
    onChangeWorkHours('workStartTime', minutesToTime(clamped));
  };

  const handleAdjustEnd = (deltaMinutes) => {
    const next = endMin + deltaMinutes;
    const minAllowed = startMin + 60;
    const clamped = Math.max(minAllowed, Math.min(MAX_MINUTES, next));
    onChangeWorkHours('workEndTime', minutesToTime(clamped));
  };

  const startPct = ((startMin - MIN_MINUTES) / TOTAL_SPAN) * 100;
  const endPct = ((endMin - MIN_MINUTES) / TOTAL_SPAN) * 100;
  const durationHours = ((endMin - startMin) / 60).toFixed(1);

  const intervals = calcPenaltyIntervals(workHours);

  return (
    <div style={tabStyles.container}>
      {/* 1. 상단 안내 카드 */}
      <div style={tabStyles.headerCard}>
        <div style={tabStyles.headerTitleRow}>
          <span style={tabStyles.badge}>근무시간 설정</span>
          <h3 style={tabStyles.headerTitle}>출근점과 퇴근점을 마우스로 끌어서 기준시간을 지정하세요</h3>
        </div>
        <p style={tabStyles.headerDesc}>
          지정된 시간에 따라 첫번째 탭의 지각·퇴근 구간 감점 시간대가 자동으로 연동되며, 10분 유예가 기본 적용됩니다.
        </p>
      </div>

      {/* 2. 타임라인 듀얼 슬라이더 영역 */}
      <div style={tabStyles.sliderCard}>
        <div style={tabStyles.sliderHeader}>
          <span style={tabStyles.sliderTitle}>⏰ 근무시간 타임라인 (06:00 ~ 22:00)</span>
          <span style={tabStyles.durationBadge}>
            기준 근무: <strong>{durationHours}시간</strong> ({workStartTime} ~ {workEndTime})
          </span>
        </div>

        {/* 슬라이더 트랙 컨테이너 */}
        <div style={tabStyles.trackWrapper}>
          <div
            ref={trackRef}
            style={tabStyles.trackBar}
            onMouseDown={handleTrackPointerDown}
            onTouchStart={handleTrackPointerDown}
          >
            {/* 정규 근무시간 하이라이트 구간 */}
            <div
              style={{
                ...tabStyles.activeRange,
                left: `${startPct}%`,
                width: `${endPct - startPct}%`,
              }}
            />

            {/* 출근점 핸들 (파란색) */}
            <div
              style={{
                ...tabStyles.handle,
                left: `${startPct}%`,
                backgroundColor: '#2563eb',
                cursor: draggingHandle === 'start' ? 'grabbing' : 'grab',
                zIndex: draggingHandle === 'start' ? 10 : 3,
              }}
              onMouseDown={(e) => {
                e.stopPropagation();
                setDraggingHandle('start');
              }}
              onTouchStart={(e) => {
                e.stopPropagation();
                setDraggingHandle('start');
              }}
              title="출근점 핸들 (마우스로 드래그)"
            >
              <div style={tabStyles.startTooltip}>출근 {workStartTime}</div>
            </div>

            {/* 퇴근점 핸들 (초록색) */}
            <div
              style={{
                ...tabStyles.handle,
                left: `${endPct}%`,
                backgroundColor: '#059669',
                cursor: draggingHandle === 'end' ? 'grabbing' : 'grab',
                zIndex: draggingHandle === 'end' ? 10 : 3,
              }}
              onMouseDown={(e) => {
                e.stopPropagation();
                setDraggingHandle('end');
              }}
              onTouchStart={(e) => {
                e.stopPropagation();
                setDraggingHandle('end');
              }}
              title="퇴근점 핸들 (마우스로 드래그)"
            >
              <div style={tabStyles.endTooltip}>퇴근 {workEndTime}</div>
            </div>
          </div>

          {/* 시간 눈금 (Ticks) */}
          <div style={tabStyles.ticksRow}>
            {HOUR_TICKS.map((tick) => {
              const tickPct = ((tick.min - MIN_MINUTES) / TOTAL_SPAN) * 100;
              return (
                <div key={tick.min} style={{ ...tabStyles.tickItem, left: `${tickPct}%` }}>
                  <div style={tabStyles.tickLine} />
                  <span style={tabStyles.tickText}>{tick.label}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* 3. 미세조정 컨트롤 및 퀵 프리셋 */}
        <div style={tabStyles.controlsGrid}>
          {/* 출근 지정 컨트롤 */}
          <div style={tabStyles.controlBox}>
            <div style={tabStyles.controlBoxHeader}>
              <span style={{ ...tabStyles.dot, backgroundColor: '#2563eb' }} />
              <span style={tabStyles.controlLabel}>출근 지정시간</span>
            </div>
            <div style={tabStyles.controlMain}>
              <span style={tabStyles.largeTime}>{workStartTime}</span>
              <div style={tabStyles.btnGroup}>
                <button
                  type="button"
                  onClick={() => handleAdjustStart(-10)}
                  style={tabStyles.stepBtn}
                  title="10분 앞당기기"
                >
                  -10분
                </button>
                <button
                  type="button"
                  onClick={() => handleAdjustStart(10)}
                  style={tabStyles.stepBtn}
                  title="10분 늦추기"
                >
                  +10분
                </button>
              </div>
            </div>
          </div>

          {/* 퇴근 지정 컨트롤 */}
          <div style={tabStyles.controlBox}>
            <div style={tabStyles.controlBoxHeader}>
              <span style={{ ...tabStyles.dot, backgroundColor: '#059669' }} />
              <span style={tabStyles.controlLabel}>퇴근 지정시간</span>
            </div>
            <div style={tabStyles.controlMain}>
              <span style={tabStyles.largeTime}>{workEndTime}</span>
              <div style={tabStyles.btnGroup}>
                <button
                  type="button"
                  onClick={() => handleAdjustEnd(-10)}
                  style={tabStyles.stepBtn}
                  title="10분 앞당기기"
                >
                  -10분
                </button>
                <button
                  type="button"
                  onClick={() => handleAdjustEnd(10)}
                  style={tabStyles.stepBtn}
                  title="10분 늦추기"
                >
                  +10분
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* 퀵 프리셋 버튼 */}
        <div style={tabStyles.presetRow}>
          <span style={tabStyles.presetLabel}>자주 쓰는 프리셋:</span>
          <button
            type="button"
            onClick={() => {
              onChangeWorkHours('workStartTime', '09:00');
              onChangeWorkHours('workEndTime', '17:00');
            }}
            style={tabStyles.presetBtn}
          >
            🏢 09:00 ~ 17:00 (오후 5시 퇴근, 8시간)
          </button>
          <button
            type="button"
            onClick={() => {
              onChangeWorkHours('workStartTime', '09:00');
              onChangeWorkHours('workEndTime', '18:00');
            }}
            style={tabStyles.presetBtn}
          >
            🏢 09:00 ~ 18:00 (표준 9시간)
          </button>
          <button
            type="button"
            onClick={() => {
              onChangeWorkHours('workStartTime', '08:30');
              onChangeWorkHours('workEndTime', '17:30');
            }}
            style={tabStyles.presetBtn}
          >
            🏢 08:30 ~ 17:30 (조기출근 9시간)
          </button>
        </div>
      </div>

      {/* 4. 실시간 유예 구간 및 구간별 감점 안내 카드 */}
      <div style={tabStyles.infoCard}>
        <div style={tabStyles.graceBanner}>
          <span style={tabStyles.graceIcon}>🛡️</span>
          <div>
            <strong style={tabStyles.graceTitle}>
              출근 {intervals.graceLateEnd}까지 정상 인정 (10분 유예) / 퇴근 {intervals.graceEarlyStart}부터 정상 인정 (10분 유예)
            </strong>
            <p style={tabStyles.graceSub}>
              사용자 현장 지침에 따라 10분 이내의 가벼운 지각이나 일찍 퇴근은 벌점이 부과되지 않습니다.
            </p>
          </div>
        </div>

        <div style={tabStyles.intervalsGrid}>
          {/* 출근 구간 */}
          <div style={tabStyles.intervalCol}>
            <span style={tabStyles.colTitle}>⏱️ 출근(지각) 자동 감점 구간</span>
            <div style={tabStyles.intervalRow}>
              <span style={tabStyles.rowLabel}>정상 인정 (유예)</span>
              <span style={tabStyles.rowTime}>{workStartTime} ~ {intervals.graceLateEnd}</span>
              <strong style={{ ...tabStyles.rowPoints, color: '#15803d' }}>0점</strong>
            </div>
            <div style={tabStyles.intervalRow}>
              <span style={tabStyles.rowLabel}>10분 후 (경미)</span>
              <span style={tabStyles.rowTime}>{intervals.late10Range}</span>
              <strong style={{ ...tabStyles.rowPoints, color: '#d97706' }}>-1점</strong>
            </div>
            <div style={tabStyles.intervalRow}>
              <span style={tabStyles.rowLabel}>30분 후 (일반)</span>
              <span style={tabStyles.rowTime}>{intervals.late30Range}</span>
              <strong style={{ ...tabStyles.rowPoints, color: '#ea580c' }}>-2점</strong>
            </div>
            <div style={tabStyles.intervalRow}>
              <span style={tabStyles.rowLabel}>1시간 후 (중대)</span>
              <span style={tabStyles.rowTime}>{intervals.late60Start}</span>
              <strong style={{ ...tabStyles.rowPoints, color: '#dc2626' }}>-3점</strong>
            </div>
          </div>

          {/* 퇴근 구간 */}
          <div style={tabStyles.intervalCol}>
            <span style={tabStyles.colTitle}>🚪 퇴근(일찍 퇴근) 자동 감점 구간</span>
            <div style={tabStyles.intervalRow}>
              <span style={tabStyles.rowLabel}>정상 인정 (유예)</span>
              <span style={tabStyles.rowTime}>{intervals.graceEarlyStart} 이후</span>
              <strong style={{ ...tabStyles.rowPoints, color: '#15803d' }}>0점</strong>
            </div>
            <div style={tabStyles.intervalRow}>
              <span style={tabStyles.rowLabel}>10분 전 퇴근</span>
              <span style={tabStyles.rowTime}>{intervals.early10Range}</span>
              <strong style={{ ...tabStyles.rowPoints, color: '#f59e0b' }}>-1점</strong>
            </div>
            <div style={tabStyles.intervalRow}>
              <span style={tabStyles.rowLabel}>30분 전 퇴근</span>
              <span style={tabStyles.rowTime}>{intervals.early30Range}</span>
              <strong style={{ ...tabStyles.rowPoints, color: '#ea580c' }}>-2점</strong>
            </div>
            <div style={tabStyles.intervalRow}>
              <span style={tabStyles.rowLabel}>1시간 전 퇴근</span>
              <span style={tabStyles.rowTime}>{intervals.early60End}</span>
              <strong style={{ ...tabStyles.rowPoints, color: '#dc2626' }}>-3점</strong>
            </div>
          </div>
        </div>

        <div style={tabStyles.tipFooter}>
          💡 <strong>조퇴 규정</strong>: 사전에 조퇴를 신청하여 관리자가 승인한 날은 근무형태를 <code>조퇴 (신청)</code>으로 지정하며, 벌점(0점) 없이 조퇴 건수로만 집계됩니다.
        </div>
      </div>
    </div>
  );
}


