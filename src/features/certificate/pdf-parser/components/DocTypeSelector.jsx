import React from 'react';

const DOC_TYPES = [
  { value: 'mlss', label: 'mlss' },
  { value: '성적서(5개 항목)', label: '성적서(5개 항목)' },
];

export function DocTypeSelector({ selectedType, onSelect }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={{ fontSize: 12, fontWeight: 600, color: '#4b5563' }}>
        성적서 종류 선택
      </label>
      <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
        {DOC_TYPES.map((type) => {
          const isChecked = selectedType === type.value;
          return (
            <label
              key={type.value}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: isChecked ? 700 : 500,
                color: isChecked ? '#1d4ed8' : '#374151',
                padding: '4px 8px',
                borderRadius: 6,
                backgroundColor: isChecked ? '#eff6ff' : 'transparent',
                border: isChecked ? '1px solid #bfdbfe' : '1px solid transparent',
                transition: 'all 0.15s ease',
                userSelect: 'none',
              }}
            >
              <input
                type="radio"
                name="docType"
                value={type.value}
                checked={isChecked}
                onChange={() => onSelect(type.value)}
                style={{
                  cursor: 'pointer',
                  accentColor: '#2563eb',
                  width: 15,
                  height: 15,
                }}
              />
              <span>{type.label}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

export default DocTypeSelector;
