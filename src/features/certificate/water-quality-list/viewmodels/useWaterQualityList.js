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
    setSites([]);
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
      if (!json.success) throw new Error(json.error || json.message);
      const nextRows = json.rows || [];
      setRows(nextRows);
      setSites((prev) => {
        const merged = new Set(prev);
        nextRows.forEach((row) => {
          const name = String(row.site_name || '').trim();
          if (name) merged.add(name);
        });
        return Array.from(merged).sort((a, b) => a.localeCompare(b, 'ko'));
      });
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
      const res = await fetch(`${getApiBase()}/api/certificates/bulk-delete-by-ids`, {
        method: 'POST',
        headers: { ...adminHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileIds: ids }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message);
      const deletedCount = Number(json.deleted?.driveFiles || 0);
      const failedCount = Array.isArray(json.failed) ? json.failed.length : 0;
      setDeleteResult({
        type: failedCount > 0 ? 'buffer' : 'success',
        message: `${deletedCount}건 삭제되었습니다.${failedCount > 0 ? ` (${failedCount}건 실패)` : ''}`,
      });
      await fetchList();
    } catch (err) {
      setDeleteResult({ type: 'error', message: err.message });
    } finally {
      setLoading(false);
    }
  }, [selectedIds, fetchList]);

  const downloadSelectedAsPdf = useCallback(async () => {
    const selected = rows.filter(r => selectedIds.has(r.id));
    const driveFileIds = selected.map(r => r.drive_file_id).filter(Boolean);
    const driveFileNames = selected.map(r => r.drive_file_name).filter(Boolean);
    if (driveFileIds.length === 0 && driveFileNames.length === 0) return;

    const categories = [...new Set(selected.map((r) => {
      const raw = String(r.category || '').toLowerCase();
      return raw.includes('mlss') ? 'mlss' : '성적서';
    }).filter(Boolean))];
    const categoryPart = categories.join('+') || '성적서';
    const siteNames = selected.map(r => r.site_name).filter(Boolean);
    const sitesPart = siteNames.length === 1
      ? siteNames[0]
      : `${siteNames[0]}_외${siteNames.length - 1}건`;
    const dates = selected
      .map(r => typeof r.report_date === 'object' && r.report_date?.value ? r.report_date.value : String(r.report_date || ''))
      .map(s => s.slice(0, 10).replace(/-/g, ''))
      .filter(Boolean)
      .sort();
    const datePart = dates.length === 0 ? '' :
      dates[0] === dates[dates.length - 1] ? dates[0] : `${dates[0]}-${dates[dates.length - 1]}`;
    const pdfFileName = selected.length === 1 && selected[0].drive_file_name
      ? selected[0].drive_file_name.replace(/\.[^.]+$/, '.pdf')
      : `${categoryPart}_${datePart}_${sitesPart}.pdf`;

    setDownloading(true);
    try {
      const res = await fetch(`${getApiBase()}/api/certificates/water-quality-download-pdf`, {
        method: 'POST',
        headers: { ...adminHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          drive_file_ids: driveFileIds,
          drive_file_names: driveFileNames,
          pdf_file_name: pdfFileName,
        }),
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

  /**
   * 선택된 항목의 이미지를 개별적으로 다운로드
   * 각 이미지를 기본 다운로드 폴더에 저장 (서버를 통해 프록시)
   */
  const downloadSelectedImages = useCallback(async () => {
    const selected = rows.filter(r => selectedIds.has(r.id));
    if (selected.length === 0) return;

    setDownloading(true);
    let downloadedCount = 0;
    let failedCount = 0;

    try {
      for (const row of selected) {
        if (!row.drive_file_id && !row.drive_file_name) {
          failedCount++;
          continue;
        }

        try {
          const res = await fetch(`${getApiBase()}/api/certificates/water-quality-download-image`, {
            method: 'POST',
            headers: { ...adminHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              drive_file_id: row.drive_file_id, 
              drive_file_name: row.drive_file_name || row.source_pdf_name 
            }),
          });

          if (!res.ok) {
            console.warn(`[downloadImages] 실패 ID: ${row.drive_file_id}`);
            failedCount++;
            continue;
          }

          const blob = await res.blob();
          const arrayBuffer = await blob.arrayBuffer();
          const buffer = new Uint8Array(arrayBuffer);
          const saveName = row.drive_file_name || row.source_pdf_name || `download_${row.drive_file_id}.jpg`;
          
          if (window.electronAPI?.saveFileToDownloads) {
            await window.electronAPI.saveFileToDownloads(saveName, buffer);
          } else {
            // Fallback: 브라우저 다운로드
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = saveName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
          }

          downloadedCount++;

          // 다운로드 간 약간의 지연
          await new Promise(resolve => setTimeout(resolve, 500));
        } catch (err) {
          console.error(`[downloadImages] 오류 ID: ${row.drive_file_id}`, err);
          failedCount++;
        }
      }

      const message = `이미지 다운로드 완료: ${downloadedCount}건 성공${failedCount > 0 ? `, ${failedCount}건 실패` : ''}`;
      setDeleteResult({ type: 'success', message });
    } catch (err) {
      setDeleteResult({ type: 'error', message: `이미지 다운로드 실패: ${err.message}` });
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
    downloading, downloadSelectedAsPdf, downloadSelectedImages,
  };
}
