import React from 'react';
import { MapPin, Check } from 'lucide-react';

/**
 * 공통 현장 선택 위젯 (다중 선택)
 * @param {string[]} sites - 전체 현장 목록
 * @param {string[]} selected - 선택된 현장들
 * @param {Function} onChange - 선택 변경 콜백 (selectedSites: string[])
 * @param {Function} onToggleAll - 전체 선택/해제
 */
export function SiteSelector({
  sites = [],
  selected = [],
  onChange,
  onToggleAll,
  label = '현장 선택',
  placeholder = '현장을 선택하세요',
  disabled = false,
  maxHeight = '200px'
}) {
  const toggleSite = (site) => {
    if (disabled) return;
    
    const newSelected = selected.includes(site)
      ? selected.filter(s => s !== site)
      : [...selected, site];
    
    onChange?.(newSelected);
  };

  const allSelected = sites.length > 0 && selected.length === sites.length;
  const someSelected = selected.length > 0 && selected.length < sites.length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <label style={{ fontSize: '13px', fontWeight: 500, color: '#475569', display: 'flex', alignItems: 'center', gap: '4px' }}>
          <MapPin size={14} />
          {label}
          <span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 'normal' }}>
            ({selected.length}/{sites.length})
          </span>
        </label>
        
        {onToggleAll && sites.length > 0 && (
          <button
            onClick={onToggleAll}
            disabled={disabled}
            style={{
              fontSize: '12px',
              padding: '2px 8px',
              background: 'transparent',
              border: '1px solid #e2e8f0',
              borderRadius: '4px',
              cursor: disabled ? 'not-allowed' : 'pointer',
              color: disabled ? '#94a3b8' : '#64748b',
            }}
          >
            {allSelected ? '전체 해제' : '전체 선택'}
          </button>
        )}
      </div>

      {sites.length === 0 ? (
        <div style={{ padding: '12px', color: '#94a3b8', fontSize: '13px', background: '#f8fafc', borderRadius: '6px' }}>
          등록된 현장이 없습니다.
        </div>
      ) : (
        <div 
          style={{ 
            display: 'flex', 
            flexWrap: 'wrap', 
            gap: '6px', 
            maxHeight, 
            overflow: 'auto',
            padding: '4px',
            border: '1px solid #e2e8f0',
            borderRadius: '6px',
            background: '#fff',
          }}
        >
          {sites.map(site => {
            const isSelected = selected.includes(site);
            return (
              <button
                key={site}
                onClick={() => toggleSite(site)}
                disabled={disabled}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '4px 10px',
                  background: isSelected ? '#dbeafe' : '#f8fafc',
                  border: `1px solid ${isSelected ? '#3b82f6' : '#e2e8f0'}`,
                  borderRadius: '4px',
                  cursor: disabled ? 'not-allowed' : 'pointer',
                  fontSize: '13px',
                  color: isSelected ? '#1e40af' : '#475569',
                  fontWeight: isSelected ? 500 : 400,
                  transition: 'all 0.15s ease',
                }}
                title={site}
              >
                {isSelected && <Check size={12} />}
                <span style={{ maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {site}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * 현장 선택 - 드롭다운 버전 (단일 선택)
 */
export function SiteDropdown({
  sites = [],
  selected,
  onChange,
  label = '현장',
  disabled = false
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <label style={{ fontSize: '13px', fontWeight: 500, color: '#475569', display: 'flex', alignItems: 'center', gap: '4px' }}>
        <MapPin size={14} />
        {label}
      </label>
      <select
        value={selected || ''}
        onChange={(e) => onChange?.(e.target.value || null)}
        disabled={disabled || sites.length === 0}
        style={{
          padding: '8px 12px',
          border: '1px solid #d1d5db',
          borderRadius: '6px',
          fontSize: '14px',
          background: disabled ? '#f1f5f9' : '#fff',
          cursor: disabled ? 'not-allowed' : 'pointer',
          minWidth: '200px',
        }}
      >
        <option value="">{sites.length === 0 ? '현장 없음' : placeholder || '전체'}</option>
        {sites.map(site => (
          <option key={site} value={site}>{site}</option>
        ))}
      </select>
    </div>
  );
}

export default SiteSelector;
