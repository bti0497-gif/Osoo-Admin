import React, { useState, useCallback, useRef } from 'react';
import { useExcelParser } from '../../excel-upload/hooks/useExcelParser';
import { useCertificateUpload } from '../hooks/useCertificateUpload';
import { useSiteMaster } from '../../hooks/useSiteMaster';

export function CertificateUploadView() {
  const [excelFiles, setExcelFiles] = useState([]);
  const [pdfFiles, setPdfFiles] = useState([]);
  const [excelDragActive, setExcelDragActive] = useState(false);
  const [pdfDragActive, setPdfDragActive] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);
  
  // 개별 프로그레스 상태
  const [excelProgress, setExcelProgress] = useState({ show: false, percent: 0, message: '' });
  const [pdfProgress, setPdfProgress] = useState({ show: false, percent: 0, message: '' });

  const excelInputRef = useRef(null);
  const pdfInputRef = useRef(null);

  const { parseExcel, transformToBigQueryFormat, filterValidRows } = useExcelParser();
  const { uploadToBigQuery, uploadPdfToDrive } = useCertificateUpload();
  const { siteMaster } = useSiteMaster();

  // Excel 드래그 앤 드롭
  const handleExcelDrag = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setExcelDragActive(true);
    } else if (e.type === 'dragleave') {
      setExcelDragActive(false);
    }
  }, []);

  const handleExcelDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setExcelDragActive(false);
    
    const files = e.dataTransfer.files;
    const excelFiles = Array.from(files).filter(f => 
      f.name.endsWith('.xlsx') || f.name.endsWith('.xls')
    );
    setExcelFiles(prev => [...prev, ...excelFiles]);
  }, []);

  // PDF 드래그 앤 드롭
  const handlePdfDrag = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setPdfDragActive(true);
    } else if (e.type === 'dragleave') {
      setPdfDragActive(false);
    }
  }, []);

  const handlePdfDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setPdfDragActive(false);
    
    const files = e.dataTransfer.files;
    const pdfFiles = Array.from(files).filter(f => 
      f.name.endsWith('.pdf')
    );
    setPdfFiles(prev => [...prev, ...pdfFiles]);
  }, []);

  // 파일 선택
  const handleExcelSelect = useCallback((e) => {
    const files = Array.from(e.target.files);
    setExcelFiles(prev => [...prev, ...files]);
  }, []);

  const handlePdfSelect = useCallback((e) => {
    const files = Array.from(e.target.files);
    setPdfFiles(prev => [...prev, ...files]);
  }, []);

  // 파일 제거
  const removeExcelFile = useCallback((index) => {
    setExcelFiles(prev => prev.filter((_, i) => i !== index));
  }, []);

  const removePdfFile = useCallback((index) => {
    setPdfFiles(prev => prev.filter((_, i) => i !== index));
  }, []);

  // Excel 업로드
  const handleExcelUpload = useCallback(async () => {
    setIsUploading(true);
    setUploadResult(null);
    setExcelProgress({ show: true, percent: 10, message: '파일 파싱 중...' });
    
    const result = { success: 0, failed: 0, totalRows: 0 };
    
    try {
      for (let i = 0; i < excelFiles.length; i++) {
        const file = excelFiles[i];
        const progress = Math.round(((i + 1) / excelFiles.length) * 100);
        setExcelProgress({ show: true, percent: progress, message: `${file.name} 처리 중...` });
        
        console.log('[Excel Upload] 처리:', file.name);
        try {
          const parseResult = await parseExcel(file);
          if (parseResult.success) {
            setExcelProgress({ show: true, percent: progress, message: '데이터 변환 중...' });
            const validRows = filterValidRows(parseResult.data);
            const bigQueryData = transformToBigQueryFormat(validRows, siteMaster);
            
            setExcelProgress({ show: true, percent: progress, message: 'BigQuery 업로드 중...' });
            const uploadResult = await uploadToBigQuery(bigQueryData);
            if (uploadResult.success) {
              result.success++;
              result.totalRows += bigQueryData.length;
            } else {
              result.failed++;
            }
          } else {
            result.failed++;
          }
        } catch (err) {
          console.error('[Excel Upload] 처리 오류:', err);
          result.failed++;
        }
      }

      setExcelProgress({ show: true, percent: 100, message: '완료!' });
      
      setUploadResult({
        success: result.failed === 0,
        message: `Excel: ${result.success}개 파일, ${result.totalRows}행 업로드 완료`,
        type: 'excel'
      });

      if (result.failed === 0) {
        setTimeout(() => setExcelProgress({ show: false, percent: 0, message: '' }), 1500);
        setExcelFiles([]);
      }
    } catch (err) {
      setUploadResult({
        success: false,
        message: `Excel 업로드 오류: ${err.message}`,
        type: 'excel'
      });
    } finally {
      setIsUploading(false);
    }
  }, [excelFiles, parseExcel, filterValidRows, transformToBigQueryFormat, uploadToBigQuery]);

  // PDF 업로드
  const handlePdfUpload = useCallback(async () => {
    setIsUploading(true);
    setUploadResult(null);
    setPdfProgress({ show: true, percent: 10, message: 'PDF 변환 중...' });
    
    const result = { success: 0, failed: 0 };
    
    try {
      for (let i = 0; i < pdfFiles.length; i++) {
        const file = pdfFiles[i];
        const progress = Math.round(((i + 1) / pdfFiles.length) * 100);
        setPdfProgress({ show: true, percent: progress, message: `${file.name} OCR 처리 중...` });
        
        console.log('[PDF Upload] 처리:', file.name);
        try {
          setPdfProgress({ show: true, percent: progress, message: '현장명 추출 중...' });
          const siteName = await extractSiteNamesFromPdf(file);
          console.log('[PDF Upload] 추출된 현장명:', siteName);
          
          setPdfProgress({ show: true, percent: progress, message: 'Drive 업로드 중...' });
          // TODO: Drive 업로드 API 연결
          console.log('[PDF Upload] Drive 업로드 준비:', { fileName: file.name, siteName });
          result.success++;
        } catch (err) {
          console.error('[PDF Upload] 처리 오류:', err);
          result.failed++;
        }
      }

      setPdfProgress({ show: true, percent: 100, message: '완료!' });
      
      setUploadResult({
        success: result.failed === 0,
        message: `PDF: ${result.success}개 파일 업로드 준비 완료`,
        type: 'pdf'
      });

      if (result.failed === 0) {
        setTimeout(() => setPdfProgress({ show: false, percent: 0, message: '' }), 1500);
        setPdfFiles([]);
      }
    } catch (err) {
      setUploadResult({
        success: false,
        message: `PDF 업로드 오류: ${err.message}`,
        type: 'pdf'
      });
    } finally {
      setIsUploading(false);
    }
  }, [pdfFiles]);

  const dropZoneStyle = (isActive, color) => ({
    border: `3px dashed ${isActive ? color : '#94a3b8'}`,
    borderRadius: '12px',
    padding: '40px 20px',
    textAlign: 'center',
    backgroundColor: isActive ? `${color}10` : '#f8fafc',
    transition: 'all 0.3s ease',
    cursor: 'pointer'
  });

  return (
    <div style={{ padding: '20px', maxWidth: '1000px', margin: '0 auto' }}>
      <h2 style={{ marginBottom: '10px' }}>성적서 올리기</h2>
      <p style={{ color: '#64748b', marginBottom: '30px' }}>
        엑셀 파일은 수치를 파싱하여 BigQuery에, PDF는 이미지로 Drive에 업로드됩니다.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
        {/* Excel 업로드 영역 */}
        <div>
          <h3 style={{ marginBottom: '10px', color: '#2563eb' }}>📊 Excel 파일 (수치 → BigQuery)</h3>
          <div
            style={dropZoneStyle(excelDragActive, '#2563eb')}
            onDragEnter={handleExcelDrag}
            onDragLeave={handleExcelDrag}
            onDragOver={handleExcelDrag}
            onDrop={handleExcelDrop}
            onClick={() => excelInputRef.current?.click()}
          >
            <input
              ref={excelInputRef}
              type="file"
              multiple
              accept=".xlsx,.xls"
              onChange={handleExcelSelect}
              style={{ display: 'none' }}
            />
            <div style={{ fontSize: '48px', marginBottom: '10px' }}>📈</div>
            <p style={{ fontWeight: 'bold', color: '#334155' }}>
              {excelDragActive ? '여기에 놓으세요!' : 'Excel 파일을 드래그하거나 클릭'}
            </p>
            <p style={{ fontSize: '12px', color: '#64748b' }}>.xlsx, .xls 파일 지원</p>
          </div>

          {/* Excel 파일 목록 + 업로드 버튼 */}
          {excelFiles.length > 0 && (
            <div style={{ marginTop: '10px' }}>
              {excelFiles.map((file, index) => (
                <div key={index} style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '8px 12px',
                  backgroundColor: '#eff6ff',
                  borderRadius: '6px',
                  marginBottom: '5px'
                }}>
                  <span style={{ fontSize: '13px', color: '#1e40af' }}>📄 {file.name}</span>
                  <button
                    onClick={() => removeExcelFile(index)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#dc2626',
                      cursor: 'pointer',
                      fontSize: '16px'
                    }}
                  >
                    ✕
                  </button>
                </div>
              ))}
              
              {/* Excel 업로드 버튼 */}
              <button
                onClick={handleExcelUpload}
                disabled={isUploading}
                style={{
                  width: '100%',
                  marginTop: '10px',
                  padding: '12px',
                  backgroundColor: isUploading ? '#94a3b8' : '#2563eb',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: isUploading ? 'not-allowed' : 'pointer',
                  fontWeight: 'bold',
                  fontSize: '14px'
                }}
              >
                {isUploading ? '⏳ 업로드 중...' : '📤 Excel 업로드'}
              </button>
              
              {/* Excel 프로그레스바 */}
              {excelProgress.show && (
                <div style={{ marginTop: '15px' }}>
                  <div style={{ fontSize: '13px', color: '#334155', marginBottom: '5px' }}>
                    ⏳ {excelProgress.message}
                  </div>
                  <div style={{
                    width: '100%',
                    height: '8px',
                    backgroundColor: '#e2e8f0',
                    borderRadius: '4px',
                    overflow: 'hidden'
                  }}>
                    <div style={{
                      width: `${excelProgress.percent}%`,
                      height: '100%',
                      backgroundColor: '#2563eb',
                      transition: 'width 0.3s ease'
                    }} />
                  </div>
                  <div style={{ fontSize: '12px', color: '#64748b', textAlign: 'center', marginTop: '3px' }}>
                    {excelProgress.percent}%
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* PDF 업로드 영역 */}
        <div>
          <h3 style={{ marginBottom: '10px', color: '#16a34a' }}>📄 PDF 파일 (이미지 → Drive)</h3>
          <div
            style={dropZoneStyle(pdfDragActive, '#16a34a')}
            onDragEnter={handlePdfDrag}
            onDragLeave={handlePdfDrag}
            onDragOver={handlePdfDrag}
            onDrop={handlePdfDrop}
            onClick={() => pdfInputRef.current?.click()}
          >
            <input
              ref={pdfInputRef}
              type="file"
              multiple
              accept=".pdf"
              onChange={handlePdfSelect}
              style={{ display: 'none' }}
            />
            <div style={{ fontSize: '48px', marginBottom: '10px' }}>📑</div>
            <p style={{ fontWeight: 'bold', color: '#334155' }}>
              {pdfDragActive ? '여기에 놓으세요!' : 'PDF 파일을 드래그하거나 클릭'}
            </p>
            <p style={{ fontSize: '12px', color: '#64748b' }}>.pdf 파일 지원 (현장명 자동 추출)</p>
          </div>

          {/* PDF 파일 목록 + 업로드 버튼 */}
          {pdfFiles.length > 0 && (
            <div style={{ marginTop: '10px' }}>
              {pdfFiles.map((file, index) => (
                <div key={index} style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '8px 12px',
                  backgroundColor: '#f0fdf4',
                  borderRadius: '6px',
                  marginBottom: '5px'
                }}>
                  <span style={{ fontSize: '13px', color: '#166534' }}>📑 {file.name}</span>
                  <button
                    onClick={() => removePdfFile(index)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#dc2626',
                      cursor: 'pointer',
                      fontSize: '16px'
                    }}
                  >
                    ✕
                  </button>
                </div>
              ))}
              
              {/* PDF 업로드 버튼 */}
              <button
                onClick={handlePdfUpload}
                disabled={isUploading}
                style={{
                  width: '100%',
                  marginTop: '10px',
                  padding: '12px',
                  backgroundColor: isUploading ? '#94a3b8' : '#16a34a',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: isUploading ? 'not-allowed' : 'pointer',
                  fontWeight: 'bold',
                  fontSize: '14px'
                }}
              >
                {isUploading ? '⏳ 업로드 중...' : '📤 PDF 업로드'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 결과 메시지 */}
      {uploadResult && (
        <div style={{
          marginTop: '20px',
          padding: '15px',
          borderRadius: '8px',
          backgroundColor: uploadResult.success ? '#dcfce7' : '#fee2e2',
          color: uploadResult.success ? '#166534' : '#991b1b',
          textAlign: 'center'
        }}>
          {uploadResult.success ? '✅' : '❌'} {uploadResult.message}
        </div>
      )}
    </div>
  );
}

// PDF에서 모든 페이지의 현장명 ROI 추출하여 병합
async function extractSiteNamesFromPdf(file) {
  try {
    const pdfjs = await import('pdfjs-dist');
    pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
    const numPages = pdf.numPages;
    
    console.log(`[ROI OCR] PDF 총 ${numPages}페이지`);
    
    // ROI 설정
    const ROI = { x: 0.40, y: 0.22, width: 0.55, height: 0.06 };
    const scale = 2;
    
    // 각 페이지의 ROI 이미지 수집
    const roiImages = [];
    const roiHeight = 100; // 고정 높이
    const roiWidth = 400;  // 고정 너비
    
    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale });
      
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      
      await page.render({ canvasContext: ctx, viewport }).promise;
      
      // ROI 크롭
      const x = Math.floor(canvas.width * ROI.x);
      const y = Math.floor(canvas.height * ROI.y);
      const w = Math.floor(canvas.width * ROI.width);
      const h = Math.floor(canvas.height * ROI.height);
      
      const roiCanvas = document.createElement('canvas');
      const roiCtx = roiCanvas.getContext('2d');
      roiCanvas.width = roiWidth;
      roiCanvas.height = roiHeight;
      roiCtx.drawImage(canvas, x, y, w, h, 0, 0, roiWidth, roiHeight);
      
      roiImages.push({ pageNum, canvas: roiCanvas });
    }
    
    // 모든 ROI를 하나의 이미지로 병합 (세로로)
    const mergedCanvas = document.createElement('canvas');
    const mergedCtx = mergedCanvas.getContext('2d');
    mergedCanvas.width = roiWidth + 100; // 페이지 번호 공간
    mergedCanvas.height = roiHeight * numPages;
    
    // 흰색 배경
    mergedCtx.fillStyle = 'white';
    mergedCtx.fillRect(0, 0, mergedCanvas.width, mergedCanvas.height);
    
    roiImages.forEach((item, index) => {
      const y = index * roiHeight;
      
      // 페이지 번호 표시
      mergedCtx.fillStyle = 'black';
      mergedCtx.font = 'bold 16px Arial';
      mergedCtx.fillText(`${item.pageNum}p:`, 5, y + roiHeight/2);
      
      // ROI 이미지 붙이기
      mergedCtx.drawImage(item.canvas, 100, y);
    });
    
    console.log('[ROI OCR] 병합된 이미지 생성 완료');
    
    // 한 번의 OCR로 모든 현장명 추출
    const { createWorker } = await import('tesseract.js');
    const worker = await createWorker('kor');
    
    const result = await worker.recognize(mergedCanvas.toDataURL());
    await worker.terminate();
    
    // 결과 파싱: "1p: 죽암 휴게소...\n2p: 고창 휴게소..."
    const lines = result.data.text.split('\n').filter(l => l.trim());
    const siteNames = [];
    
    lines.forEach(line => {
      const match = line.match(/(\d+)p[:\s]+([^\n（(]+)/);
      if (match) {
        siteNames.push({
          page: parseInt(match[1]),
          siteName: match[2].trim()
        });
      }
    });
    
    console.log('[ROI OCR] 추출된 현장명들:', siteNames);
    
    // 첫 번째 현장명 반환 (나중에 필요시 siteNames 전체 반환 가능)
    return siteNames.length > 0 ? siteNames[0].siteName : file.name.replace('.pdf', '');
    
  } catch (err) {
    console.error('[ROI OCR] 현장명 추출 실패:', err);
    return file.name.replace('.pdf', '');
  }
}
