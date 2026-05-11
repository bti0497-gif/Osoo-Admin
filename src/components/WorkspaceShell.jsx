import React, { Suspense } from 'react';

const contentLoadingFallback = (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: '320px' }}>
        <div style={{ textAlign: 'center', color: '#64748b' }}>
            <div className="spinner" style={{ margin: '0 auto 0.75rem' }} />
            <p style={{ margin: 0, fontSize: '0.875rem', fontWeight: 700 }}>화면 로딩 중...</p>
        </div>
    </div>
);

const WorkspaceShell = ({ children }) => {
    return (
        <div className="main-content-workspace">
            <Suspense fallback={contentLoadingFallback}>
                {children}
            </Suspense>
        </div>
    );
};

export default WorkspaceShell;
