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
  
  // 수질성적서 웹앱 통신
  sendWaterQualityData: (payload) => ipcRenderer.invoke('water-quality-upload', payload),
  onUploadProgress: (callback) => ipcRenderer.on('upload-progress', (_event, data) => callback(data)),
  onUploadComplete: (callback) => ipcRenderer.on('upload-complete', (_event, data) => callback(data)),

  // 웹뷰 프리로드 스크립트 경로 동적 제공
  getWebviewPreloadPath: () => ipcRenderer.invoke('webview:getPreloadPath'),

  // IPC Send/Receive 통합 포트
  send: (channel, data) => {
    const validChannels = ['water-quality-message', 'water-quality-upload', 'upload-progress', 'upload-complete'];
    if (validChannels.includes(channel)) {
      ipcRenderer.send(channel, data);
    }
  },
  receive: (channel, func) => {
    const validChannels = ['transfer-status', 'upload-progress', 'upload-complete', 'water-quality-response'];
    if (validChannels.includes(channel)) {
      const subscription = (event, ...args) => func(...args);
      ipcRenderer.on(channel, subscription);
      return () => {
        ipcRenderer.removeListener(channel, subscription);
      };
    }
  }
};

contextBridge.exposeInMainWorld('electronAPI', electronAPISchema);
contextBridge.exposeInMainWorld('electron', electronAPISchema);

