import { useState, useCallback } from 'react';
import { getApiBase } from '../../../../core/api/serverConfig';

const adminHeaders = () => ({
  'x-user-role': 'super_admin',
  'x-user-name': 'admin',
});

/**
 * 수질데이터 조회 ViewModel Hook (연도, 월, 현장 필수 선택)
 */
export function useWaterQualityQuery() {
  const [pivotedRows, setPivotedRows] = useState([]);
  const [locationsList, setLocationsList] = useState(['유량조정조', '무산소조', '포기조', '침전조', '방류조']);
  const [itemsList, setItemsList] = useState([
    { key: 'nh3_n', label: '암모니아성질소 (NH3-N)', color: '#2563eb', bg: '#dbeafe' },
    { key: 'no3_n', label: '질산성질소 (NO3-N)', color: '#059669', bg: '#d1fae5' },
    { key: 'po4_p', label: '인산염인 (PO4-P)', color: '#d97706', bg: '#fef3c7' },
    { key: 'alkalinity', label: '알칼리도 (ALK)', color: '#7c3aed', bg: '#ede9fe' },
  ]);
  const [sites, setSites] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedSite, setSelectedSite] = useState('');

  /**
   * 현장 마스터 목록 조회
   */
  const fetchSites = useCallback(async () => {
    try {
      const res = await fetch(`${getApiBase()}/api/settings/sites`, {
        headers: adminHeaders(),
      });

      if (!res.ok) throw new Error('현장 목록 조회 실패');

      const result = await res.json();
      if (result.success && Array.isArray(result.sites)) {
        const activeSites = result.sites
          .filter((s) => s.is_active === 1 || s.is_active === '1')
          .map((s) => ({ id: s.id, site_name: String(s.site_name || '').trim() }))
          .filter((s) => s.site_name !== '오수처리장' && s.site_name !== '양북임시휴게소' && s.site_name !== '')
          .sort((a, b) => a.site_name.localeCompare(b.site_name, 'ko'));
        setSites(activeSites);

        // 첫 번째 현장 자동 선택 (비어있을 경우)
        if (activeSites.length > 0 && !selectedSite) {
          setSelectedSite(activeSites[0].site_name);
        }
      }
    } catch (err) {
      console.error('[useWaterQualityQuery] 현장 목록 조회 실패:', err);
    }
  }, [selectedSite]);

  /**
   * 일일 수질 피벗 데이터 조회
   */
  const fetchData = useCallback(async (overrideSite = null) => {
    const targetSite = overrideSite || selectedSite;

    if (!targetSite) {
      setError('조회할 현장을 선택해 주세요.');
      setPivotedRows([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        year: String(selectedYear),
        month: String(selectedMonth),
        siteName: targetSite,
      });

      const res = await fetch(`${getApiBase()}/api/water-quality/daily-query?${params}`, {
        headers: adminHeaders(),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`조회 실패: ${res.status} ${text.substring(0, 100)}`);
      }

      const result = await res.json();
      if (result.success) {
        setPivotedRows(result.rows || []);
        if (Array.isArray(result.locations) && result.locations.length > 0) {
          setLocationsList(result.locations);
        }
        if (Array.isArray(result.items) && result.items.length > 0) {
          setItemsList(result.items);
        }
      } else {
        throw new Error(result.message || '데이터를 불러오지 못했습니다.');
      }
    } catch (err) {
      console.error('[useWaterQualityQuery] 데이터 조회 실패:', err);
      setError(err.message);
      setPivotedRows([]);
    } finally {
      setLoading(false);
    }
  }, [selectedYear, selectedMonth, selectedSite]);

  return {
    pivotedRows,
    locationsList,
    itemsList,
    sites,
    loading,
    error,

    selectedYear,
    selectedMonth,
    selectedSite,

    setSelectedYear,
    setSelectedMonth,
    setSelectedSite,

    fetchSites,
    fetchData,
  };
}

export default useWaterQualityQuery;
