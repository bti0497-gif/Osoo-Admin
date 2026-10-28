import { apiClient } from '../../../core/api/apiClient.js';
export const getVendorList = () => [];
export const MEDICINE_VENDOR_KEYWORDS = ['에이치디이앤씨', '에이치디이엔씨', '에이치디', '영일과학상사', '영일과학', '약품'];
export const MEDICINE_VENDOR_DISPLAY = '에이치디이앤씨/영일과학상사';

export function isMedicineVendor(name) {
  if (!name) return false;
  return MEDICINE_VENDOR_KEYWORDS.some(k => name.includes(k));
}

export async function fetchVendorList() {
  try {
    const data = await apiClient.get('/api/vendors', {}, { timeout: 15000 });
    return data.vendors || [];
  } catch (err) {
    console.warn('[vendorStorage] 거래처 목록 로드 타임아웃/실패 (기본값 사용):', err.message);
    return getVendorList();
  }
}
export async function saveVendor(vendor) { const data = await apiClient.post('/api/vendors', vendor); return data.vendor; }
export async function removeVendor(id) { await apiClient.delete(`/api/vendors/${encodeURIComponent(id)}`); }
