import React, { useState } from 'react';

/**
 * 툴팁이 달린 경량 아이콘 전용 버튼 컴포넌트
 */
export function TooltipIconButton({
  icon,
  tooltip,
  active = false,
  badgeCount,
  onClick,
  activeStyle = {},
  buttonStyle = {},
  ariaLabel,
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      style={styles.tooltipBtnWrapper}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        type="button"
        onClick={onClick}
        title={tooltip}
        aria-label={ariaLabel || tooltip}
        style={{
          ...styles.iconBtnBase,
          ...(active ? styles.iconBtnActive : {}),
          ...buttonStyle,
          ...(active ? activeStyle : {}),
        }}
      >
        <span>{icon}</span>
        {badgeCount !== undefined && badgeCount > 0 && (
          <span style={styles.iconBadge}>{badgeCount}</span>
        )}
      </button>

      {hovered && (
        <div style={styles.customTooltip}>
          {tooltip}
          <div style={styles.tooltipArrow} />
        </div>
      )}
    </div>
  );
}

const styles = {
  tooltipBtnWrapper: {
    position: 'relative',
    display: 'inline-flex',
  },
  iconBtnBase: {
    width: '36px',
    height: '34px',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '15px',
    borderRadius: '6px',
    border: 'none',
    backgroundColor: 'transparent',
    color: '#475569',
    cursor: 'pointer',
    transition: 'all 0.12s ease',
    padding: 0,
    position: 'relative',
  },
  iconBtnActive: {
    backgroundColor: '#0f172a',
    color: '#ffffff',
    boxShadow: '0 1px 2px rgba(0,0,0,0.18)',
  },
  customTooltip: {
    position: 'absolute',
    top: 'calc(100% + 7px)',
    left: '50%',
    transform: 'translateX(-50%)',
    backgroundColor: '#0f172a',
    color: '#ffffff',
    fontSize: '11px',
    fontWeight: 700,
    padding: '4px 8px',
    borderRadius: '6px',
    whiteSpace: 'nowrap',
    zIndex: 9999,
    boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
    pointerEvents: 'none',
  },
  tooltipArrow: {
    position: 'absolute',
    top: '-4px',
    left: '50%',
    transform: 'translateX(-50%)',
    width: 0,
    height: 0,
    borderLeft: '4px solid transparent',
    borderRight: '4px solid transparent',
    borderBottom: '4px solid #0f172a',
  },
  iconBadge: {
    position: 'absolute',
    top: '-4px',
    right: '-4px',
    minWidth: '16px',
    height: '16px',
    borderRadius: '999px',
    backgroundColor: '#ef4444',
    color: '#ffffff',
    fontSize: '10px',
    fontWeight: 800,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0 3px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
  },
};
