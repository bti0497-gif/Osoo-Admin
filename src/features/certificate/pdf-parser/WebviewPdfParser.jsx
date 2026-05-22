import React, { useState, useEffect, useRef } from 'react';

// Webview 웹앱 기본 URL
const BASE_WEBAPP_URL = 'https://waterquality-analyzer-874923267324.us-east1.run.app';

// 전역 플래그: Strict Mode 이중 실행 방지
let webviewInstance = null;

/**
 * WebviewContainer - ref와 useEffect 방식으로 webview 생성
 */
function WebviewContainer({ onMessage }) {
  const [isReady, setIsReady] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    let active = true;
    let webview = null;
    let handleDidFinishLoad = null;
    let handleIpcMessage = null;

    const initWebview = async () => {
      if (!containerRef.current || webviewInstance) return;

      let preloadPath = 'file:///E:/Wastewater Treatment Plant Admin/electron/preload-webview.js';
      if (window.electron && typeof window.electron.getWebviewPreloadPath === 'function') {
        try {
          preloadPath = await window.electron.getWebviewPreloadPath();
        } catch (err) {
          console.error('Failed to get webview preload path:', err);
        }
      }

      if (!active || !containerRef.current) return;

      webview = document.createElement('webview');
      webview.src = BASE_WEBAPP_URL;
      webview.setAttribute('preload', preloadPath);
      webview.setAttribute('allowpopups', 'true');
      webview.setAttribute('webpreferences', 'contextIsolation=yes, nodeIntegration=no');
      webview.style.cssText = 'width:100%;height:100%;border:none;';

      handleDidFinishLoad = () => {
        if (active) setIsReady(true);
      };
      handleIpcMessage = (event) => {
        if (event.channel === 'water-quality-message') {
          onMessage?.(event.args[0]);
        }
      };

      webview.addEventListener('did-finish-load', handleDidFinishLoad);
      webview.addEventListener('ipc-message', handleIpcMessage);

      containerRef.current.appendChild(webview);
      webviewInstance = webview;
    };

    initWebview();

    return () => {
      active = false;
      if (webview) {
        if (handleDidFinishLoad) webview.removeEventListener('did-finish-load', handleDidFinishLoad);
        if (handleIpcMessage) webview.removeEventListener('ipc-message', handleIpcMessage);
        if (containerRef.current && containerRef.current.contains(webview)) {
          containerRef.current.removeChild(webview);
        }
      }
      webviewInstance = null;
    };
  }, [onMessage]);

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'relative' }}>
      {!isReady && (
        <div style={{
          position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
          color: '#64748b', fontSize: '14px'
        }}>
          웹앱 로딩 중...
        </div>
      )}
    </div>
  );
}

/**
 * WebviewPdfParser - Electron webview 기반 PDF 파싱 컴포넌트
 */
export function WebviewPdfParser() {
  const handleMessage = (data) => {
    console.log('[WebviewPdfParser] Webview로부터 메시지 수신:', data);
    if (data && data.payload) {
      if (window.electron && typeof window.electron.send === 'function') {
        console.log('[WebviewPdfParser] 일렉트론 메인 프로세스로 자동 전송 트리거');
        window.electron.send('water-quality-message', data);
      } else {
        console.warn('[WebviewPdfParser] window.electron.send를 사용할 수 없습니다. 일반 브라우저 환경이거나 프리로드 로드 실패입니다.');
      }
    }
  };

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: '#f1f5f9' }}>
      {/* Webview Container */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <WebviewContainer onMessage={handleMessage} />
      </div>
    </div>
  );
}

export default WebviewPdfParser;
