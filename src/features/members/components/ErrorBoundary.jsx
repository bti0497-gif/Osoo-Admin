import React from 'react';

/**
 * 회원/현장 화면 에러 바운더리
 */
export class MemberViewErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, message: error?.message || '알 수 없는 오류' };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[MemberManagementView] render error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ 
          padding: '1rem', 
          border: '1px solid #fecaca', 
          borderRadius: '8px', 
          background: '#fff1f2', 
          color: '#9f1239', 
          fontWeight: 700, 
          fontSize: '0.85rem' 
        }}>
          회원/현장 화면 렌더링 중 오류가 발생했습니다. 화면을 다시 열어 주세요.
          <div style={{ 
            marginTop: '0.5rem', 
            fontSize: '0.75rem', 
            fontWeight: 600, 
            color: '#be123c' 
          }}>
            오류 메시지: {this.state.message}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default MemberViewErrorBoundary;
