import React from 'react';

/**
 * 업로드 상태 표시 패널
 */
export function UploadStatusPanel({ uploadStatus }) {
  if (!uploadStatus) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' }}>
      {/* 완료 메시지 */}
      {uploadStatus.completed && (
        <div style={{ 
          background: '#dcfce7', 
          border: '1px solid #86efac', 
          borderRadius: '6px', 
          padding: '6px 12px', 
          fontSize: '13px', 
          color: '#166534', 
          fontWeight: 600,
        }}>
          ✅ 업로드 완료! (3초 후 초기화됩니다)
        </div>
      )}
      
      {/* 상태 배지 */}
      <div style={{
        fontSize: '11px',
        background: '#f8fafc',
        color: '#475569',
        border: '1px solid #e2e8f0',
        padding: '6px 12px',
        borderRadius: '6px',
      }}>
        이미지 {uploadStatus.imageOk}성공/{uploadStatus.imageFail}실패 &nbsp;|&nbsp; 
        BigQuery {uploadStatus.jsonOk}성공/{uploadStatus.jsonFail}실패
      </div>
      
      {/* 미등록 현장 경고 */}
      {uploadStatus.unmatchedSites?.length > 0 && (
        <div style={{
          background: '#fff7ed',
          border: '1px solid #fed7aa',
          borderRadius: '6px',
          padding: '6px 10px',
          fontSize: '12px',
          color: '#c2410c',
          maxWidth: '420px',
        }}>
          <strong>⚠ 현장 마스터 미등록 — Google Sheets에 추가 후 재업로드해주세요:</strong>
          <br />
          {uploadStatus.unmatchedSites.map((s, i) => (
            <span 
              key={i} 
              style={{
                display: 'inline-block',
                background: s.unresolved ? '#fee2e2' : '#ffedd5',
                borderRadius: '4px',
                padding: '1px 6px',
                margin: '2px 2px 0 0',
                fontWeight: 700,
              }}
            >
              {s.unresolved ? '⚠ 현장명 인식 실패 (미확인현장으로 임시 저장)' : s.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export default UploadStatusPanel;
