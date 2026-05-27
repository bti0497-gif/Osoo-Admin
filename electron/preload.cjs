const { contextBridge, ipcRenderer } = require('electron');

const electronAPISchema = {
  getVersion: () => ipcRenderer.invoke('app:getVersion'),
  checkForUpdates: () => ipcRenderer.invoke('app:checkForUpdates'),
  onUpdateAvailable: (callback) => ipcRenderer.on('update:available', (_event, info) => callback(info)),
  onUpdateDownloaded: (callback) => ipcRenderer.on('update:downloaded', (_event, info) => callback(info)),
  onUpdateProgress: (callback) => ipcRenderer.on('update:progress', (_event, progress) => callback(progress)),
  onUpdateError: (callback) => ipcRenderer.on('update:error', (_event, err) => callback(err)),
  savePdf: (options) => ipcRenderer.invoke('pdf:save', options),
  openFile: (filePath) => ipcRenderer.invoke('shell:openFile', filePath),
  roiSave: (data) => ipcRenderer.invoke('roi:save', data),
  roiLoad: () => ipcRenderer.invoke('roi:load'),

  // 웹뷰 프리로드 스크립트 경로 동적 제공
  getWebviewPreloadPath: () => ipcRenderer.invoke('webview:getPreloadPath'),

  // 하위 호환성 유지 (웹앱에서 호출해도 무시)
  send: (channel, data) => {
    console.log('[Preload] send called (no-op):', channel);
  },
  receive: (channel, func) => {
    // no-op
    return () => {};
  },
  isElectron: true
};

contextBridge.exposeInMainWorld('electronAPI', electronAPISchema);
contextBridge.exposeInMainWorld('electron', electronAPISchema);

