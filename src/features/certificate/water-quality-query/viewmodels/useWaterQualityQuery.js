import { useState, useCallback } from 'react';
import { getApiBase } from '../../../../core/api/serverConfig';

const adminHeaders = () => ({
  'x-user-role': 'super_admin',
  'x-user-name': 'admin',
});

/**
 * 수질데이터 조회 ViewModel Hook
 */
export function useWaterQualityQuery() {
  const [data, setData] = useState([]);
  const [sites, setSites] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedSite, setSelectedSite] = useState('all');

  /**
   * 현장 목록 조회
   */
  const fetchSites = useCallback(async () => {
    try {
      const res = await fetch(`${getApiBase()}/api/certificates/water-quality/sites`, {
        headers: adminHeaders(),
      });

      if (!res.ok) {
        throw new Error('현장 목록 조회 실패');
      }

      const result = await res.json();
      if (result.success) {
        setSites(result.sites || []);
      }
    } catch (err) {
      console.error('[useWaterQualityQuery] 현장 목록 조회 실패:', err);
    }
  }, []);

  /**
   * 수질데이터 조회
   */
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        year: String(selectedYear),
        month: String(selectedMonth),
        siteName: selectedSite,
      });

      const res = await fetch(`${getApiBase()}/api/certificates/water-quality?${params}`, {
        headers: adminHeaders(),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`조회 실패: ${res.status} ${text.substring(0, 100)}`);
      }

      const result = await res.json();
      if (result.success) {
        setData(result.data || []);
      } else {
        throw new Error(result.error || '조회 실패');
      }
    } catch (err) {
      console.error('[useWaterQualityQuery] 데이터 조회 실패:', err);
      setError(err.message);
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [selectedYear, selectedMonth, selectedSite]);

  return {
    // State
    data,
    sites,
    loading,
    error,
    selectedYear,
    selectedMonth,
    selectedSite,

    // Setters
    setSelectedYear,
    setSelectedMonth,
    setSelectedSite,

    // Actions
    fetchSites,
    fetchData,
  };
}

export default useWaterQualityQuery;
