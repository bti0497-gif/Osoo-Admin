import { useState, useCallback } from 'react';
import { MonthlyReportModel } from './MonthlyReportModel';

const currentDate = new Date();

export function useMonthlyReportViewModel() {
  const [year,  setYear]  = useState(currentDate.getFullYear());
  const [month, setMonth] = useState(currentDate.getMonth() + 1);

  const [sites,          setSites]          = useState([]);
  const [selectedSiteIds, setSelectedSiteIds] = useState(new Set());
  const [templatePath,   setTemplatePath]   = useState('');

  const [loadingState, setLoadingState] = useState('idle'); // idle | loading | done | error
  const [exporting,    setExporting]    = useState(false);
  const [errorMsg,     setErrorMsg]     = useState('');
  const [successMsg,   setSuccessMsg]   = useState('');

  const loadSites = useCallback(async () => {
    setLoadingState('loading');
    setErrorMsg('');
    setSites([]);
    setSelectedSiteIds(new Set());
    try {
      const res = await MonthlyReportModel.getSites(year, month);
      if (res.success) {
        setSites(res.sites || []);
        setSelectedSiteIds(new Set((res.sites || []).map(s => s.site_id)));
        setLoadingState('done');
      } else {
        setErrorMsg(res.message || '현장 목록 로드 실패');
        setLoadingState('error');
      }
    } catch (err) {
      setErrorMsg(err.message);
      setLoadingState('error');
    }
  }, [year, month]);

  const toggleSite = useCallback((siteId) => {
    setSelectedSiteIds(prev => {
      const next = new Set(prev);
      if (next.has(siteId)) next.delete(siteId);
      else next.add(siteId);
      return next;
    });
  }, []);

  const selectAll   = useCallback(() => setSelectedSiteIds(new Set(sites.map(s => s.site_id))), [sites]);
  const deselectAll = useCallback(() => setSelectedSiteIds(new Set()), []);

  const exportExcel = useCallback(async () => {
    if (!templatePath) { setErrorMsg('템플릿 파일 경로를 입력하세요.'); return; }
    const selected = sites.filter(s => selectedSiteIds.has(s.site_id));
    if (selected.length === 0) { setErrorMsg('내보낼 현장을 선택하세요.'); return; }

    setExporting(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const blob = await MonthlyReportModel.exportExcel(
        year, month,
        selected.map(s => ({ siteId: s.site_id, siteName: s.site_name })),
        templatePath
      );

      // 브라우저 다운로드 트리거
      const url = URL.createObjectURL(blob);
      const a   = document.createElement('a');
      a.href     = url;
      a.download = `월운영일지_${year}년${String(month).padStart(2, '0')}월.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setSuccessMsg(`${selected.length}개 현장 Excel 생성 완료`);
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setExporting(false);
    }
  }, [year, month, sites, selectedSiteIds, templatePath]);

  return {
    year, setYear,
    month, setMonth,
    sites,
    selectedSiteIds,
    toggleSite, selectAll, deselectAll,
    templatePath, setTemplatePath,
    loadingState,
    exporting,
    errorMsg,
    successMsg,
    loadSites,
    exportExcel,
  };
}
