import React, { useState, useRef, useEffect, useCallback } from 'react';
import { FileText, Eye, EyeOff, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { pdfjs } from 'react-pdf';
import { PDFDocument } from 'pdf-lib';

// Hooks
import { usePdfTemplate } from '../viewmodels/usePdfTemplate';
import { usePdfBatch } from '../viewmodels/usePdfBatch';
import { usePdfUpload } from '../viewmodels/usePdfUpload';
import { usePdfGemini } from '../viewmodels/usePdfGemini';
import { useSiteMaster } from '../../hooks/useSiteMaster';

// Utils
import { getFullPageImageBlob, getPdfPageImageBlob } from '../utils/imageGenerator';
import { movePage, deletePage } from '../utils/pdfManipulator';

// Panels
import { PageThumbnailPanel, PdfCanvasPanel, RoiToolbar, UploadStatusPanel } from './panels';
import PdfUploadProgressWidget from './PdfUploadProgressWidget';

// Styles
import { getStyles } from './styles';

// ROI 크롭 이미지 Blob들을 세로로 합쳐 단일 이미지를 생성하는 헬퍼 함수
async function mergeRoiBlobs(blobs) {
  const images = await Promise.all(blobs.map(blob => new Promise((resolve, reject) => {
    const img = new Image();
    img.src = URL.createObjectURL(blob);
    img.onload = () => resolve(img);
    img.onerror = reject;
  })));

  if (images.length === 0) return null;

  const width = Math.max(...images.map(img => img.width));
  const height = images.reduce((sum, img) => sum + img.height, 0);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  let currentY = 0;
  images.forEach(img => {
    ctx.drawImage(img, 0, currentY);
    currentY += img.height;
    URL.revokeObjectURL(img.src);
  });

  return new Promise((resolve) => {
    canvas.toBlob(resolve, 'image/jpeg', 0.9);
  });
}

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
  info: '기본 정보 (날짜, 현장명)',
};

const fieldBorderColors = {
  info: '#2563eb',
};

const fieldBgColors = {
  info: 'rgba(37, 99, 235, 0.12)',
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
    resetBatch,
  } = usePdfBatch();
  
  const { uploadStatus, uploadProgress, processUploads, resetStatus, setUploadStatus } = usePdfUpload();

  const { callGeminiBatch, postProcessResults, checkPdfDuplicate } = usePdfGemini();
  const { siteMaster } = useSiteMaster();
  
  // Custom Confirm Modal State
  const [confirmModal, setConfirmModal] = useState({ active: false, message: '', onConfirm: null });
  
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
  // 실제 PDF 파싱 및 전송 실행부
  const executeProcessAll = async () => {
    const processingPages = Array.from({ length: Math.max(numPages - 1, 0) }, (_, idx) => idx + 2);
    if (processingPages.length === 0) {
      showToast('성적서 페이지가 없습니다. 첫 페이지 대시보드만 있는 PDF입니다.', 'error');
      return;
    }

    startBatch(processingPages.length);
    
    const roiBlobs = [];
    const fullImgBlobs = [];

    // 단계 A: 각 페이지의 이미지 크롭/변환 (로컬 Canvas 연산이므로 초고속!)
    try {
      for (const pageNum of processingPages) {
        // HMR(핫 리로드)이나 컴포넌트 소멸로 pdfDoc가 유실된 경우 안전 탈출
        if (!pdfDoc) {
          console.warn('[handleProcessAll] pdfDoc 객체가 유실되어 프로세스를 중단합니다.');
          return;
        }
        const displayIndex = processingPages.indexOf(pageNum) + 1;
        updatePageStatus(displayIndex, 'extracting', { detail: `PDF ${pageNum}페이지 크롭 중...` });
        // Try ROI image generation with retries; do not fallback to full page image
        const maxRetries = 3;
        let attempt = 0;
        let imgBlob = null;
        while (attempt < maxRetries && !imgBlob) {
          try {
            imgBlob = await getPdfPageImageBlob(pdfDoc, pageNum, globalBoxes);
          } catch (e) {
            console.error(`[handleProcessAll] ROI 이미지 변환 오류 (페이지 ${pageNum}) 시도 ${attempt + 1}:`, e);
          }
          attempt++;
        }
        if (!imgBlob) {
          console.error(`[handleProcessAll] ROI 이미지 변환 최종 실패 (페이지 ${pageNum})`);
          throw new Error('ROI 이미지 변환 실패');
        }
        const fullImgBlob = await getFullPageImageBlob(pdfDoc, pageNum);
        // fullImgBlob is still needed for later upload stages
        roiBlobs.push(imgBlob);
        fullImgBlobs.push(fullImgBlob || imgBlob);
        updatePageStatus(displayIndex, 'extracting', { detail: `PDF ${pageNum}페이지 크롭 완료` });
      }
    } catch (err) {
      console.error('[handleProcessAll] 이미지 변환 중 오류:', err);
      showToast('이미지 변환에 실패했습니다.', 'error');
      return;
    }

    // 단계 B & C: ROI 조각 세로 병합 및 Gemini 일괄 분석 (10페이지 단위 청크 분할 처리)
    let batchResults = [];
    try {
      setStage('extracting');
      
      const chunkSize = 10;
      const totalChunks = Math.ceil(processingPages.length / chunkSize);
      
      for (let c = 0; c < totalChunks; c++) {
        const startIdx = c * chunkSize;
        const endIdx = Math.min(startIdx + chunkSize, processingPages.length);
        const chunkBlobs = roiBlobs.slice(startIdx, endIdx);
        const chunkPageNumbers = Array.from({ length: endIdx - startIdx }, (_, idx) => startIdx + idx + 1);
        
        showToast(`현장명 조각 이미지 병합 중... (${c + 1}/${totalChunks})`, 'info');
        const chunkMergedBlob = await mergeRoiBlobs(chunkBlobs);
        if (!chunkMergedBlob) throw new Error(`병합 이미지 생성 실패 (그룹 ${c + 1})`);
        
        // 해당 청크 페이지들의 상태 업데이트
        for (const pNum of chunkPageNumbers) {
          updatePageStatus(pNum, 'extracting', { detail: `AI 일괄 분석 중... (${c + 1}/${totalChunks})` });
        }
        
        const chunkResults = await callGeminiBatch(chunkMergedBlob, chunkPageNumbers, (retryNum) => {
          for (const pNum of chunkPageNumbers) {
            updatePageStatus(pNum, 'extracting', { detail: `AI 재시도 중... (${retryNum})` });
          }
        }, siteMaster);
        
        if (Array.isArray(chunkResults)) {
          batchResults = [...batchResults, ...chunkResults];
        } else {
          console.warn(`[handleProcessAll] 그룹 ${c + 1} 결과가 배열이 아님:`, chunkResults);
        }
        
        // 해당 청크 페이지 분석 성공 처리
        for (const pNum of chunkPageNumbers) {
          updatePageStatus(pNum, 'done');
        }
      }
      
      showToast('현장명 일괄 분석 완료!', 'success');
    } catch (err) {
      console.error('[handleProcessAll] Gemini 분석 오류:', err);
      for (let i = 1; i <= processingPages.length; i++) {
        updatePageStatus(i, 'error', { detail: 'AI 분석 실패' });
      }
      showToast(`AI 분석 실패: ${err.message}`, 'error');
      return;
    }

    // 단계 D: Gemini 결과와 개별 전체 페이지 Blob 매핑 및 후처리
    const allResults = [];
    for (let i = 1; i <= processingPages.length; i++) {
      const pageResult = batchResults.find(r => Number(r.page) === i) || {
        include: false,
        record: { report_date: null, site_name: '미확인현장' },
        errors: ['missing_response']
      };
      pageResult.source_pdf_page = processingPages[i - 1];
      allResults.push({
        extracted: pageResult,
        imgBlob: fullImgBlobs[i - 1]
      });
    }

    // 후처리: 날짜/현장명 보정 + basename 생성
    const { finalResults } = postProcessResults(allResults, file.name, siteMaster);

    // 제외된 페이지 디버깅용 로그 추가
    const excludedPages = allResults.filter(r => !finalResults.some(f => f.extracted?.page === r.extracted?.page));
    if (excludedPages.length > 0) {
      console.warn('[Upload 디버그] 업로드에서 제외된 페이지 정보:', excludedPages.map(p => ({
        page: p.extracted?.page,
        errors: p.extracted?.errors,
        record: p.extracted?.record
      })));
    }

    // 업로드 단계
    setStage('uploading');
    console.log(`[Upload] 전체 ${allResults.length}건, include=true: ${finalResults.length}건`);

    const stats = await processUploads(finalResults, file.name);
    // processUploads 내부에서 setUploadStatus를 호출하지만
    // 렌더링 타이밍 보장을 위해 직접 설정
    setUploadStatus({ ...stats, completed: true });
    setStage('done');
  };

  // 파일명 중복을 감지하고 파싱 시작 단계를 제어하는 메인 버튼 핸들러
  const handleProcessAll = async () => {
    if (!pdfDoc || !file || !numPages) return;

    try {
      const checkResult = await checkPdfDuplicate(file.name);
      if (checkResult?.success && checkResult.exists) {
        setConfirmModal({
          active: true,
          message: `'${file.name}' 파일은 이미 업로드된 이력이 존재합니다. 그래도 강제로 다시 분석(Gemini 실행)하여 덮어쓰시겠습니까?`,
          onConfirm: () => {
            setConfirmModal({ active: false, message: '', onConfirm: null });
            executeProcessAll();
          }
        });
      } else {
        executeProcessAll();
      }
    } catch (err) {
      console.warn('PDF 중복 확인 예외 (진행 허용):', err);
      executeProcessAll();
    }
  };

  // ============================
  // 커스텀 Confirm 모달
  // ============================
  const renderConfirmModal = () => {
    if (!confirmModal.active) return null;

    return (
      <div style={modalStyles.overlay}>
        <div style={{
          ...modalStyles.box,
          maxWidth: '400px',
          padding: '24px',
          textAlign: 'center',
          gap: '16px'
        }}>
          <div style={{
            fontSize: '36px',
            lineHeight: 1
          }}>
            ⚠️
          </div>
          <div style={{
            fontSize: '15px',
            fontWeight: '600',
            color: '#1e293b',
            lineHeight: 1.5,
            whiteSpace: 'pre-line'
          }}>
            {confirmModal.message}
          </div>
          <div style={{
            display: 'flex',
            gap: '8px',
            marginTop: '8px'
          }}>
            <button
              onClick={() => {
                showToast('중복 감지로 작업이 취소되었습니다.', 'warn');
                setConfirmModal({ active: false, message: '', onConfirm: null });
              }}
              style={{
                flex: 1,
                padding: '10px',
                background: '#f1f5f9',
                color: '#475569',
                border: 'none',
                borderRadius: '6px',
                fontWeight: 'bold',
                cursor: 'pointer'
              }}
            >
              취소
            </button>
            <button
              onClick={confirmModal.onConfirm}
              style={{
                flex: 1,
                padding: '10px',
                background: '#2563eb',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                fontWeight: 'bold',
                cursor: 'pointer'
              }}
            >
              강제 진행
            </button>
          </div>
        </div>
      </div>
    );
  };

  // ============================
  // BatchProgress 모달
  // ============================
  const renderBatchModal = () => {
    if (!batchProgress.active) return null;

    const isExtracting = batchProgress.stage === 'preparing' || batchProgress.stage === 'extracting';
    const isUploadingStage = batchProgress.stage === 'uploading';
    const isDone = batchProgress.stage === 'done';

    // 진행률 계산
    let pct = 0;
    let doneLabel = '';
    let titleText = '';

    if (isExtracting) {
      titleText = '현장명 일괄 분석 중...';
      const donePages = batchProgress.pages.filter(p => p.status === 'done' || p.status === 'error').length;
      pct = batchProgress.total > 0 ? Math.round((donePages / batchProgress.total) * 100) : 0;
      doneLabel = `${donePages} / ${batchProgress.total} 분석 완료`;
    } else if (isUploadingStage) {
      titleText = 'Google Drive 이미지 전송 중...';
      const driveDone = uploadProgress?.driveDone || 0;
      const driveTotal = uploadProgress?.driveTotal || 0;
      pct = driveTotal > 0 ? Math.round((driveDone / driveTotal) * 100) : 0;
      doneLabel = `${driveDone} / ${driveTotal} 전송 완료`;
    } else if (isDone) {
      titleText = '성적서 업로드 완료';
      pct = 100;
      doneLabel = '완료';
    }

    const handleCloseModal = () => {
      resetBatch();
      resetStatus();
    };

    return (
      <div style={modalStyles.overlay}>
        <div style={{
          ...modalStyles.box,
          maxHeight: '90vh', // 최대 높이를 90vh로 조금 더 확장
          height: 'auto',
        }}>
          {/* Header (고정) */}
          <div style={modalStyles.header}>
            <div style={modalStyles.title}>
              {!isDone && <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} />}
              <span>{titleText}</span>
            </div>

            {/* 업로드 단계인 경우 현재 전송 중인 파일명 실시간 노출 */}
            {isUploadingStage && uploadProgress?.currentFileName && (
              <div style={{ 
                fontSize: '13px', 
                color: '#2563eb', 
                fontWeight: 600,
                marginTop: '10px',
                background: '#eff6ff',
                padding: '8px 14px',
                borderRadius: '6px',
                border: '1px solid #bfdbfe',
                display: 'inline-block',
                width: '100%',
                boxSizing: 'border-box'
              }}>
                📤 전송 중: {uploadProgress.currentFileName}
              </div>
            )}

            <div style={modalStyles.progressWrap}>
              <div style={modalStyles.progressLabel}>
                <span>{doneLabel}</span>
                <span>{pct}%</span>
              </div>
              <div style={modalStyles.progressTrack}>
                <div style={modalStyles.progressFill(pct)} />
              </div>
            </div>
          </div>

          {/* Scrollable Content Area (이 영역만 스크롤되도록 설정하여 하단 풋터가 잘리지 않게 함) */}
          <div style={{
            flex: 1,
            overflowY: 'auto',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            background: '#f8fafc',
            maxHeight: '50vh'
          }}>
            {/* AI 추출 단계일 때만 개별 페이지 목록을 보여줌 */}
            {isExtracting && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
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
                  </div>
                ))}
              </div>
            )}

            {/* 업로드 단계 또는 완료 단계일 때 전송 상세 내역을 보여줌 */}
            {(isUploadingStage || isDone) && (
              <div style={{ 
                padding: '16px', 
                background: '#fff', 
                borderRadius: '8px', 
                fontSize: '13px', 
                border: '1px solid #e2e8f0',
                color: '#475569',
                lineHeight: 1.6,
                boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
              }}>
                <div style={{ fontWeight: 700, marginBottom: '12px', color: '#1e293b', fontSize: '14px', borderBottom: '1px solid #f1f5f9', paddingBottom: '6px' }}>성적서 업로드 요약</div>
                {uploadProgress && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>성공적으로 전송됨:</span>
                      <span style={{ color: '#10b981', fontWeight: 700 }}>{uploadProgress.imageOk || 0}건</span>
                    </div>
                    {Number(uploadProgress.imageExists || 0) > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>중복 파일 스킵됨:</span>
                        <span style={{ color: '#f59e0b', fontWeight: 700 }}>{uploadProgress.imageExists}건</span>
                      </div>
                    )}
                    {Number(uploadProgress.imageFail || 0) > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>전송 실패:</span>
                        <span style={{ color: '#ef4444', fontWeight: 700 }}>{uploadProgress.imageFail}건</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* 완료 단계 추가 가이드 메시지 */}
            {isDone && (
              <div style={{
                textAlign: 'center',
                padding: '10px',
                color: '#1e293b',
                fontSize: '13px',
                fontWeight: 600,
                backgroundColor: '#f0fdf4',
                border: '1px dashed #bbf7d0',
                borderRadius: '6px'
              }}>
                🎉 모든 성적서 파일의 드라이브 전송 및 메타데이터 갱신이 안전하게 완료되었습니다!
              </div>
            )}
          </div>

          {/* Footer (고정) */}
          {isDone && (
            <div style={{
              ...modalStyles.footer,
              borderTop: '1px solid #f1f5f9',
              padding: '16px',
              background: '#fff'
            }}>
              <button 
                onClick={handleCloseModal}
                style={{
                  width: '100%',
                  padding: '14px',
                  backgroundColor: '#2563eb',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  fontSize: '14px',
                  boxShadow: '0 2px 8px rgba(37,99,235,0.25)',
                  transition: 'background-color 0.2s',
                }}
                onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#1d4ed8'}
                onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#2563eb'}
              >
                닫기 및 완료
              </button>
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

      {/* Custom Confirm Modal */}
      {renderConfirmModal()}

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
          zIndex: 100, padding: '16px 32px', borderRadius: '10px',
          fontSize: '15px', fontWeight: 700, color: '#fff',
          background: toast.type === 'warn' ? '#eab308' : '#10b981',
          boxShadow: '0 10px 30px rgba(0,0,0,0.3)',
          border: '1px solid rgba(255,255,255,0.2)',
          animation: 'fadeInCenter 0.2s ease-out',
        }}>
          {toast.msg}
        </div>
      )}
      <style>{`@keyframes fadeInCenter { from { opacity: 0; transform: translate(-50%, -40%); } to { opacity: 1; transform: translate(-50%, -50%); } }`}</style>
    </div>
  );
}

export default NewPdfParserView;
