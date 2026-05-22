import React from 'react';
import { Calendar } from 'lucide-react';

/**
 * 공통 기간 선택 위젯
 * @param {string} startDate - 시작일 (YYYY-MM-DD)
 * @param {string} endDate - 종료일 (YYYY-MM-DD)
 * @param {Function} onStartChange - 시작일 변경
 * @param {Function} onEndChange - 종료일 변경
 * @param {Function} onChange - 일괄 변경 { startDate, endDate }
 */
export function DateRangePicker({
  startDate,
  endDate,
  onStartChange,
  onEndChange,
  onChange,
  label = '조회 기간',
  startLabel = '시작일',
  endLabel = '종료일',
  disabled = false
}) {
  const handleStartChange = (e) => {
    const value = e.target.value;
    if (onChange) {
      onChange({ startDate: value, endDate });
    } else {
      onStartChange?.(value);
    }
  };

  const handleEndChange = (e) => {
    const value = e.target.value;
    if (onChange) {
      onChange({ startDate, endDate: value });
    } else {
      onEndChange?.(value);
    }
  };

  const inputStyle = {
    padding: '8px 12px',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    fontSize: '14px',
    fontFamily: 'inherit',
    background: disabled ? '#f1f5f9' : '#fff',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.6 : 1,
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      {label && (
        <label style={{ fontSize: '13px', fontWeight: 500, color: '#475569', display: 'flex', alignItems: 'center', gap: '4px' }}>
          <Calendar size={14} />
          {label}
        </label>
      )}
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <input
          type="date"
          value={startDate || ''}
          onChange={handleStartChange}
          disabled={disabled}
          style={inputStyle}
        />
        <span style={{ color: '#64748b', fontSize: '14px' }}>~</span>
        <input
          type="date"
          value={endDate || ''}
          onChange={handleEndChange}
          disabled={disabled}
          min={startDate}
          style={inputStyle}
        />
      </div>
    </div>
  );
}

/**
 * 프리셋 버튼 그룹 (오늘, 이번주, 이번달 등)
 */
export function DateRangePresets({ onSelect, disabled = false }) {
  const presets = [
    { label: '오늘', days: 0 },
    { label: '7일', days: 7 },
    { label: '30일', days: 30 },
    { label: '90일', days: 90 },
  ];

  const handleClick = (days) => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - days);
    
    const format = (d) => d.toISOString().split('T')[0];
    onSelect?.({
      startDate: format(start),
      endDate: format(end),
    });
  };

  return (
    <div style={{ display: 'flex', gap: '4px' }}>
      {presets.map((preset) => (
        <button
          key={preset.label}
          onClick={() => handleClick(preset.days)}
          disabled={disabled}
          style={{
            padding: '4px 10px',
            fontSize: '12px',
            background: '#f1f5f9',
            border: '1px solid #e2e8f0',
            borderRadius: '4px',
            cursor: disabled ? 'not-allowed' : 'pointer',
            color: disabled ? '#94a3b8' : '#64748b',
          }}
        >
          {preset.label}
        </button>
      ))}
    </div>
  );
}

export default DateRangePicker;
