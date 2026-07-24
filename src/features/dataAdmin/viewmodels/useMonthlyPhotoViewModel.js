import { useState, useEffect, useMemo, useCallback } from 'react';
import { apiClient } from '../../../core/api';

export function useMonthlyPhotoViewModel(currentUser) {
  const [activeTab, setActiveTab] = useState('월정산 사진받기'); // '월정산 사진받기' | '임시'

  const currentDate = new Date();
  const [year, setYear] = useState(currentDate.getFullYear());
  const [month, setMonth] = useState(currentDate.getMonth() + 1);

  const [siteList, setSiteList] = useState([]);
  const [loadingSites, setLoadingSites] = useState(false);
  const [searchFilter, setSearchFilter] = useState('');
  const [selectedSite, setSelectedSite] = useState(null);

  const [photoSummary, setPhotoSummary] = useState(null);
  const [loadingSummary, setLoadingSummary] = useState(false);

  const [selectedCategories, setSelectedCategories] = useState([
    'testPhoto',
    'sludge',
    'cleaningCertificate',
    'medicineIn',
    'kitIn',
  ]);

  const [targetDirectory, setTargetDirectory] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [downloadStatus, setDownloadStatus] = useState(null); // { type: 'info'|'success'|'error', message: '' }

  // 현장 목록 로드 (구글시트 캐시 / API)
  const fetchSites = useCallback(async () => {
    setLoadingSites(true);
    try {
      const res = await apiClient.get('/api/site-master');
      let sites = [];
      if (res?.success && Array.isArray(res.sites)) {
        sites = res.sites;
      } else if (Array.isArray(res)) {
        sites = res;
      }

      // 현장명 기준 한국어 사전순 정렬
      const sorted = [...sites].sort((a, b) =>
        String(a.site_name || a.siteName || '').localeCompare(String(b.site_name || b.siteName || ''), 'ko')
      );
      setSiteList(sorted);

      if (sorted.length > 0 && !selectedSite) {
        setSelectedSite(sorted[0]);
      }
    } catch (err) {
      console.error('[useMonthlyPhotoViewModel] site-master load error:', err);
    } finally {
      setLoadingSites(false);
    }
  }, [selectedSite]);

  useEffect(() => {
    fetchSites();
  }, [fetchSites]);

  // 필터링된 현장 목록
  const filteredSites = useMemo(() => {
    const term = searchFilter.trim().toLowerCase();
    if (!term) return siteList;
    return siteList.filter((s) => {
      const name = String(s.site_name || s.siteName || '').toLowerCase();
      return name.includes(term);
    });
  }, [siteList, searchFilter]);

  // 선택된 현장 및 연월 사진 요약 조회
  const fetchPhotoSummary = useCallback(async (siteName, y, m) => {
    if (!siteName) return;
    setLoadingSummary(true);
    setPhotoSummary(null);
    setDownloadStatus(null);
    try {
      const res = await apiClient.get('/api/photos/monthly-summary', {
        params: { siteName, year: y, month: m },
      });
      if (res?.success && res.summary) {
        setPhotoSummary(res.summary);
      } else {
        setPhotoSummary(null);
      }
    } catch (err) {
      console.error('[useMonthlyPhotoViewModel] summary fetch error:', err);
      setPhotoSummary(null);
    } finally {
      setLoadingSummary(false);
    }
  }, []);

  useEffect(() => {
    const siteName = selectedSite?.site_name || selectedSite?.siteName;
    if (siteName && activeTab === '월정산 사진받기') {
      fetchPhotoSummary(siteName, year, month);
    }
  }, [selectedSite, year, month, activeTab, fetchPhotoSummary]);

  // 카테고리 체크 토글
  const toggleCategory = (catKey) => {
    setSelectedCategories((prev) => {
      if (prev.includes(catKey)) {
        return prev.filter((k) => k !== catKey);
      }
      return [...prev, catKey];
    });
  };

  // 공통 폴더 선택 다이얼로그 (일렉트론 API)
  const handleSelectFolder = async () => {
    try {
      const electronAPI = window.electronAPI || window.electron;
      if (electronAPI && typeof electronAPI.selectFolder === 'function') {
        const folderPath = await electronAPI.selectFolder();
        if (folderPath) {
          setTargetDirectory(folderPath);
          setDownloadStatus({ type: 'info', message: `저장 폴더가 선택되었습니다: ${folderPath}` });
        }
      } else {
        setDownloadStatus({
          type: 'error',
          message: '일렉트론 환경에서만 폴더 선택 창을 열 수 있습니다. (브라우저 지원 안 함)',
        });
      }
    } catch (err) {
      setDownloadStatus({ type: 'error', message: `폴더 선택 오류: ${err.message}` });
    }
  };

  // 바탕화면 일괄 다운로드 실행
  const handleExecuteDownload = async () => {
    const siteName = selectedSite?.site_name || selectedSite?.siteName;
    if (!siteName) {
      setDownloadStatus({ type: 'error', message: '현장을 먼저 선택해 주세요.' });
      return;
    }
    if (selectedCategories.length === 0) {
      setDownloadStatus({ type: 'error', message: '다운로드할 사진 카테고리를 최소 1개 이상 선택해 주세요.' });
      return;
    }

    setDownloading(true);
    setDownloadStatus({ type: 'info', message: '바탕화면으로 사진 수집 및 저장 작업을 진행 중입니다...' });

    try {
      const res = await apiClient.post('/api/photos/batch-download', {
        siteName,
        year,
        month,
        selectedCategories,
        targetDirectory: targetDirectory || null,
      });

      if (res?.success) {
        setDownloadStatus({
          type: 'success',
          message: `성공적으로 총 ${res.totalSaved}개의 사진 파일이 바탕화면에 저장되었습니다!\n저장 경로: ${res.savedFolderPath}`,
        });
      } else {
        setDownloadStatus({ type: 'error', message: res?.message || '사진 일괄 저장 실패' });
      }
    } catch (err) {
      setDownloadStatus({ type: 'error', message: `다운로드 실행 중 오류 발생: ${err.message}` });
    } finally {
      setDownloading(false);
    }
  };

  return {
    activeTab,
    setActiveTab,
    year,
    setYear,
    month,
    setMonth,
    siteList,
    filteredSites,
    loadingSites,
    searchFilter,
    setSearchFilter,
    selectedSite,
    setSelectedSite,
    photoSummary,
    loadingSummary,
    selectedCategories,
    toggleCategory,
    targetDirectory,
    setTargetDirectory,
    downloading,
    downloadStatus,
    handleSelectFolder,
    handleExecuteDownload,
    refreshSummary: () => {
      const siteName = selectedSite?.site_name || selectedSite?.siteName;
      if (siteName) fetchPhotoSummary(siteName, year, month);
    },
  };
}
