import React from 'react';
import { Filter, X } from 'lucide-react';

/**
 * 공통 필터 패널 위젯
 * @param {ReactNode} children - 필터 입력들
 * @param {Function} onSearch - 검색 버튼 클릭
 * @param {Function} onReset - 초기화 버튼 클릭
 * @param {boolean} hasFilters - 필터 적용 중인지 여부 (리셋 버튼 표시)
 */
export function FilterPanel({
  children,
  onSearch,
  onReset,
  hasFilters = false,
  searchText = '검색',
  resetText = '초기화'
}) {
  return (
    <div style={{
      background: '#fff',
      border: '1px solid #e2e8f0',
      borderRadius: '8px',
      padding: '16px',
      marginBottom: '16px',
    }}>
      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        {children}
        
        <div style={{ display: 'flex', gap: '8px', marginLeft: 'auto' }}>
          <button
            onClick={onSearch}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 16px',
              background: '#2563eb',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 500,
            }}
          >
            <Filter size={16} />
            {searchText}
          </button>
          
          {hasFilters && onReset && (
            <button
              onClick={onReset}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 16px',
                background: '#f1f5f9',
                color: '#64748b',
                border: '1px solid #e2e8f0',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '14px',
              }}
            >
              <X size={16} />
              {resetText}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * 필터 그룹 (라벨 + 입력)
 */
export function FilterGroup({ label, children, width = '200px' }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: width }}>
      <label style={{ fontSize: '13px', fontWeight: 500, color: '#475569' }}>
        {label}
      </label>
      {children}
    </div>
  );
}

export default FilterPanel;
