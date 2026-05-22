/**
 * Webview Preload Script - 간결화 버전
 * 웹앱 -> Electron Main Process 직접 통신
 */
const { ipcRenderer, contextBridge } = require('electron');

// 웹앱에서 window.electron.send()로 메인 프로세스에 직접 전송
contextBridge.exposeInMainWorld('electron', {
  send: (channel, data) => {
    ipcRenderer.send(channel, data);
  }
});
