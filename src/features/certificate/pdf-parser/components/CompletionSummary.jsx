import React from 'react';

export function CompletionSummary({
  pages,
  unmatchedPages,
  uploadProgress,
  onStartUpload,
  onReset,
}) {
  const matchedCount = pages.filter(p => p.status === 'matched').length;
  const totalCount = pages.length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: 24, backgroundColor: '#f9fafb', borderRadius: 12 }}>
      <h2 style={{ fontSize: 18, fontWeight: 600, color: '#333' }}>매칭 완료</h2>

      {/* 요약 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div style={{ padding: 12, backgroundColor: '#fff', borderRadius: 8, border: '1px solid #e5e7eb' }}>
          <div style={{ fontSize: 12, color: '#666' }}>총 페이지</div>
          <div style={{ fontSize: 24, fontWeight: 600, color: '#333' }}>{totalCount}</div>
        </div>
        <div style={{ padding: 12, backgroundColor: '#fff', borderRadius: 8, border: '1px solid #e5e7eb' }}>
          <div style={{ fontSize: 12, color: '#666' }}>매칭 완료</div>
          <div style={{ fontSize: 24, fontWeight: 600, color: '#22c55e' }}>{matchedCount}</div>
        </div>
      </div>

      {/* 빠진/매칭안됨 페이지 */}
      {unmatchedPages.length > 0 && (
        <div style={{ padding: 12, backgroundColor: '#fef2f2', borderRadius: 8, border: '1px solid #fecaca' }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: '#dc2626', marginBottom: 8 }}>
            ⚠ 매칭되지 않은 페이지 ({unmatchedPages.length})
          </div>
          <div style={{ fontSize: 12, color: '#991b1b' }}>
            {unmatchedPages.map(p => `페이지 ${p.pageIndex + 1}`).join(', ')}
          </div>
        </div>
      )}

      {/* 업로드 진행 상태 */}
      {uploadProgress.percent > 0 && (
        <div style={{ padding: 12, backgroundColor: '#f0f7ff', borderRadius: 8, border: '1px solid #bfdbfe' }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: '#1e40af', marginBottom: 4 }}>
            {uploadProgress.message}
          </div>
          <div style={{ width: '100%', height: 8, backgroundColor: '#e5e7eb', borderRadius: 4, overflow: 'hidden' }}>
            <div
              style={{
                width: `${uploadProgress.percent}%`,
                height: '100%',
                backgroundColor: '#2563eb',
                transition: 'width 0.3s',
              }}
            />
          </div>
          <div style={{ fontSize: 12, color: '#666', marginTop: 4, textAlign: 'right' }}>
            {uploadProgress.percent}%
          </div>
        </div>
      )}

      {/* 버튼 */}
      <div style={{ display: 'flex', gap: 12 }}>
        <button
          onClick={uploadProgress.percent === 100 ? onReset : onStartUpload}
          disabled={uploadProgress.percent > 0 && uploadProgress.percent < 100}
          style={{
            flex: 1,
            padding: 12,
            borderRadius: 8,
            border: 'none',
            backgroundColor: uploadProgress.percent === 100 ? '#10b981' : '#2563eb',
            color: 'white',
            fontSize: 14,
            fontWeight: 600,
            cursor: (uploadProgress.percent > 0 && uploadProgress.percent < 100) ? 'not-allowed' : 'pointer',
            transition: 'all 0.2s ease',
          }}
          onMouseEnter={(e) => {
            if (!(uploadProgress.percent > 0 && uploadProgress.percent < 100)) {
              e.currentTarget.style.backgroundColor = uploadProgress.percent === 100 ? '#059669' : '#1d4ed8';
            }
          }}
          onMouseLeave={(e) => {
            if (!(uploadProgress.percent > 0 && uploadProgress.percent < 100)) {
              e.currentTarget.style.backgroundColor = uploadProgress.percent === 100 ? '#10b981' : '#2563eb';
            }
          }}
        >
          {uploadProgress.percent === 100 
            ? '확인 (첫 화면으로)' 
            : uploadProgress.percent > 0 
              ? '처리 중...' 
              : '이미지 변환 및 Drive 전송'}
        </button>
        <button
          onClick={onReset}
          disabled={uploadProgress.percent > 0 && uploadProgress.percent < 100}
          style={{
            padding: 12,
            borderRadius: 8,
            border: '1px solid #ccc',
            backgroundColor: '#fff',
            color: '#333',
            fontSize: 14,
            cursor: (uploadProgress.percent > 0 && uploadProgress.percent < 100) ? 'not-allowed' : 'pointer',
          }}
        >
          전체 취소
        </button>
      </div>
    </div>
  );
}
