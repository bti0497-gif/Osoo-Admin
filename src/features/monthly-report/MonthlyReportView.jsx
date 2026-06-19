import React from 'react';
import { useMonthlyReportViewModel } from './useMonthlyReportViewModel';

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);
const YEARS  = Array.from({ length: 5 },  (_, i) => new Date().getFullYear() - i);

export function MonthlyReportView() {
  const {
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
  } = useMonthlyReportViewModel();

  return (
    <div style={{ padding: '24px', maxWidth: 720, margin: '0 auto', fontFamily: 'sans-serif' }}>
      <h2 style={{ marginBottom: 24 }}>월운영일지 Excel 내보내기</h2>

      {/* 연/월 선택 */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center' }}>
        <label style={{ fontWeight: 600 }}>연도</label>
        <select value={year} onChange={e => setYear(Number(e.target.value))} style={selectStyle}>
          {YEARS.map(y => <option key={y} value={y}>{y}년</option>)}
        </select>

        <label style={{ fontWeight: 600 }}>월</label>
        <select value={month} onChange={e => setMonth(Number(e.target.value))} style={selectStyle}>
          {MONTHS.map(m => <option key={m} value={m}>{m}월</option>)}
        </select>

        <button onClick={loadSites} disabled={loadingState === 'loading'} style={btnPrimary}>
          {loadingState === 'loading' ? '조회 중...' : '현장 조회'}
        </button>
      </div>

      {/* 템플릿 경로 */}
      <div style={{ marginBottom: 16 }}>
        <label style={{ fontWeight: 600, display: 'block', marginBottom: 4 }}>
          양식 파일 경로 (월운영일지.xlsx)
        </label>
        <input
          type="text"
          value={templatePath}
          onChange={e => setTemplatePath(e.target.value)}
          placeholder="예: C:\Users\ASUS\Documents\양식들\월운영일지.xlsx"
          style={{ width: '100%', padding: '8px 10px', border: '1px solid #ccc', borderRadius: 4, fontSize: 13, boxSizing: 'border-box' }}
        />
      </div>

      {/* 현장 목록 */}
      {sites.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
            <span style={{ fontWeight: 600 }}>현장 선택 ({selectedSiteIds.size}/{sites.length})</span>
            <button onClick={selectAll}   style={btnSmall}>전체 선택</button>
            <button onClick={deselectAll} style={btnSmall}>전체 해제</button>
          </div>

          <div style={{ border: '1px solid #ddd', borderRadius: 6, maxHeight: 300, overflowY: 'auto' }}>
            {sites.map(site => (
              <label
                key={site.site_id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 14px',
                  borderBottom: '1px solid #f0f0f0',
                  cursor: 'pointer',
                  backgroundColor: selectedSiteIds.has(site.site_id) ? '#f0f7ff' : 'white',
                }}
              >
                <input
                  type="checkbox"
                  checked={selectedSiteIds.has(site.site_id)}
                  onChange={() => toggleSite(site.site_id)}
                />
                <span style={{ fontSize: 14 }}>{site.site_name}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {loadingState === 'done' && sites.length === 0 && (
        <p style={{ color: '#888', marginBottom: 16 }}>해당 월에 데이터가 있는 현장이 없습니다.</p>
      )}

      {/* 에러/성공 메시지 */}
      {errorMsg   && <p style={{ color: '#c00',   marginBottom: 12 }}>⚠ {errorMsg}</p>}
      {successMsg && <p style={{ color: '#080',   marginBottom: 12 }}>✓ {successMsg}</p>}

      {/* 내보내기 버튼 */}
      <button
        onClick={exportExcel}
        disabled={exporting || selectedSiteIds.size === 0 || !templatePath}
        style={{ ...btnPrimary, padding: '10px 28px', fontSize: 15 }}
      >
        {exporting ? 'Excel 생성 중...' : `Excel 내보내기 (${selectedSiteIds.size}개 현장)`}
      </button>
    </div>
  );
}

const selectStyle = {
  padding: '6px 10px', border: '1px solid #ccc', borderRadius: 4, fontSize: 14,
};
const btnPrimary = {
  padding: '7px 18px', backgroundColor: '#2563eb', color: 'white',
  border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 14,
};
const btnSmall = {
  padding: '4px 10px', backgroundColor: '#f3f4f6', color: '#333',
  border: '1px solid #ccc', borderRadius: 4, cursor: 'pointer', fontSize: 12,
};
