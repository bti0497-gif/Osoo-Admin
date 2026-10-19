/**
 * 근태 및 인사고과 (hr_evaluation) 상수, 등급/벌점 기준표 및 전국 현장 시뮬레이션 데이터 생성기
 */
import { generateSampleApologyDoc } from './hrScoringConstants.js';

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

export const DEFAULT_FIELD_WORKERS = [
  { workerId: 'w_cheongju_s', siteId: 'site_cheongju_s', siteName: '청주휴게소(서울)', workerName: '김태호', position: '현장소장', phone: '010-3421-8812', profileSeed: 1 },
  { workerId: 'w_jukam_s', siteId: 'site_jukam_s', siteName: '죽암휴게소(서울)', workerName: '박성민', position: '현장소장', phone: '010-5192-3304', profileSeed: 2 },
  { workerId: 'w_jukam_b', siteId: 'site_jukam_b', siteName: '죽암휴게소(부산)', workerName: '이정훈', position: '환경관리자', phone: '010-8821-1094', profileSeed: 3 },
  { workerId: 'w_cheonan_b', siteId: 'site_cheonan_b', siteName: '천안호두휴게소(부산)', workerName: '최동현', position: '현장소장', phone: '010-2910-4451', profileSeed: 4 },
  { workerId: 'w_cheonan_s', siteId: 'site_cheonan_s', siteName: '천안삼거리휴게소(서울)', workerName: '정우성', position: '환경관리자', phone: '010-6332-7721', profileSeed: 5 },
  { workerId: 'w_hongcheon_y', siteId: 'site_hongcheon_y', siteName: '홍천휴게소(양양)', workerName: '강현우', position: '현장소장', phone: '010-7741-9082', profileSeed: 6 },
  { workerId: 'w_hoengseong_i', siteId: 'site_hoengseong_i', siteName: '횡성휴게소(인천)', workerName: '조민수', position: '현장소장', phone: '010-4119-5532', profileSeed: 7 },
  { workerId: 'w_hoengseong_g', siteId: 'site_hoengseong_g', siteName: '횡성휴게소(강릉)', workerName: '윤재호', position: '환경관리자', phone: '010-9012-6610', profileSeed: 8 },
  { workerId: 'w_andong_b', siteId: 'site_andong_b', siteName: '안동휴게소(부산)', workerName: '장석원', position: '현장소장', phone: '010-3881-2209', profileSeed: 9 },
  { workerId: 'w_cheondeung_p', siteId: 'site_cheondeung_p', siteName: '천등산휴게소(평택)', workerName: '임도윤', position: '환경관리자', phone: '010-5540-1920', profileSeed: 10 },
  { workerId: 'w_cheondeung_j', siteId: 'site_cheondeung_j', siteName: '천등산휴게소(제천)', workerName: '한승우', position: '현장소장', phone: '010-6678-3104', profileSeed: 11 },
  { workerId: 'w_yeoju_i', siteId: 'site_yeoju_i', siteName: '여주휴게소(인천)', workerName: '오진석', position: '현장소장', phone: '010-2109-8471', profileSeed: 12 },
  { workerId: 'w_seonsan_y', siteId: 'site_seonsan_y', siteName: '선산휴게소(양평)', workerName: '신동혁', position: '환경관리자', phone: '010-8412-5093', profileSeed: 13 },
  { workerId: 'w_gochang_s', siteId: 'site_gochang_s', siteName: '고창고인돌휴게소(서울)', workerName: '배준영', position: '현장소장', phone: '010-7320-1185', profileSeed: 14 },
];

/**
 * 현재 선택된 현장/근무자(worker)와 대상 연월(year, month)에 해당하는
 * 소통게시판 자유양식 참고 게시글 목록을 생성/반환합니다.
 * (실제 소통게시판처럼 카테고리 배지 없이 작성자·작성일시·제목·본문 자유양식으로 구성)
 */
export function getWorkerBoardPosts(worker, year, month, workerRecord) {
  if (!worker) return [];

  const ym = `${year}-${String(month).padStart(2, '0')}`;
  const padDay = (d) => String(Math.max(1, Math.min(28, d))).padStart(2, '0');

  // 근무자의 실제 해당 월 일별 기록에서 휴가일, 지각일, 자동퇴근/조퇴일을 찾아 게시글 날짜와 일치시킵니다.
  const dailyList = Object.values(workerRecord?.dailyRecords || {}).sort((a, b) => a.day - b.day);
  const leaveDayRec = dailyList.find((r) => r.dayType !== 'work' && r.dayType !== 'regular_off');
  const lateDayRec = dailyList.find((r) => Boolean(r.lateType));
  const earlyOrAutoRec = dailyList.find((r) => Boolean(r.earlyType));

  const leaveDay = leaveDayRec?.day || 8;
  const lateDay = lateDayRec?.day || 14;
  const earlyDay = earlyOrAutoRec?.day || 21;

  // 현장별 고유 시드에 따라 자연스러운 자유양식 제목/본문 구성
  const seed = worker.profileSeed || 1;

  const leaveTemplates = [
    {
      title: `${month}월 ${leaveDay}일 자녀 대학병원 진료 동행으로 하루 쉬어가겠습니다.`,
      content: `안녕하세요 ${worker.siteName} ${worker.workerName}입니다. ${month}월 ${leaveDay}일 자녀 대학병원 정기 진료 예약이 잡혀 있어 부득이하게 하루 휴무를 사용하고자 합니다. 전날 약품 보충 및 기계실 사전 점검을 모두 마쳐두었습니다.`,
    },
    {
      title: `${month}월 ${leaveDay}일 집안 경조사(친척 장례) 참석으로 휴무 말씀드립니다.`,
      content: `${worker.siteName} ${worker.workerName}입니다. 갑작스럽게 집안 어르신 부고 연락을 받아 ${month}월 ${leaveDay}일 경조사 참석차 자리를 비우게 되었습니다. 비상 연락망 및 인근 현장 소장님께 상황 공유드렸습니다.`,
    },
    {
      title: `${month}월 ${leaveDay}일 개인 건강검진 및 은행 업무로 연차(월차) 사용합니다.`,
      content: `안녕하세요 ${worker.siteName} 담당자 ${worker.workerName}입니다. ${month}월 ${leaveDay}일 오전 종합건강검진 및 오후 개인 가사 정리가 있어 하루 쉬어가겠습니다. 오전 방류수 채수 일정은 전일 사전 조정 완료했습니다.`,
    },
    {
      title: `${month}월 ${leaveDay}일 환경기술인 법정 의무 보수교육 참석 안내드립니다.`,
      content: `${worker.siteName} ${worker.workerName}입니다. ${month}월 ${leaveDay}일 환경기술인 법정 보수교육 집합 교육이 예정되어 있어 현장 출근 대신 교육장 참석 후 수료증 제출하겠습니다.`,
    },
  ];

  const lateTemplates = [
    {
      title: `금일(${month}/${lateDay}) 출근길 고속도로 화물차 사고 정체로 조금 늦었습니다.`,
      content: `출근 중 나들목 인근 화물차 추돌사고로 차선이 통제되어 평소보다 10여 분 늦게 현장에 도착해 로그인했습니다. 현장 도착 즉시 유량 및 폭기조 상태 정상 확인했습니다.`,
    },
    {
      title: `${month}월 ${lateDay}일 아침 차량 배터리 방전 긴급출동 조치로 출근이 지연되었습니다.`,
      content: `아침 출근 출발 시 차량 배터리가 방전되어 보험사 긴급출동 점프 조치 후 이동하느라 09시를 조금 넘겨 출근 체크했습니다. 불편을 드려 죄송합니다.`,
    },
    {
      title: `오늘(${month}/${lateDay}) 짙은 안개 및 국도 신호 정체로 지각 출근했습니다.`,
      content: `새벽부터 내린 안개와 국도 구간 도로 공사로 인해 차량 정체가 심해 정시보다 조금 늦게 현장 PC에 접속했습니다. 참고 부탁드립니다.`,
    },
  ];

  const earlyTemplates = [
    {
      title: `어제(${month}/${earlyDay}) 저녁 설비 점검 후 퇴근 버튼을 못 누르고 나왔습니다.`,
      content: `18시 무렵 슬러지 탈수기 배관 및 약품탱크 레벨센서 알람이 떠서 현장 조치 후 바로 퇴근하느라 PC 로그아웃(퇴근 체크)을 깜빡해 20시 자동퇴근 처리되었습니다.`,
    },
    {
      title: `${month}월 ${earlyDay}일 외부 배수로 작업 후 로그아웃 누락 건 말씀드립니다.`,
      content: `오후 늦게 처리장 외부 우수로 및 방류구 주변 낙엽 제거 작업을 마치고 작업복 환복 후 바로 퇴근하여 PC 퇴근 클릭을 누락했습니다. 실제 퇴근은 18시 20분경입니다.`,
    },
    {
      title: `${month}월 ${earlyDay}일 오후 치과 신경치료 내원으로 조금 일찍 이동했습니다.`,
      content: `오전 수질 실험과 약품 투입 및 일일점검 사진 등록을 모두 마친 뒤, 급성 치통 치료를 위해 치과 예약 시간에 맞춰 오후 일찍 이동했습니다.`,
    },
  ];

  const chosenLeave = leaveTemplates[(seed - 1) % leaveTemplates.length];
  const chosenLate = lateTemplates[(seed - 1) % lateTemplates.length];
  const chosenEarly = earlyTemplates[(seed - 1) % earlyTemplates.length];

  return [
    {
      id: `bp_${worker.workerId}_${year}_${month}_1`,
      workerId: worker.workerId,
      siteName: worker.siteName,
      author: worker.workerName,
      day: leaveDay,
      targetDate: `${ym}-${padDay(leaveDay)}`,
      writtenAt: `${ym}-${padDay(Math.max(1, leaveDay - 1))} 17:42`,
      title: chosenLeave.title,
      content: chosenLeave.content,
    },
    {
      id: `bp_${worker.workerId}_${year}_${month}_2`,
      workerId: worker.workerId,
      siteName: worker.siteName,
      author: worker.workerName,
      day: lateDay,
      targetDate: `${ym}-${padDay(lateDay)}`,
      writtenAt: `${ym}-${padDay(lateDay)} 09:28`,
      title: chosenLate.title,
      content: chosenLate.content,
    },
    {
      id: `bp_${worker.workerId}_${year}_${month}_3`,
      workerId: worker.workerId,
      siteName: worker.siteName,
      author: worker.workerName,
      day: earlyDay,
      targetDate: `${ym}-${padDay(earlyDay)}`,
      writtenAt: `${ym}-${padDay(earlyDay)} 20:35`,
      title: chosenEarly.title,
      content: chosenEarly.content,
    },
  ];
}

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

  if (autoLogout || (typeof checkOut === 'string' && checkOut.startsWith('20:00'))) {
    const p = rules.autoLogout !== undefined ? rules.autoLogout : -2;
    points += p;
    earlyType = '20시자동퇴근';
    penaltyBadges.push({ label: `20시자동 ${p}`, color: '#ea580c', bg: '#ffedd5' });
  } else if (checkOut && checkOut !== '-' && dayType !== 'half_pm') {
    const [hh, mm] = checkOut.split(':').map(Number);
    const totalMin = hh * 60 + mm;
    if (totalMin < 17 * 60 + 50) {
      const p = rules.earlyLeave !== undefined ? rules.earlyLeave : -2;
      points += p;
      earlyType = '조기퇴근';
      penaltyBadges.push({ label: `조퇴(${checkOut}) ${p}`, color: '#e11d48', bg: '#ffe4e6' });
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
 * 실제 현장 목록(useSiteMaster 등)이 로드되었을 때 기본 14개 현장 시뮬레이션 목록과 결합
 */
export function mergeWorkersWithSiteMaster(siteMaster = []) {
  if (!Array.isArray(siteMaster) || siteMaster.length === 0) {
    return DEFAULT_FIELD_WORKERS;
  }

  const merged = [...DEFAULT_FIELD_WORKERS];
  const existingNames = new Set(merged.map((w) => w.siteName.replace(/\s+/g, '')));

  const extraLastNames = ['김', '이', '박', '최', '정', '강', '조', '윤', '장', '임', '한', '오', '서', '신'];
  const extraFirstNames = ['기훈', '영수', '상철', '민재', '준호', '태윤', '건우', '현석', '성진', '동욱', '재현', '병철'];

  siteMaster.forEach((site, idx) => {
    const rawName = (site.site_name || site.siteName || '').trim();
    if (!rawName) return;
    const cleanKey = rawName.replace(/\s+/g, '');
    if (existingNames.has(cleanKey)) return;

    existingNames.add(cleanKey);
    const seed = merged.length + 1;
    const generatedName =
      site.manager_name ||
      site.managerName ||
      `${extraLastNames[idx % extraLastNames.length]}${extraFirstNames[(idx * 3) % extraFirstNames.length]}`;

    merged.push({
      workerId: `w_master_${site.id || idx}`,
      siteId: String(site.id || `site_${idx}`),
      siteName: rawName,
      workerName: generatedName,
      position: idx % 2 === 0 ? '현장소장' : '환경관리자',
      phone: `010-${String(3100 + ((idx * 137) % 6000)).padStart(4, '0')}-${String(1200 + ((idx * 251) % 8000)).padStart(4, '0')}`,
      profileSeed: seed,
    });
  });

  return merged;
}

/**
 * 특정 연/월 및 근무자에 대한 월간 일별 데이터 + 초기 상벌점 + 종합의견 시뮬레이션 생성
 */
export function generateWorkerMonthlyRecord(worker, year, month) {
  const daysInMonth = new Date(year, month, 0).getDate();
  const seed = (worker.profileSeed || 1) + year * 13 + month * 7;
  const dailyRecords = {};

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const d = new Date(year, month - 1, day);
    const dow = d.getDay(); // 0: 일, 6: 토

    let dayType = 'work';
    let checkIn = `08:${String(42 + ((seed + day * 3) % 15)).padStart(2, '0')}`;
    let checkOut = `18:${String(5 + ((seed + day * 5) % 24)).padStart(2, '0')}`;
    let autoLogout = false;
    let leaveReason = '';
    let lateReason = '';
    let earlyLeaveReason = '';
    let isPenaltyExcused = false;

    // 주말은 기본적으로 정기휴무 (단, 현장 특성에 따라 격주 토요일 근무 시뮬레이션)
    if (dow === 0 || (dow === 6 && (day + seed) % 2 === 0)) {
      dayType = 'regular_off';
      checkIn = '-';
      checkOut = '-';
    } else {
      // 특정 일자 이벤트 시뮬레이션
      if (worker.workerId === 'w_cheongju_s' && day === 8) {
        dayType = 'monthly_leave';
        checkIn = '-';
        checkOut = '-';
        leaveReason = '자녀 대학병원 정기 진료 동행 (사전 보고 완료)';
      } else if (worker.workerId === 'w_cheongju_s' && day === 14) {
        checkIn = '09:12';
        lateReason = '출근길 고속도로 화물차 추돌사고 정체 (블랙박스 확인)';
        isPenaltyExcused = true;
      } else if (worker.workerId === 'w_cheongju_s' && day === 21) {
        checkOut = '20:00 (자동)';
        autoLogout = true;
        earlyLeaveReason = '약품탱크 레벨센서 야간 점검 후 퇴근 미체크';
      } else if (worker.workerId === 'w_jukam_s' && day === 11) {
        checkOut = '20:00 (자동)';
        autoLogout = true;
        earlyLeaveReason = '야간 슬러지 탈수기 배관 막힘 긴급조치 후 PC 로그아웃 누락';
        isPenaltyExcused = true;
      } else if (worker.workerId === 'w_jukam_b' && (day === 16 || day === 17)) {
        dayType = 'family_leave';
        checkIn = '-';
        checkOut = '-';
        leaveReason = '처가 조모상 참석 (대체 점검자 지정 완료)';
      } else if (worker.workerId === 'w_hongcheon_y' && day === 19) {
        dayType = 'official_leave';
        checkIn = '-';
        checkOut = '-';
        leaveReason = '환경기술인 법정 의무 보수교육 참석';
      } else if (worker.workerId === 'w_hoengseong_i' && day === 22) {
        dayType = 'half_pm';
        checkOut = '13:30';
        leaveReason = '급성 치통 치과 신경치료 (오후반차)';
      } else {
        // 일반 시드 기반 이벤트 (근무자별 현실적인 편차 부여하여 S~C등급 고른 분포 형성)
        const workerIdx = worker.profileSeed || 1;
        const pattern = (day * 13 + workerIdx * 7 + month * 3) % 37;
        if (pattern === 4 && day <= 26) {
          dayType = workerIdx % 2 === 0 ? 'monthly_leave' : 'annual_leave';
          checkIn = '-';
          checkOut = '-';
          leaveReason = workerIdx % 2 === 0 ? '개인 가사 정리 및 은행 업무 (사전 승인)' : '가족 행사 참석 연차 사용';
        } else if (pattern === 9 || (workerIdx >= 5 && pattern === 15) || (workerIdx >= 9 && pattern === 21)) {
          const isSevere = workerIdx >= 10 && day % 2 === 0;
          checkIn = isSevere ? '09:36' : workerIdx % 3 === 0 ? '09:08' : '09:19';
          lateReason = isSevere
            ? '차량 배터리 방전 긴급출동 조치 후 출근'
            : workerIdx % 3 === 0
              ? '국도 안개 및 출근길 신호 정체'
              : '고속도로 나들목 정체로 인한 지연 출근';
          isPenaltyExcused = day === 6 && workerIdx <= 4;
        } else if (pattern === 18 || (workerIdx >= 4 && pattern === 27) || (workerIdx >= 8 && pattern === 31)) {
          checkOut = '20:00 (자동)';
          autoLogout = true;
          earlyLeaveReason = workerIdx % 2 === 0 ? '현장 외부 배수로 점검 후 바로 퇴근하여 미체크' : '탈수기 마감 청소 후 로그아웃 누락';
        } else if ((workerIdx >= 7 && pattern === 33) || (workerIdx >= 11 && pattern === 12)) {
          checkOut = '17:20';
          earlyLeaveReason = '관공서 서류 제출 및 현장 물품 구매 이동';
        }
      }
    }

    const penaltyInfo = computeAutoPenalty({ dayType, checkIn, checkOut, autoLogout });
    const finalPenaltyPoints = isPenaltyExcused ? 0 : penaltyInfo.autoPenaltyPoints;

    dailyRecords[dateStr] = {
      date: dateStr,
      day,
      dow,
      dayType,
      checkIn,
      checkOut,
      autoLogout,
      leaveReason,
      lateReason,
      earlyLeaveReason,
      autoPenaltyPoints: penaltyInfo.autoPenaltyPoints,
      isPenaltyExcused,
      finalPenaltyPoints,
      penaltyBadges: penaltyInfo.penaltyBadges,
      lateType: penaltyInfo.lateType,
      earlyType: penaltyInfo.earlyType,
    };
  }

  // 근무자별 초기 상벌점 시뮬레이션
  const workerIdx = worker.profileSeed || 1;
  const rewardPenaltyList = [];
  if (workerIdx === 1 || workerIdx === 2 || workerIdx === 6) {
    rewardPenaltyList.push({
      id: `rp_${worker.workerId}_1`,
      date: `${year}-${String(month).padStart(2, '0')}-10`,
      category: 'reward',
      title: '긴급수리 우수대응',
      points: 3,
      reason: '폭기조 송풍기 벨트 마모 조기 발견 및 자체 교체로 설비 중단 예방',
      author: '중앙관리자',
    });
  } else if (workerIdx === 3 || workerIdx === 5) {
    rewardPenaltyList.push({
      id: `rp_${worker.workerId}_1`,
      date: `${year}-${String(month).padStart(2, '0')}-12`,
      category: 'reward',
      title: '점검보고 우수',
      points: 2,
      reason: '월간 수질 실험사진 및 약품 수불부 무결점 정시 보고',
      author: '최고관리자',
    });
  }

  if (workerIdx === 1 || workerIdx === 4 || workerIdx === 8 || workerIdx === 11) {
    const isApologyWorker = workerIdx === 1;
    rewardPenaltyList.push({
      id: `rp_${worker.workerId}_2`,
      date: `${year}-${String(month).padStart(2, '0')}-18`,
      category: 'penalty',
      title: isApologyWorker ? '시말서 징구 (약품 과투입 및 슬러지 유출 과실)' : '일지·사진 등록 지연',
      points: isApologyWorker ? -5 : -2,
      reason: isApologyWorker
        ? '2차 침전조 약품 밸브 잠금 미확인으로 슬러지 부유 발생에 따른 시말서 제출'
        : '주간 슬러지 반출 계근표 사진 익일 지연 업로드',
      author: '중앙관리자',
      apologyDoc: isApologyWorker ? generateSampleApologyDoc(worker, year, month, 18) : null,
    });
  } else if (workerIdx >= 12) {
    rewardPenaltyList.push({
      id: `rp_${worker.workerId}_3`,
      date: `${year}-${String(month).padStart(2, '0')}-20`,
      category: 'penalty',
      title: '시설점검 소홀',
      points: -3,
      reason: '기계실 유량계 주변 정리정돈 및 청소 상태 미흡 지적',
      author: '중앙관리자',
    });
  }

  const defaultComments = [
    '일일 수질 실험 및 설비 예방점검이 전반적으로 성실하며, 특이사항 발생 시 소통게시판 사전 보고가 우수함.',
    '현장 설비 관리 상태 양호. 월간 퇴근 미체크(20시 자동퇴근) 건에 대한 로그아웃 습관화 당부 완료.',
    '방류수 수질 기준 준수 및 약품 재고 관리가 체계적임. 동절기 대비 배관 보온 점검 우수.',
  ];

  return {
    workerId: worker.workerId,
    dailyRecords,
    rewardPenaltyList,
    evaluatorComment: defaultComments[workerIdx % defaultComments.length],
    isConfirmed: workerIdx <= 3,
    confirmedAt: workerIdx <= 3 ? `${year}-${String(month).padStart(2, '0')}-28 17:30` : null,
  };
}
