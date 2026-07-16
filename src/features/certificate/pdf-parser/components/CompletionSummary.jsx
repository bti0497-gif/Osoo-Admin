import React, { useEffect } from 'react';
import { Loader2 } from 'lucide-react';

// =========================================================================
// CRITICAL WARNING: 완료 요약 및 중복 전송 방지 로직 (수정 금지)
// =========================================================================
// 1. isUploading === true 일 때 전송 및 취소 버튼은 반드시 disabled 상태가
//    되어야 하며, 중복 호출 및 레이스 컨디션을 원천 차단해야 합니다.
// 2. 업로드 진행률이 0%인 상태(극초기)라도 사용자 인식 피드백을 제공하도록
//    uploadProgress.message가 비어있지 않다면 무조건 오버레이와 로딩바를 보여주어야 합니다.
// 3. 마우스 커서와 로딩 스피너(Loader2) 인터랙션을 훼손하지 마십시오.
// =========================================================================
export function CompletionSummary({
  pages,
  uploadProgress,
  onStartUpload,
  onReset,
}) {
  const matchedCount = pages.filter(p => p.status === 'matched').length;
  const totalCount = pages.length;

  const isUploading = uploadProgress.message !== '' && uploadProgress.percent < 100;

  // 업로드 완료(100%) 시 3초 후 자동으로 첫 화면으로 리셋
  useEffect(() => {
    if (uploadProgress.percent === 100) {
      const timer = setTimeout(() => {
        onReset();
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [uploadProgress.percent, onReset]);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: 20,
      padding: '32px 28px',
      backgroundColor: '#ffffff',
      borderRadius: 16,
      boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.08), 0 8px 10px -6px rgba(0, 0, 0, 0.04)',
      border: '1px solid #e5e7eb',
      width: '100%',
      boxSizing: 'border-box'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid #f3f4f6', paddingBottom: 16 }}>
        <div style={{
          width: 8,
          height: 18,
          borderRadius: 4,
          backgroundColor: '#2563eb'
        }} />
        <h2 style={{ fontSize: 16, fontWeight: 700, color: '#1f2937', margin: 0 }}>성적서 수동 매칭 결과 요약</h2>
      </div>

      {/* 요약 계량기 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div style={{
          padding: '16px 20px',
          backgroundColor: '#f8fafc',
          borderRadius: 12,
          border: '1px solid #f1f5f9',
          display: 'flex',
          flexDirection: 'column',
          gap: 6
        }}>
          <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>총 분석 페이지</div>
          <div style={{ fontSize: 26, fontWeight: 800, color: '#1e293b' }}>
            {totalCount}<span style={{ fontSize: 14, fontWeight: 500, color: '#94a3b8', marginLeft: 4 }}>Pages</span>
          </div>
        </div>
        
        <div style={{
          padding: '16px 20px',
          backgroundColor: '#f0fdf4',
          borderRadius: 12,
          border: '1px solid #dcfce7',
          display: 'flex',
          flexDirection: 'column',
          gap: 6
        }}>
          <div style={{ fontSize: 12, color: '#166534', fontWeight: 600 }}>매칭 지정 완료</div>
          <div style={{ fontSize: 26, fontWeight: 800, color: '#15803d' }}>
            {matchedCount}<span style={{ fontSize: 14, fontWeight: 500, color: '#86efac', marginLeft: 4 }}>Pages</span>
          </div>
        </div>
      </div>

      {/* 업로드 진행 상태 */}
      {uploadProgress.message !== '' && (
        <div style={{
          padding: '18px 20px',
          backgroundColor: uploadProgress.percent === 100 ? '#f0fdf4' : '#eff6ff',
          borderRadius: 12,
          border: uploadProgress.percent === 100 ? '1px solid #bbf7d0' : '1px solid #bfdbfe',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          transition: 'all 0.3s ease'
        }}>
          <div style={{ display: 'flex', justifycontent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, fontWeight: 600, color: uploadProgress.percent === 100 ? '#166534' : '#1e40af', lineHeight: '1.4' }}>
              {isUploading && <Loader2 size={15} style={{ animation: 'spin 1s linear infinite', flexShrink: 0 }} />}
              <div>
                {uploadProgress.message}
                {uploadProgress.percent === 100 && (
                  <span style={{ display: 'block', fontSize: 11, color: '#166534', marginTop: 6, fontWeight: 500, opacity: 0.85 }}>
                    (3초 후 자동으로 첫 화면으로 이동합니다)
                  </span>
                )}
              </div>
            </div>
            <div style={{ fontSize: 14, fontWeight: 800, color: uploadProgress.percent === 100 ? '#15803d' : '#2563eb', marginLeft: 'auto' }}>
              {uploadProgress.percent}%
            </div>
          </div>
          
          <div style={{ width: '100%', height: 8, backgroundColor: '#e2e8f0', borderRadius: 999, overflow: 'hidden' }}>
            <div
              style={{
                width: `${uploadProgress.percent}%`,
                height: '100%',
                backgroundColor: uploadProgress.percent === 100 ? '#10b981' : '#2563eb',
                transition: 'width 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
                borderRadius: 999
              }}
            />
          </div>
        </div>
      )}

      {/* 버튼 */}
      <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
        <button
          onClick={uploadProgress.percent === 100 ? onReset : onStartUpload}
          disabled={isUploading}
          style={{
            flex: 2,
            padding: '14px 16px',
            borderRadius: 10,
            border: 'none',
            backgroundColor: uploadProgress.percent === 100 
              ? '#10b981' 
              : isUploading 
                ? '#93c5fd' 
                : '#2563eb',
            color: 'white',
            fontSize: 14,
            fontWeight: 700,
            cursor: isUploading ? 'wait' : 'pointer',
            transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
            boxShadow: uploadProgress.percent === 100 
              ? '0 4px 12px -2px rgba(16, 185, 129, 0.2)' 
              : isUploading 
                ? 'none' 
                : '0 4px 12px -2px rgba(37, 99, 235, 0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8
          }}
          onMouseEnter={(e) => {
            if (!isUploading) {
              e.currentTarget.style.backgroundColor = uploadProgress.percent === 100 ? '#059669' : '#1d4ed8';
              e.currentTarget.style.transform = 'translateY(-1px)';
            }
          }}
          onMouseLeave={(e) => {
            if (!isUploading) {
              e.currentTarget.style.backgroundColor = uploadProgress.percent === 100 ? '#10b981' : '#2563eb';
              e.currentTarget.style.transform = 'translateY(0)';
            }
          }}
        >
          {isUploading && <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />}
          {uploadProgress.percent === 100 
            ? '확인 (첫 화면으로)' 
            : isUploading 
              ? '이미지 변환 및 전송 중...' 
              : '이미지 변환 및 Drive 전송'}
        </button>
        <button
          onClick={onReset}
          disabled={isUploading}
          style={{
            flex: 1,
            padding: '14px 16px',
            borderRadius: 10,
            border: '1px solid #cbd5e1',
            backgroundColor: '#ffffff',
            color: '#475569',
            fontSize: 14,
            fontWeight: 600,
            cursor: isUploading ? 'not-allowed' : 'pointer',
            transition: 'all 0.15s ease',
            opacity: isUploading ? 0.6 : 1
          }}
          onMouseEnter={(e) => {
            if (!isUploading) {
              e.currentTarget.style.backgroundColor = '#f8fafc';
              e.currentTarget.style.borderColor = '#94a3b8';
            }
          }}
          onMouseLeave={(e) => {
            if (!isUploading) {
              e.currentTarget.style.backgroundColor = '#ffffff';
              e.currentTarget.style.borderColor = '#cbd5e1';
            }
          }}
        >
          전체 취소
        </button>
      </div>
    </div>
  );
}
