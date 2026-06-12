import { useState, useCallback } from 'react';
import { getApiBase } from '../../../../core/api/serverConfig';

const adminHeaders = () => ({
  'x-user-role': 'super_admin',
  'x-user-name': 'admin',
});

export function useWaterQualityList() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [selectedSite, setSelectedSite] = useState('all');
  const [sites, setSites] = useState([]);
  const [deleteResult, setDeleteResult] = useState(null);
  const [downloading, setDownloading] = useState(false);

  const fetchSites = useCallback(async () => {
    try {
      const res = await fetch(`${getApiBase()}/api/certificates/water-quality/sites`, {
        headers: adminHeaders(),
      });
      const json = await res.json();
      setSites(json.sites || []);
    } catch {}
  }, []);

  const fetchList = useCallback(async (y, m, site) => {
    setLoading(true);
    setError(null);
    setSelectedIds(new Set());
    try {
      const params = new URLSearchParams({ year: y ?? year, month: m ?? month });
      const siteFilter = site ?? selectedSite;
      if (siteFilter && siteFilter !== 'all') params.set('siteName', siteFilter);
      const res = await fetch(`${getApiBase()}/api/certificates/water-quality-list?${params}`, {
        headers: adminHeaders(),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message);
      setRows(json.rows || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [year, month, selectedSite]);

  const toggleSelect = useCallback((id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    setSelectedIds(prev =>
      prev.size === rows.length ? new Set() : new Set(rows.map(r => r.id))
    );
  }, [rows]);

  const deleteSelected = useCallback(async () => {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    setLoading(true);
    setDeleteResult(null);
    try {
      const res = await fetch(`${getApiBase()}/api/certificates/water-quality-rows`, {
        method: 'DELETE',
        headers: { ...adminHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      });
      const json = await res.json();
      if (json.streamingBuffer) {
        setDeleteResult({ type: 'buffer', message: json.message });
        return;
      }
      if (!json.success) throw new Error(json.message);
      setDeleteResult({ type: 'success', message: `${json.deleted}건 삭제되었습니다.` });
      await fetchList();
    } catch (err) {
      setDeleteResult({ type: 'error', message: err.message });
    } finally {
      setLoading(false);
    }
  }, [selectedIds, fetchList]);

  const downloadSelectedAsPdf = useCallback(async () => {
    const selected = rows.filter(r => selectedIds.has(r.id));
    const driveFileNames = selected.map(r => r.drive_file_name).filter(Boolean);
    if (driveFileNames.length === 0) return;

    // 파일명 생성: {category}_{채수날짜}_{현장명_외N개}.pdf
    const categories = [...new Set(selected.map(r => r.category).filter(Boolean))];
    const categoryPart = categories.join('·') || '성적서';
    const siteNames = selected.map(r => r.site_name).filter(Boolean);
    const sitesPart = siteNames.length === 1
      ? siteNames[0]
      : `${siteNames[0]}_외${siteNames.length - 1}개`;
    const dates = selected
      .map(r => typeof r.report_date === 'object' && r.report_date?.value ? r.report_date.value : String(r.report_date || ''))
      .map(s => s.slice(0, 10).replace(/-/g, ''))
      .filter(Boolean)
      .sort();
    const datePart = dates.length === 0 ? '' :
      dates[0] === dates[dates.length - 1] ? dates[0] : `${dates[0]}-${dates[dates.length - 1]}`;
    const pdfFileName = `${categoryPart}_${datePart}_${sitesPart}.pdf`;

    setDownloading(true);
    try {
      const res = await fetch(`${getApiBase()}/api/certificates/water-quality-download-pdf`, {
        method: 'POST',
        headers: { ...adminHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ drive_file_names: driveFileNames, pdf_file_name: pdfFileName }),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.message || '다운로드 실패');
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = pdfFileName;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setDeleteResult({ type: 'error', message: err.message });
    } finally {
      setDownloading(false);
    }
  }, [rows, selectedIds]);

  return {
    rows, loading, error,
    selectedIds, toggleSelect, toggleAll,
    year, setYear, month, setMonth,
    selectedSite, setSelectedSite,
    sites, fetchSites,
    fetchList,
    deleteSelected, deleteResult, setDeleteResult,
    downloading, downloadSelectedAsPdf,
  };
}
