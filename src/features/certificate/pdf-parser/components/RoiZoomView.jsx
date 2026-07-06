import React, { useState } from 'react';

export function RoiZoomView({ roiImage, pageIndex, totalPages, onPrev, onNext, onZoomIn, onZoomOut }) {
  const [zoom, setZoom] = useState(1);

  const handleZoomIn = () => {
    setZoom(prev => Math.min(prev + 0.25, 3));
    onZoomIn?.();
  };

  const handleZoomOut = () => {
    setZoom(prev => Math.max(prev - 0.25, 0.5));
    onZoomOut?.();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: '#333' }}>현장명 영역</h3>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={handleZoomOut} style={zoomBtnStyle}>−</button>
          <span style={{ fontSize: 13, color: '#666', minWidth: 40, textAlign: 'center' }}>{Math.round(zoom * 100)}%</span>
          <button onClick={handleZoomIn} style={zoomBtnStyle}>+</button>
        </div>
      </div>

      <div
        style={{
          flex: 1,
          border: '2px solid #e5e7eb',
          borderRadius: 8,
          overflow: 'hidden',
          backgroundColor: '#f9fafb',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {roiImage ? (
          <img
            src={roiImage}
            alt={`페이지 ${pageIndex + 1} ROI`}
            style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', transform: `scale(${zoom})` }}
          />
        ) : (
          <div style={{ color: '#888', fontSize: 13 }}>ROI 이미지 없음</div>
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button
          onClick={onPrev}
          disabled={pageIndex === 0}
          style={{ ...navBtnStyle, opacity: pageIndex === 0 ? 0.5 : 1 }}
        >
          ← 이전
        </button>
        <span style={{ fontSize: 13, color: '#666' }}>페이지 {pageIndex + 1} / {totalPages}</span>
        <button
          onClick={onNext}
          disabled={pageIndex >= totalPages - 1}
          style={{ ...navBtnStyle, opacity: pageIndex >= totalPages - 1 ? 0.5 : 1 }}
        >
          다음 →
        </button>
      </div>
    </div>
  );
}

const zoomBtnStyle = {
  width: 32, height: 32, borderRadius: 4, border: '1px solid #ccc', backgroundColor: '#fff',
  cursor: 'pointer', fontSize: 16, fontWeight: 600,
};

const navBtnStyle = {
  padding: '6px 16px', borderRadius: 6, border: '1px solid #ccc', backgroundColor: '#fff',
  cursor: 'pointer', fontSize: 13,
};
