import React, { useEffect, useState } from 'react';
import { useWaterQualityList } from '../viewmodels/useWaterQualityList';

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 5 }, (_, i) => CURRENT_YEAR - i);
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

function formatDate(val) {
  if (!val) return '-';
  const s = typeof val === 'object' && val.value ? val.value : String(val);
  return s.slice(0, 10);
}

function formatDateTime(val) {
  if (!val) return '-';
  const s = typeof val === 'object' && val.value ? val.value : String(val);
  return s.replace('T', ' ').slice(0, 16);
}

export default function WaterQualityListView() {
  const {
    rows, loading, error,
    selectedIds, toggleSelect, toggleAll,
    year, setYear, month, setMonth,
    selectedSite, setSelectedSite,
    sites, fetchSites,
    fetchList,
    deleteSelected, deleteResult, setDeleteResult,
    downloading, downloadSelectedAsPdf, downloadSelectedImages,
  } = useWaterQualityList();

  useEffect(() => {
    fetchSites();
    fetchList(year, month, 'all');
  }, []);

  const allSelected = rows.length > 0 && selectedIds.size === rows.length;
  const hasSelection = selectedIds.size > 0;
  const [hoveredId, setHoveredId] = useState(null);

  return (
    <div style={{ padding: '20px', fontFamily: 'system-ui, sans-serif', height: '100%', display: 'flex', flexDirection: 'column', gap: '12px' }}>

      {/* 헤더 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontWeight: 700, fontSize: '15px', color: '#1e293b' }}>성적서 보기</span>
          <span style={{ fontSize: '12px', color: '#64748b', background: '#f1f5f9', padding: '2px 8px', borderRadius: '12px', fontWeight: 600 }}>
            {rows.length}건
          </span>
          {hasSelection && (
            <span style={{ fontSize: '12px', color: '#2563eb', background: '#eff6ff', padding: '2px 8px', borderRadius: '12px', fontWeight: 600 }}>
              {selectedIds.size}건 선택
            </span>
          )}
        </div>

        {/* 필터 + 버튼 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <select value={year} onChange={e => setYear(Number(e.target.value))} style={selectStyle}>
            {YEARS.map(y => <option key={y} value={y}>{y}년</option>)}
          </select>
          <select value={month} onChange={e => setMonth(Number(e.target.value))} style={selectStyle}>
            {MONTHS.map(m => <option key={m} value={m}>{m}월</option>)}
          </select>
          <select value={selectedSite} onChange={e => setSelectedSite(e.target.value)} style={{ ...selectStyle, minWidth: '160px' }}>
            <option value="all">전체 현장</option>
            {sites.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <button onClick={() => fetchList(year, month, selectedSite)} style={btnStyle('#2563eb')}>
            조회
          </button>
          <button
            onClick={downloadSelectedAsPdf}
            disabled={!hasSelection || downloading}
            style={btnStyle('#0891b2', !hasSelection || downloading)}
          >
            {downloading ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={spinnerStyle} />
                PDF 생성 중...
              </span>
            ) : 'PDF 다운로드'}
          </button>
          <button
            onClick={downloadSelectedImages}
            disabled={!hasSelection || downloading}
            style={btnStyle('#22c55e', !hasSelection || downloading)}
            title="선택된 항목의 원본 이미지를 개별적으로 다운로드합니다"
          >
            {downloading ? '다운로드 중...' : '이미지 다운로드'}
          </button>
          <button
            onClick={() => {
              if (window.confirm(`선택된 ${selectedIds.size}건을 삭제하시겠습니까?`)) deleteSelected();
            }}
            disabled={!hasSelection || loading}
            style={btnStyle('#dc2626', !hasSelection || loading)}
          >
            선택 삭제
          </button>
        </div>
      </div>

      {/* 안내 메시지 */}
      <div style={{ fontSize: '12px', color: '#64748b', background: '#fafafa', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '6px 12px' }}>
        ※ 최근 업로드된 데이터는 BigQuery 스트리밍 버퍼 처리 중에는 삭제되지 않습니다. 잠시 후(약 1시간) 다시 시도하세요.
        <br />※ 동일 현장·날짜 중복 데이터는 최신 1건만 표시됩니다.
      </div>

      {/* 결과 알림 */}
      {deleteResult && (
        <div style={{
          padding: '8px 14px', borderRadius: '6px', fontSize: '13px', fontWeight: 500,
          background: deleteResult.type === 'success' ? '#f0fdf4' : deleteResult.type === 'buffer' ? '#fffbeb' : '#fef2f2',
          color: deleteResult.type === 'success' ? '#166534' : deleteResult.type === 'buffer' ? '#92400e' : '#991b1b',
          border: `1px solid ${deleteResult.type === 'success' ? '#bbf7d0' : deleteResult.type === 'buffer' ? '#fde68a' : '#fecaca'}`,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span>{deleteResult.message}</span>
          <button onClick={() => setDeleteResult(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', color: '#94a3b8' }}>×</button>
        </div>
      )}

      {/* 다운로드 오버레이 */}
      {downloading && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          zIndex: 9999,
        }}>
          <div style={{
            background: '#fff', borderRadius: '12px', padding: '32px 48px',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
          }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '50%', border: '4px solid #e2e8f0', borderTopColor: '#2563eb', animation: 'spin 0.7s linear infinite' }} />
            <div style={{ fontSize: '15px', fontWeight: 600, color: '#1e293b' }}>다운로드 중...</div>
            <div style={{ fontSize: '12px', color: '#64748b' }}>{selectedIds.size}개 파일을 처리하고 있습니다.</div>
          </div>
        </div>
      )}

      {/* 에러 */}
      {error && (
        <div style={{ color: '#dc2626', fontSize: '13px', background: '#fef2f2', padding: '8px 12px', borderRadius: '6px' }}>
          오류: {error}
        </div>
      )}

      {/* 그리드 */}
      <div style={{ flex: 1, overflow: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead>
            <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
              <th style={thStyle('48px')}>
                <input type="checkbox" checked={allSelected} onChange={toggleAll} />
              </th>
              <th style={thStyle('150px')}>올린날짜</th>
              <th style={thStyle('100px')}>채수날짜</th>
              <th style={thStyle('90px')}>종류</th>
              <th style={thStyle()}>현장명</th>
              <th style={thStyle('200px')}>비고 (파일명)</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} style={emptyTd}>로딩 중...</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={6} style={emptyTd}>데이터가 없습니다.</td></tr>
            ) : (
              rows.map((row, idx) => {
                const checked = selectedIds.has(row.id);
                return (
                  <tr
                    key={row.id || idx}
                    onClick={() => toggleSelect(row.id)}
                    onMouseEnter={() => setHoveredId(row.id)}
                    onMouseLeave={() => setHoveredId(null)}
                    style={{
                      cursor: 'pointer',
                      background: checked ? '#dbeafe' : hoveredId === row.id ? '#f0f9ff' : idx % 2 === 1 ? '#f8fafc' : '#fff',
                      borderBottom: '1px solid #f1f5f9',
                      outline: checked ? '1px solid #93c5fd' : 'none',
                      transition: 'background 0.1s',
                    }}
                  >
                    <td style={tdStyle('center')}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleSelect(row.id)}
                        onClick={e => e.stopPropagation()}
                      />
                    </td>
                    <td style={tdStyle('center')}>{formatDateTime(row.uploaded_at)}</td>
                    <td style={tdStyle('center')}>{formatDate(row.report_date)}</td>
                    <td style={tdStyle('center')}>
                      <span style={{
                        padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 600,
                        background: row.category === 'mlss' ? '#f0fdf4' : '#eff6ff',
                        color: row.category === 'mlss' ? '#15803d' : '#1d4ed8',
                      }}>
                        {row.category || '-'}
                      </span>
                    </td>
                    <td style={tdStyle()}>{row.site_name || '-'}</td>
                    <td style={{ ...tdStyle(), color: '#94a3b8', fontSize: '11px', fontFamily: 'monospace' }}>
                      {row.drive_file_name || row.source_pdf_name || '-'}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const spinnerStyle = {
  width: '14px', height: '14px', borderRadius: '50%',
  border: '2px solid rgba(255,255,255,0.4)',
  borderTopColor: '#fff',
  animation: 'spin 0.7s linear infinite',
  display: 'inline-block',
  flexShrink: 0,
};

if (!document.getElementById('wq-spin-style')) {
  const s = document.createElement('style');
  s.id = 'wq-spin-style';
  s.textContent = '@keyframes spin { to { transform: rotate(360deg); } }';
  document.head.appendChild(s);
}

const selectStyle = {
  height: '32px', border: '1px solid #cbd5e1', borderRadius: '6px',
  padding: '0 8px', fontSize: '13px', color: '#334155', background: '#fff',
};

const btnStyle = (bg, disabled = false) => ({
  height: '32px', padding: '0 14px', borderRadius: '6px', fontSize: '13px',
  fontWeight: 600, border: 'none', cursor: disabled ? 'not-allowed' : 'pointer',
  background: disabled ? '#e2e8f0' : bg, color: disabled ? '#94a3b8' : '#fff',
  transition: 'opacity 0.15s',
});

const thStyle = (width) => ({
  padding: '10px 12px', textAlign: 'center', fontSize: '12px', fontWeight: 700,
  color: '#475569', whiteSpace: 'nowrap', position: 'sticky', top: 0, zIndex: 1,
  background: '#f8fafc', ...(width ? { width } : {}),
});

const tdStyle = (align = 'left') => ({
  padding: '9px 12px', textAlign: align, verticalAlign: 'middle', whiteSpace: 'nowrap',
});

const emptyTd = {
  padding: '40px', textAlign: 'center', color: '#94a3b8', fontSize: '14px',
};
