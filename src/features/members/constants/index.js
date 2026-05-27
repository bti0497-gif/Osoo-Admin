/**
 * 회원/현장 관리 상수 정의
 */

// 그리드 헤더 스타일 (앱 상단 layout.css와 무관)
export const MEMBER_SITE_GRID_HEADER_ROW_HEIGHT = 16;
export const MEMBER_SITE_GRID_HEADER_FONT_SIZE = 12;

// 회원 그리드 컬럼 너비
export const MEMBER_GRID_COLUMN_WIDTHS = {
  name: 100,
  password: 140,
  role: 120,
  phone: 170,
  site_name1: 240,
};

// 현장 그리드 컬럼 너비
export const SITE_GRID_COLUMN_WIDTHS = {
  site_name: 240,
  manager_name: 170,
  method: 120,
  series: 120,
};

// 권한 표시 맵
export const ROLE_LABEL_MAP = {
  admin: '최고관리자',
  group_admin: '중앙관리자',
  user: '현장관리자',
};

// 편집 키 상수
export const MEMBER_EDIT_NEW_ROW_KEY = '__MEMBER_NEW_ROW__';
export const SITE_EDIT_NEW_ROW_KEY = '__SITE_NEW_ROW__';

/**
 * 권한 값 정규화
 * @param {string} value - 입력값
 * @param {string} fallback - 기본값
 * @returns {string} 정규화된 권한 코드
 */
export function normalizeRoleValue(value, fallback = 'user') {
  const raw = String(value || '').trim();
  if (!raw) return fallback;

  if (raw === 'admin' || raw === 'group_admin' || raw === 'user') return raw;
  if (raw === '최고관리자') return 'admin';
  if (raw === '중앙관리자' || raw === '권역통합관리자') return 'group_admin';
  if (raw === '현장관리자' || raw === '일반사용자') return 'user';

  return fallback;
}

/**
 * 관리자의 관리 현장 텍스트 생성
 * @param {string[]} siteNames - 현장명 배열
 * @returns {string} '양방향' 또는 현장명
 */
export function getAutoSiteTextForManager(siteNames) {
  if (!Array.isArray(siteNames) || siteNames.length === 0) return '';
  if (siteNames.length > 1) return '양방향';
  return siteNames[0] || '';
}
