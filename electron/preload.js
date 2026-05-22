/**
 * Electron Main Preload Script
 * 
 * Renderer(React)에서 Main process로 안전하게 통신
 */

const { contextBridge, ipcRenderer } = require('electron');

// Renderer → Main API
contextBridge.exposeInMainWorld('electronAPI', {
  // 수질성적서 데이터 전송
  sendWaterQualityData: (payload) => {
    return ipcRenderer.invoke('water-quality-upload', payload);
  },
  
  // 업로드 진행 상황 수신
  onUploadProgress: (callback) => {
    ipcRenderer.on('upload-progress', (event, data) => callback(data));
  },
  
  // 업로드 완료 수신
  onUploadComplete: (callback) => {
    ipcRenderer.on('upload-complete', (event, data) => callback(data));
  },
  
  // 설정 저장/로드
  saveSettings: (key, value) => {
    return ipcRenderer.invoke('save-settings', key, value);
  },
  loadSettings: (key) => {
    return ipcRenderer.invoke('load-settings', key);
  },
});
