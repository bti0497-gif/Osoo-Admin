import React from 'react';
import { Document, Page } from 'react-pdf';

/**
 * PDF 캔버스 + ROI 드로잉 패널
 */
export function PdfCanvasPanel({
  file,
  activePage,
  globalBoxes,
  activeField,
  currentBox,
  showTemplateBoxes,
  containerRef,
  onMouseDown,
  onMouseMove,
  onMouseUp,
  styles,
  fieldBorderColors,
  fieldBgColors,
  fieldLabels,
}) {
  return (
    <section style={styles.content}>
      {file ? (
        <div style={styles.pdfScrollArea}>
          <div 
            style={styles.pdfCanvas(!!activeField)} 
            ref={containerRef}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseUp}
          >
            <Document file={file}>
              <Page 
                pageNumber={activePage} 
                renderAnnotationLayer={false} 
                renderTextLayer={false} 
              />
            </Document>
            
            {/* ROI 템플릿 박스 표시 */}
            {showTemplateBoxes && Object.entries(globalBoxes).map(([field, box]) => box && (
              <div 
                key={field}
                style={{
                  position: 'absolute',
                  left: box.x,
                  top: box.y,
                  width: box.width,
                  height: box.height,
                  border: `2px solid ${fieldBorderColors[field]}`,
                  background: fieldBgColors[field],
                  pointerEvents: 'none',
                }}
              >
                <div style={{
                  position: 'absolute',
                  top: '-24px',
                  left: '-2px',
                  fontSize: '12px',
                  fontWeight: 700,
                  color: '#fff',
                  background: fieldBorderColors[field],
                  padding: '2px 8px',
                  borderRadius: '4px 4px 0 0',
                  whiteSpace: 'nowrap',
                }}>
                  {fieldLabels[field]}
                </div>
              </div>
            ))}
            
            {/* 현재 그리는 박스 */}
            {activeField && currentBox && (
              <div
                style={{
                  position: 'absolute',
                  left: currentBox.x,
                  top: currentBox.y,
                  width: currentBox.width,
                  height: currentBox.height,
                  border: `2px dashed ${fieldBorderColors[activeField]}`,
                  background: fieldBgColors[activeField],
                  pointerEvents: 'none',
                }}
              />
            )}
          </div>
        </div>
      ) : (
        <div style={styles.emptyState}>
          <div style={styles.emptyInner}>
            <div style={styles.emptyIcon}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2">
                <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
            </div>
            <p>PDF 파일을 업로드하세요</p>
            <p style={{ fontSize: '13px', marginTop: '8px' }}>왼쪽 패널에서 파일을 선택하거나 드래그하세요</p>
          </div>
        </div>
      )}
    </section>
  );
}

export default PdfCanvasPanel;
