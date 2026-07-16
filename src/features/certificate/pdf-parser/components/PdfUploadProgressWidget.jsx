import React from 'react';

export default function PdfUploadProgressWidget({ uploadStatus, uploading, onClose }) {
  const isAllComplete = uploadStatus?.completed;

  React.useEffect(() => {
    if (!isAllComplete || !onClose) return undefined;
    const timer = setTimeout(() => {
      onClose();
    }, 3000);
    return () => clearTimeout(timer);
  }, [isAllComplete, onClose]);

  if (!uploading && !uploadStatus) return null;

  const styles = {
    overlay: {
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
    },
    card: {
      backgroundColor: '#fff',
      borderRadius: '12px',
      padding: '24px 32px',
      minWidth: '400px',
      boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)',
    },
    title: {
      fontSize: '18px',
      fontWeight: 600,
      marginBottom: '20px',
      color: '#1e293b',
    },
    stage: {
      marginBottom: '16px',
    },
    stageLabel: {
      display: 'flex',
      justifyContent: 'space-between',
      fontSize: '14px',
      color: '#64748b',
      marginBottom: '6px',
    },
    progressBar: {
      height: '8px',
      backgroundColor: '#e2e8f0',
      borderRadius: '4px',
      overflow: 'hidden',
    },
    progressFill: {
      height: '100%',
      backgroundColor: '#3b82f6',
      borderRadius: '4px',
      transition: 'width 0.3s ease',
    },
    complete: {
      backgroundColor: '#10b981',
    },
    totalProgress: {
      marginTop: '20px',
      paddingTop: '16px',
      borderTop: '1px solid #e2e8f0',
    },
    totalLabel: {
      display: 'flex',
      justifyContent: 'space-between',
      fontSize: '16px',
      fontWeight: 600,
      color: '#1e293b',
    },
    percent: {
      color: '#3b82f6',
    },
    closeButton: {
      marginTop: '20px',
      padding: '10px 20px',
      backgroundColor: '#3b82f6',
      color: '#fff',
      border: 'none',
      borderRadius: '6px',
      fontSize: '14px',
      fontWeight: 600,
      cursor: 'pointer',
      width: '100%',
    },
  };

  const driveDone = uploadStatus?.driveDone || 0;
  const driveTotal = uploadStatus?.driveTotal || 0;
  const drivePercent = driveTotal > 0 ? Math.round((driveDone / driveTotal) * 100) : 0;
  const isDriveComplete = driveDone >= driveTotal && driveTotal > 0;

  return (
    <div style={styles.overlay}>
      <div style={styles.card}>
        <div style={styles.title}>
          {isAllComplete ? '업로드 완료' : 'Drive 이미지 업로드 중'}
        </div>

        <div style={styles.stage}>
          <div style={styles.stageLabel}>
            <span>Google Drive 이미지 업로드</span>
            <span>{isDriveComplete ? '완료' : `${driveDone}/${driveTotal}`}</span>
          </div>
          <div style={styles.progressBar}>
            <div
              style={{
                ...styles.progressFill,
                width: `${drivePercent}%`,
                ...(isDriveComplete ? styles.complete : {}),
              }}
            />
          </div>
        </div>

        <div style={styles.totalProgress}>
          <div style={styles.totalLabel}>
            <span>전체 진행률</span>
            <span style={styles.percent}>{drivePercent}%</span>
          </div>
        </div>

        {isAllComplete && uploadStatus && (
          <div style={{
            marginTop: '16px',
            padding: '12px',
            background: '#f8fafc',
            borderRadius: '6px',
            fontSize: '13px',
            border: '1px solid #e2e8f0',
            color: '#475569',
            lineHeight: 1.6
          }}>
            <div style={{ fontWeight: 600, marginBottom: '6px', color: '#334155' }}>전송 결과</div>
            <div>성공: <span style={{ color: '#10b981', fontWeight: 600 }}>{uploadStatus.imageOk || 0}건</span></div>
            {Number(uploadStatus.imageExists || 0) > 0 && (
              <div>건너뜀 (이미 전송됨): <span style={{ color: '#f59e0b', fontWeight: 600 }}>{uploadStatus.imageExists}건</span></div>
            )}
            {Number(uploadStatus.imageFail || 0) > 0 && (
              <div>실패: <span style={{ color: '#ef4444', fontWeight: 600 }}>{uploadStatus.imageFail}건</span></div>
            )}
          </div>
        )}

        {isAllComplete && onClose && (
          <button style={styles.closeButton} onClick={onClose}>
            닫기
          </button>
        )}
      </div>
    </div>
  );
}
