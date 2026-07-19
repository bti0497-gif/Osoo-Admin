import React from 'react';
import { useGyeonggiMonthlyReportViewModel } from './useGyeonggiMonthlyReportViewModel';

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);
const YEARS = Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - i);

export default function GyeonggiMonthlyReportView() {
  const {
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
  } = useGyeonggiMonthlyReportViewModel();

  return (
    <div style={{ padding: '24px', maxWidth: 760, margin: '0 auto', fontFamily: 'sans-serif' }}>
      <h2 style={{ marginBottom: 8 }}>월운영보고서 출력</h2>
      <p style={{ marginTop: 0, marginBottom: 20, color: '#64748b', fontSize: 13 }}>
        템플릿: templates/gyeonggi/월운영보고서.xlsx
      </p>

      <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <label style={{ fontWeight: 600 }}>연도</label>
        <select value={year} onChange={(e) => setYear(Number(e.target.value))} style={selectStyle}>
          {YEARS.map((y) => (
            <option key={y} value={y}>{y}년</option>
          ))}
        </select>

        <label style={{ fontWeight: 600 }}>월</label>
        <select value={month} onChange={(e) => setMonth(Number(e.target.value))} style={selectStyle}>
          {MONTHS.map((m) => (
            <option key={m} value={m}>{m}월</option>
          ))}
        </select>

        <button onClick={loadSites} disabled={loadingState === 'loading'} style={btnPrimary}>
          {loadingState === 'loading' ? '현장 조회 중...' : '현장 조회'}
        </button>
      </div>

      {sites.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
            <span style={{ fontWeight: 600 }}>현장 선택 ({selectedSiteIds.size}/{sites.length})</span>
            <button onClick={selectAll} style={btnSmall}>전체 선택</button>
            <button onClick={deselectAll} style={btnSmall}>전체 해제</button>
          </div>

          <div style={{ border: '1px solid #ddd', borderRadius: 6, maxHeight: 320, overflowY: 'auto' }}>
            {sites.map((site) => {
              const checked = selectedSiteIds.has(String(site.site_id));
              return (
                <label
                  key={site.site_id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '10px 14px',
                    borderBottom: '1px solid #f0f0f0',
                    cursor: 'pointer',
                    backgroundColor: checked ? '#f0f9ff' : 'white',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleSite(String(site.site_id))}
                  />
                  <span style={{ fontSize: 14 }}>{site.site_name}</span>
                </label>
              );
            })}
          </div>
        </div>
      )}

      {loadingState === 'done' && sites.length === 0 && (
        <p style={{ color: '#888', marginBottom: 16 }}>해당 월에 데이터가 있는 현장이 없습니다.</p>
      )}

      {errorMsg && <p style={{ color: '#c00', marginBottom: 12 }}>경고: {errorMsg}</p>}
      {successMsg && <p style={{ color: '#080', marginBottom: 12 }}>완료: {successMsg}</p>}

      <button
        onClick={exportExcel}
        disabled={exporting || selectedSiteIds.size === 0}
        style={{ ...btnPrimary, padding: '10px 28px', fontSize: 15 }}
      >
        {exporting ? '엑셀 생성 중...' : `월운영보고서 출력 (${selectedSiteIds.size}개 현장)`}
      </button>
    </div>
  );
}

const selectStyle = {
  padding: '6px 10px',
  border: '1px solid #ccc',
  borderRadius: 4,
  fontSize: 14,
};

const btnPrimary = {
  padding: '7px 18px',
  backgroundColor: '#2563eb',
  color: 'white',
  border: 'none',
  borderRadius: 4,
  cursor: 'pointer',
  fontSize: 14,
};

const btnSmall = {
  padding: '4px 10px',
  backgroundColor: '#f3f4f6',
  color: '#333',
  border: '1px solid #ccc',
  borderRadius: 4,
  cursor: 'pointer',
  fontSize: 12,
};
