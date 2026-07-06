import React, { useRef } from 'react';

export function PdfDropZone({ onDrop, isDragging, setIsDragging }) {
  const fileInputRef = useRef(null);

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    console.log('[PdfDropZone] 드롭된 파일:', files);
    const pdfFiles = files.filter(f => f.type === 'application/pdf');
    console.log('[PdfDropZone] PDF 파일 필터링:', pdfFiles);

    if (pdfFiles.length === 0) {
      alert('PDF 파일만 업로드할 수 있습니다.');
      return;
    }

    console.log('[PdfDropZone] onDrop 호출:', pdfFiles[0]);
    onDrop(pdfFiles[0]);
  };

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files);
    if (files.length > 0 && files[0].type === 'application/pdf') {
      onDrop(files[0]);
    }
  };

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={handleClick}
      style={{
        border: `2px dashed ${isDragging ? '#2563eb' : '#ccc'}`,
        borderRadius: 12,
        padding: 48,
        textAlign: 'center',
        backgroundColor: isDragging ? '#f0f7ff' : '#fafafa',
        cursor: 'pointer',
      }}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf"
        style={{ display: 'none' }}
        onChange={handleFileSelect}
      />
      <div style={{ fontSize: 48, color: '#888', marginBottom: 16 }}>📄</div>
      <p style={{ fontSize: 16, color: '#333', fontWeight: 500 }}>
        PDF 파일을 드래그 앤 드롭하거나 클릭하여 선택하세요
      </p>
      <p style={{ fontSize: 13, color: '#888', marginTop: 8 }}>
        첫페이지는 대시보드 페이지입니다. (옵션으로 건너뛸 수 있습니다)
      </p>
    </div>
  );
}
