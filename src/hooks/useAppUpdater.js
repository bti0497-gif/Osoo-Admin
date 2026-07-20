import { useEffect, useRef } from 'react';
import { useDialog } from '../components/common/DialogContext';

export function useAppUpdater(isAuthenticated) {
    const { showAlert, showConfirm } = useDialog();
    const checkedRef = useRef(false);

    useEffect(() => {
        // isAuthenticated가 true인 시점(로그인 성공 또는 세션 복원 후 메인 쉘 진입 시)에 1회 발동
        if (!isAuthenticated || checkedRef.current) return;
        checkedRef.current = true;

        const api = window.electronAPI || window.electron;
        if (!api?.isElectron || typeof api.onUpdateAvailable !== 'function') {
            return;
        }

        let cleanupAvailable = null;
        let cleanupDownloaded = null;
        let cleanupError = null;

        // 1. 새 상위 버전 발견 시 팝업 안내 (단일 확인 버튼)
        if (typeof api.onUpdateAvailable === 'function') {
            cleanupAvailable = api.onUpdateAvailable(async (info) => {
                const newVersion = info?.version || '최신';
                await showAlert(
                    `새 버전(${newVersion})이 존재합니다.\n[확인]을 누르면 업그레이드 패치를 다운로드하고 설치를 진행합니다.`,
                    '새 버전 업데이트 안내'
                );
                try {
                    if (typeof api.downloadUpdate === 'function') {
                        await api.downloadUpdate();
                    }
                } catch (e) {
                    console.error('[AppUpdater] downloadUpdate Error:', e);
                }
            });
        }

        // 2. 패치 다운로드 완료 시 팝업 후 즉시 재실행 설치
        if (typeof api.onUpdateDownloaded === 'function') {
            cleanupDownloaded = api.onUpdateDownloaded(async (info) => {
                const newVersion = info?.version || '최신';
                await showAlert(
                    `최신 버전(${newVersion}) 패치 다운로드가 완료되었습니다.\n확인을 누르면 앱이 재시작되며 업데이트가 적용됩니다.`,
                    '업데이트 적용'
                );
                if (typeof api.quitAndInstall === 'function') {
                    api.quitAndInstall();
                }
            });
        }

        // 3. 업데이트 오류 시 로깅
        if (typeof api.onUpdateError === 'function') {
            cleanupError = api.onUpdateError((err) => {
                console.warn('[AppUpdater] Update check error (ignored):', err);
            });
        }

        // 부팅 후 update 체크 호출
        if (typeof api.checkForUpdates === 'function') {
            api.checkForUpdates().catch((err) => {
                console.warn('[AppUpdater] checkForUpdates failed:', err.message);
            });
        }

        return () => {
            if (typeof cleanupAvailable === 'function') cleanupAvailable();
            if (typeof cleanupDownloaded === 'function') cleanupDownloaded();
            if (typeof cleanupError === 'function') cleanupError();
        };
    }, [isAuthenticated, showAlert, showConfirm]);
}
