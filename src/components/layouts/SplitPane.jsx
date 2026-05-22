import React from 'react';

/**
 * 좌우 분할 레이아웃
 * @param {ReactNode} sidebar - 좌측 패널
 * @param {ReactNode} content - 우측 콘텐츠
 * @param {number} sidebarWidth - 좌측 너비 (px 또는 %)
 * @param {boolean} resizable - 리사이즈 가능 여부 (향후 구현)
 */
export function SplitPane({
  sidebar,
  content,
  sidebarWidth = '280px',
  minSidebarWidth = '200px',
  maxSidebarWidth = '400px',
  gap = '0'
}) {
  return (
    <div style={{
      display: 'flex',
      height: '100%',
      gap,
      overflow: 'hidden',
    }}>
      <aside style={{
        width: sidebarWidth,
        minWidth: minSidebarWidth,
        maxWidth: maxSidebarWidth,
        height: '100%',
        overflow: 'auto',
        background: '#f8fafc',
        borderRight: '1px solid #e2e8f0',
        display: 'flex',
        flexDirection: 'column',
      }}>
        {sidebar}
      </aside>
      
      <main style={{
        flex: 1,
        height: '100%',
        overflow: 'auto',
        display: 'flex',
        flexDirection: 'column',
      }}>
        {content}
      </main>
    </div>
  );
}

/**
 * 상하 분할 레이아웃
 */
export function VerticalSplit({ top, bottom, topHeight = '50%', minTopHeight = '100px' }) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      gap: '12px',
    }}>
      <div style={{
        height: topHeight,
        minHeight: minTopHeight,
        overflow: 'auto',
      }}>
        {top}
      </div>
      <div style={{
        flex: 1,
        overflow: 'auto',
      }}>
        {bottom}
      </div>
    </div>
  );
}

export default SplitPane;
