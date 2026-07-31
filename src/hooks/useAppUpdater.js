import { useEffect, useRef } from 'react';
import { useDialog } from '../components/common/DialogContext';

export function useAppUpdater(enabled = true) {
    const { showAlert } = useDialog();
    const checkedRef = useRef(false);

    useEffect(() => {
        if (!enabled || checkedRef.current) return;
        checkedRef.current = true;

        const api = window.electronAPI || window.electron;
        if (!api?.isElectron) {
            return;
        }

        let cleanupAvailable = null;
        let cleanupDownloaded = null;
        let cleanupError = null;

        // 1. 새 상위 버전 발견 이벤트 (자동 다운로드 진행)
        if (typeof api.onUpdateAvailable === 'function') {
            cleanupAvailable = api.onUpdateAvailable((info) => {
                const newVersion = info?.version || '최신';
                console.log(`[AppUpdater] 새 버전(${newVersion})이 발견되어 백그라운드 다운로드를 시작합니다.`);
            });
        }

        // 2. 패치 다운로드 완료 이벤트 -> 알림 팝업 후 클릭 시 재시작 및 설치
        if (typeof api.onUpdateDownloaded === 'function') {
            cleanupDownloaded = api.onUpdateDownloaded(async (info) => {
                const newVersion = info?.version || '최신';
                await showAlert(
                    `최신 버전(${newVersion}) 업데이트 패치 다운로드가 완료되었습니다.\n[확인]을 누르면 프로그램이 재시작되며 업데이트가 적용됩니다.`,
                    '자동 업데이트 알림'
                );
                if (typeof api.quitAndInstall === 'function') {
                    api.quitAndInstall();
                }
            });
        }

        // 3. 업데이트 체크 오류 로깅
        if (typeof api.onUpdateError === 'function') {
            cleanupError = api.onUpdateError((err) => {
                console.warn('[AppUpdater] Update check error:', err);
            });
        }

        // 앱 시작 1초 후 업데이트 검사 실행
        const timer = setTimeout(() => {
            if (typeof api.checkForUpdates === 'function') {
                api.checkForUpdates().catch((err) => {
                    console.warn('[AppUpdater] checkForUpdates failed:', err.message);
                });
            }
        }, 1000);

        return () => {
            clearTimeout(timer);
            if (typeof cleanupAvailable === 'function') cleanupAvailable();
            if (typeof cleanupDownloaded === 'function') cleanupDownloaded();
            if (typeof cleanupError === 'function') cleanupError();
        };
    }, [enabled, showAlert]);
}
