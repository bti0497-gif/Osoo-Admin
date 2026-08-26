import { useState, useEffect, useCallback } from 'react';
import { getApiBase } from '../../../core/api/serverConfig';

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 5 }, (_, i) => CURRENT_YEAR - i);
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

export function useMonthlySettlementAuto() {
  const [activeTab, setActiveTab] = useState('auto_generate'); // 'auto_generate' | 'template_manager'
  const [year, setYear] = useState(CURRENT_YEAR);
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [selectedSite, setSelectedSite] = useState('all');
  const [sites, setSites] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [summaryData, setSummaryData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [toastMessage, setToastMessage] = useState(null);
  const [uploadingSiteId, setUploadingSiteId] = useState(null);

  const showToast = useCallback((msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  }, []);

  // 현장 목록 조회
  const fetchSites = useCallback(async () => {
    try {
      const res = await fetch(`${getApiBase()}/api/settlement/sites`);
      if (!res.ok) throw new Error('현장 목록 조회 실패');
      const data = await res.json();
      if (data.success && Array.isArray(data.sites)) {
        setSites(data.sites);
      }
    } catch (err) {
      console.error('[useMonthlySettlementAuto] 현장 목록 로드 오류:', err);
    }
  }, []);

  // 템플릿 목록 조회
  const fetchTemplates = useCallback(async () => {
    try {
      const res = await fetch(`${getApiBase()}/api/settlement/templates`);
      if (!res.ok) throw new Error('템플릿 목록 조회 실패');
      const data = await res.json();
      if (data.success && Array.isArray(data.templates)) {
        setTemplates(data.templates);
      }
    } catch (err) {
      console.error('[useMonthlySettlementAuto] 템플릿 목록 로드 오류:', err);
    }
  }, []);

  // 월정산 요약 데이터 조회
  const fetchSummary = useCallback(async (targetYear = year, targetMonth = month, site = selectedSite) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        year: String(targetYear),
        month: String(targetMonth),
        siteId: site,
      });
      const res = await fetch(`${getApiBase()}/api/settlement/summary?${params}`);
      if (!res.ok) {
        throw new Error(`데이터 조회 실패: ${res.status}`);
      }
      const data = await res.json();
      if (data.success) {
        setSummaryData(data);
      } else {
        throw new Error(data.error || '데이터를 가져오지 못했습니다.');
      }
    } catch (err) {
      console.error('[useMonthlySettlementAuto] 요약 데이터 조회 오류:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [year, month, selectedSite]);

  // 템플릿 파일 다운로드
  const downloadTemplate = useCallback((filename) => {
    if (!filename) return;
    const url = `${getApiBase()}/api/settlement/templates/${encodeURIComponent(filename)}/download`;
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, []);

  // 템플릿 파일 업로드/교체
  const uploadTemplate = useCallback(async (siteId, file, isSub = false) => {
    if (!file) return;
    setUploadingSiteId(siteId);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('isSub', String(isSub));

      const res = await fetch(`${getApiBase()}/api/settlement/templates/${encodeURIComponent(siteId)}/upload`, {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || '양식 업로드에 실패했습니다.');
      }

      showToast(`✅ [${file.name}] 양식 파일이 성공적으로 교체/등록되었습니다.`);
      await fetchTemplates();
    } catch (err) {
      console.error('[useMonthlySettlementAuto] 양식 업로드 오류:', err);
      setError(err.message);
    } finally {
      setUploadingSiteId(null);
    }
  }, [fetchTemplates, showToast]);

  // 템플릿 파일 삭제
  const deleteTemplate = useCallback(async (siteId, isSub = false) => {
    if (!window.confirm('정말 이 양식 파일을 삭제하시겠습니까?')) return;
    setError(null);
    try {
      const params = isSub ? '?isSub=true' : '';
      const res = await fetch(`${getApiBase()}/api/settlement/templates/${encodeURIComponent(siteId)}${params}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || '양식 삭제에 실패했습니다.');
      }

      showToast('🗑️ 양식 파일이 삭제되었습니다.');
      await fetchTemplates();
    } catch (err) {
      console.error('[useMonthlySettlementAuto] 양식 삭제 오류:', err);
      setError(err.message);
    }
  }, [fetchTemplates, showToast]);

  useEffect(() => {
    fetchSites();
    fetchTemplates();
    fetchSummary(year, month, 'all');
  }, [fetchSites, fetchTemplates, fetchSummary, year, month]);

  return {
    activeTab, setActiveTab,
    year, setYear,
    month, setMonth,
    selectedSite, setSelectedSite,
    YEARS, MONTHS,
    sites,
    templates,
    summaryData,
    loading,
    error,
    toastMessage,
    uploadingSiteId,
    fetchSummary,
    fetchTemplates,
    downloadTemplate,
    uploadTemplate,
    deleteTemplate,
  };
}
