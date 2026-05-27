import React, { useState, useEffect, useRef } from 'react';

// ============================================================================
// Cloud Run 리전 자동 탐색 (Region Auto-Discovery)
// 배포 시 리전이 변경되어도 코드 수정 없이 자동으로 접속 가능한 URL을 찾습니다.
// webview의 did-finish-load / did-fail-load 이벤트를 활용하여 CORS/네트워크 에러 없이 탐색.
// ============================================================================
const SERVICE_PREFIX = 'https://waterquality-analyzer-874923267324';
const REGIONS = [
  'asia-northeast3',   // 서울 (우선)
  'asia-northeast1',   // 도쿄
  'us-central1',
  'us-west1',
  'us-east1',
  'asia-southeast1',
];
const CACHE_KEY = 'CURRENT_ACTIVE_API_URL';
const LOAD_TIMEOUT_MS = 8000;

function buildRegionUrl(region) {
  return `${SERVICE_PREFIX}.${region}.run.app`;
}

function getCandidateUrls() {
  const cached = localStorage.getItem(CACHE_KEY);
  const regionUrls = REGIONS.map(buildRegionUrl);
  if (cached && regionUrls.includes(cached)) {
    return [cached, ...regionUrls.filter(u => u !== cached)];
  }
  return regionUrls;
}

// 전역 플래그: Strict Mode 이중 실행 방지
let webviewInstance = null;

/**
 * WebviewContainer - 순수 뷰어 (웹앱이 자체적으로 BigQuery/Drive 전송 처리)
 * 백그라운드에서 리전 탐색 완료 후에만 webview를 화면에 표시.
 * 탐색 중에는 스피너 + "접속 중..." 메시지만 노출.
 */
function WebviewContainer() {
  const [isReady, setIsReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    let active = true;
    let webview = null;
    let onFinish = null;
    let onFail = null;
    let timeoutId = null;

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

      const candidates = getCandidateUrls();
      let currentIdx = 0;

      webview = document.createElement('webview');
      webview.setAttribute('preload', preloadPath);
      webview.setAttribute('allowpopups', 'true');
      webview.setAttribute('webpreferences', 'contextIsolation=yes, nodeIntegration=no');
      // 핵심: 탐색 중에는 숨김 처리
      webview.style.cssText = 'width:100%;height:100%;border:none;visibility:hidden;position:absolute;';

      const tryNext = () => {
        if (!active) return;
        if (currentIdx >= candidates.length) {
          console.warn('[WebappDiscovery] 모든 리전 접속 실패');
          if (active) setFailed(true);
          return;
        }
        const url = candidates[currentIdx];
        console.log(`[WebappDiscovery] 시도 ${currentIdx + 1}/${candidates.length}: ${url}`);
        webview.src = url;

        timeoutId = setTimeout(() => {
          if (!active) return;
          console.log(`[WebappDiscovery] ${url} 타임아웃, 다음 시도`);
          currentIdx++;
          tryNext();
        }, LOAD_TIMEOUT_MS);
      };

      onFinish = () => {
        if (!active) return;
        if (timeoutId) { clearTimeout(timeoutId); timeoutId = null; }
        const loadedUrl = candidates[currentIdx];

        // 404 에러 페이지 감지
        try {
          const title = webview.getTitle() || '';
          if (/error|not found|404/i.test(title)) {
            console.log(`[WebappDiscovery] ${loadedUrl} 에러 페이지 (title: "${title}"), 다음 시도`);
            currentIdx++;
            tryNext();
            return;
          }
        } catch { /* getTitle 실패 시 성공으로 처리 */ }

        console.log('[WebappDiscovery] 접속 성공:', loadedUrl);
        localStorage.setItem(CACHE_KEY, loadedUrl);
        // 성공: webview를 보이게 전환
        webview.style.visibility = 'visible';
        webview.style.position = 'relative';
        setIsReady(true);
      };

      onFail = (event) => {
        if (!active) return;
        if (timeoutId) { clearTimeout(timeoutId); timeoutId = null; }
        const failedUrl = candidates[currentIdx];
        console.log(`[WebappDiscovery] ${failedUrl} 로드 실패 (code: ${event.errorCode}), 다음 시도`);
        currentIdx++;
        tryNext();
      };

      webview.addEventListener('did-finish-load', onFinish);
      webview.addEventListener('did-fail-load', onFail);
      containerRef.current.appendChild(webview);
      webviewInstance = webview;

      tryNext();
    };

    initWebview();

    return () => {
      active = false;
      if (timeoutId) clearTimeout(timeoutId);
      if (webview) {
        if (onFinish) webview.removeEventListener('did-finish-load', onFinish);
        if (onFail) webview.removeEventListener('did-fail-load', onFail);
        if (containerRef.current && containerRef.current.contains(webview)) {
          containerRef.current.removeChild(webview);
        }
      }
      webviewInstance = null;
    };
  }, []);

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'relative' }}>
      {!isReady && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          background: '#f8fafc', zIndex: 10
        }}>
          {!failed ? (
            <>
              <div style={{
                width: 36, height: 36, border: '3px solid #e2e8f0',
                borderTopColor: '#3b82f6', borderRadius: '50%',
                animation: 'spin 0.8s linear infinite'
              }} />
              <p style={{ marginTop: 16, color: '#64748b', fontSize: 14 }}>
                웹앱 서버 접속 중...
              </p>
            </>
          ) : (
            <>
              <p style={{ color: '#ef4444', fontSize: 14, fontWeight: 500 }}>
                서버 접속에 실패했습니다.
              </p>
              <button
                onClick={() => window.location.reload()}
                style={{
                  marginTop: 12, padding: '8px 16px', fontSize: 13,
                  background: '#3b82f6', color: '#fff', border: 'none',
                  borderRadius: 6, cursor: 'pointer'
                }}
              >
                다시 시도
              </button>
            </>
          )}
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}
    </div>
  );
}

/**
 * WebviewPdfParser - 순수 웹앱 뷰어 컴포넌트
 * 웹앱 백엔드가 BigQuery/Drive 직접 처리하므로 일렉트론은 뷰어 역할만 수행
 */
export function WebviewPdfParser() {
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: '#f1f5f9' }}>
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <WebviewContainer />
      </div>
    </div>
  );
}

export default WebviewPdfParser;
