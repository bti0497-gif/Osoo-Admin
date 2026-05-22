/**
 * Webview Preload Script - 디버깅 버전
 */
const { ipcRenderer, contextBridge } = require('electron');

console.log('[Preload] Webview preload script loaded');

// 웹앱에서 window.electron.send()로 메인 프로세스에 직접 전송
contextBridge.exposeInMainWorld('electron', {
  send: (channel, data) => {
    console.log('[Preload] Sending to main:', channel, data?.type);
    ipcRenderer.send(channel, data);
  }
});

// 웹앱의 postMessage도 가로채서 main으로 전달
window.addEventListener('message', (event) => {
  console.log('[Preload] Received postMessage:', event.data?.type);
  if (event.data?.type?.startsWith('WATER_QUALITY_')) {
    console.log('[Preload] Forwarding to main process');
    ipcRenderer.send('water-quality-message', event.data);
  }
});

// 메인 프로세스에서 응답 수신 후 부모 창으로 전달
ipcRenderer.on('upload-progress', (event, data) => {
  console.log('[Preload] Received upload-progress from main:', data);
  window.postMessage({ type: 'upload-progress', data }, '*');
});

ipcRenderer.on('upload-complete', (event, data) => {
  console.log('[Preload] Received upload-complete from main:', data);
  window.postMessage({ type: 'upload-complete', data }, '*');
});
