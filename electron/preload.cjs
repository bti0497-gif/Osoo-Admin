const { contextBridge, ipcRenderer } = require('electron');

const electronAPISchema = {
  getVersion: () => ipcRenderer.invoke('app:getVersion'),
  getServerPort: () => ipcRenderer.invoke('app:getServerPort'),
  checkForUpdates: () => ipcRenderer.invoke('app:checkForUpdates'),
  downloadUpdate: () => ipcRenderer.invoke('app:downloadUpdate'),
  quitAndInstall: () => ipcRenderer.invoke('app:quitAndInstall'),
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
  
  // 파일 다운로드 (기본 다운로드 폴더에 자동 저장)
  downloadFile: (url, fileName) => ipcRenderer.invoke('file:download', { url, fileName }),
  
  // 바이너리 버퍼를 다운로드 폴더에 저장 (대화상자 없음)
  saveFileToDownloads: (fileName, buffer) => ipcRenderer.invoke('file:saveBuffer', { fileName, buffer }),

  // 바이너리 버퍼를 임시 폴더에 저장 (대화상자 없음, 자동 열기용)
  saveFileToTemp: (fileName, buffer) => ipcRenderer.invoke('file:saveBufferToTemp', { fileName, buffer }),

  // 저장할 대상 디렉토리(폴더) 선택 공통 다이얼로그
  selectFolder: () => ipcRenderer.invoke('dialog:selectFolder'),

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

