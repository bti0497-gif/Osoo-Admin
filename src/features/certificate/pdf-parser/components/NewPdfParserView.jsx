import React, { useState, useRef, useEffect, useMemo } from 'react';
import { FileText, Eye, EyeOff, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { pdfjs } from 'react-pdf';
import { PDFDocument } from 'pdf-lib';

// Hooks
import { usePdfTemplate } from '../viewmodels/usePdfTemplate';
import { usePdfBatch } from '../viewmodels/usePdfBatch';
import { usePdfUpload } from '../viewmodels/usePdfUpload';
import { usePdfGemini } from '../viewmodels/usePdfGemini';

// Utils
import { getFullPageImageBlob, getPdfPageImageBlob } from '../utils/imageGenerator';
import { movePage, deletePage } from '../utils/pdfManipulator';

// Panels
import { PageThumbnailPanel, PdfCanvasPanel, RoiToolbar, UploadStatusPanel } from './panels';
import PdfUploadProgressWidget from './PdfUploadProgressWidget';

// Styles
import { getStyles } from './styles';

// file:// 프로토콜에서도 동작하도록 현재 페이지 기준으로 worker 경로 설정
if (typeof window !== 'undefined' && window.location.protocol === 'file:') {
  const base = window.location.href.replace(/\/[^/]*$/, '');
  pdfjs.GlobalWorkerOptions.workerSrc = `${base}/pdf.worker.min.mjs`;
} else {
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url
  ).toString();
}

const fieldLabels = {
  date: '측정일',
  items: '측정항목',
  results: '측정결과',
  location: '측정현장',
};

const fieldBorderColors = {
  date: '#2563eb',
  items: '#16a34a',
  results: '#7c3aed',
  location: '#dc2626',
};

const fieldBgColors = {
  date: 'rgba(37, 99, 235, 0.12)',
  items: 'rgba(22, 163, 74, 0.12)',
  results: 'rgba(124, 58, 237, 0.12)',
  location: 'rgba(220, 38, 38, 0.12)',
};

const modalStyles = {
  overlay: { position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(2px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' },
  box: { background: '#fff', borderRadius: '12px', boxShadow: '0 20px 60px rgba(0,0,0,0.2)', maxWidth: '448px', width: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: '80vh' },
  header: { padding: '20px', borderBottom: '1px solid #f1f5f9', background: '#2563eb', flexShrink: 0 },
  title: { fontSize: '18px', fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center', gap: '8px' },
  progressWrap: { marginTop: '16px' },
  progressLabel: { display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#bfdbfe', marginBottom: '4px', fontWeight: 500 },
  progressTrack: { height: '8px', background: 'rgba(30,58,138,0.5)', borderRadius: '4px', overflow: 'hidden' },
  progressFill: (pct) => ({ height: '100%', background: '#fff', borderRadius: '4px', width: `${pct}%`, transition: 'width 0.3s' }),
  pageList: { flex: 1, overflowY: 'auto', padding: '12px', background: '#f8fafc', display: 'flex', flexDirection: 'column', gap: '8px', minHeight: '50vh' },
  pageItem: (status) => ({ display: 'flex', flexDirection: 'column', padding: '12px', borderRadius: '8px', border: status === 'extracting' ? '1px solid #93c5fd' : '1px solid #f1f5f9', background: status === 'extracting' ? '#eff6ff' : '#fff', boxShadow: '0 1px 2px rgba(0,0,0,0.04)', gap: '6px', outline: status === 'extracting' ? '1px solid #3b82f6' : 'none' }),
  pageRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  pageLabel: (status) => ({ fontSize: '14px', fontWeight: 700, minWidth: '50px', color: status === 'extracting' ? '#1d4ed8' : '#334155' }),
  pill: (color, bg) => ({ fontSize: '10px', background: bg, color, padding: '2px 8px', borderRadius: '9999px', fontWeight: 500 }),
  footer: { padding: '16px', background: '#f8fafc', borderTop: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '12px', flexShrink: 0 },
  resultBox: { fontSize: '12px', color: '#475569', background: '#fff', border: '1px solid #e2e8f0', padding: '10px 12px', borderRadius: '6px' },
  resultTitle: { fontWeight: 600, marginBottom: '4px', color: '#334155' },
};

/**
 * PDF Parser View (MVVM Refactored)
 * 
 * View: 이 컴포넌트 + 패널들
 * ViewModel: usePdfTemplate, usePdfBatch, usePdfUpload, usePdfGemini
 * Model: server/routes/aiRoutes.cjs, certificateRoutes.cjs
 */
export function NewPdfParserView() {
  // File state
  const [file, setFile] = useState(null);
  const [fileUrl, setFileUrl] = useState(null);
  const [numPages, setNumPages] = useState(0);
  const [pdfDoc, setPdfDoc] = useState(null);
  const [activePage, setActivePage] = useState(1);

  // File → ObjectURL 변환 (여러 Document 컴포넌트가 동시 접근 가능)
  useEffect(() => {
    if (file) {
      const url = URL.createObjectURL(file);
      setFileUrl(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setFileUrl(null);
    }
  }, [file]);
  
  // ROI Drawing state
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  const [currentBox, setCurrentBox] = useState(null);
  const containerRef = useRef(null);
  
  // ViewModels
  const {
    globalBoxes, activeField, showTemplateBoxes,
    setBox, toggleField, setShowTemplateBoxes,
    saveTemplate, clearTemplate, hasTemplate,
  } = usePdfTemplate();
  
  const {
    batchProgress, startBatch, updatePageStatus, setStage,
    completeBatch, resetBatch, progressPercent,
  } = usePdfBatch();
  
  const { uploadStatus, uploading, uploadProgress, processUploads, resetStatus, setUploadStatus } = usePdfUpload();

  const { callGemini, postProcessResults } = usePdfGemini();
  
  // Toast
  const [toast, setToast] = useState(null);
  const showToast = useCallback((msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2000);
  }, []);

  const styles = getStyles();
  const processing = batchProgress.active;

  // 처리 완료 후 3초 뒤 자동 초기화
  const isDone = batchProgress.stage === 'done';
  useEffect(() => {
    if (!isDone) return;
    const timer = setTimeout(() => {
      resetBatch();
      resetStatus();
      setFile(null);
      setNumPages(0);
      setPdfDoc(null);
      setActivePage(1);
      showToast('전송 완료! 초기화되었습니다.');
    }, 3000);
    return () => clearTimeout(timer);
  }, [isDone, resetBatch, resetStatus, showToast]);

  // PDF 로드 완료
  const handleDocumentLoad = (pdf) => {
    setNumPages(pdf.numPages);
    setPdfDoc(pdf);
  };

  // 파일 변경
  const handleFileChange = (e) => {
    const selected = e.target.files?.[0];
    if (selected?.type === 'application/pdf') {
      setFile(selected);
      setActivePage(1);
      setPdfDoc(null);
      setNumPages(0);
      resetStatus();
      resetBatch();
    }
  };

  // 페이지 이동
  const handleMovePage = async (pageNum, direction) => {
    const result = await movePage(file, pageNum, direction, PDFDocument);
    if (result) {
      setFile(result.file);
      setNumPages(result.newPageCount);
      setPdfDoc(null);
      setActivePage(result.newActivePage);
    }
  };

  // 페이지 삭제
  const handleDeletePage = async (pageNum) => {
    const result = await deletePage(file, pageNum, activePage, PDFDocument);
    if (result) {
      if (result.file === null) {
        setFile(null);
        setPdfDoc(null);
        setNumPages(0);
        setActivePage(1);
        return;
      }
      setFile(result.file);
      setNumPages(result.newPageCount);
      setPdfDoc(null);
      setActivePage(result.newActivePage);
    }
  };

  // ROI 드로잉 핸들러
  const handleMouseDown = (e) => {
    if (!activeField || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    setIsDrawing(true);
    setStartPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    setCurrentBox({ x: e.clientX - rect.left, y: e.clientY - rect.top, width: 0, height: 0 });
  };

  const handleMouseMove = (e) => {
    if (!isDrawing || !containerRef.current || !activeField) return;
    const rect = containerRef.current.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    setCurrentBox({
      x: Math.min(startPos.x, cx),
      y: Math.min(startPos.y, cy),
      width: Math.abs(cx - startPos.x),
      height: Math.abs(cy - startPos.y),
    });
  };

  const handleMouseUp = () => {
    if (isDrawing && activeField && currentBox?.width > 5 && currentBox?.height > 5) {
      setBox(activeField, currentBox);
    }
    setIsDrawing(false);
    setCurrentBox(null);
  };

  // ============================
  // 전체 파싱 및 업로드 (핵심)
  // ============================
  const handleProcessAll = async () => {
    if (!pdfDoc || !file || !numPages) return;
    
    startBatch(numPages);
    const allResults = [];

    try {
      for (let i = 1; i <= numPages; i++) {
        updatePageStatus(i, 'extracting', { detail: 'Gemini 분석 중...' });

        try {
          // Gemini용 ROI 크롭 이미지
          const imgBlob = await getPdfPageImageBlob(pdfDoc, i, globalBoxes);
          // Drive 저장용 전체 페이지 이미지
          const fullImgBlob = await getFullPageImageBlob(pdfDoc, i);

          if (!imgBlob) throw new Error('페이지 이미지 변환 실패');

          // Gemini API 호출 (재시도 포함)
          const extracted = await callGemini(imgBlob, (retryNum) => {
            updatePageStatus(i, 'extracting', { detail: `재시도 중... (${retryNum})` });
          });

          allResults.push({ extracted, imgBlob: fullImgBlob || imgBlob });
          updatePageStatus(i, 'done');
        } catch (err) {
          console.error(`[Page ${i}] 처리 실패:`, err);
          updatePageStatus(i, 'error', { detail: err.message || '오류 발생' });
        }

        // API 속도 제한 방지
        if (i < numPages) await new Promise(r => setTimeout(r, 500));
      }
    } catch (e) {
      console.error('[handleProcessAll] 전체 오류:', e);
    }

    // 후처리: 날짜/현장명 보정 + basename 생성
    const { finalResults } = postProcessResults(allResults);

    // 업로드 단계
    setStage('uploading');
    console.log(`[Upload] 전체 ${allResults.length}건, include=true: ${finalResults.length}건`);

    const stats = await processUploads(finalResults, file.name);
    // processUploads 내부에서 setUploadStatus를 호출하지만
    // 렌더링 타이밍 보장을 위해 직접 설정
    setUploadStatus({ ...stats, completed: true });
    setStage('done');
  };

  // ============================
  // BatchProgress 모달
  // ============================
  const renderBatchModal = () => {
    if (!batchProgress.active) return null;

    const done = batchProgress.pages.filter(p => p.status === 'done' || p.status === 'error').length;
    const pct = batchProgress.total > 0 ? Math.round((done / batchProgress.total) * 100) : 0;
    const isDone = batchProgress.stage === 'done';

    return (
      <div style={modalStyles.overlay}>
        <div style={modalStyles.box}>
          <div style={modalStyles.header}>
            <div style={modalStyles.title}>
              {!isDone && <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} />}
              {isDone ? '처리 완료' : '일괄 추출 진행 중...'}
            </div>
            <div style={modalStyles.progressWrap}>
              <div style={modalStyles.progressLabel}>
                <span>{done} / {batchProgress.total} 완료</span>
                <span>{pct}%</span>
              </div>
              <div style={modalStyles.progressTrack}>
                <div style={modalStyles.progressFill(pct)} />
              </div>
            </div>
          </div>

          <div style={modalStyles.pageList}>
            {batchProgress.pages.map((p) => (
              <div
                key={p.pageNum}
                ref={(el) => { if (el && p.status === 'extracting') el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }}
                style={modalStyles.pageItem(p.status)}
              >
                <div style={modalStyles.pageRow}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={modalStyles.pageLabel(p.status)}>Page {p.pageNum}</span>
                    {p.status === 'extracting' && <span style={modalStyles.pill('#1d4ed8', '#dbeafe')}>{p.data?.detail || '분석 중...'}</span>}
                    {p.status === 'done' && <span style={modalStyles.pill('#15803d', '#dcfce7')}>성공</span>}
                    {p.status === 'error' && <span style={modalStyles.pill('#dc2626', '#fee2e2')}>실패</span>}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '24px' }}>
                    {p.status === 'pending' && <div style={{ width: '20px', height: '20px', borderRadius: '50%', border: '2px solid #e2e8f0' }} />}
                    {p.status === 'extracting' && <Loader2 size={18} color="#2563eb" style={{ animation: 'spin 1s linear infinite' }} />}
                    {p.status === 'done' && <CheckCircle2 size={20} color="#22c55e" />}
                    {p.status === 'error' && <XCircle size={20} color="#ef4444" />}
                  </div>
                </div>
                {p.status === 'error' && p.data?.detail && (
                  <div style={{ fontSize: '11px', color: '#dc2626', background: '#fef2f2', padding: '8px', borderRadius: '4px', border: '1px solid #fecaca', whiteSpace: 'pre-wrap', wordBreak: 'break-word', marginTop: '4px' }}>
                    {p.data.detail}
                  </div>
                )}
              </div>
            ))}
          </div>

          {isDone && (
            <div style={modalStyles.footer}>
              <div style={modalStyles.resultBox}>
                <div style={modalStyles.resultTitle}>전송 결과</div>
                {uploadStatus ? (
                  <>
                    <div>이미지 → Drive: <span style={{ color: '#16a34a', fontWeight: 600 }}>{uploadStatus.imageOk}건 성공</span>{uploadStatus.imageFail > 0 && <span style={{ color: '#dc2626' }}> / {uploadStatus.imageFail}건 실패</span>}</div>
                    <div>JSON → BigQuery: <span style={{ color: '#16a34a', fontWeight: 600 }}>{uploadStatus.jsonOk}건 성공</span>{uploadStatus.jsonFail > 0 && <span style={{ color: '#dc2626' }}> / {uploadStatus.jsonFail}건 실패</span>}</div>
                  </>
                ) : (
                  <div style={{ color: '#64748b' }}>전송 데이터 없음</div>
                )}
              </div>
              <div style={{ fontSize: '12px', color: '#94a3b8', textAlign: 'right' }}>3초 후 자동으로 초기화됩니다...</div>
            </div>
          )}
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  };

  return (
    <div style={styles.overlay}>
      {/* Header */}
      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <div style={styles.headerIcon}><FileText size={20} color="#fff" /></div>
          <h1 style={styles.headerTitle}>성적서 PDF 파서</h1>
        </div>
        <div style={styles.headerRight}>
          <button onClick={() => { saveTemplate(); showToast('ROI 템플릿이 저장되었습니다.'); }} style={styles.btnGhost}>ROI 템플릿 저장</button>
          {hasTemplate && (
            <>
              <button onClick={() => { clearTemplate(); showToast('ROI 템플릿이 초기화되었습니다.', 'warn'); }} style={styles.btnGhostRed}>초기화</button>
              <button 
                onClick={() => setShowTemplateBoxes(!showTemplateBoxes)} 
                style={styles.btnGhostGray}
              >
                {showTemplateBoxes ? <><EyeOff size={14}/> ROI 숨김</> : <><Eye size={14}/> ROI 표시</>}
              </button>
            </>
          )}
        </div>
      </header>

      {/* Main */}
      <div style={styles.main}>
        <PageThumbnailPanel
          file={fileUrl}
          numPages={numPages}
          activePage={activePage}
          onPageSelect={setActivePage}
          onMovePage={handleMovePage}
          onDeletePage={handleDeletePage}
          onFileChange={handleFileChange}
          onDocumentLoad={handleDocumentLoad}
          styles={styles}
        />

        <div style={styles.content}>
          <RoiToolbar
            fieldLabels={fieldLabels}
            fieldBorderColors={fieldBorderColors}
            globalBoxes={globalBoxes}
            activeField={activeField}
            onFieldToggle={toggleField}
            onProcess={handleProcessAll}
            processing={processing}
            batchActive={batchProgress.active}
            hasTemplate={hasTemplate}
            uploadStatus={uploadStatus}
            styles={styles}
          />

          <PdfCanvasPanel
            file={fileUrl}
            activePage={activePage}
            globalBoxes={globalBoxes}
            activeField={activeField}
            currentBox={currentBox}
            showTemplateBoxes={showTemplateBoxes}
            containerRef={containerRef}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onDocumentLoad={handleDocumentLoad}
            styles={styles}
            fieldBorderColors={fieldBorderColors}
            fieldBgColors={fieldBgColors}
            fieldLabels={fieldLabels}
          />
        </div>
      </div>

      {/* BatchProgress Modal */}
      {renderBatchModal()}

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: '24px', left: '50%', transform: 'translateX(-50%)',
          zIndex: 100, padding: '10px 24px', borderRadius: '8px',
          fontSize: '14px', fontWeight: 600, color: '#fff',
          background: toast.type === 'warn' ? '#f59e0b' : '#22c55e',
          boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
          animation: 'fadeIn 0.2s ease',
        }}>
          {toast.msg}
        </div>
      )}
      <style>{`@keyframes fadeIn { from { opacity: 0; transform: translateX(-50%) translateY(8px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }`}</style>

      {/* PDF 업로드 진행 상황 위젯 */}
      <PdfUploadProgressWidget 
        uploadStatus={uploadProgress} 
        uploading={uploading}
        onClose={resetStatus}
      />
    </div>
  );
}

export default NewPdfParserView;
