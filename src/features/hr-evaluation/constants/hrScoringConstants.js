/**
 * 인사고과 점수, 벌점/가산점 및 등급 컷오프 설정 상수 및 기본값
 */

export const SCORING_SETTINGS_STORAGE_KEY = 'osoo_hr_scoring_settings_v3_clean';

export const DEFAULT_SCORING_SETTINGS = {
  // 0. 출퇴근 지정 시간 (신규)
  workHours: {
    workStartTime: '09:00', // 출근 지정 시간
    workEndTime: '17:00', // 퇴근 지정 시간 (오후 5시까지 정상 퇴근)
  },

  // 1. 자동 근태 감점 기준
  autoPenalty: {
    // 출근 지각 (출근 지정시간 기준)
    late10m: -1, // 10분 후 초과 ~ 30분 이하
    late30m: -2, // 30분 후 초과 ~ 1시간 이하
    late60m: -3, // 1시간 후 초과
    lateMinor: -1, // 하위 호환
    lateNormal: -2, // 하위 호환
    lateSevere: -3, // 하위 호환

    // 퇴근 일찍 퇴근 (퇴근 지정시간 기준, 10분 전까지는 정상)
    early10m: -1, // 10분 전 초과 ~ 30분 전 이하
    early30m: -2, // 30분 전 초과 ~ 1시간 전 이하
    early60m: -3, // 1시간 전 초과 일찍 퇴근
    earlyLeave: -2, // 하위 호환

    // 중대 근태 위반
    autoLogout: -2, // 20시 자동 로그아웃 (퇴근 미체크)
    unauthorizedRemote: -5, // 미승인 원격접속 / 위치이탈
    absent: -10, // 무단결근
  },

  // 2. 관리자 상벌점 프리셋 목록
  rewardPresets: [
    { id: 'r_repair', title: '긴급수리 우수대응', points: 3, defaultReason: '' },
    { id: 'r_report', title: '점검보고 우수', points: 2, defaultReason: '' },
    { id: 'r_support', title: '타현장 지원', points: 3, defaultReason: '' },
    { id: 'r_water', title: '방류수질 최우수 관리', points: 4, defaultReason: '' },
    { id: 'r_custom', title: '직접 입력 (포상)', points: 2, defaultReason: '' },
  ],

  penaltyPresets: [
    { id: 'p_apology', title: '시말서 징구 (중대 과실)', points: -5, defaultReason: '' },
    { id: 'p_delay', title: '일지·사진 등록 지연', points: -2, defaultReason: '' },
    { id: 'p_facility', title: '시설점검 소홀', points: -3, defaultReason: '' },
    { id: 'p_safety', title: '안전수칙 미준수', points: -5, defaultReason: '' },
    { id: 'p_remote', title: '원격접속 규정위반', points: -5, defaultReason: '' },
    { id: 'p_custom', title: '직접 입력 (징계/감점)', points: -2, defaultReason: '' },
  ],

  // 3. 고과 등급 컷오프 점수
  gradeCriteria: [
    { grade: 'S', min: 95, label: 'S등급 · 최우수', shortLabel: '최우수', color: '#6d28d9', bg: '#ede9fe', border: '#c4b5fd' },
    { grade: 'A', min: 85, label: 'A등급 · 우수', shortLabel: '우수', color: '#1d4ed8', bg: '#dbeafe', border: '#93c5fd' },
    { grade: 'B', min: 75, label: 'B등급 · 양호', shortLabel: '양호', color: '#15803d', bg: '#dcfce7', border: '#86efac' },
    { grade: 'C', min: 65, label: 'C등급 · 보통', shortLabel: '보통', color: '#b45309', bg: '#fef3c7', border: '#fcd34d' },
    { grade: 'D', min: 0, label: 'D등급 · 미흡', shortLabel: '미흡', color: '#b91c1c', bg: '#fee2e2', border: '#fca5a5' },
  ],
};

/**
 * 'HH:mm' 문자열을 분(minutes) 단위 숫자로 변환
 */
export function timeToMinutes(timeStr) {
  if (!timeStr || typeof timeStr !== 'string') return 0;
  const [h, m] = timeStr.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return 0;
  return h * 60 + m;
}

/**
 * 분(minutes) 단위 숫자를 'HH:mm' 문자열로 변환
 */
export function minutesToTime(minutes) {
  const total = Math.max(0, Math.min(1439, Math.round(minutes)));
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * 출퇴근 지정시간에 따른 구간별 시간대 계산 헬퍼
 */
export function calcPenaltyIntervals(workHours = DEFAULT_SCORING_SETTINGS.workHours) {
  const startMin = timeToMinutes(workHours?.workStartTime || '09:00');
  const endMin = timeToMinutes(workHours?.workEndTime || '17:00');

  return {
    startMin,
    graceLateEnd: minutesToTime(startMin + 10),
    late10Range: `${minutesToTime(startMin + 11)} ~ ${minutesToTime(startMin + 30)}`,
    late30Range: `${minutesToTime(startMin + 31)} ~ ${minutesToTime(startMin + 60)}`,
    late60Start: `${minutesToTime(startMin + 61)} 이후`,

    endMin,
    graceEarlyStart: minutesToTime(endMin - 10),
    early10Range: `${minutesToTime(endMin - 30)} ~ ${minutesToTime(endMin - 11)}`,
    early30Range: `${minutesToTime(endMin - 60)} ~ ${minutesToTime(endMin - 31)}`,
    early60End: `${minutesToTime(endMin - 61)} 이전`,
  };
}

export function loadScoringSettings() {
  try {
    const raw = localStorage.getItem(SCORING_SETTINGS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        const mergedWorkHours = {
          workStartTime: parsed.workHours?.workStartTime || DEFAULT_SCORING_SETTINGS.workHours.workStartTime,
          workEndTime: parsed.workHours?.workEndTime || DEFAULT_SCORING_SETTINGS.workHours.workEndTime,
        };

        const parsedAuto = parsed.autoPenalty || {};
        const late10m = parsedAuto.late10m ?? parsedAuto.lateMinor ?? -1;
        const late30m = parsedAuto.late30m ?? parsedAuto.lateNormal ?? -2;
        const late60m = parsedAuto.late60m ?? parsedAuto.lateSevere ?? -3;
        const early10m = parsedAuto.early10m ?? -1;
        const early30m = parsedAuto.early30m ?? parsedAuto.earlyLeave ?? -2;
        const early60m = parsedAuto.early60m ?? -3;

        return {
          workHours: mergedWorkHours,
          autoPenalty: {
            ...DEFAULT_SCORING_SETTINGS.autoPenalty,
            ...parsedAuto,
            late10m,
            late30m,
            late60m,
            lateMinor: late10m,
            lateNormal: late30m,
            lateSevere: late60m,
            early10m,
            early30m,
            early60m,
            earlyLeave: early30m,
          },
          rewardPresets: Array.isArray(parsed.rewardPresets) && parsed.rewardPresets.length > 0
            ? parsed.rewardPresets
            : DEFAULT_SCORING_SETTINGS.rewardPresets,
          penaltyPresets: Array.isArray(parsed.penaltyPresets) && parsed.penaltyPresets.length > 0
            ? parsed.penaltyPresets
            : DEFAULT_SCORING_SETTINGS.penaltyPresets,
          gradeCriteria: Array.isArray(parsed.gradeCriteria) && parsed.gradeCriteria.length > 0
            ? parsed.gradeCriteria
            : DEFAULT_SCORING_SETTINGS.gradeCriteria,
        };
      }
    }
  } catch (err) {
    console.warn('[hrScoringConstants] loadScoringSettings 실패:', err);
  }
  return DEFAULT_SCORING_SETTINGS;
}

export function saveScoringSettings(settings) {
  try {
    localStorage.setItem(SCORING_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch (err) {
    console.warn('[hrScoringConstants] saveScoringSettings 실패:', err);
  }
}

