import { createEmptyWorkerMonthlyRecord } from '../constants/hrEvaluationConstants';

export const STORAGE_KEY_PREFIX = 'osoo_hr_real_v3_clean';

/**
 * 이전 버전의 더미/시뮬레이션 localStorage 캐시 전수 강제 삭제
 */
export function purgeLegacyHrLocalStorage() {
  try {
    if (typeof localStorage === 'undefined') return;
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('osoo_hr_') && !key.startsWith(STORAGE_KEY_PREFIX)) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((k) => localStorage.removeItem(k));
    if (keysToRemove.length > 0) {
      console.log(`[HR Storage] 이전 더미 캐시 ${keysToRemove.length}건 완전 초기화 완료.`);
    }
  } catch (err) {
    console.warn('[HR Storage] purgeLegacyHrLocalStorage 에러:', err);
  }
}

/**
 * 로컬 캐시 초기 데이터 로드 및 빌드 (순수 실데이터 구조)
 */
export function buildInitialMonthMap(workers, year, month) {
  purgeLegacyHrLocalStorage();
  const storageKey = `${STORAGE_KEY_PREFIX}_${year}_${month}`;
  try {
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed && typeof parsed === 'object') {
        const merged = { ...parsed };
        for (const w of workers) {
          if (!merged[w.workerId]) {
            merged[w.workerId] = createEmptyWorkerMonthlyRecord(w, year, month);
          }
        }
        return merged;
      }
    }
  } catch (err) {
    console.warn('[hrMonthStorageService] localStorage 로드 실패:', err);
  }

  const initial = {};
  for (const w of workers) {
    initial[w.workerId] = createEmptyWorkerMonthlyRecord(w, year, month);
  }
  return initial;
}

/**
 * 로컬 캐시 저장
 */
export function saveMonthMapToStorage(year, month, monthlyRecordsMap) {
  const storageKey = `${STORAGE_KEY_PREFIX}_${year}_${month}`;
  try {
    localStorage.setItem(storageKey, JSON.stringify(monthlyRecordsMap));
  } catch (err) {
    console.warn('[hrMonthStorageService] localStorage 저장 실패:', err);
  }
}
