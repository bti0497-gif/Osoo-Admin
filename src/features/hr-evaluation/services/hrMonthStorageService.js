import { generateWorkerMonthlyRecord } from '../constants/hrEvaluationConstants';

const STORAGE_KEY_PREFIX = 'osoo_hr_evaluation_v1';

/**
 * 로컬 캐시 초기 데이터 로드 및 빌드
 */
export function buildInitialMonthMap(workers, year, month) {
  const storageKey = `${STORAGE_KEY_PREFIX}_${year}_${month}`;
  try {
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed && typeof parsed === 'object') {
        const merged = { ...parsed };
        for (const w of workers) {
          if (!merged[w.workerId]) {
            merged[w.workerId] = generateWorkerMonthlyRecord(w, year, month);
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
    initial[w.workerId] = generateWorkerMonthlyRecord(w, year, month);
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
