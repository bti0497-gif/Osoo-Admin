/**
 * PDF 조작 유틸리티
 * 페이지 이동, 삭제 등 PDF 구조 변경 작업
 */

/**
 * PDF 페이지 순서 변경
 * @param {File} file - 원본 PDF 파일
 * @param {number} pageIndex - 이동할 페이지 번호 (1-based)
 * @param {string} direction - 'up' | 'down'
 * @param {PDFDocument} PDFDocument - pdf-lib PDFDocument 클래스
 * @returns {Promise<{file: File, newPageCount: number, newActivePage: number}|null>}
 */
export async function movePage(file, pageIndex, direction, PDFDocument) {
  if (!file) return null;
  
  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdfDocLib = await PDFDocument.load(arrayBuffer);
    
    const targetIndex = pageIndex - 1;
    const swapIndex = direction === 'up' ? targetIndex - 1 : targetIndex + 1;
    
    if (swapIndex < 0 || swapIndex >= pdfDocLib.getPageCount()) {
      return null;
    }
    
    const pageCount = pdfDocLib.getPageCount();
    const newPdf = await PDFDocument.create();
    
    // 페이지 순서 재배열
    const indices = Array.from({ length: pageCount }, (_, i) => i);
    [indices[targetIndex], indices[swapIndex]] = [indices[swapIndex], indices[targetIndex]];
    
    const copiedPages = await newPdf.copyPages(pdfDocLib, indices);
    copiedPages.forEach(p => newPdf.addPage(p));
    
    const pdfBytes = await newPdf.save();
    const newFile = new File([pdfBytes], file.name, { type: 'application/pdf' });
    
    return {
      file: newFile,
      newPageCount: newPdf.getPageCount(),
      newActivePage: swapIndex + 1,
    };
  } catch (err) {
    console.error('[movePage] Error:', err);
    return null;
  }
}

/**
 * PDF 페이지 삭제
 * @param {File} file - 원본 PDF 파일
 * @param {number} pageIndex - 삭제할 페이지 번호 (1-based)
 * @param {number} currentActivePage - 현재 활성 페이지 (1-based)
 * @param {PDFDocument} PDFDocument - pdf-lib PDFDocument 클래스
 * @returns {Promise<{file: File|null, newPageCount: number, newActivePage: number}|null>}
 */
export async function deletePage(file, pageIndex, currentActivePage, PDFDocument) {
  if (!file) return null;
  
  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdfDocLib = await PDFDocument.load(arrayBuffer);
    const targetIndex = pageIndex - 1;
    
    // 마지막 페이지 삭제 시 파일 전체 삭제
    if (pdfDocLib.getPageCount() <= 1) {
      return {
        file: null,
        newPageCount: 0,
        newActivePage: 1,
      };
    }
    
    pdfDocLib.removePage(targetIndex);
    const pdfBytes = await pdfDocLib.save();
    const newFile = new File([pdfBytes], file.name, { type: 'application/pdf' });
    
    // 활성 페이지 조정
    let newActivePage = currentActivePage;
    if (currentActivePage === pageIndex) {
      newActivePage = Math.max(1, pageIndex - 1);
    } else if (currentActivePage > pageIndex) {
      newActivePage = currentActivePage - 1;
    }
    
    return {
      file: newFile,
      newPageCount: pdfDocLib.getPageCount(),
      newActivePage,
    };
  } catch (err) {
    console.error('[deletePage] Error:', err);
    return null;
  }
}

/**
 * PDF 메타데이터 추출
 * @param {File} file - PDF 파일
 * @returns {Promise<{pageCount: number, title: string|null, author: string|null}|null>}
 */
export async function getPdfMetadata(file) {
  if (!file) return null;
  
  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await PDFDocument.load(arrayBuffer, { 
      updateMetadata: false 
    });
    
    return {
      pageCount: pdf.getPageCount(),
      title: pdf.getTitle(),
      author: pdf.getAuthor(),
    };
  } catch (err) {
    console.error('[getPdfMetadata] Error:', err);
    return null;
  }
}
