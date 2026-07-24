import React from 'react';

export default function TempPlaceholderTab() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        color: '#94a3b8',
        background: '#fafafa',
        borderRadius: 12,
        border: '1px dashed #cbd5e1',
        padding: '3rem',
        textAlign: 'center',
      }}
    >
      <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📁</div>
      <h3 style={{ margin: '0 0 0.5rem', color: '#475569', fontSize: '1.2rem' }}>임시 탭</h3>
      <p style={{ margin: 0, fontSize: '0.9rem', color: '#64748b' }}>
        향후 추가 기능을 확장할 수 있도록 준비된 임시 영역입니다.
      </p>
    </div>
  );
}
