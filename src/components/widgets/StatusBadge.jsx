import React from 'react';

/**
 * 공통 상태 배지 위젯
 * @param {string} variant - 'success' | 'warning' | 'error' | 'info' | 'neutral'
 * @param {string} size - 'sm' | 'md' | 'lg'
 * @param {ReactNode} icon - 아이콘 컴포넌트
 */
export function StatusBadge({ 
  children, 
  variant = 'neutral',
  size = 'md',
  icon: Icon
}) {
  const variants = {
    success: {
      bg: '#dcfce7',
      border: '#86efac',
      color: '#166534',
    },
    warning: {
      bg: '#fff7ed',
      border: '#fed7aa',
      color: '#c2410c',
    },
    error: {
      bg: '#fee2e2',
      border: '#fecaca',
      color: '#dc2626',
    },
    info: {
      bg: '#eff6ff',
      border: '#bfdbfe',
      color: '#1e40af',
    },
    neutral: {
      bg: '#f1f5f9',
      border: '#e2e8f0',
      color: '#64748b',
    },
  };

  const sizes = {
    sm: { padding: '2px 8px', fontSize: '12px' },
    md: { padding: '4px 10px', fontSize: '13px' },
    lg: { padding: '6px 12px', fontSize: '14px' },
  };

  const style = variants[variant] || variants.neutral;
  const sizeStyle = sizes[size] || sizes.md;

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        background: style.bg,
        border: `1px solid ${style.border}`,
        borderRadius: '4px',
        color: style.color,
        fontWeight: 500,
        ...sizeStyle,
      }}
    >
      {Icon && <Icon size={size === 'sm' ? 12 : size === 'lg' ? 16 : 14} />}
      {children}
    </span>
  );
}

/**
 * 카운트 배지 (숫자 표시용)
 */
export function CountBadge({ count, total, variant = 'neutral' }) {
  const text = total !== undefined ? `${count}/${total}` : String(count);
  return <StatusBadge variant={variant}>{text}</StatusBadge>;
}

export default StatusBadge;
