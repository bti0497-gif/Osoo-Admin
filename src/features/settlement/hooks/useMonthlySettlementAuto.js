import { useState, useEffect, useCallback } from 'react';
import { getApiBase } from '../../../core/api/serverConfig';
import { filterSitesForUser } from '../../../core/auth/siteAccessHelper';

const now = new Date();
const CURRENT_YEAR = now.getFullYear();
const DEFAULT_YEAR = now.getFullYear();
const DEFAULT_MONTH = now.getMonth() + 1;
const YEARS = Array.from({ length: 5 }, (_, i) => CURRENT_YEAR - i);
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

export function useMonthlySettlementAuto(currentUser = null) {
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
      const activeUser = currentUser || (() => {
        try {
          const raw = localStorage.getItem('osoo_admin_user_session');
          return raw ? JSON.parse(raw).user : null;
        } catch {
          return null;
        }
      })();

      const params = new URLSearchParams();
      if (activeUser?.id) params.append('userId', activeUser.id);
      if (activeUser?.name) params.append('userName', activeUser.name);

      const url = `${getApiBase()}/api/settlement/sites${params.toString() ? `?${params.toString()}` : ''}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('현장 목록 조회 실패');
      const data = await res.json();
      if (data.success && Array.isArray(data.sites)) {
        const filtered = filterSitesForUser(
          data.sites,
          activeUser,
          (s) => s.shortName || s.name || s.id
        );
        setSites(filtered);
      }
    } catch (err) {
      console.error('[useMonthlySettlementAuto] 현장 목록 로드 오류:', err);
    }
  }, [currentUser]);

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
    const a = document.createElement('a');
    a.href = `${getApiBase()}/api/settlement/templates/${encodeURIComponent(filename)}/download`;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, []);

  // 템플릿 파일 직접 열기 (OS 기본 프로그램으로 실행)
  const openTemplate = useCallback(async (filename) => {
    if (!filename) return;
    try {
      const res = await fetch(`${getApiBase()}/api/settlement/templates/${encodeURIComponent(filename)}/open`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || '양식 파일을 여는 데 실패했습니다.');
      showToast(`📂 [${filename}] 양식을 프로그램으로 열었습니다.`);
    } catch (err) {
      console.error('[useMonthlySettlementAuto] 양식 열기 오류:', err);
      showToast(`⚠️ 양식 열기 실패: ${err.message}`);
    }
  }, [showToast]);

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

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        throw new Error(data.error || `정산서 작성 실패 (${res.status})`);
      }

      showToast(`🎉 [${data.fileName || '정산서'}] 한글 파일이 지정된 경로에 성공적으로 저장되었습니다!`);
      alert(`🎉 [청주휴게소(서울방향)] ${targetYear}년 ${targetMonth}월 정산서 한글 파일 작성이 완료되었습니다!\n\n저장 파일: ${data.fileName || '정산서'}\n저장 위치: 바탕 화면 및 월정산 마감 폴더`);
      return true;
    } catch (err) {
      console.error('[useMonthlySettlementAuto] 청주 정산서 생성 오류:', err);
      setError(err.message);
      alert(`⚠️ 청주휴게소 정산서 작성 실패\n\n오류: ${err.message}`);
      return false;
    } finally {
      setIsGenerating(false);
    }
  }, [year, month, showToast]);

  // 공통 정산 보고서 생성 호출 헬퍼
  const requestSettlementGen = useCallback(async ({ name, url, errorMsg, toastSuccess }, customInputs = {}, targetYear = year, targetMonth = month) => {
    setIsGenerating(true);
    setError(null);
    try {
      showToast(`⏳ [${name}] ${targetYear}년 ${targetMonth}월 정산서 자동 생성을 시작합니다...`);
      const res = await fetch(`${getApiBase()}${url}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year: targetYear, month: targetMonth, customInputs }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || errorMsg);
      showToast(`🎉 [${data.fileName || '정산서'}] ${toastSuccess || `${name} 정산서가 성공적으로 작성되었습니다!`}`);
      return true;
    } catch (err) {
      console.error(`[useMonthlySettlementAuto] ${name} 정산서 생성 오류:`, err);
      setError(err.message);
      return false;
    } finally {
      setIsGenerating(false);
    }
  }, [year, month, showToast]);

  const generateJukamBusanReport = useCallback((opt = {}) => {
    const y = opt.targetYear || year;
    const m = opt.targetMonth || month;
    return requestSettlementGen({ name: '죽암휴게소(부산방향)', url: '/api/settlement/generate/jukam-busan', errorMsg: '죽암(부산방향) 정산서 엑셀 생성 실패' }, {}, y, m);
  }, [requestSettlementGen, year, month]);

  const generateJukamSeoulReport = useCallback((opt = {}) => {
    const y = opt.targetYear || year;
    const m = opt.targetMonth || month;
    return requestSettlementGen({ name: '죽암휴게소(서울방향)', url: '/api/settlement/generate/jukam-seoul', errorMsg: '죽암(서울방향) 정산서 엑셀 생성 실패' }, {}, y, m);
  }, [requestSettlementGen, year, month]);

  const generateCheonanBusanReport = useCallback((opt = {}) => {
    const y = opt.targetYear || year;
    const m = opt.targetMonth || month;
    return requestSettlementGen({ name: '천안휴게소(부산방향)', url: '/api/settlement/generate/cheonan-busan', errorMsg: '천안(부산방향) 정산서 엑셀 생성 실패' }, {}, y, m);
  }, [requestSettlementGen, year, month]);

  const generateHongcheonExcelReport = useCallback((y = year, m = month) =>
    requestSettlementGen({ name: '홍천휴게소(양양방향)', url: '/api/settlement/generate/hongcheon-excel', errorMsg: '홍천(양양방향) 정산서 엑셀 생성 실패' }, {}, y, m), [requestSettlementGen, year, month]);

  const generateHongcheonHwpReport = useCallback((inputs = {}, y = year, m = month) =>
    requestSettlementGen({ name: '홍천휴게소(양양방향)', url: '/api/settlement/generate/hongcheon-hwp', errorMsg: '홍천(양양방향) 한글 정산서 생성 실패', toastSuccess: '홍천(양양방향) 한글 정산보고서가 성공적으로 작성되었습니다!' }, inputs, y, m), [requestSettlementGen, year, month]);

  const generateCheongsongReport = useCallback((inputs = {}, y = year, m = month) =>
    requestSettlementGen({ name: '청송휴게소(상주방향)', url: '/api/settlement/generate/cheongsong', errorMsg: '청송 정산서 생성 실패' }, inputs, y, m), [requestSettlementGen, year, month]);

  const generateGeumwangReport = useCallback((inputs = {}, y = year, m = month) =>
    requestSettlementGen({ name: '금왕휴게소(평택방향)', url: '/api/settlement/generate/geumwang', errorMsg: '금왕 정산서 생성 실패' }, inputs, y, m), [requestSettlementGen, year, month]);

  const generateMiryangReport = useCallback((inputs = {}, y = year, m = month) =>
    requestSettlementGen({ name: '밀양영남루(울산)', url: '/api/settlement/generate/miryang', errorMsg: '밀양영남루 정산서 생성 실패', toastSuccess: '밀양영남루 한글 정산서 및 엑셀 명세서가 성공적으로 작성되었습니다!' }, inputs, y, m), [requestSettlementGen, year, month]);

  const generateGochangReport = useCallback((inputs = {}, y = year, m = month, dir = 'mokpo') => {
    const isSeoul = dir === 'seoul';
    return requestSettlementGen({
      name: isSeoul ? '고창고인돌(서울방향)' : '고창고인돌(목포방향)',
      url: isSeoul ? '/api/settlement/generate/gochang-seoul' : '/api/settlement/generate/gochang',
      errorMsg: `고창고인돌(${isSeoul ? '서울' : '목포'}) 정산 엑셀 생성 실패`,
      toastSuccess: `고창고인돌(${isSeoul ? '서울' : '목포'}) 정산 엑셀 파일이 성공적으로 작성되었습니다!`,
    }, { ...inputs, direction: dir }, y, m);
  }, [requestSettlementGen, year, month]);

  const generateGochangSeoulReport = useCallback((inputs = {}, y = year, m = month) =>
    generateGochangReport(inputs, y, m, 'seoul'), [generateGochangReport]);

  const generateAndongReport = useCallback((inputs = {}, y = year, m = month) =>
    requestSettlementGen({
      name: '안동휴게소(부산방향)',
      url: '/api/settlement/generate/andong',
      errorMsg: '안동휴게소 정산서 생성 실패',
      toastSuccess: '안동휴게소 한글 정산 보고서 및 엑셀 증빙이 성공적으로 작성되었습니다!',
    }, inputs, y, m), [requestSettlementGen, year, month]);

  const generateSeonsanReport = useCallback((inputs = {}, y = year, m = month, dir = 'changwon') => {
    const isYangpyeong = dir === 'yangpyeong' || dir === 'seonsan_yangpyeong';
    const siteName = isYangpyeong ? '선산휴게소(양평방향)' : '선산휴게소(창원방향)';
    const url = isYangpyeong ? '/api/settlement/generate/seonsan-yangpyeong' : '/api/settlement/generate/seonsan-changwon';
    return requestSettlementGen({
      name: siteName,
      url,
      errorMsg: `${siteName} 정산서 생성 실패`,
      toastSuccess: `${siteName} 도로공사 정산 서류가 성공적으로 작성되었습니다!`,
    }, { ...inputs, direction: dir }, y, m);
  }, [requestSettlementGen, year, month]);

  const generateSeonsanChangwonReport = useCallback((inputs = {}, y = year, m = month) =>
    generateSeonsanReport(inputs, y, m, 'changwon'), [generateSeonsanReport]);

  const generateSeonsanYangpyeongReport = useCallback((inputs = {}, y = year, m = month) =>
    generateSeonsanReport(inputs, y, m, 'yangpyeong'), [generateSeonsanReport]);

  // 데이터관리 다운로드 사전 검사
  const checkDataReady = useCallback(async (siteId, targetYear = year, targetMonth = month) => {
    try {
      const res = await fetch(`${getApiBase()}/api/settlement/check-data-ready?siteId=${encodeURIComponent(siteId)}&year=${targetYear}&month=${targetMonth}`);
      if (!res.ok) return { ready: true };
      return await res.json();
    } catch {
      return { ready: true };
    }
  }, [year, month]);

  useEffect(() => {
    fetchSites();
    fetchTemplates();
    fetchSummary(year, month, 'all');

    // 한글 COM 사전 웜업 (Pre-warm): 정산 화면 진입 시 백그라운드에서 한글 엔진 예열
    fetch(`${getApiBase()}/api/settlement/prewarm-hwp`, { method: 'POST' }).catch(() => {});
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
    openTemplate,
    downloadTemplate,
    uploadTemplate,
    deleteTemplate,
    generateCheongjuReport,
    generateJukamBusanReport,
    generateJukamSeoulReport,
    generateCheonanBusanReport,
    generateHongcheonExcelReport,
    generateHongcheonHwpReport,
    generateCheongsongReport,
    generateGeumwangReport,
    generateMiryangReport,
    generateGochangReport,
    generateGochangSeoulReport,
    generateAndongReport,
    generateSeonsanReport,
    generateSeonsanChangwonReport,
    generateSeonsanYangpyeongReport,
    checkDataReady,
  };
}
