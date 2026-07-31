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
  const generateThumbnail = useCallback(async (pageIndex, targetPages = null, scale = 0.5, options = {}) => {
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

      const dataUrl = options.documentCrop
        ? cropDocumentWithPadding(canvas, scale)
        : canvas.toDataURL('image/jpeg', 0.7);

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

/**
 * 흰 PDF 페이지 안에서 인쇄된 계산서 본문을 찾고, 외곽 3mm를 포함한 기준 이미지를 만든다.
 * ROI의 (0,0)은 이 결과 이미지의 좌상단이며 PDF 페이지의 좌상단이 아니다.
 */
function cropDocumentWithPadding(sourceCanvas, renderScale) {
  const context = sourceCanvas.getContext('2d', { willReadFrequently: true });
  if (!context) return sourceCanvas.toDataURL('image/jpeg', 0.9);
  const { width, height } = sourceCanvas;
  const pixels = context.getImageData(0, 0, width, height).data;

  // 상단 4.5% 및 하단 4.5%의 웹 프린트 헤더/푸터(AI경리나라, 웹 URL)를 제외한 실물 서식 스캔 영역
  const startY = Math.floor(height * 0.045);
  const endY = Math.floor(height * 0.955);

  let minX = width, minY = height, maxX = -1, maxY = -1;
  const stride = Math.max(1, Math.floor(Math.min(width, height) / 1200));

  for (let y = startY; y < endY; y += stride) {
    for (let x = 0; x < width; x += stride) {
      const offset = (y * width + x) * 4;
      // 흰 배경(235 이상)과 투명 픽셀은 문서 외곽 판정에서 제외한다.
      if (pixels[offset + 3] > 20 && (pixels[offset] < 235 || pixels[offset + 1] < 235 || pixels[offset + 2] < 235)) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }

  if (maxX < minX || maxY < minY) return sourceCanvas.toDataURL('image/jpeg', 0.9);

  // PDF는 72pt/inch이므로 3mm = 72 * 3 / 25.4 pt. 렌더 scale을 곱해 픽셀로 환산한다.
  const padding = Math.round((72 * 3 / 25.4) * renderScale);
  const left = Math.max(0, minX - padding);
  const top = Math.max(0, minY - padding);
  const right = Math.min(width, maxX + stride + padding);
  const bottom = Math.min(height, maxY + stride + padding);

  const cropped = document.createElement('canvas');
  cropped.width = Math.max(1, right - left);
  cropped.height = Math.max(1, bottom - top);
  cropped.getContext('2d')?.drawImage(sourceCanvas, left, top, cropped.width, cropped.height, 0, 0, cropped.width, cropped.height);
  const dataUrl = cropped.toDataURL('image/jpeg', 0.92);
  cropped.width = 0;
  cropped.height = 0;
  return dataUrl;
}
