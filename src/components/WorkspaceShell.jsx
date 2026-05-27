import React, { Suspense, Component } from 'react';

const contentLoadingFallback = (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: '320px' }}>
        <div style={{ textAlign: 'center', color: '#64748b' }}>
            <div className="spinner" style={{ margin: '0 auto 0.75rem' }} />
            <p style={{ margin: 0, fontSize: '0.875rem', fontWeight: 700 }}>화면 로딩 중...</p>
        </div>
    </div>
);

class WorkspaceErrorBoundary extends Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }
    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }
    componentDidCatch(error, info) {
        console.error('[WorkspaceErrorBoundary]', error, info?.componentStack);
    }
    render() {
        if (this.state.hasError) {
            return (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: '320px' }}>
                    <div style={{ textAlign: 'center', color: '#dc2626', maxWidth: '480px', padding: '2rem' }}>
                        <h2 style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: '0.5rem' }}>화면 로드 중 오류 발생</h2>
                        <p style={{ fontSize: '0.875rem', color: '#64748b', marginBottom: '1rem', wordBreak: 'break-word' }}>
                            {this.state.error?.message || '알 수 없는 오류'}
                        </p>
                        <button
                            onClick={() => this.setState({ hasError: false, error: null })}
                            style={{ padding: '0.5rem 1.25rem', fontSize: '0.875rem', fontWeight: 500, background: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
                        >
                            다시 시도
                        </button>
                    </div>
                </div>
            );
        }
        return this.props.children;
    }
}

const WorkspaceShell = ({ children }) => {
    return (
        <div className="main-content-workspace">
            <WorkspaceErrorBoundary>
                <Suspense fallback={contentLoadingFallback}>
                    {children}
                </Suspense>
            </WorkspaceErrorBoundary>
        </div>
    );
};

export default WorkspaceShell;
