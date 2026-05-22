import React from 'react';

/**
 * 툴바 + 콘텐츠 레이아웃
 * @param {ReactNode} toolbar - 상단 툴바
 * @param {ReactNode} children - 메인 콘텐츠
 * @param {ReactNode} footer - 하단 푸터 (선택)
 */
export function ToolbarLayout({
  toolbar,
  children,
  footer,
  toolbarHeight = 'auto',
  footerHeight = 'auto',
  gap = '16px'
}) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      gap,
    }}>
      {toolbar && (
        <div style={{
          flexShrink: 0,
          height: toolbarHeight,
        }}>
          {toolbar}
        </div>
      )}
      
      <div style={{
        flex: 1,
        overflow: 'auto',
        minHeight: 0,
      }}>
        {children}
      </div>
      
      {footer && (
        <div style={{
          flexShrink: 0,
          height: footerHeight,
          borderTop: '1px solid #e2e8f0',
          paddingTop: '12px',
        }}>
          {footer}
        </div>
      )}
    </div>
  );
}

/**
 * 툴바 아이템 (버튼 그룹용)
 */
export function ToolbarGroup({ children, align = 'left', gap = '8px' }) {
  const alignStyle = {
    left: { marginRight: 'auto' },
    center: { margin: '0 auto' },
    right: { marginLeft: 'auto' },
  };

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap,
      ...alignStyle[align],
    }}>
      {children}
    </div>
  );
}

export default ToolbarLayout;
