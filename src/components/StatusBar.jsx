import React, { useState, useEffect, useCallback } from 'react';
import { useDialog } from './common/DialogContext';

const StatusBar = ({ title, helpText, onTabChange }) => {
    const { showAlert } = useDialog();
    const [time, setTime] = useState(new Date().toLocaleTimeString());
    const [progress, setProgress] = useState(null);
    const [appVersion, setAppVersion] = useState('v1.0.26');
    const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
    const [updateProgressText, setUpdateProgressText] = useState('');

    const appVersionRef = React.useRef(appVersion);
    useEffect(() => {
        appVersionRef.current = appVersion;
    }, [appVersion]);

    useEffect(() => {
        const timer = setInterval(() => {
            setTime(new Date().toLocaleTimeString());
        }, 1000);
        return () => clearInterval(timer);
    }, []);

    useEffect(() => {
        const api = window.electronAPI || window.electron;
        if (api?.getVersion) {
            api.getVersion().then((ver) => {
                if (ver) {
                    setAppVersion(`v${ver}`);
                    appVersionRef.current = `v${ver}`;
                }
            }).catch(() => {});
        }
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

    const isManualCheckRef = React.useRef(false);

    useEffect(() => {
        const api = window.electronAPI || window.electron;
        if (!api?.isElectron) return;

        let unAvailable = null;
        let unNotAvailable = null;
        let unDownloaded = null;
        let unProgress = null;
        let unError = null;

        if (typeof api.onUpdateAvailable === 'function') {
            unAvailable = api.onUpdateAvailable((info) => {
                setIsCheckingUpdate(false);
                setUpdateProgressText('새 버전 발견!');
                if (isManualCheckRef.current) {
                    showAlert(`🎉 최신 버전(${info?.version || ''})이 발견되어 백그라운드 패치 다운로드를 시작합니다.`, '업데이트 발견');
                }
                isManualCheckRef.current = false;
            });
        }

        if (typeof api.onUpdateNotAvailable === 'function') {
            unNotAvailable = api.onUpdateNotAvailable((info) => {
                setIsCheckingUpdate(false);
                setUpdateProgressText('');
                if (isManualCheckRef.current) {
                    const verText = info?.version ? `v${info.version}` : appVersionRef.current;
                    showAlert(`현재 이미 최신 버전(${verText})을 사용 중입니다.`, '버전 검사 결과');
                }
                isManualCheckRef.current = false;
            });
        }

        if (typeof api.onUpdateProgress === 'function') {
            unProgress = api.onUpdateProgress((p) => {
                const pct = Math.round(p?.percent || 0);
                setUpdateProgressText(`패치 다운로드 중... ${pct}%`);
            });
        }

        if (typeof api.onUpdateDownloaded === 'function') {
            unDownloaded = api.onUpdateDownloaded(async (info) => {
                setIsCheckingUpdate(false);
                setUpdateProgressText('');
                isManualCheckRef.current = false;
                await showAlert(
                    `최신 패치 버전(${info?.version || ''}) 다운로드가 완료되었습니다.\n[확인]을 누르면 앱이 재시작되며 즉시 업데이트가 적용됩니다.`,
                    '업데이트 완료'
                );
                if (typeof api.quitAndInstall === 'function') {
                    api.quitAndInstall();
                }
            });
        }

        if (typeof api.onUpdateError === 'function') {
            unError = api.onUpdateError((err) => {
                setIsCheckingUpdate(false);
                setUpdateProgressText('');
                if (isManualCheckRef.current) {
                    showAlert(`업데이트 검사 중 오류가 발생했습니다: ${err}`, '업데이트 오류');
                }
                isManualCheckRef.current = false;
            });
        }

        return () => {
            if (typeof unAvailable === 'function') unAvailable();
            if (typeof unNotAvailable === 'function') unNotAvailable();
            if (typeof unDownloaded === 'function') unDownloaded();
            if (typeof unProgress === 'function') unProgress();
            if (typeof unError === 'function') unError();
        };
    }, [showAlert, appVersion]);

    const handleCheckUpdate = useCallback(async () => {
        const api = window.electronAPI || window.electron;
        if (!api?.isElectron) {
            showAlert('웹 개발 환경에서는 일렉트론 자동 업데이트를 지원하지 않습니다.\n설치판 앱에서 동작합니다.', '버전 검사');
            return;
        }

        if (isCheckingUpdate) return;
        isManualCheckRef.current = true;
        setIsCheckingUpdate(true);
        setUpdateProgressText('서버 버전 확인 중...');

        try {
            if (typeof api.checkForUpdates === 'function') {
                await api.checkForUpdates();
            } else {
                throw new Error('checkForUpdates API를 찾을 수 없습니다.');
            }
        } catch (err) {
            setIsCheckingUpdate(false);
            setUpdateProgressText('');
            isManualCheckRef.current = false;
            showAlert(`버전 검사 실패: ${err.message}`, '오류');
        }
    }, [isCheckingUpdate, showAlert]);

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

                {updateProgressText && (
                    <div className="status-item" style={{
                        backgroundColor: '#1e293b',
                        border: '1px solid #10b981',
                        borderRadius: '6px',
                        padding: '2px 8px',
                        color: '#34d399',
                        fontSize: '12px'
                    }}>
                        <span>{updateProgressText}</span>
                    </div>
                )}

                {/* 앱 버전 표시 및 수동 버전 체크 버튼 */}
                <div className="status-item" style={{
                    backgroundColor: '#1e293b',
                    padding: '2px 8px',
                    borderRadius: '4px',
                    color: '#e2e8f0',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '12px'
                }}>
                    <span style={{ fontWeight: 600, color: '#38bdf8' }}>{appVersion}</span>
                    <button
                        onClick={handleCheckUpdate}
                        disabled={isCheckingUpdate}
                        title="버전 업데이트 검사"
                        style={{
                            backgroundColor: isCheckingUpdate ? '#475569' : '#0284c7',
                            color: '#ffffff',
                            border: 'none',
                            borderRadius: '3px',
                            padding: '1px 7px',
                            fontSize: '11px',
                            cursor: isCheckingUpdate ? 'wait' : 'pointer',
                            fontWeight: 600,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '3px',
                            transition: 'background-color 0.2s'
                        }}
                    >
                        <span className="material-icons" style={{
                            fontSize: '12px',
                            animation: isCheckingUpdate ? 'spin 1s linear infinite' : 'none'
                        }}>refresh</span>
                        <span>{isCheckingUpdate ? '검사 중' : '버전 체크'}</span>
                    </button>
                </div>

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
