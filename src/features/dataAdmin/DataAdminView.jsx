import React from 'react';
import { useDataAdminViewModel } from './useDataAdminViewModel';

const cellText = (value) => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
};

const DataAdminView = ({ currentUser }) => {
  const vm = useDataAdminViewModel(currentUser);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '1rem', gap: '1rem', background: '#fff' }}>
      <section style={{ display: 'grid', gridTemplateColumns: '220px repeat(5, minmax(120px, 1fr)) auto auto', gap: '0.75rem', alignItems: 'end' }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontWeight: 700 }}>
          테이블
          <select value={vm.selectedTable} onChange={(event) => vm.setSelectedTable(event.target.value)} style={{ height: 36 }}>
            {vm.tables.map((table) => (
              <option key={table.id} value={table.id}>{table.label}</option>
            ))}
          </select>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontWeight: 700 }}>
          현장명
          <input value={vm.filters.siteName} onChange={(event) => vm.updateFilter('siteName', event.target.value)} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontWeight: 700 }}>
          현장 ID
          <input value={vm.filters.siteId} onChange={(event) => vm.updateFilter('siteId', event.target.value)} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontWeight: 700 }}>
          시작일
          <input type="date" value={vm.filters.dateFrom} onChange={(event) => vm.updateFilter('dateFrom', event.target.value)} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontWeight: 700 }}>
          종료일
          <input type="date" value={vm.filters.dateTo} onChange={(event) => vm.updateFilter('dateTo', event.target.value)} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontWeight: 700 }}>
          통합검색
          <input value={vm.filters.search} onChange={(event) => vm.updateFilter('search', event.target.value)} placeholder="문자 컬럼 검색" />
        </label>
        <button onClick={vm.refresh} disabled={vm.loading} style={{ height: 36 }}>조회</button>
        <button onClick={vm.resetFilters} disabled={vm.loading} style={{ height: 36 }}>초기화</button>
      </section>

      {vm.error && (
        <div style={{ padding: '0.75rem', border: '1px solid #fecaca', background: '#fef2f2', color: '#991b1b', borderRadius: 8 }}>
          {vm.error}
        </div>
      )}

      <section style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <strong>{vm.tableMeta?.label || '테이블'} 목록</strong>
        <span style={{ color: '#64748b', fontSize: '0.9rem' }}>{vm.rows.length}건 표시</span>
      </section>

      <div style={{ flex: 1, overflow: 'auto', border: '1px solid #e2e8f0', borderRadius: 10 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
          <thead style={{ position: 'sticky', top: 0, background: '#f8fafc', zIndex: 1 }}>
            <tr>
              <th style={{ padding: '0.5rem', borderBottom: '1px solid #e2e8f0', width: 120 }}>작업</th>
              {vm.columns.map((column) => (
                <th key={column} style={{ padding: '0.5rem', borderBottom: '1px solid #e2e8f0', textAlign: 'left', whiteSpace: 'nowrap' }}>
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {vm.rows.map((row) => (
              <tr key={row.__rowKey}>
                <td style={{ padding: '0.5rem', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>
                  <button onClick={() => vm.startEdit(row)} disabled={vm.loading}>수정</button>
                  <button onClick={() => vm.deleteRow(row)} disabled={vm.loading} style={{ marginLeft: 6 }}>삭제</button>
                </td>
                {vm.columns.map((column) => (
                  <td key={column} style={{ padding: '0.5rem', borderBottom: '1px solid #e2e8f0', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={cellText(row[column])}>
                    {cellText(row[column])}
                  </td>
                ))}
              </tr>
            ))}
            {!vm.rows.length && (
              <tr>
                <td colSpan={vm.columns.length + 1} style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>
                  조회된 데이터가 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {vm.editingRow && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
          <div style={{ width: 'min(900px, 90vw)', height: 'min(720px, 85vh)', background: '#fff', borderRadius: 12, padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <strong>행 수정(JSON)</strong>
            <textarea value={vm.editText} onChange={(event) => vm.setEditText(event.target.value)} style={{ flex: 1, fontFamily: 'Consolas, monospace', fontSize: '0.9rem' }} />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
              <button onClick={vm.cancelEdit}>취소</button>
              <button onClick={vm.saveEdit} disabled={vm.loading}>저장</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DataAdminView;
