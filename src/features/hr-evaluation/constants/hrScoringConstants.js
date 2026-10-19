/**
 * 인사고과 점수, 벌점/가산점 및 등급 컷오프 설정 상수 및 기본값
 */

export const SCORING_SETTINGS_STORAGE_KEY = 'osoo_hr_scoring_settings_v1';

export const DEFAULT_SCORING_SETTINGS = {
  // 1. 자동 근태 감점 기준
  autoPenalty: {
    lateMinor: -1, // 경미 지각 (09:01 ~ 09:30)
    lateNormal: -2, // 일반 지각 (09:31 ~ 10:00)
    lateSevere: -3, // 중대 지각 (10:01 이후)
    earlyLeave: -2, // 조기 퇴근 (18:00 이전)
    autoLogout: -2, // 20시 자동 로그아웃 (퇴근 미체크)
    unauthorizedRemote: -5, // 미승인 원격접속 / 위치이탈
    absent: -10, // 무단결근
  },

  // 2. 관리자 상벌점 프리셋 목록
  rewardPresets: [
    { id: 'r_repair', title: '긴급수리 우수대응', points: 3, defaultReason: '폭기조 브로워 및 펌프 돌발 고장 시 신속한 자체 수리로 정상 가동 유지' },
    { id: 'r_report', title: '점검보고 우수', points: 2, defaultReason: '일일 수질·유량·약품 대장 및 실험사진 정시 완벽 등록' },
    { id: 'r_support', title: '타현장 지원', points: 3, defaultReason: '인근 휴게소 오수처리장 결원/긴급점검 시 현장 기술 지원 수행' },
    { id: 'r_water', title: '방류수질 최우수 관리', points: 4, defaultReason: '월간 수질성적서 5대 항목 모두 기준치 대비 20% 이내 안정 유지' },
    { id: 'r_custom', title: '직접 입력 (포상)', points: 2, defaultReason: '' },
  ],

  penaltyPresets: [
    { id: 'p_apology', title: '시말서 징구 (중대 과실)', points: -5, defaultReason: '약품 투입 및 침전조 슬러지 유출 관련 주의의무 태만에 따른 시말서 제출' },
    { id: 'p_delay', title: '일지·사진 등록 지연', points: -2, defaultReason: '일일점검 기록 및 정산용 필수 사진 마감 기한 경과 후 지연 등록' },
    { id: 'p_facility', title: '시설점검 소홀', points: -3, defaultReason: '기계실/탈수기실 일상 점검 미흡 및 청소 상태 불량 지적' },
    { id: 'p_safety', title: '안전수칙 미준수', points: -5, defaultReason: '약품 투입 및 슬러지 반출 작업 시 안전장구 착용·안전수칙 미준수' },
    { id: 'p_remote', title: '원격접속 규정위반', points: -5, defaultReason: '사전 승인 없는 외부 원격 프로그램 접속 탐지' },
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

export function loadScoringSettings() {
  try {
    const raw = localStorage.getItem(SCORING_SETTINGS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        return {
          autoPenalty: { ...DEFAULT_SCORING_SETTINGS.autoPenalty, ...(parsed.autoPenalty || {}) },
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

export function generateSampleApologyDoc(worker, year, month, dateStr = '14') {
  const padMonth = String(month).padStart(2, '0');
  const padDay = String(dateStr).padStart(2, '0');
  const wName = worker?.workerName || '김태호';
  const sName = worker?.siteName || '청주휴게소(서울)';
  const pos = worker?.position || '현장소장';

  return {
    hasDoc: true,
    fileName: `시말서_${wName}_${year}${padMonth}${padDay}.pdf`,
    fileSize: '428 KB',
    fileType: 'application/pdf',
    drivePath: `/오수처리장_인사고과/시말서/${year}/${padMonth}월/${sName}_시말서.pdf`,
    driveFileId: `drive_apology_${worker?.workerId || 'w_1'}_01`,
    uploadedAt: `${year}-${padMonth}-${padDay} 15:30`,
    incidentDate: `${year}-${padMonth}-${padDay} 18:20`,
    docTitle: '시 말 서 (경 위 서)',
    workerName: wName,
    siteName: sName,
    position: pos,
    statement: `본인은 ${year}년 ${month}월 ${padDay}일경, 현장 점검 중 밸브 및 센서 잠금 상태를 철저히 확인하지 않아 약품 과투입 및 침전조 슬러지 부유 현상을 유발하였습니다.\n\n현장 관리 책임자로서 중대한 관리 소홀 책임을 깊이 통감하며, 향후 모든 점검 체크리스트를 2중 확인하고 동일한 과실이 재발하지 않도록 각별히 유의할 것을 엄숙히 서약하며 본 시말서를 제출합니다.`,
    signed: true,
    sealText: `${wName} (인)`,
  };
}
