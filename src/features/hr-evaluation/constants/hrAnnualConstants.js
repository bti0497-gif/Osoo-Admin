/**
 * 연간 종합 고과 (연봉협상 자료) 관련 상수 및 옵션 정의
 */

export const ANNUAL_EVAL_STORAGE_PREFIX = 'osoo_hr_annual_eval_v1';

export const SALARY_RECOMMENDATION_OPTIONS = [
  {
    value: 'top',
    label: '최우수 (인상 적극 권고)',
    shortLabel: '인상 적극 권고',
    badgeText: '최우수 · 적극인상',
    color: '#6d28d9',
    bg: '#ede9fe',
    border: '#c4b5fd',
    desc: '고과 S등급 달성, 돌발 고장 긴급수리 및 수질 우수관리로 운영비 절감 기여',
  },
  {
    value: 'high',
    label: '우수 (인상 권고)',
    shortLabel: '인상 권고',
    badgeText: '우수 · 인상권고',
    color: '#1d4ed8',
    bg: '#dbeafe',
    border: '#93c5fd',
    desc: '고과 A등급 달성, 일일 점검 및 보고 성실, 무사고 안정 운영',
  },
  {
    value: 'normal',
    label: '보통 (표준/동결)',
    shortLabel: '표준/동결',
    badgeText: '보통 · 표준동결',
    color: '#15803d',
    bg: '#dcfce7',
    border: '#86efac',
    desc: '고과 B등급, 통상 업무 기준 충족, 일부 근태 주의사항 지도 완료',
  },
  {
    value: 'review',
    label: '미흡 (재계약·개선 검토)',
    shortLabel: '재계약·개선 검토',
    badgeText: '미흡 · 재계약검토',
    color: '#b91c1c',
    bg: '#fee2e2',
    border: '#fca5a5',
    desc: '고과 C/D등급 또는 징계 누적, 안전수칙 준수 및 현장 개선 계획 수립 필요',
  },
];

export const SALARY_RECOMMENDATION_MAP = Object.fromEntries(
  SALARY_RECOMMENDATION_OPTIONS.map((opt) => [opt.value, opt])
);

export function getDefaultSalaryRecommendation(grade) {
  if (grade === 'S') return 'top';
  if (grade === 'A') return 'high';
  if (grade === 'B') return 'normal';
  return 'review';
}

export function getDefaultAnnualComment(worker, grade, avgScore, rank, total) {
  const name = worker?.workerName || '해당 근무자';
  const site = worker?.siteName || '현장';

  if (grade === 'S') {
    return `[${site} ${name}] 1년간 방류수 수질 안정 관리 및 긴급 설비 고장 시 신속한 자체 수리로 위탁 운영비 절감에 크게 기여함. 전체 ${total}개 현장 중 ${rank}위(평균 ${avgScore}%)를 기록하였으며, 일일 점검 및 소통게시판 사전 보고가 매우 성실하여 2027년도 연봉 계약 시 우수 인상률 반영을 적극 권고함.`;
  }
  if (grade === 'A') {
    return `[${site} ${name}] 기계실 일상 점검 및 수질 실험 대장 관리가 성실함. 돌발 알람 시 즉시 조치하여 방류수 수질 기준을 1년 내내 안정적으로 유지함(전국 ${rank}위 / 평균 ${avgScore}%). 성실한 현장 운영 실적을 인정하여 연봉 협상 시 인상 권고 의견을 제출함.`;
  }
  if (grade === 'B') {
    return `[${site} ${name}] 기본적인 시설 가동 및 약품 관리를 충실히 수행함(연간 평균 ${avgScore}%). 일부 월간 퇴근 미체크(20시 자동퇴근) 및 점검 사진 지연 등록이 관찰되었으나 면담 후 개선 의지가 확인되어 표준 동결 또는 기본 인상률 적용을 권고함.`;
  }
  return `[${site} ${name}] 연간 시설 점검 미흡 지적 및 근태 벌점이 일부 누적되어 개선 피드백을 전달함(연간 평균 ${avgScore}%). 차년도 안전 수칙 준수 및 현장 시설 유지보수 적극성에 대한 집중 모니터링 및 재계약 조건 재검토를 권고함.`;
}
