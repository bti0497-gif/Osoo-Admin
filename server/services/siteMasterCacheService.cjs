'use strict';

/**
 * siteMasterCacheService.cjs
 * ─────────────────────────────────────────────────────────
 * 앱 시작 시 구글시트에서 현장 목록(site_id, site_name)을
 * 읽어 site-cache.json에 저장하고, 이후 작업은 이 파일을 기준으로 한다.
 *
 * 흐름:
 *   1. site-cache.json 읽기 (없으면 skip)
 *   2. 구글시트에서 현장 목록 fetch
 *   3. 달라진 게 있으면 site-cache.json 업데이트
 *   4. 이후 모든 작업은 site-cache.json 기준
 */

const fs = require('fs');
const path = require('path');

let _appDataPath = null;
let _memCache = null; // 메모리 캐시 (프로세스 재시작 전까지 유지)

function getCacheFilePath() {
  if (!_appDataPath) throw new Error('siteMasterCacheService: appDataPath가 초기화되지 않았습니다.');
  return path.join(_appDataPath, 'site-cache.json');
}

/**
 * appDataPath 초기화 (server/index.cjs 시작 시 호출)
 */
function init(appDataPath) {
  _appDataPath = appDataPath;
}

/**
 * site-cache.json에서 읽기
 * @returns {Array|null} 현장 목록 또는 null (파일 없음)
 */
function readCacheFile() {
  try {
    const filePath = getCacheFilePath();
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed.sites) ? parsed.sites : null;
  } catch {
    return null;
  }
}

/**
 * site-cache.json에 쓰기
 * @param {Array} sites
 */
function writeCacheFile(sites) {
  const filePath = getCacheFilePath();
  fs.writeFileSync(
    filePath,
    JSON.stringify({ updatedAt: new Date().toISOString(), sites }, null, 2),
    'utf8'
  );
}

/**
 * 두 현장 목록이 동일한지 비교 (id + site_name 기준)
 */
function isSameList(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  const keyOf = (item) => `${item.id}::${item.site_name}`;
  const setA = new Set(a.map(keyOf));
  return b.every((item) => setA.has(keyOf(item)));
}

/**
 * 앱 시작 시 호출: 구글시트 fetch → 변경 있으면 캐시 갱신
 * @param {Function} getSitesFromSheets - sitesSheetsService의 getSites
 * @returns {Array} 최신 현장 목록
 */
async function refreshSiteMasterCache(getSitesFromSheets) {
  const cached = readCacheFile();

  let sheetSites = null;
  try {
    const raw = await getSitesFromSheets();
    sheetSites = (raw || [])
      .filter((s) => s && s.is_active !== 0)
      .map((s) => ({
        id: String(s.id || '').trim(),
        site_name: String(s.site_name || '').trim(),
        manager_name: String(s.manager_name || '').trim(),
        method: String(s.method || '').trim(),
        series: String(s.series || '').trim(),
      }))
      .filter((s) => s.id && s.site_name);
  } catch (err) {
    console.warn('[siteMasterCache] 구글시트 fetch 실패, 캐시 파일 사용:', err.message);
  }

  if (sheetSites) {
    if (!isSameList(cached, sheetSites)) {
      writeCacheFile(sheetSites);
      console.log(`[siteMasterCache] 캐시 갱신: ${sheetSites.length}개 현장`);
    } else {
      console.log(`[siteMasterCache] 변경 없음, 캐시 유지 (${sheetSites.length}개)`);
    }
    _memCache = sheetSites;
    return sheetSites;
  }

  // 구글시트 실패 시 파일 캐시 또는 빈 배열
  if (cached) {
    _memCache = cached;
    return cached;
  }

  _memCache = [];
  return [];
}

/**
 * 현재 메모리 캐시 반환 (없으면 파일에서 읽기)
 */
function getSiteMaster() {
  if (_memCache) return _memCache;
  const cached = readCacheFile();
  _memCache = cached || [];
  return _memCache;
}

/**
 * 메모리 캐시 강제 초기화 (수동 새로고침 시)
 */
function invalidateMemCache() {
  _memCache = null;
}

module.exports = {
  init,
  refreshSiteMasterCache,
  getSiteMaster,
  invalidateMemCache,
};
