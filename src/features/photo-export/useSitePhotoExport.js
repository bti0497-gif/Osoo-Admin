import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { apiClient, rediscoverServer } from '../../core/api';

/**
 * 현장별 월정산 사진 실시간 드라이브 조회 ViewModel (프로그래스바 지원)
 */
export function useSitePhotoExport(siteMaster = [], currentUser) {
  const now = new Date();
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);
  
  // 다중 현장 선택 (Set ID 기반)
  const [selectedSiteIds, setSelectedSiteIds] = useState(new Set());
  // 가장 최근에 클릭(선택)된 현장 ID
  const [lastActiveSiteId, setLastActiveSiteId] = useState(null);
  
  const [searchTerm, setSearchTerm] = useState('');
  const [loadingSummary, setLoadingSummary] = useState(false);
  
  // 드라이브 조회 진행 상태 (프로그래스바)
  const [scanProgress, setScanProgress] = useState({ percent: 0, stepText: '' });

  // 포함할 카테고리 체크 상태
  const [categories, setCategories] = useState({
    testPhotos: true,            // 실험분석사진 (1회분)
    sludgePhotos: true,          // 슬러지 반출 사진
    cleaningCertificates: true,  // 청소 필증 사진
    medicineInPhotos: true,      // 약품 입고 사진
    kitInPhotos: true,           // 키트 입고 사진
  });

  // 최근 선택 현장의 Google Drive 실시간 사진 보유 현황 데이터
  const [activeSummary, setActiveSummary] = useState(null);

  const hasInitializedRef = useRef(false);

  // 메뉴 진입 시 아무 현장도 기본 선택하지 않고 0개 선택 상태로 시작
  // (사용자가 현장을 직접 클릭할 때만 선택 및 드라이브 스캔 활성화)

  // 선택된 현장 객체 목록
  const selectedSitesList = useMemo(() => {
    if (!Array.isArray(siteMaster)) return [];
    return siteMaster.filter((s) => selectedSiteIds.has(s.id));
  }, [siteMaster, selectedSiteIds]);

  // 가장 최근에 선택된 현장 객체
  const lastActiveSite = useMemo(() => {
    if (!Array.isArray(siteMaster) || !lastActiveSiteId) return null;
    return siteMaster.find((s) => s.id === lastActiveSiteId) || null;
  }, [siteMaster, lastActiveSiteId]);

  // 현장 클릭 토글 (선택 / 해제)
  const toggleSiteSelect = useCallback((siteId) => {
    setSelectedSiteIds((prev) => {
      const next = new Set(prev);
      if (next.has(siteId)) {
        next.delete(siteId);
        const remaining = Array.from(next);
        setLastActiveSiteId(remaining.length > 0 ? remaining[remaining.length - 1] : null);
      } else {
        next.add(siteId);
        setLastActiveSiteId(siteId);
      }
      return next;
    });
  }, []);

  // 전체 현장 선택 / 전체 해제
  const selectAllSites = useCallback((filteredSites) => {
    if (!Array.isArray(filteredSites) || filteredSites.length === 0) return;
    setSelectedSiteIds(new Set(filteredSites.map((s) => s.id)));
    setLastActiveSiteId(filteredSites[0].id);
  }, []);

  const deselectAllSites = useCallback(() => {
    setSelectedSiteIds(new Set());
    setLastActiveSiteId(null);
  }, []);

  // 최근 선택 현장(lastActiveSite)의 Google Drive 실시간 보유 현황 조회 API (단계별 프로그래스바 연동)
  const fetchActiveSummary = useCallback(async () => {
    if (!lastActiveSite?.site_name) {
      setActiveSummary(null);
      setScanProgress({ percent: 0, stepText: '' });
      return;
    }

    setLoadingSummary(true);
    setScanProgress({ percent: 15, stepText: `'${lastActiveSite.site_name}' Google Drive 접속 및 루트 폴더 확인 중...` });

    // 시각적 피드백을 위한 단계별 진행률 애니메이션
    const timer1 = setTimeout(() => {
      setScanProgress({ percent: 45, stepText: `'${lastActiveSite.site_name}' 수질분석 실험사진 및 슬러지 폴더 스캔 중...` });
    }, 250);

    const timer2 = setTimeout(() => {
      setScanProgress({ percent: 75, stepText: `'${lastActiveSite.site_name}' 약품입고 & 키트입고 사진 목록 정밀 탐색 중...` });
    }, 600);

    try {
      const res = await apiClient.get('/api/photos/monthly-summary', {
        siteName: lastActiveSite.site_name,
        year: selectedYear,
        month: selectedMonth,
      });

      setScanProgress({ percent: 100, stepText: '드라이브 사진 조회 완료!' });

      const summaryData = res?.summary || res?.data?.summary;
      if (summaryData) {
        setActiveSummary(summaryData);
      } else {
        setActiveSummary(null);
      }
    } catch (err) {
      console.warn('[useSitePhotoExport] 첫 API 호출 실패, 포트 자동 재탐색 시도:', err.message);
      try {
        await rediscoverServer();
        const retryRes = await apiClient.get('/api/photos/monthly-summary', {
          siteName: lastActiveSite.site_name,
          year: selectedYear,
          month: selectedMonth,
        });
        setScanProgress({ percent: 100, stepText: '드라이브 사진 조회 완료!' });
        const summaryData = retryRes?.summary || retryRes?.data?.summary;
        if (summaryData) {
          setActiveSummary(summaryData);
          return;
        }
      } catch (retryErr) {
        console.warn('[useSitePhotoExport] 서버 재탐색 후에도 조회 실패:', retryErr.message);
      }
      setActiveSummary(null);
      setScanProgress({ percent: 100, stepText: '조회 실패 (네트워크 연결 확인 필요)' });
    } finally {
      clearTimeout(timer1);
      clearTimeout(timer2);
      setTimeout(() => {
        setLoadingSummary(false);
      }, 300);
    }
  }, [lastActiveSite, selectedYear, selectedMonth]);

  useEffect(() => {
    fetchActiveSummary();
  }, [fetchActiveSummary]);

  const toggleCategory = useCallback((key) => {
    setCategories((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const toggleAllCategories = useCallback((check) => {
    setCategories({
      testPhotos: check,
      sludgePhotos: check,
      cleaningCertificates: check,
      medicineInPhotos: check,
      kitInPhotos: check,
    });
  }, []);

  // 다운로드 상태
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState({ current: 0, total: 0, siteName: '', message: '' });
  // 완료 표시용 (토스트에서 자동 사라짐)
  const [downloadComplete, setDownloadComplete] = useState(null); // { totalSaved, siteCount } or null

  const executeDownload = useCallback(async () => {
    if (selectedSitesList.length === 0) {
      alert('선택된 현장이 없습니다.');
      return;
    }

    // 체크된 카테고리 키 변환 (ViewModel 키 → 서버 카테고리 키)
    const categoryKeyMap = {
      testPhotos: 'testPhoto',
      sludgePhotos: 'sludge',
      cleaningCertificates: 'cleaningCertificate',
      medicineInPhotos: 'medicineIn',
      kitInPhotos: 'kitIn',
    };
    const selectedCats = Object.entries(categories)
      .filter(([, checked]) => checked)
      .map(([key]) => categoryKeyMap[key])
      .filter(Boolean);

    if (selectedCats.length === 0) {
      alert('다운로드할 카테고리를 하나 이상 선택해 주세요.');
      return;
    }

    setIsDownloading(true);
    setDownloadComplete(null);
    setDownloadProgress({ current: 0, total: selectedSitesList.length, percent: 5, siteName: '', message: '다운로드 준비 중...' });

    let totalSavedAll = 0;
    const totalSites = selectedSitesList.length;

    for (let i = 0; i < totalSites; i++) {
      const site = selectedSitesList[i];
      const basePercent = Math.round((i / totalSites) * 100);
      const stepWeight = 100 / totalSites;

      setDownloadProgress({
        current: i,
        total: totalSites,
        percent: Math.max(5, basePercent + Math.round(stepWeight * 0.15)),
        siteName: site.site_name,
        message: `${site.site_name} 사진 탐색 및 다운로드 준비 중... (${i + 1}/${totalSites})`,
      });

      // 다운로드 진행 피드백 시뮬레이션 인터벌 (백엔드 처리 시간 동안 프로그레스바가 부드럽게 상승)
      let stage = 0;
      const progressTimer = setInterval(() => {
        stage++;
        if (stage === 1) {
          setDownloadProgress((prev) => ({
            ...prev,
            percent: Math.min(95, basePercent + Math.round(stepWeight * 0.4)),
            message: `${site.site_name} Google Drive 사진 파일 수집 중...`,
          }));
        } else if (stage === 2) {
          setDownloadProgress((prev) => ({
            ...prev,
            percent: Math.min(95, basePercent + Math.round(stepWeight * 0.7)),
            message: `${site.site_name} 바탕화면 사진 폴더 생성 및 저장 중...`,
          }));
        } else if (stage >= 3) {
          setDownloadProgress((prev) => ({
            ...prev,
            percent: Math.min(98, basePercent + Math.round(stepWeight * 0.9)),
            message: `${site.site_name} 사진 파일 쓰기 마무리 중...`,
          }));
        }
      }, 350);

      try {
        const res = await apiClient.post('/api/photos/batch-download', {
          siteName: site.site_name,
          year: selectedYear,
          month: selectedMonth,
          selectedCategories: selectedCats,
        });

        const saved = res?.totalSaved || res?.data?.totalSaved || 0;
        totalSavedAll += saved;
      } catch (err) {
        console.warn(`[useSitePhotoExport] ${site.site_name} 다운로드 실패:`, err.message);
      } finally {
        clearInterval(progressTimer);
      }

      // 이 현장 완료 → 프로그래스 bar = (i+1)/total
      const completedPercent = Math.round(((i + 1) / totalSites) * 100);
      setDownloadProgress({
        current: i + 1,
        total: totalSites,
        percent: completedPercent,
        siteName: site.site_name,
        message: `${site.site_name} 다운로드 완료 (${i + 1}/${totalSites})`,
      });
    }

    setIsDownloading(false);
    setDownloadProgress({ current: 0, total: 0, percent: 0, siteName: '', message: '' });

    // 선택 현장 초기화
    deselectAllSites();
    setActiveSummary(null);

    // 완료 토스트 표시 → 3초 후 자동 사라짐
    setDownloadComplete({ totalSaved: totalSavedAll, siteCount: selectedSitesList.length });
    setTimeout(() => setDownloadComplete(null), 3500);
  }, [selectedSitesList, categories, selectedYear, selectedMonth]);

  return {
    selectedYear,
    setSelectedYear,
    selectedMonth,
    setSelectedMonth,
    selectedSiteIds,
    selectedSitesList,
    lastActiveSite,
    toggleSiteSelect,
    selectAllSites,
    deselectAllSites,
    searchTerm,
    setSearchTerm,
    loadingSummary,
    scanProgress,
    categories,
    toggleCategory,
    toggleAllCategories,
    activeSummary,
    executeDownload,
    isDownloading,
    downloadProgress,
    downloadComplete,
    refreshSummary: fetchActiveSummary,
  };
}
