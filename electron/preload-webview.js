/**
 * Webview Preload Script - 경량 버전
 * 웹앱 백엔드가 BigQuery/Drive 전송을 직접 처리하므로 IPC 중계 불필요.
 * 하위 호환성을 위해 window.electron 바인딩만 유지.
 */
const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  send: (channel, data) => {
    // 하위 호환성 유지 (웹앱에서 호출해도 무시)
    console.log('[Preload] send called (no-op):', channel);
  },
  isElectron: true
});
