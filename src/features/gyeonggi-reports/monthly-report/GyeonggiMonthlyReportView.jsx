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
    <div style={{
      padding: '0 24px 20px 24px',
      maxWidth: 760,
      margin: '0 auto',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      boxSizing: 'border-box',
      overflow: 'hidden',
      fontFamily: 'sans-serif'
    }}>
      <div style={{ flexShrink: 0, paddingTop: '4px' }}>
        <h2 style={{ marginTop: 0, marginBottom: 4, fontSize: '22px', fontWeight: '800', color: '#1e3a8a' }}>월운영보고서 출력</h2>
        <p style={{ marginTop: 0, marginBottom: 14, color: '#64748b', fontSize: 13 }}>
          템플릿: templates/gyeonggi/월운영보고서.xlsx
        </p>

        <div style={{ display: 'flex', gap: 12, marginBottom: 14, alignItems: 'center', flexWrap: 'wrap' }}>
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
      </div>

      {sites.length > 0 && (
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', marginBottom: 12 }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 6, alignItems: 'center', flexShrink: 0 }}>
            <span style={{ fontWeight: 600 }}>현장 선택 ({selectedSiteIds.size}/{sites.length})</span>
            <button onClick={selectAll} style={btnSmall}>전체 선택</button>
            <button onClick={deselectAll} style={btnSmall}>전체 해제</button>
          </div>

          <div style={{ border: '1px solid #ddd', borderRadius: 6, flex: 1, minHeight: 0, overflowY: 'auto', backgroundColor: '#fff' }}>
            {sites.map((site) => {
              const checked = selectedSiteIds.has(String(site.site_id));
              return (
                <label
                  key={site.site_id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '8px 14px',
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
        <p style={{ color: '#888', marginBottom: 16, flexShrink: 0 }}>해당 월에 데이터가 있는 현장이 없습니다.</p>
      )}

      {errorMsg && <p style={{ color: '#c00', marginBottom: 10, flexShrink: 0, fontSize: 13 }}>경고: {errorMsg}</p>}
      {successMsg && <p style={{ color: '#080', marginBottom: 10, flexShrink: 0, fontSize: 13 }}>완료: {successMsg}</p>}

      <div style={{ flexShrink: 0 }}>
        <button
          onClick={exportExcel}
          disabled={exporting || selectedSiteIds.size === 0}
          style={{ ...btnPrimary, width: '100%', padding: '10px 28px', fontSize: 15, fontWeight: 700 }}
        >
          {exporting ? '엑셀 생성 중...' : `월운영보고서 출력 (${selectedSiteIds.size}개 현장)`}
        </button>
      </div>
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
