import { useState, useEffect, useCallback } from 'react';
import { getApiBase } from '../../../core/api/serverConfig';

const now = new Date();
const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
const CURRENT_YEAR = now.getFullYear();
const DEFAULT_YEAR = prevMonthDate.getFullYear();
const DEFAULT_MONTH = prevMonthDate.getMonth() + 1;
const YEARS = Array.from({ length: 5 }, (_, i) => CURRENT_YEAR - i);
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

export function useMonthlySettlementAuto() {
  const [activeTab, setActiveTab] = useState('auto_generate'); // 'auto_generate' | 'template_manager'
  const [year, setYear] = useState(DEFAULT_YEAR);
  const [month, setMonth] = useState(DEFAULT_MONTH);
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

  const [isGenerating, setIsGenerating] = useState(false);

  // 청주휴게소 정산서 한글 파일 생성 및 다운로드
  const generateCheongjuReport = useCallback(async (statements, targetYear = year, targetMonth = month) => {
    setIsGenerating(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('year', String(targetYear));
      formData.append('month', String(targetMonth));

      if (statements.waterQuality?.file) {
        formData.append('statementWaterQuality', statements.waterQuality.file);
      }
      if (statements.kit?.file) {
        formData.append('statementKit', statements.kit.file);
      }
      if (statements.chemical?.file) {
        formData.append('statementChemical', statements.chemical.file);
      }

      const res = await fetch(`${getApiBase()}/api/settlement/generate/cheongju`, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `정산서 작성 실패 (${res.status})`);
      }

      const blob = await res.blob();
      const shortY = String(targetYear).slice(-2);
      const mm = String(targetMonth).padStart(2, '0');
      const filename = `${shortY}년 ${mm}월분 오수처리시설 외 임대료 정산 보고건 - 청주(서울)휴게소.hwp`;
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      showToast(`🎉 [${filename}] 정산서 한글 파일이 성공적으로 작성되어 저장되었습니다!`);
      return true;
    } catch (err) {
      console.error('[useMonthlySettlementAuto] 청주 정산서 생성 오류:', err);
      setError(err.message);
      return false;
    } finally {
      setIsGenerating(false);
    }
  }, [year, month, showToast]);

  // 죽암휴게소(부산방향) 엑셀 정산서 자동 생성
  const generateJukamBusanReport = useCallback(async ({ targetYear = year, targetMonth = month } = {}) => {
    setIsGenerating(true);
    setError(null);
    try {
      showToast(`⏳ [죽암휴게소(부산방향)] ${targetYear}년 ${targetMonth}월 엑셀 정산서 자동 생성을 시작합니다...`);

      const res = await fetch(`${getApiBase()}/api/settlement/generate/jukam-busan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year: targetYear, month: targetMonth }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || '죽암(부산방향) 정산서 엑셀 생성 실패');
      }

      showToast(`🎉 [${data.fileName}] 죽암(부산방향) 엑셀 정산서가 성공적으로 작성되었습니다!`);
      return true;
    } catch (err) {
      console.error('[useMonthlySettlementAuto] 죽암(부산) 정산서 생성 오류:', err);
      setError(err.message);
      return false;
    } finally {
      setIsGenerating(false);
    }
  }, [year, month, showToast]);

  // 데이터관리 다운로드 사전 검사
  const checkDataReady = useCallback(async (siteId, targetYear = year, targetMonth = month) => {
    try {
      const res = await fetch(`${getApiBase()}/api/settlement/check-data-ready?siteId=${encodeURIComponent(siteId)}&year=${targetYear}&month=${targetMonth}`);
      if (!res.ok) return { ready: true }; // 네트워크 실패 시 작업 방해 방지용 fallback
      const data = await res.json();
      return data;
    } catch (_) {
      return { ready: true };
    }
  }, [year, month]);

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
    isGenerating,
    fetchSummary,
    fetchTemplates,
    downloadTemplate,
    uploadTemplate,
    deleteTemplate,
    generateCheongjuReport,
    generateJukamBusanReport,
    checkDataReady,
  };
}
