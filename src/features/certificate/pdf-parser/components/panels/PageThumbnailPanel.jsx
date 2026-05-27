import React from 'react';
import { Document, Page } from 'react-pdf';
import { ArrowUp, ArrowDown, Trash2 } from 'lucide-react';

/**
 * 좌측 페이지 썸네일 패널
 */
export function PageThumbnailPanel({
  file,
  numPages,
  activePage,
  onPageSelect,
  onMovePage,
  onDeletePage,
  onFileChange,
  onDocumentLoad,
  styles,
}) {
  return (
    <aside style={styles.sidebar}>
      <div style={styles.sidebarHead}>
        <span style={styles.sidebarHeadText}>Pages</span>
        <span style={{ fontSize: '12px', color: '#94a3b8' }}>{numPages || 0} total</span>
      </div>
      
      <div style={styles.uploadArea}>
        <label style={styles.uploadBox}>
          <input 
            type="file" 
            accept="application/pdf" 
            onChange={onFileChange} 
            style={styles.uploadInput} 
          />
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          <span style={{ fontSize: '12px', color: '#475569', fontWeight: 500, marginTop: '4px' }}>
            PDF 업로드
          </span>
        </label>
      </div>
      
      <div style={styles.thumbScroll}>
        {file && (
          <Document file={file} onLoadSuccess={(pdf) => onDocumentLoad?.(pdf)}>
            {Array.from({ length: numPages || 0 }, (_, index) => {
              const pageNum = index + 1;
              const isActive = activePage === pageNum;
              return (
                <div key={'thumb-' + pageNum} style={styles.thumbWrap}>
                  <button 
                    onClick={() => onPageSelect(pageNum)} 
                    style={styles.thumbBtn(isActive)}
                  >
                    <div style={styles.thumbInner}>
                      <Page 
                        pageNumber={pageNum} 
                        width={160} 
                        renderTextLayer={false} 
                        renderAnnotationLayer={false} 
                      />
                    </div>
                    <span style={styles.thumbBadge(isActive)}>P{pageNum}</span>
                  </button>
                  
                  <div style={styles.thumbActions}>
                    {pageNum > 1 && (
                      <button 
                        onClick={(e) => { e.stopPropagation(); onMovePage(pageNum, 'up'); }} 
                        style={styles.iconBtn()}
                      >
                        <ArrowUp size={14} />
                      </button>
                    )}
                    {pageNum < (numPages || 0) && (
                      <button 
                        onClick={(e) => { e.stopPropagation(); onMovePage(pageNum, 'down'); }} 
                        style={styles.iconBtn()}
                      >
                        <ArrowDown size={14} />
                      </button>
                    )}
                    <button 
                      onClick={(e) => { e.stopPropagation(); onDeletePage(pageNum); }} 
                      style={styles.iconBtnRed}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </Document>
        )}
      </div>
    </aside>
  );
}

export default PageThumbnailPanel;
