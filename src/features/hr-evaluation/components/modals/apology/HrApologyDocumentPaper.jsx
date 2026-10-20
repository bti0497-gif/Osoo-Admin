import React from 'react';

/**
 * 📜 시말서(경위서) 공식 문서 용지 렌더링 컴포넌트
 */
export function HrApologyDocumentPaper({
  apologyDoc,
  penaltyItem,
  workerEvaluation,
  zoomScale,
  styles,
}) {
  const scaledWidth = Math.round(680 * (zoomScale || 1));

  return (
    <div
      style={{
        ...styles.documentPaper,
        width: `${scaledWidth}px`,
        maxWidth: '95%',
        padding: apologyDoc.dataUrl ? '16px' : '36px 42px',
      }}
    >
      {apologyDoc.dataUrl ? (
        <img
          src={apologyDoc.dataUrl}
          alt="시말서 스캔본"
          style={styles.scannedImage}
        />
      ) : (
        /* 공식 시말서 서식 렌더링 */
        <div style={styles.formalDocWrapper}>
          <div style={styles.docWatermark}>공 식 원 본</div>
          <h1 style={styles.docMainTitle}>시  말  서</h1>
          <p style={styles.docSubTitle}>( 사 건 경 위 및 반 성 서 약 서 )</p>

          {/* 인적사항 테이블 */}
          <table style={styles.docTable}>
            <tbody>
              <tr>
                <th style={styles.docTh}>소 속</th>
                <td style={styles.docTd}>{workerEvaluation?.siteName || apologyDoc.siteName}</td>
                <th style={styles.docTh}>직 위</th>
                <td style={styles.docTd}>{workerEvaluation?.position || apologyDoc.position}</td>
              </tr>
              <tr>
                <th style={styles.docTh}>성 명</th>
                <td style={styles.docTd}>{workerEvaluation?.workerName || apologyDoc.workerName}</td>
                <th style={styles.docTh}>사건일시</th>
                <td style={styles.docTd}>{apologyDoc.incidentDate}</td>
              </tr>
              <tr>
                <th style={styles.docTh}>사건 장소</th>
                <td colSpan={3} style={styles.docTd}>
                  {workerEvaluation?.siteName || apologyDoc.siteName} 오수처리시설 현장 일체
                </td>
              </tr>
            </tbody>
          </table>

          {/* 1. 사건 경위 및 내용 */}
          <div style={styles.docSection}>
            <h4 style={styles.docSectionTitle}>1. 사건 발생 경위</h4>
            <div style={styles.docTextBox}>
              {penaltyItem.reason || apologyDoc.statement}
            </div>
          </div>

          {/* 2. 본인 과실 및 반성 */}
          <div style={styles.docSection}>
            <h4 style={styles.docSectionTitle}>2. 본인 과실 및 반성 내용</h4>
            <div style={styles.docTextBox}>
              위 사건은 본인의 현장 순찰 및 기계 설비 점검 태만으로 인해 발생하였음을 명백히 인정합니다.
              본 과실로 인하여 공정 운영에 차질을 빚고 회사에 심려를 끼쳐드린 점 머리 숙여 사죄드립니다.
            </div>
          </div>

          {/* 3. 재발 방지 대책 및 서약 */}
          <div style={styles.docSection}>
            <h4 style={styles.docSectionTitle}>3. 재발 방지 대책 및 서약</h4>
            <div style={styles.docTextBox}>
              향후 모든 일일점검 및 수질 계측 기록을 2중 확인하고, 비상 연락 체계를 철저히 유지하여 동일한
              과실이 절대로 재발하지 않도록 최선을 다할 것을 엄숙히 서약하며, 추후 재발 시 어떠한 인사 조치도
              감수하겠습니다.
            </div>
          </div>

          {/* 날짜 및 서명 날인 블록 */}
          <div style={styles.signBlock}>
            <p style={styles.docDateText}>
              {penaltyItem.date?.slice(0, 4)}년 {penaltyItem.date?.slice(5, 7)}월 {penaltyItem.date?.slice(8, 10)}일
            </p>
            <div style={styles.signatureRow}>
              <span style={styles.signLabel}>위 작성자(본인):</span>
              <strong style={styles.signName}>{workerEvaluation?.workerName || apologyDoc.workerName}</strong>
              <div style={styles.redStamp}>
                {apologyDoc.sealText || '인'}
              </div>
            </div>
          </div>

          {/* 본사 접수 확인 스탬프 */}
          <div style={styles.companyStamp}>
            <span style={styles.companyStampText}>[본사 인사총무팀 보관필]</span>
            <span style={styles.companyStampSub}>Google Drive 영구 보관 검증 완료</span>
          </div>
        </div>
      )}
    </div>
  );
}
