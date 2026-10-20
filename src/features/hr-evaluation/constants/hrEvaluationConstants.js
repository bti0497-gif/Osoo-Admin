/**
 * 근태 및 인사고과 (hr_evaluation) 상수, 등급/벌점 기준표 및 실데이터 모델 헬퍼
 */

export const DAY_TYPE_OPTIONS = [
  { value: 'work', label: '정상근무', shortLabel: '근무', bg: '#dcfce7', color: '#15803d', border: '#86efac', isLeave: false, leaveWeight: 0 },
  { value: 'regular_off', label: '정기휴무', shortLabel: '정기휴무', bg: '#f1f5f9', color: '#475569', border: '#cbd5e1', isLeave: false, leaveWeight: 0 },
  { value: 'monthly_leave', label: '월차', shortLabel: '월차', bg: '#dbeafe', color: '#1d4ed8', border: '#93c5fd', isLeave: true, leaveWeight: 1 },
  { value: 'annual_leave', label: '연차', shortLabel: '연차', bg: '#e0e7ff', color: '#4338ca', border: '#a5b4fc', isLeave: true, leaveWeight: 1 },
  { value: 'half_am', label: '오전반차', shortLabel: '오전반차', bg: '#cffafe', color: '#0e7490', border: '#67e8f9', isLeave: true, leaveWeight: 0.5 },
  { value: 'half_pm', label: '오후반차', shortLabel: '오후반차', bg: '#ccfbf1', color: '#0f766e', border: '#5eead4', isLeave: true, leaveWeight: 0.5 },
  { value: 'family_leave', label: '경조사', shortLabel: '경조사', bg: '#f3e8ff', color: '#7e22ce', border: '#d8b4fe', isLeave: true, leaveWeight: 1 },
  { value: 'sick_leave', label: '병가', shortLabel: '병가', bg: '#fef3c7', color: '#b45309', border: '#fcd34d', isLeave: true, leaveWeight: 1 },
  { value: 'official_leave', label: '공가', shortLabel: '공가', bg: '#e0f2fe', color: '#0369a1', border: '#7dd3fc', isLeave: true, leaveWeight: 1 },
  { value: 'absent', label: '무단결근', shortLabel: '결근', bg: '#fee2e2', color: '#b91c1c', border: '#fca5a5', isLeave: false, leaveWeight: 0 },
];

export const DAY_TYPE_MAP = Object.fromEntries(DAY_TYPE_OPTIONS.map((opt) => [opt.value, opt]));

export const AUTO_PENALTY_RULES = [
  { id: 'late_minor', label: '경미 지각 (09:01 ~ 09:10)', points: -1, color: '#d97706', bg: '#fef3c7' },
  { id: 'late_normal', label: '일반 지각 (09:11 ~ 09:30)', points: -2, color: '#ea580c', bg: '#ffedd5' },
  { id: 'late_severe', label: '심한 지각 (09:31 이후)', points: -3, color: '#dc2626', bg: '#fee2e2' },
  { id: 'early_leave', label: '조기 퇴근 (17:50 이전)', points: -2, color: '#e11d48', bg: '#ffe4e6' },
  { id: 'auto_logout', label: '퇴근 미체크 (20:00 자동퇴근)', points: -2, color: '#ea580c', bg: '#ffedd5' },
  { id: 'absent', label: '무단 결근 (사전보고 없음)', points: -10, color: '#991b1b', bg: '#fecaca' },
];

export const GRADE_CRITERIA = [
  { grade: 'S', min: 95, label: 'S등급 · 최우수', shortLabel: '최우수', color: '#6d28d9', bg: '#ede9fe', border: '#c4b5fd' },
  { grade: 'A', min: 85, label: 'A등급 · 우수', shortLabel: '우수', color: '#1d4ed8', bg: '#dbeafe', border: '#93c5fd' },
  { grade: 'B', min: 75, label: 'B등급 · 양호', shortLabel: '양호', color: '#15803d', bg: '#dcfce7', border: '#86efac' },
  { grade: 'C', min: 65, label: 'C등급 · 보통', shortLabel: '보통', color: '#b45309', bg: '#fef3c7', border: '#fcd34d' },
  { grade: 'D', min: 0, label: 'D등급 · 미흡', shortLabel: '미흡', color: '#b91c1c', bg: '#fee2e2', border: '#fca5a5' },
];

export function getGradeInfo(percentage, customCriteria = null) {
  const criteria = customCriteria || GRADE_CRITERIA;
  const score = Number(percentage) || 0;
  for (const item of criteria) {
    if (score >= item.min) return item;
  }
  return criteria[criteria.length - 1];
}

export const REWARD_PENALTY_PRESETS = {
  reward: [
    { id: 'r_repair', title: '긴급수리 우수대응', points: 3, defaultReason: '폭기조 브로워 및 펌프 돌발 고장 시 신속한 자체 수리로 정상 가동 유지' },
    { id: 'r_report', title: '점검보고 우수', points: 2, defaultReason: '일일 수질·유량·약품 대장 및 실험사진 정시 완벽 등록' },
    { id: 'r_support', title: '타현장 지원', points: 3, defaultReason: '인근 휴게소 오수처리장 결원/긴급점검 시 현장 기술 지원 수행' },
    { id: 'r_water', title: '방류수질 최우수 관리', points: 4, defaultReason: '월간 수질성적서 5대 항목 모두 기준치 대비 20% 이내 안정 유지' },
    { id: 'r_custom', title: '직접 입력 (포상)', points: 2, defaultReason: '' },
  ],
  penalty: [
    { id: 'p_apology', title: '시말서 징구 (중대 과실)', points: -5, defaultReason: '약품 투입 및 침전조 슬러지 유출 관련 주의의무 태만에 따른 시말서 제출' },
    { id: 'p_delay', title: '일지·사진 등록 지연', points: -2, defaultReason: '일일점검 기록 및 정산용 필수 사진 마감 기한 경과 후 지연 등록' },
    { id: 'p_facility', title: '시설점검 소홀', points: -3, defaultReason: '기계실/탈수기실 일상 점검 미흡 및 청소 상태 불량 지적' },
    { id: 'p_safety', title: '안전수칙 미준수', points: -5, defaultReason: '약품 투입 및 슬러지 반출 작업 시 안전장구 착용·안전수칙 미준수' },
    { id: 'p_remote', title: '원격접속 규정위반', points: -5, defaultReason: '사전 승인 없는 외부 원격 프로그램 접속 탐지' },
    { id: 'p_custom', title: '직접 입력 (징계/감점)', points: -2, defaultReason: '' },
  ],
};

/**
 * 기본 현장/근무자 초기 목록 (서버/Google Sheets 응답 전 안전한 초기값)
 */
export const DEFAULT_FIELD_WORKERS = [
  { workerId: 'd439fe52-84c9-4015-bc85-f0100fbf953a', siteId: 'd439fe52-84c9-4015-bc85-f0100fbf953a', siteName: '천안휴게소(부산방향)', workerName: '조상호', position: '현장소장', phone: '010-8667-8344' },
  { workerId: 'ca09b513-a02e-4ded-bdee-9893e89542d1', siteId: 'ca09b513-a02e-4ded-bdee-9893e89542d1', siteName: '청주휴게소(서울방향)', workerName: '김동춘', position: '현장소장', phone: '010-2723-3879' },
  { workerId: '2d9a561b-af84-4445-baf0-a79ea2409163', siteId: '2d9a561b-af84-4445-baf0-a79ea2409163', siteName: '횡성휴게소(강릉방향)', workerName: '박승진', position: '현장소장', phone: '010-7340-0862' },
  { workerId: '22ece0c8-ee00-4924-af97-ca95535dbda8', siteId: '22ece0c8-ee00-4924-af97-ca95535dbda8', siteName: '안동휴게소(부산방향)', workerName: '이준모', position: '현장소장', phone: '' },
];

/**
 * 출퇴근 시각과 근무형태에 따른 자동 벌점 계산
 */
export function computeAutoPenalty({ dayType, checkIn, checkOut, autoLogout }, customRules = null) {
  const rules = customRules || {
    lateMinor: -1,
    lateNormal: -2,
    lateSevere: -3,
    earlyLeave: -2,
    autoLogout: -2,
    absent: -10,
  };

  if (dayType === 'absent') {
    const pts = rules.absent !== undefined ? rules.absent : -10;
    return {
      autoPenaltyPoints: pts,
      lateType: '무단결근',
      earlyType: null,
      penaltyBadges: [{ label: `무단결근 ${pts}`, color: '#991b1b', bg: '#fecaca' }],
    };
  }

  // 정상근무 또는 반차인 경우에만 출퇴근 시각 벌점 계산
  if (dayType !== 'work' && dayType !== 'half_am' && dayType !== 'half_pm') {
    return {
      autoPenaltyPoints: 0,
      lateType: null,
      earlyType: null,
      penaltyBadges: [],
    };
  }

  let points = 0;
  let lateType = null;
  let earlyType = null;
  const penaltyBadges = [];

  if (checkIn && checkIn !== '-' && dayType !== 'half_am') {
    const [hh, mm] = checkIn.split(':').map(Number);
    if (!Number.isNaN(hh) && !Number.isNaN(mm)) {
      const totalMin = hh * 60 + mm;
      if (totalMin > 9 * 60 + 30) {
        const p = rules.lateSevere !== undefined ? rules.lateSevere : -3;
        points += p;
        lateType = '심한지각';
        penaltyBadges.push({ label: `지각(${checkIn}) ${p}`, color: '#dc2626', bg: '#fee2e2' });
      } else if (totalMin > 9 * 60 + 10) {
        const p = rules.lateNormal !== undefined ? rules.lateNormal : -2;
        points += p;
        lateType = '일반지각';
        penaltyBadges.push({ label: `지각(${checkIn}) ${p}`, color: '#ea580c', bg: '#ffedd5' });
      } else if (totalMin >= 9 * 60 + 1) {
        const p = rules.lateMinor !== undefined ? rules.lateMinor : -1;
        points += p;
        lateType = '경미지각';
        penaltyBadges.push({ label: `지각(${checkIn}) ${p}`, color: '#d97706', bg: '#fef3c7' });
      }
    }
  }

  if (autoLogout || (typeof checkOut === 'string' && checkOut.startsWith('20:00'))) {
    const p = rules.autoLogout !== undefined ? rules.autoLogout : -2;
    points += p;
    earlyType = '20시자동퇴근';
    penaltyBadges.push({ label: `20시자동 ${p}`, color: '#ea580c', bg: '#ffedd5' });
  } else if (checkOut && checkOut !== '-' && dayType !== 'half_pm') {
    const [hh, mm] = checkOut.split(':').map(Number);
    if (!Number.isNaN(hh) && !Number.isNaN(mm)) {
      const totalMin = hh * 60 + mm;
      if (totalMin < 17 * 60 + 50) {
        const p = rules.earlyLeave !== undefined ? rules.earlyLeave : -2;
        points += p;
        earlyType = '조기퇴근';
        penaltyBadges.push({ label: `조퇴(${checkOut}) ${p}`, color: '#e11d48', bg: '#ffe4e6' });
      }
    }
  }

  return {
    autoPenaltyPoints: points,
    lateType,
    earlyType,
    penaltyBadges,
  };
}

/**
 * 실제 현장 마스터(useSiteMaster / getSites) 목록을 인사고과 근무자 배열로 정규화
 */
export function mergeWorkersWithSiteMaster(siteMaster = []) {
  if (!Array.isArray(siteMaster) || siteMaster.length === 0) {
    return DEFAULT_FIELD_WORKERS;
  }

  const valid = siteMaster
    .filter((s) => {
      const sName = String(s.site_name || s.siteName || '').trim();
      return sName && sName !== '오수처리장' && sName !== '양북임시휴게소';
    })
    .map((site) => {
      const rawName = String(site.site_name || site.siteName || '').trim();
      const sId = String(site.id || site.site_id || '').trim();
      const mName = String(site.manager_name || site.managerName || site.workerName || '').trim();

      return {
        workerId: sId,
        siteId: sId,
        siteName: rawName,
        workerName: mName || '현장관리자',
        position: '현장소장',
        phone: String(site.phone || '').trim(),
      };
    });

  return valid.length > 0 ? valid : DEFAULT_FIELD_WORKERS;
}

/**
 * 특정 연/월에 대해 순수 비어있는 초기 일별 레코드 구조 생성 (더미 시뮬레이션 절대 배제)
 */
export function createEmptyWorkerMonthlyRecord(worker, year, month) {
  const daysInMonth = new Date(year, month, 0).getDate();
  const dailyRecords = {};

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const d = new Date(year, month - 1, day);
    const dow = d.getDay();

    dailyRecords[dateStr] = {
      date: dateStr,
      day,
      dow,
      dayType: 'work',
      checkIn: '-',
      checkOut: '-',
      autoLogout: false,
      leaveReason: '',
      lateReason: '',
      earlyLeaveReason: '',
      autoPenaltyPoints: 0,
      isPenaltyExcused: false,
      finalPenaltyPoints: 0,
      penaltyBadges: [],
      lateType: null,
      earlyType: null,
      isFuture: false,
    };
  }

  return {
    workerId: worker.workerId,
    dailyRecords,
    rewardPenaltyList: [],
    evaluatorComment: '',
    isConfirmed: false,
    confirmedAt: null,
  };
}
