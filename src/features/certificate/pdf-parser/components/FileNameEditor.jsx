import React from 'react';

export function FileNameEditor({ fileName, onChange }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <label style={{ fontSize: 12, fontWeight: 500, color: '#666' }}>
        파일명 (직접 편집 가능)
      </label>
      <input
        type="text"
        value={fileName}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
        style={{
          width: '100%',
          padding: 8,
          borderRadius: 6,
          border: '1px solid #ccc',
          fontSize: 13,
          fontFamily: 'monospace',
        }}
        placeholder="예: mlss_20260615_고창휴게소.jpg"
      />
    </div>
  );
}
