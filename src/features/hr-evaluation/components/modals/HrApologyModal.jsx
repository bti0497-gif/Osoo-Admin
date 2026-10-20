import React, { useState, useRef } from 'react';
import { hrApologyModalStyles as styles } from './apology/hrApologyModalStyles';
import { HrApologyDocumentPaper } from './apology/HrApologyDocumentPaper';

/**
 * 📄 시말서(경위서) 원본 스캔본 열람 및 Google Drive 관리 모달
 */
export function HrApologyModal({
  isOpen,
  onClose,
  penaltyItem,
  workerEvaluation,
  onUpdateApologyDoc,
}) {
  const [zoomScale, setZoomScale] = useState(1);
  const fileInputRef = useRef(null);

  if (!isOpen || !penaltyItem) return null;

  const wName = workerEvaluation?.workerName || '근무자';
  const sName = workerEvaluation?.siteName || '현장';
  const pos = workerEvaluation?.position || '현장관리자';

  const apologyDoc = penaltyItem.apologyDoc || {
    hasDoc: false,
    fileName: `시말서_${wName}_${penaltyItem.date?.replace(/-/g, '') || ''}.pdf`,
    fileSize: '-',
    fileType: 'application/pdf',
    drivePath: '',
    driveFileId: null,
    uploadedAt: null,
    incidentDate: penaltyItem.date || '',
    docTitle: '시 말 서 (경 위 서)',
    workerName: wName,
    siteName: sName,
    position: pos,
    statement: `본인은 ${penaltyItem.date || '해당 일자'}경 현장 관리 중 ${penaltyItem.reason || penaltyItem.title || '주의의무 소홀'} 건으로 지적을 받았습니다.\n\n현장 관리 책임자로서 관리 소홀을 반성하며, 향후 동일한 과실이 발생하지 않도록 주의할 것을 서약하며 본 시말서를 제출합니다.`,
    signed: false,
    sealText: `${wName} (인)`,
  };


  const handleZoom = (delta) => {
    setZoomScale((prev) => Math.max(0.7, Math.min(1.6, Number((prev + delta).toFixed(1)))));
  };

  const handleTriggerUpload = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (uploadEvent) => {
      const dataUrl = uploadEvent.target?.result;
      const updated = {
        ...apologyDoc,
        hasDoc: true,
        fileName: file.name,
        fileSize: `${(file.size / 1024).toFixed(0)} KB`,
        fileType: file.type,
        dataUrl,
        drivePath: `/오수처리장_인사고과/시말서/2026/${file.name}`,
        uploadedAt: new Date().toISOString().slice(0, 16).replace('T', ' '),
      };
      if (onUpdateApologyDoc) {
        onUpdateApologyDoc(penaltyItem.id, updated);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleDownload = () => {
    if (apologyDoc.dataUrl) {
      const a = document.createElement('a');
      a.href = apologyDoc.dataUrl;
      a.download = apologyDoc.fileName || '시말서_스캔본.png';
      a.click();
    } else {
      const blob = new Blob([apologyDoc.statement], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${apologyDoc.fileName || '시말서_문서'}.txt`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* 모달 상단 헤더 */}
        <div style={styles.header}>
          <div style={styles.headerLeft}>
            <span style={styles.headerIcon}>📄</span>
            <div>
              <h2 style={styles.title}>시말서(경위서) 원본 스캔본 열람 및 Google Drive 관리</h2>
              <p style={styles.subtitle}>
                근무자 과실 경위 및 자필 서약서 공식 원본입니다. (클라우드 영구 보관)
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} style={styles.closeBtn}>
            ✕
          </button>
        </div>

        {/* 상단 Google Drive 보관 및 메타 요약 배너 */}
        <div style={styles.metaBanner}>
          <div style={styles.drivePathRow}>
            <span style={styles.driveBadge}>
              ☁️ Google Drive 보관됨
            </span>
            <code style={styles.drivePathText}>{apologyDoc.drivePath}</code>
          </div>
          <div style={styles.metaGrid}>
            <div style={styles.metaItem}>
              <span style={styles.metaLabel}>대상 현장/근무자</span>
              <strong style={styles.metaValue}>
                {workerEvaluation?.siteName || apologyDoc.siteName} · {workerEvaluation?.workerName || apologyDoc.workerName}
              </strong>
            </div>
            <div style={styles.metaItem}>
              <span style={styles.metaLabel}>징구일자 / 파일명</span>
              <strong style={styles.metaValue}>
                {penaltyItem.date} · {apologyDoc.fileName}
              </strong>
            </div>
            <div style={styles.metaItem}>
              <span style={styles.metaLabel}>부과 벌점</span>
              <strong style={{ ...styles.metaValue, color: '#dc2626' }}>
                {penaltyItem.points}점
              </strong>
            </div>
            <div style={styles.metaItem}>
              <span style={styles.metaLabel}>징계 사유</span>
              <strong style={styles.metaValue} title={penaltyItem.reason}>
                {penaltyItem.reason || penaltyItem.title}
              </strong>
            </div>
          </div>
        </div>

        {/* 뷰어 제어 툴바 */}
        <div style={styles.viewerToolbar}>
          <div style={styles.toolbarLeft}>
            <span style={styles.docTypeBadge}>
              {apologyDoc.fileType?.includes('pdf') ? 'PDF 공식문서' : '스캔 이미지'}
            </span>
            <span style={styles.fileSizeText}>용량: {apologyDoc.fileSize}</span>
          </div>
          <div style={styles.zoomControls}>
            <button type="button" onClick={() => handleZoom(-0.1)} style={styles.zoomBtn}>
              -
            </button>
            <span style={styles.zoomText}>{Math.round(zoomScale * 100)}%</span>
            <button type="button" onClick={() => handleZoom(0.1)} style={styles.zoomBtn}>
              +
            </button>
            <button type="button" onClick={() => setZoomScale(1)} style={styles.zoomResetBtn}>
              100%
            </button>
          </div>
        </div>

        {/* 문서 뷰어 바디 (스캔본 서식 시뮬레이션 or 업로드 이미지) */}
        <div style={styles.viewerBody}>
          <HrApologyDocumentPaper
            apologyDoc={apologyDoc}
            penaltyItem={penaltyItem}
            workerEvaluation={workerEvaluation}
            zoomScale={zoomScale}
            styles={styles}
          />
        </div>

        {/* 숨김 파일 입력란 */}
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          accept="image/*,application/pdf"
          style={{ display: 'none' }}
        />

        {/* 하단 버튼 바 */}
        <div style={styles.footer}>
          <button type="button" onClick={handleTriggerUpload} style={styles.uploadBtn}>
            🔄 스캔본 파일 교체 업로드
          </button>
          <div style={styles.footerRight}>
            <button type="button" onClick={handleDownload} style={styles.downloadBtn}>
              ⬇️ 스캔본 다운로드
            </button>
            <button type="button" onClick={handlePrint} style={styles.printBtn}>
              🖨️ 인쇄
            </button>
            <button type="button" onClick={onClose} style={styles.closeModalBtn}>
              닫기
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
