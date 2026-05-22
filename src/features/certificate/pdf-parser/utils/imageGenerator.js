/**
 * PDF 페이지 이미지 생성 유틸리티
 * Full page image와 ROI crop composite image 생성
 */

/**
 * 전체 페이지 이미지 Blob 생성 (Drive 업로드용)
 * @param {PDFPageProxy} pdfDocument - pdf-lib 페이지 객체
 * @param {number} pageNum - 페이지 번호
 * @param {number} scale - 렌더링 스케일 (기본 2.0)
 * @returns {Promise<Blob|null>} JPEG Blob
 */
export async function getFullPageImageBlob(pdfDocument, pageNum, scale = 2.0) {
  try {
    const page = await pdfDocument.getPage(pageNum);
    const viewport = page.getViewport({ scale });
    
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    
    await page.render({ canvasContext: ctx, viewport }).promise;
    
    const blob = await new Promise((resolve) => {
      canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.88);
    });
    
    page.cleanup();
    canvas.width = 0;
    canvas.height = 0;
    
    return blob;
  } catch (e) {
    console.error('[getFullPageImageBlob] Error:', e);
    return null;
  }
}

/**
 * ROI 영역 크롭 합성 이미지 Blob 생성 (Gemini API용)
 * @param {PDFPageProxy} pdfDocument - pdf-lib 페이지 객체
 * @param {number} pageNum - 페이지 번호
 * @param {Object} globalBoxes - ROI 영역 정의 { field: {x, y, width, height} }
 * @param {number} scale - 렌더링 스케일 (기본 2.0)
 * @returns {Promise<Blob|null>} JPEG Blob
 */
export async function getPdfPageImageBlob(pdfDocument, pageNum, globalBoxes = {}, scale = 2.0) {
  try {
    const page = await pdfDocument.getPage(pageNum);
    const viewport = page.getViewport({ scale });
    
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    
    await page.render({ canvasContext: ctx, viewport }).promise;

    const roiKeys = Object.keys(globalBoxes);
    
    // ROI 영역이 있으면 크롭 합성
    if (roiKeys.length > 0) {
      const PADDING = 8;
      const ROI_W = 600;
      
      const crops = roiKeys.map(field => {
        const box = globalBoxes[field];
        const sx = Math.max(0, box.x * scale - PADDING);
        const sy = Math.max(0, box.y * scale - PADDING);
        const sw = Math.min(canvas.width - sx, box.width * scale + PADDING * 2);
        const sh = Math.min(canvas.height - sy, box.height * scale + PADDING * 2);
        const scaleFactor = ROI_W / sw;
        return { field, sx, sy, sw, sh, dh: Math.round(sh * scaleFactor) };
      });
      
      const GAP = 6;
      const totalH = crops.reduce((sum, c) => sum + c.dh + GAP, 0);
      
      const outCanvas = document.createElement('canvas');
      outCanvas.width = ROI_W;
      outCanvas.height = totalH;
      
      const outCtx = outCanvas.getContext('2d');
      outCtx.fillStyle = '#fff';
      outCtx.fillRect(0, 0, ROI_W, totalH);
      
      let offsetY = 0;
      for (const c of crops) {
        outCtx.drawImage(canvas, c.sx, c.sy, c.sw, c.sh, 0, offsetY, ROI_W, c.dh);
        offsetY += c.dh + GAP;
      }
      
      const blob = await new Promise((resolve) => {
        outCanvas.toBlob((b) => resolve(b), 'image/jpeg', 0.88);
      });
      
      page.cleanup();
      canvas.width = 0;
      canvas.height = 0;
      outCanvas.width = 0;
      outCanvas.height = 0;
      
      return blob;
    }

    // ROI 없으면 전체 페이지 반환
    const blob = await new Promise((resolve) => {
      canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.82);
    });
    
    page.cleanup();
    canvas.width = 0;
    canvas.height = 0;
    
    return blob;
  } catch (e) {
    console.error('[getPdfPageImageBlob] Error:', e);
    return null;
  }
}

/**
 * Blob을 Base64 Data URL로 변환
 * @param {Blob} blob - 변환할 Blob
 * @returns {Promise<string>} Data URL
 */
export function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
