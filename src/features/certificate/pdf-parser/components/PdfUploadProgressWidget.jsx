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

  const totalItems = uploadStatus?.totalItems || 0;
  const bqDone = uploadStatus?.bqDone || 0;
  const bqTotal = uploadStatus?.bqTotal || 0;
  const driveDone = uploadStatus?.driveDone || 0;
  const driveTotal = uploadStatus?.driveTotal || 0;

  const bqPercent = bqTotal > 0 ? Math.round((bqDone / bqTotal) * 100) : 0;
  const drivePercent = driveTotal > 0 ? Math.round((driveDone / driveTotal) * 100) : 0;
  const totalPercent = totalItems > 0
    ? Math.round(((bqDone + driveDone) / (bqTotal + driveTotal)) * 100)
    : 0;

  const isBqComplete = bqDone >= bqTotal && bqTotal > 0;
  const isDriveComplete = driveDone >= driveTotal && driveTotal > 0;

  return (
    <div style={styles.overlay}>
      <div style={styles.card}>
        <div style={styles.title}>
          {isAllComplete ? '업로드 완료' : '업로드 진행 중'}
        </div>

        <div style={styles.stage}>
          <div style={styles.stageLabel}>
            <span>BigQuery 데이터 저장</span>
            <span>{isBqComplete ? '완료' : `${bqDone}/${bqTotal}`}</span>
          </div>
          <div style={styles.progressBar}>
            <div
              style={{
                ...styles.progressFill,
                width: `${bqPercent}%`,
                ...(isBqComplete ? styles.complete : {}),
              }}
            />
          </div>
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
            <span style={styles.percent}>{totalPercent}%</span>
          </div>
        </div>

        {isAllComplete && onClose && (
          <button style={styles.closeButton} onClick={onClose}>
            닫기
          </button>
        )}
      </div>
    </div>
  );
}
