import { useCallback, useState } from 'react';
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

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `월운영보고서_${year}년${String(month).padStart(2, '0')}월.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

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
