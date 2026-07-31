import { apiClient } from '../../../core/api/apiClient.js';
export const getVendorList = () => [];
export async function fetchVendorList() { const data = await apiClient.get('/api/vendors'); return data.vendors || []; }
export async function saveVendor(vendor) { const data = await apiClient.post('/api/vendors', vendor); return data.vendor; }
export async function removeVendor(id) { await apiClient.delete(`/api/vendors/${encodeURIComponent(id)}`); }
