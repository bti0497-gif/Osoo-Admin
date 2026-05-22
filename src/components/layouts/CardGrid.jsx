import React from 'react';

/**
 * 카드 그리드 레이아웃
 * @param {Array} items - { id, title, content, footer?, onClick? }
 * @param {number} columns - 컬럼 수 (반응형: 기본 3, 중간 2, 좁은 1)
 * @param {string} gap - 간격
 */
export function CardGrid({
  items = [],
  columns = 3,
  gap = '16px',
  emptyText = '데이터가 없습니다.'
}) {
  if (items.length === 0) {
    return (
      <div style={{
        textAlign: 'center',
        padding: '60px 20px',
        color: '#94a3b8',
        background: '#f8fafc',
        borderRadius: '8px',
      }}>
        {emptyText}
      </div>
    );
  }

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
      gap,
    }}>
      {items.map((item) => (
        <Card key={item.id} {...item} />
      ))}
    </div>
  );
}

/**
 * 개별 카드
 */
export function Card({
  title,
  subtitle,
  content,
  footer,
  onClick,
  selected = false,
  disabled = false
}) {
  return (
    <div
      onClick={!disabled ? onClick : undefined}
      style={{
        display: 'flex',
        flexDirection: 'column',
        padding: '16px',
        background: selected ? '#eff6ff' : '#fff',
        border: `1px solid ${selected ? '#3b82f6' : '#e2e8f0'}`,
        borderRadius: '8px',
        cursor: onClick && !disabled ? 'pointer' : 'default',
        opacity: disabled ? 0.6 : 1,
        transition: 'all 0.15s ease',
        boxShadow: selected ? '0 2px 4px rgba(59, 130, 246, 0.1)' : 'none',
      }}
      onMouseEnter={(e) => {
        if (onClick && !disabled && !selected) {
          e.currentTarget.style.borderColor = '#bfdbfe';
        }
      }}
      onMouseLeave={(e) => {
        if (!selected) {
          e.currentTarget.style.borderColor = '#e2e8f0';
        }
      }}
    >
      {title && (
        <div style={{
          fontSize: '15px',
          fontWeight: 600,
          color: '#1e293b',
          marginBottom: subtitle ? '4px' : '12px',
        }}>
          {title}
        </div>
      )}
      
      {subtitle && (
        <div style={{
          fontSize: '13px',
          color: '#64748b',
          marginBottom: '12px',
        }}>
          {subtitle}
        </div>
      )}
      
      <div style={{
        flex: 1,
        fontSize: '14px',
        color: '#475569',
      }}>
        {content}
      </div>
      
      {footer && (
        <div style={{
          marginTop: '12px',
          paddingTop: '12px',
          borderTop: '1px solid #f1f5f9',
          fontSize: '13px',
          color: '#64748b',
        }}>
          {footer}
        </div>
      )}
    </div>
  );
}

export default CardGrid;
