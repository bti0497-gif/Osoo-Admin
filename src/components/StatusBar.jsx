import React, { useState, useEffect } from 'react';

const StatusBar = ({ title, helpText, onTabChange }) => {
    const [time, setTime] = useState(new Date().toLocaleTimeString());
    const [progress, setProgress] = useState(null);

    useEffect(() => {
        const timer = setInterval(() => {
            setTime(new Date().toLocaleTimeString());
        }, 1000);
        return () => clearInterval(timer);
    }, []);

    useEffect(() => {
        const handleProgress = (e) => {
            if (e.detail?.active) {
                setProgress(e.detail);
            } else {
                setProgress(null);
            }
        };
        window.addEventListener('global-upload-progress', handleProgress);
        return () => window.removeEventListener('global-upload-progress', handleProgress);
    }, []);

    return (
        <footer className="status-bar">
            <div className="status-left">
                <div className="status-item">
                    <span className="material-icons text-primary" style={{ fontSize: '14px' }}>navigation</span>
                    <span>현재 메뉴: <span className="current-menu-highlight">{title}</span></span>
                </div>
                <div className="status-item" style={{ borderLeft: '1px solid #475569', paddingLeft: '1rem' }}>
                    <span className="material-icons text-green-400" style={{ fontSize: '14px' }}>info</span>
                    <span>도움말: {helpText || '각 항목의 상세 데이터는 왼쪽 메뉴를 통해 접근하세요.'}</span>
                </div>
            </div>

            <div className="status-right">
                {progress?.active && (
                    <div className="status-item" style={{
                        backgroundColor: '#1e293b',
                        border: '1px solid #3b82f6',
                        borderRadius: '6px',
                        padding: '2px 10px',
                        color: '#60a5fa',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        fontSize: '12px'
                    }}>
                        <span className="material-icons spin" style={{ fontSize: '14px', animation: 'spin 1s linear infinite' }}>sync</span>
                        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                        <span>
                            {progress.title || '작업 진행 중'}: <strong style={{ color: '#fff' }}>{progress.done}/{progress.total}건 ({progress.percent}%)</strong>
                        </span>
                        <div style={{ width: '60px', height: '6px', backgroundColor: '#334155', borderRadius: '3px', overflow: 'hidden' }}>
                            <div style={{ width: `${progress.percent}%`, height: '100%', backgroundColor: '#3b82f6', transition: 'width 0.3s' }} />
                        </div>
                        {progress.workspaceId && onTabChange && (
                            <button
                                onClick={() => onTabChange(progress.workspaceId)}
                                style={{
                                    backgroundColor: '#2563eb',
                                    color: '#fff',
                                    border: 'none',
                                    borderRadius: '4px',
                                    padding: '2px 8px',
                                    fontSize: '11px',
                                    cursor: 'pointer',
                                    fontWeight: 600
                                }}
                            >
                                상세보기
                            </button>
                        )}
                    </div>
                )}

                <div className="status-item">
                    <span className="material-icons" style={{ fontSize: '14px', color: '#94a3b8' }}>login</span>
                    <span>현재 시간: <span style={{ color: 'white' }}>{time}</span></span>
                </div>
                <div className="status-item" style={{ backgroundColor: '#334155', padding: '2px 8px', borderRadius: '4px', color: 'white' }}>
                    <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#4ade80', marginRight: '6px' }}></div>
                    <span>서버 상태: 양호</span>
                </div>
            </div>
        </footer>
    );
};

export default StatusBar;
