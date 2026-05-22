import React from 'react';

/**
 * 공통 데이터 테이블 위젯
 * @param {Array} columns - { key, label, align?, width?, render? }
 * @param {Array} data - 데이터 배열
 * @param {string} emptyText - 데이터 없을 때 표시 텍스트
 * @param {number} maxHeight - 최대 높이 (스크롤)
 * @param {Function} onRowClick - 행 클릭 핸들러
 */
export function DataTable({ 
  columns = [], 
  data = [], 
  emptyText = '데이터가 없습니다.',
  maxHeight,
  onRowClick,
  loading = false
}) {
  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>
        <div className="spinner" style={{ margin: '0 auto 12px' }} />
        데이터 로딩 중...
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8', background: '#f8fafc', borderRadius: '8px' }}>
        {emptyText}
      </div>
    );
  }

  const containerStyle = maxHeight ? { maxHeight, overflow: 'auto' } : {};

  return (
    <div style={containerStyle}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #e2e8f0', background: '#f8fafc' }}>
            {columns.map((col) => (
              <th
                key={col.key}
                style={{
                  padding: '12px',
                  textAlign: col.align || 'left',
                  fontWeight: 600,
                  color: '#475569',
                  width: col.width,
                  whiteSpace: 'nowrap',
                }}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, rowIndex) => (
            <tr
              key={rowIndex}
              onClick={() => onRowClick?.(row, rowIndex)}
              style={{
                borderBottom: '1px solid #f1f5f9',
                cursor: onRowClick ? 'pointer' : 'default',
                background: rowIndex % 2 === 0 ? '#fff' : '#fafafa',
              }}
              onMouseEnter={(e) => {
                if (onRowClick) e.currentTarget.style.background = '#f1f5f9';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = rowIndex % 2 === 0 ? '#fff' : '#fafafa';
              }}
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  style={{
                    padding: '12px',
                    textAlign: col.align || 'left',
                    color: '#334155',
                  }}
                >
                  {col.render ? col.render(row[col.key], row) : (row[col.key] ?? '-')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default DataTable;
