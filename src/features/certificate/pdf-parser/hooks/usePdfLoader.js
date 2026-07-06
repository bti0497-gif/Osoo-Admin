import { useState, useCallback, useRef } from 'react';
import { pdfjs } from 'react-pdf';

// file:// 프로토콜에서도 동작하도록 worker 경로 설정
if (typeof window !== 'undefined' && window.location.protocol === 'file:') {
  const base = window.location.href.replace(/\/[^/]*$/, '');
  pdfjs.GlobalWorkerOptions.workerSrc = `${base}/pdf.worker.min.mjs`;
} else {
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url
  ).toString();
}

/**
 * usePdfLoader — PDF 파일 로드 및 썸네일 생성
 */
export function usePdfLoader() {
  const [pdfDocument, setPdfDocument] = useState(null);
  const [pages, setPages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // PDF 분석 및 썸네일 생성 진행률 상태
  const [pdfProgress, setPdfProgress] = useState({ current: 0, total: 0, percent: 0, message: '' });

  // 비동기 렌더링 상태 지연을 방지하기 위한 최신 pdfDocument 참조
  const pdfDocumentRef = useRef(null);

  /**
   * PDF 파일 로드
   */
  const loadPdf = useCallback(async (file) => {
    setLoading(true);
    setError(null);
    setPdfProgress({ current: 0, total: 0, percent: 0, message: 'PDF 파일을 불러오는 중...' });

    try {
      const arrayBuffer = await file.arrayBuffer();
      const loadingTask = pdfjs.getDocument(arrayBuffer);
      const pdf = await loadingTask.promise;

      setPdfDocument(pdf);
      pdfDocumentRef.current = pdf;

      const totalPages = pdf.numPages;
      setPdfProgress({ current: 0, total: totalPages, percent: 0, message: `PDF 구조 분석 준비 중... (0/${totalPages})` });

      // 페이지 정보 생성
      const pageData = [];
      for (let i = 1; i <= totalPages; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 1.0 });

        pageData.push({
          pageIndex: i - 1,
          pageNum: i,
          viewport,
          thumbnail: null, // 나중에 썸네일 생성
          roiImage: null, // 나중에 ROI 이미지 생성
          matchedSite: null,
          status: 'pending',
        });

        page.cleanup();
        
        // 전체 진행률의 30%를 구조 분석 단계에 분배
        const percent = Math.round((i / totalPages) * 30);
        setPdfProgress({
          current: i,
          total: totalPages,
          percent,
          message: `PDF 구조 분석 중... (${i}/${totalPages})`
        });
      }

      setPages(pageData);
      return pageData;
    } catch (err) {
      console.error('[usePdfLoader] PDF 로드 오류:', err);
      setError(err.message);
      setPdfProgress({ current: 0, total: 0, percent: 0, message: '' });
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * 썸네일 생성
   */
  const generateThumbnail = useCallback(async (pageIndex, targetPages = null, scale = 0.5) => {
    const pdf = pdfDocumentRef.current || pdfDocument;
    if (!pdf) {
      console.log('[usePdfLoader] pdfDocument가 없음');
      return null;
    }

    const pagesToUse = targetPages || pages;
    const pageData = pagesToUse[pageIndex];
    if (!pageData) {
      console.log('[usePdfLoader] pageData가 없음');
      return null;
    }

    try {
      const page = await pdf.getPage(pageData.pageNum);
      const viewport = page.getViewport({ scale });

      // DOM canvasRef 대신 메모리 상에 동적 canvas 엘리먼트 생성
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        console.log('[usePdfLoader] canvas context가 없음');
        return null;
      }

      canvas.width = viewport.width;
      canvas.height = viewport.height;

      await page.render({ canvasContext: ctx, viewport }).promise;

      const dataUrl = canvas.toDataURL('image/jpeg', 0.7);

      page.cleanup();
      canvas.width = 0;
      canvas.height = 0;

      return dataUrl;
    } catch (err) {
      console.error('[usePdfLoader] 썸네일 생성 오류:', err);
      return null;
    }
  }, [pdfDocument, pages]);

  /**
   * ROI 영역 크롭 이미지 생성
   */
  const generateRoiImage = useCallback(async (pageIndex, roiBox, targetPages = null, scale = 2.0) => {
    const pdf = pdfDocumentRef.current || pdfDocument;
    if (!pdf) return null;

    const pagesToUse = targetPages || pages;
    const pageData = pagesToUse[pageIndex];
    if (!pageData || !roiBox) return null;

    try {
      const page = await pdf.getPage(pageData.pageNum);
      const viewport = page.getViewport({ scale });

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;

      canvas.width = viewport.width;
      canvas.height = viewport.height;

      await page.render({ canvasContext: ctx, viewport }).promise;

      // ROI 영역 크롭 (절대 픽셀 좌표에 scale 배율 및 PADDING을 곱하여 정확히 적용)
      const roiCanvas = document.createElement('canvas');
      const roiCtx = roiCanvas.getContext('2d');

      const { x, y, width, height } = roiBox;
      const PADDING = 8;
      const sx = Math.max(0, x * scale - PADDING);
      const sy = Math.max(0, y * scale - PADDING);
      const sWidth = Math.min(canvas.width - sx, width * scale + PADDING * 2);
      const sHeight = Math.min(canvas.height - sy, height * scale + PADDING * 2);

      roiCanvas.width = sWidth;
      roiCanvas.height = sHeight;

      roiCtx.drawImage(
        canvas,
        sx,
        sy,
        sWidth,
        sHeight,
        0,
        0,
        sWidth,
        sHeight
      );

      const dataUrl = roiCanvas.toDataURL('image/jpeg', 0.9);

      page.cleanup();
      canvas.width = 0;
      canvas.height = 0;
      roiCanvas.width = 0;
      roiCanvas.height = 0;

      // 로컬 pages 데이터도 바로 갱신
      setPages(prev => {
        const next = [...prev];
        if (next[pageIndex]) {
          next[pageIndex] = { ...next[pageIndex], roiImage: dataUrl };
        }
        return next;
      });

      return dataUrl;
    } catch (err) {
      console.error('[usePdfLoader] ROI 이미지 생성 오류:', err);
      return null;
    }
  }, [pdfDocument, pages]);

  /**
   * 모든 썸네일 생성
   */
  const generateAllThumbnails = useCallback(async (targetPages = null) => {
    const pagesToProcess = targetPages || pages;
    const total = pagesToProcess.length;
    console.log('[usePdfLoader] generateAllThumbnails 호출, pages.length:', total);
    const updatedPages = [...pagesToProcess];

    for (let i = 0; i < updatedPages.length; i++) {
      console.log('[usePdfLoader] 썸네일 생성 중:', i);
      
      // 나머지 70% 구간을 썸네일 생성 단계에 분배 (30% ~ 100%)
      const percent = 30 + Math.round(((i + 1) / total) * 70);
      setPdfProgress({
        current: i + 1,
        total,
        percent,
        message: `페이지 썸네일 생성 중... (${i + 1}/${total})`
      });

      const thumbnail = await generateThumbnail(i, updatedPages);
      if (thumbnail) {
        updatedPages[i] = { ...updatedPages[i], thumbnail };
        console.log('[usePdfLoader] 썸네일 저장 완료:', i);
      } else {
        console.log('[usePdfLoader] 썸네일 생성 실패:', i);
      }
    }

    console.log('[usePdfLoader] generateAllThumbnails 완료, setPages 호출');
    setPages(updatedPages);
    
    setPdfProgress({
      current: total,
      total,
      percent: 100,
      message: '모든 페이지 분석 및 썸네일 생성이 완료되었습니다!'
    });
    
    // 완료 문구를 잠시 표시한 후 토스트 상태 초기화
    setTimeout(() => {
      setPdfProgress({ current: 0, total: 0, percent: 0, message: '' });
    }, 1500);

  }, [pages, generateThumbnail]);

  /**
   * 초기화
   */
  const reset = useCallback(() => {
    setPdfDocument(null);
    pdfDocumentRef.current = null;
    setPages([]);
    setLoading(false);
    setError(null);
    setPdfProgress({ current: 0, total: 0, percent: 0, message: '' });
  }, []);

  return {
    pdfDocument,
    pages,
    setPages,
    loading,
    pdfProgress,
    error,
    loadPdf,
    generateThumbnail,
    generateRoiImage,
    generateAllThumbnails,
    reset,
  };
}
