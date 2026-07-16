/**
 * pdfModel — PDF 처리 모델 (데이터 및 순수 로직)
 * 
 * Model 역할:
 * - PDF 파일 로드 및 파싱
 * - 이미지 생성 (썸네일, ROI)
 * - 데이터 변환
 */

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

export class PdfModel {
  /**
   * PDF 문서 로드
   */
  static async loadPdfDocument(file) {
    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjs.getDocument(arrayBuffer);
    return await loadingTask.promise;
  }

  /**
   * 페이지 정보 생성
   */
  static async createPageData(pdf) {
    const pageData = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 1.0 });

      pageData.push({
        pageIndex: i - 1,
        pageNum: i,
        viewport,
        thumbnail: null,
        roiImage: null,
        matchedSite: null,
        status: 'pending',
      });

      page.cleanup();
    }
    return pageData;
  }

  /**
   * 썸네일 생성
   */
  static async generateThumbnail(pdf, pageIndex, scale, canvas) {
    const page = await pdf.getPage(pageIndex + 1);
    const viewport = page.getViewport({ scale });

    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    canvas.width = viewport.width;
    canvas.height = viewport.height;

    await page.render({ canvasContext: ctx, viewport }).promise;

    const dataUrl = canvas.toDataURL('image/jpeg', 0.7);

    page.cleanup();
    canvas.width = 0;
    canvas.height = 0;

    return dataUrl;
  }

  /**
   * ROI 영역 크롭 이미지 생성
   */
  static async generateRoiImage(pdf, pageIndex, roiBox, scale, canvas) {
    const page = await pdf.getPage(pageIndex + 1);
    const viewport = page.getViewport({ scale });

    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    canvas.width = viewport.width;
    canvas.height = viewport.height;

    await page.render({ canvasContext: ctx, viewport }).promise;

    // ROI 영역 크롭
    const roiCanvas = document.createElement('canvas');
    const roiCtx = roiCanvas.getContext('2d');

    const { x, y, width, height } = roiBox;
    roiCanvas.width = width * scale;
    roiCanvas.height = height * scale;

    roiCtx.drawImage(
      canvas,
      x * scale,
      y * scale,
      width * scale,
      height * scale,
      0,
      0,
      width * scale,
      height * scale
    );

    const dataUrl = roiCanvas.toDataURL('image/jpeg', 0.9);

    page.cleanup();
    canvas.width = 0;
    canvas.height = 0;

    return dataUrl;
  }
}
