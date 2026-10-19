/**
 * siteAccessHelper.js
 * ─────────────────────────────────────────────────────────────────────
 * 중앙관리자 담당 현장 권한 및 현장명 정규화 헬퍼
 *
 * 1. normalizeSiteKey(site)
 *    - 현장 문자열 또는 객체(name, shortName, id 등)에서 특수문자, 괄호, '휴게소', '방향' 제거 후 소문자 변환
 *    - 예: '청주(서울)' -> '청주서울', '청주휴게소(서울방향)' -> '청주서울'
 *
 * 2. isSiteAssigned(site, assignedSites)
 *    - 주어진 현장이 관리자 담당 현장 목록에 포함되는지 검사
 *    - '*' 와일드카드 또는 assignedSites가 비어있는 경우(미설정 시 전체 허용 안전망) true 반환
 *
 * 3. filterSitesForUser(sites, currentUser, siteKeyExtractor)
 *    - 사용자 정보(currentUser)를 기반으로 목록 필터링
 *    - 최고관리자(admin, isSuperAdmin)는 전체 반환
 *    - assignedSites가 비어있는 경우 전체 반환 (안전망)
 *    - 그 외 담당 현장에 해당하는 항목만 필터링
 */

/**
 * 현장 식별자 정규화
 * @param {string|object} site
 * @returns {string}
 */
export function normalizeSiteKey(site) {
  if (!site) return '';
  let str = '';
  if (typeof site === 'string') {
    str = site;
  } else if (typeof site === 'object') {
    str =
      site.shortName ||
      site.name ||
      site.site_name ||
      site.siteName ||
      site.site ||
      site.site_id ||
      site.siteId ||
      site.id ||
      '';
  }
  return String(str)
    .replace(/[\s\-_/()（）[\]【】휴게소방향]/g, '')
    .toLowerCase();
}

/**
 * 현장 객체로부터 가능한 모든 정규화 키 목록 추출
 * @param {string|object} site
 * @returns {string[]}
 */
export function extractSiteKeys(site) {
  if (!site) return [];
  if (typeof site === 'string') {
    const norm = normalizeSiteKey(site);
    return norm ? [norm] : [];
  }
  const keys = new Set();
  const candidates = [
    site.shortName,
    site.name,
    site.site_name,
    site.siteName,
    site.site,
    site.site_id,
    site.siteId,
    site.id,
  ];
  for (const c of candidates) {
    if (c) {
      const norm = normalizeSiteKey(c);
      if (norm) keys.add(norm);
    }
  }
  return Array.from(keys);
}

/**
 * 특정 현장이 담당 현장 목록에 할당되어 있는지 여부 확인
 * @param {string|object} site
 * @param {string[]} assignedSites
 * @returns {boolean}
 */
export function isSiteAssigned(site, assignedSites) {
  // 안전망: 할당 목록이 없거나 빈 배열이면 전체 허용 (락아웃 방지)
  if (!assignedSites || !Array.isArray(assignedSites) || assignedSites.length === 0) {
    return true;
  }
  // 최고관리자 와일드카드
  if (assignedSites.includes('*')) {
    return true;
  }

  const targetKeys = extractSiteKeys(site);
  if (targetKeys.length === 0) return false;

  const assignedKeys = assignedSites.map(normalizeSiteKey).filter(Boolean);

  return targetKeys.some((tKey) =>
    assignedKeys.some(
      (aKey) =>
        aKey === tKey ||
        tKey.includes(aKey) ||
        aKey.includes(tKey)
    )
  );
}

/**
 * 사용자의 권한 및 담당 현장에 맞춰 현장 목록 필터링
 * @param {Array} sites - 필터링할 현장 목록
 * @param {object} currentUser - 현재 로그인 사용자 객체 ({ role, isSuperAdmin, assignedSites, ... })
 * @param {Function} [siteKeyExtractor] - 항목에서 현장 식별자/객체를 추출하는 함수
 * @returns {Array}
 */
export function filterSitesForUser(sites, currentUser, siteKeyExtractor = null) {
  if (!Array.isArray(sites) || sites.length === 0) {
    return [];
  }
  if (!currentUser) {
    return sites;
  }
  // 최고관리자는 전체 반환
  if (
    currentUser.isSuperAdmin ||
    currentUser.role === 'admin' ||
    currentUser.role === 'super_admin' ||
    currentUser.isAdmin
  ) {
    return sites;
  }

  const assigned = currentUser.assignedSites;
  // 안전망: 담당 현장이 아직 시트에 설정되지 않았거나 와일드카드인 경우 전체 반환
  if (!assigned || !Array.isArray(assigned) || assigned.length === 0 || assigned.includes('*')) {
    return sites;
  }

  return sites.filter((item) => {
    const target = siteKeyExtractor ? siteKeyExtractor(item) : item;
    return isSiteAssigned(target, assigned);
  });
}

export default {
  normalizeSiteKey,
  extractSiteKeys,
  isSiteAssigned,
  filterSitesForUser,
};
