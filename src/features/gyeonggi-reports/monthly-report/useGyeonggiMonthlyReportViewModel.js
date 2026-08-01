import { useCallback, useState, useEffect } from 'react';
import { GyeonggiMonthlyReportModel } from './GyeonggiMonthlyReportModel';

const currentDate = new Date();

export function useGyeonggiMonthlyReportViewModel() {
  const [year, setYear] = useState(currentDate.getFullYear());
  const [month, setMonth] = useState(currentDate.getMonth() + 1);

  const [sites, setSites] = useState([]);
  const [selectedSiteIds, setSelectedSiteIds] = useState(new Set());

  const [loadingState, setLoadingState] = useState('idle');
  const [exporting, setExporting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const loadSites = useCallback(async () => {
    setLoadingState('loading');
    setErrorMsg('');
    setSuccessMsg('');
    setSites([]);
    setSelectedSiteIds(new Set());

    try {
      const res = await GyeonggiMonthlyReportModel.getSites(year, month);
      const nextSites = Array.isArray(res.sites) ? res.sites : [];
      setSites(nextSites);
      setSelectedSiteIds(new Set(nextSites.map((site) => String(site.site_id))));
      setLoadingState('done');
    } catch (err) {
      setErrorMsg(err.message || '현장 목록 조회 실패');
      setLoadingState('error');
    }
  }, [year, month]);

  useEffect(() => {
    loadSites();
  }, [loadSites]);

  const toggleSite = useCallback((siteId) => {
    setSelectedSiteIds((prev) => {
      const next = new Set(prev);
      if (next.has(siteId)) next.delete(siteId);
      else next.add(siteId);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedSiteIds(new Set(sites.map((site) => String(site.site_id))));
  }, [sites]);

  const deselectAll = useCallback(() => {
    setSelectedSiteIds(new Set());
  }, []);

  const exportExcel = useCallback(async () => {
    const selected = sites.filter((site) => selectedSiteIds.has(String(site.site_id)));
    if (selected.length === 0) {
      setErrorMsg('출력할 현장을 최소 1개 이상 선택해 주세요.');
      return;
    }

    setExporting(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const blob = await GyeonggiMonthlyReportModel.exportExcel(
        year,
        month,
        selected.map((site) => ({ siteId: site.site_id, siteName: site.site_name }))
      );

      const cleanSiteName = (name) => String(name || '').replace(/[\\/:*?"<>|]/g, '_').trim();
      let fileName = '';
      if (selected.length === 1) {
        fileName = `${cleanSiteName(selected[0].site_name)}_${year}년${String(month).padStart(2, '0')}월_월운영보고서.xlsx`;
      } else {
        fileName = `${cleanSiteName(selected[0].site_name)}_외_${selected.length - 1}개소_${year}년${String(month).padStart(2, '0')}월_월운영보고서.xlsx`;
      }

      if (window.electronAPI && window.electronAPI.saveFileWithDialog) {
        // 일렉트론 환경: 사용자가 원하는 위치로 '다른 이름으로 저장' 다이얼로그를 띄우고 지정 폴더 저장 후 엑셀 열기
        const arrayBuffer = await blob.arrayBuffer();
        const saveRes = await window.electronAPI.saveFileWithDialog(fileName, arrayBuffer);
        if (saveRes.canceled) {
          setSuccessMsg('보고서 출력이 취소되었습니다.');
          return;
        }
        if (saveRes.error) {
          throw new Error(saveRes.error);
        }
      } else {
        // 웹 브라우저 환경: 다운로드
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }

      setSuccessMsg(`${selected.length}개 현장 월운영보고서 출력 완료`);
    } catch (err) {
      setErrorMsg(err.message || '월운영보고서 출력 실패');
    } finally {
      setExporting(false);
    }
  }, [year, month, sites, selectedSiteIds]);

  return {
    year,
    setYear,
    month,
    setMonth,
    sites,
    selectedSiteIds,
    toggleSite,
    selectAll,
    deselectAll,
    loadingState,
    exporting,
    errorMsg,
    successMsg,
    loadSites,
    exportExcel,
  };
}
