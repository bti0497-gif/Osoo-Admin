/**
 * 계산서/입금표 ROI 크롭 영역 설정 저장 및 관리 유틸리티
 * - 1순위: AppData JSON 영구 파일 (%APPDATA%/Osoo_Admin_App/osoo_settlement_roi_config.json)
 * - 2순위: 브라우저 localStorage 캐시
 */

import { apiClient } from '../../../core/api/apiClient.js';

const STORAGE_KEY = 'osoo_admin_settlement_roi_config_v1';

export const DEFAULT_ROI_CONFIG = {
  supplierFocusX: 50,
  supplierFocusY: 16,
  supplierX: 2,
  supplierY: 3,    // 일반계산서(매입) 상호명 Y 시작 위치 (%)
  supplierW: 96,
  supplierH: 26,   // 일반계산서(매입) 상호명 영역 높이 (%)

  salesSupplierFocusX: 50,
  salesSupplierFocusY: 23,
  salesSupplierX: 2,
  salesSupplierY: 10,  // 매출계산서 전용 상호명 Y 시작 위치 (%)
  salesSupplierW: 96,
  salesSupplierH: 26,  // 매출계산서 전용 상호명 영역 높이 (%)

  itemX: 2,
  itemY: 53,       // 품목명 Y 시작 위치 (%) (매입/매출 공통)
  itemW: 96,
  itemH: 24,       // 품목명 영역 높이 (%) (매입/매출 공통)
  itemFocusX: 50,
  itemFocusY: 65,
  zoomScale: 2.4,  // 확대 배율
};

export function normalizeSettlementRoiConfig(config = {}) {
  const merged = { ...DEFAULT_ROI_CONFIG, ...config };
  return {
    ...merged,
    supplierFocusX: Number(config.supplierFocusX ?? (Number(merged.supplierX) + Number(merged.supplierW) / 2)),
    supplierFocusY: Number(config.supplierFocusY ?? (Number(merged.supplierY) + Number(merged.supplierH) / 2)),
    salesSupplierFocusX: Number(config.salesSupplierFocusX ?? (Number(merged.salesSupplierX) + Number(merged.salesSupplierW) / 2)),
    salesSupplierFocusY: Number(config.salesSupplierFocusY ?? (Number(merged.salesSupplierY) + Number(merged.salesSupplierH) / 2)),
    itemFocusX: Number(config.itemFocusX ?? (Number(merged.itemX) + Number(merged.itemW) / 2)),
    itemFocusY: Number(config.itemFocusY ?? (Number(merged.itemY) + Number(merged.itemH) / 2)),
  };
}

/**
 * 저장된 ROI 영구 설정 비동기 로드
 */
export async function fetchSettlementRoiConfig() {
  try {
    const data = await apiClient.get('/api/settlement/roi-config');
    if (data && data.success && data.config) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data.config));
      return normalizeSettlementRoiConfig(data.config);
    }
  } catch (err) {
    console.warn('[settlementRoiConfig] 백엔드 API 로드 실패, localStorage에서 조회합니다:', err.message);
  }

  return getSettlementRoiConfigSync();
}

/**
 * 동기 동반 로드 (localStorage fallback)
 */
export function getSettlementRoiConfigSync() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_ROI_CONFIG };
    const parsed = JSON.parse(raw);
    return normalizeSettlementRoiConfig(parsed);
  } catch (err) {
    console.error('[settlementRoiConfig] ROI 설정 동기 로드 오류:', err);
    return { ...DEFAULT_ROI_CONFIG };
  }
}

/**
 * ROI 영구 설정 저장 (AppData JSON 파일 및 localStorage 동시 보존)
 */
export async function saveSettlementRoiConfig(config) {
  const nextConfig = normalizeSettlementRoiConfig(config);

  // 1. localStorage 로컬 캐시 즉시 업데이트
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextConfig));
  } catch (err) {
    console.warn('[settlementRoiConfig] localStorage 저장 실패:', err);
  }

  // 2. AppData 영구 JSON 파일 저장 요청
  try {
    const data = await apiClient.post('/api/settlement/roi-config', nextConfig);
    if (!data?.success) throw new Error(data?.error || 'ROI 설정 저장에 실패했습니다.');
  } catch (err) {
    console.error('[settlementRoiConfig] 백엔드 영구 저장 요청 실패:', err);
    throw err;
  }

  return nextConfig;
}
