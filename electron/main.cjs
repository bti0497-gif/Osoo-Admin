const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { fork, exec, execSync } = require('child_process');
const { setupAutoUpdater, checkForUpdates, downloadUpdate, quitAndInstall } = require('./updater.cjs');

// Windows 터미널 한글 깨짐 방지
if (process.platform === 'win32') {
  try { execSync('chcp 65001', { stdio: 'ignore', windowsHide: true }); } catch (_) {}
}
process.stdout.setEncoding?.('utf8');
process.stderr.setEncoding?.('utf8');

let mainWindow = null;
let serverProcess = null;
const isDev = !app.isPackaged;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getServerPortFilePath() {
  const baseDir = path.join(__dirname, '..');
  const appDataPath = path.join(process.env.APPDATA || baseDir, 'Osoo_Handle_App');
  return path.join(appDataPath, 'server.port');
}

async function waitForServerReady(timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  const portFilePath = getServerPortFilePath();

  while (Date.now() < deadline) {
    try {
      if (fs.existsSync(portFilePath)) {
        const portStr = fs.readFileSync(portFilePath, 'utf8').trim();
        const port = parseInt(portStr, 10);
        if (!isNaN(port)) {
          const res = await fetch(`http://127.0.0.1:${port}/api/ping`);
          if (res.ok) {
            return port;
          }
        }
      }
    } catch (_) {
      // 서버가 아직 뜨지 않았을 수 있으므로 재시도한다.
    }

    await sleep(250);
  }

  throw new Error('서버 준비 확인 시간 초과');
}

function cleanupExistingPortProcessesAsync() {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') return resolve();
    const psScript = `$ErrorActionPreference='SilentlyContinue'; $currentPid=${process.pid}; netstat -ano | ForEach-Object { if ($_ -match '(?i)127\\.0\\.0\\.1:2624[0-5]\\b' -or $_ -match '(?i)0\\.0\\.0\\.0:2624[0-5]\\b') { $tokens = $_ -split '\\s+' | Where-Object { $_ }; if ($tokens.Length -ge 5) { $pid = [int]$tokens[-1]; if ($pid -and $pid -ne $currentPid) { Stop-Process -Id $pid -Force } } } }`;
    const killer = exec(`powershell.exe -NoProfile -Command "${psScript}"`, { windowsHide: true });
    let done = false;
    const finish = () => { if (!done) { done = true; resolve(); } };
    killer.on('exit', finish);
    killer.on('error', finish);
    setTimeout(finish, 800); // 800ms 안전 타임아웃
  });
}

async function startServer() {
  if (serverProcess) return;

  // 비동기 클린부팅 (메인 스레드 멈춤 없이 26240~26245 잔여 프로세스 강제 종료)
  await cleanupExistingPortProcessesAsync();

  const appRootPath = isDev ? path.join(__dirname, '..') : app.getAppPath();
  const appDataPath = path.join(process.env.APPDATA || path.join(__dirname, '..'), 'Osoo_Handle_App');
  const serverScriptPath = path.join(appRootPath, 'server.cjs');

  // 프로덕션: asarUnpack된 서버 스크립트가 있으면 그것을 사용
  let actualScript = serverScriptPath;
  let cwd = appRootPath;
  const serverEnv = { ...process.env, ELECTRON: '1', APP_DATA_PATH: appDataPath };

  if (!isDev) {
    const unpackedScript = path.join(process.resourcesPath, 'app.asar.unpacked', 'server.cjs');
    if (fs.existsSync(unpackedScript)) {
      actualScript = unpackedScript;
      cwd = path.join(process.resourcesPath, 'app.asar.unpacked');
    }
    // asar 내부의 node_modules를 fork()된 자식 프로세스가 찾을 수 있도록 NODE_PATH 지정
    const asarNodeModules = path.join(app.getAppPath(), 'node_modules');
    serverEnv.NODE_PATH = asarNodeModules;
  }

  console.log(`[Electron] Starting server: ${actualScript}`);
  console.log(`[Electron] CWD: ${cwd}`);

  serverProcess = fork(actualScript, [], {
    cwd: cwd,
    stdio: 'pipe',
    env: serverEnv
  });

  serverProcess.stdout?.on('data', (data) => {
    console.log(`[Server] ${data.toString('utf8').trim()}`);
  });

  serverProcess.stderr?.on('data', (data) => {
    console.error(`[Server Error] ${data.toString('utf8').trim()}`);
  });

  serverProcess.on('exit', (code) => {
    console.log(`[Server] Process exited with code ${code}`);
    serverProcess = null;
    if (mainWindow && !mainWindow.isDestroyed()) {
      setTimeout(() => startServer(), 2000);
    }
  });

  console.log('[Electron] Server process started');
}

function stopServer() {
  if (serverProcess) {
    serverProcess.kill();
    serverProcess = null;
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: '전국휴게소 오수처리장 통합관리시스템 중앙관리자용 프로그램',
    icon: path.join(__dirname, '..', 'public', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      webviewTag: true,
      backgroundThrottling: false, // 창이 가려지거나 백그라운드로 가도 렌더링/전송 작업이 멈추지 않도록 설정
    },
    show: false,
    autoHideMenuBar: true,
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  const distIndex = path.join(__dirname, '..', 'dist', 'index.html');
  const forceDevServer = process.env.ELECTRON_FORCE_DEV_SERVER === '1';
  const useDevServer = isDev && (forceDevServer || !fs.existsSync(distIndex));

  if (useDevServer) {
    mainWindow.loadURL('http://localhost:26240');
  } else {
    mainWindow.loadFile(distIndex);
  }

  // F12 개발자 도구 토글 단축키 추가
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F12' && input.type === 'keyDown') {
      if (mainWindow.webContents.isDevToolsOpened()) {
        mainWindow.webContents.closeDevTools();
      } else {
        mainWindow.webContents.openDevTools({ mode: 'detach' });
      }
      event.preventDefault();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createHiddenPdfWindow() {
  return new BrowserWindow({
    show: false,
    width: 1280,
    height: 960,
    autoHideMenuBar: true,
    webPreferences: {
      sandbox: false,
      contextIsolation: true,
    },
  });
}

async function waitForPdfContentReady(webContents) {
  await webContents.executeJavaScript(`
    new Promise((resolve) => {
      const imagePromises = Array.from(document.images || []).map((image) => {
        if (image.complete) {
          return Promise.resolve();
        }

        return new Promise((done) => {
          image.addEventListener('load', done, { once: true });
          image.addEventListener('error', done, { once: true });
        });
      });

      const fontReady = document.fonts?.ready || Promise.resolve();

      Promise.all([fontReady, ...imagePromises])
        .catch(() => undefined)
        .finally(() => setTimeout(resolve, 150));
    });
  `);
}

async function buildPdfBufferFromHtml(htmlContent, printBackground) {
  const pdfWindow = createHiddenPdfWindow();

  try {
    await pdfWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`);
    await waitForPdfContentReady(pdfWindow.webContents);
    return await pdfWindow.webContents.printToPDF({
      printBackground,
      pageSize: 'A4',
      preferCSSPageSize: true,
    });
  } finally {
    if (!pdfWindow.isDestroyed()) {
      pdfWindow.destroy();
    }
  }
}

app.whenReady().then(async () => {
  await startServer();
  try {
    await waitForServerReady();
  } catch (err) {
    console.warn('[Electron] 서버 준비 대기 실패, 창을 먼저 띄웁니다:', err.message);
  }
  createWindow();

  if (!isDev) {
    setupAutoUpdater(mainWindow);
  }
}).catch((err) => {
  console.error('[Electron] 초기화 실패:', err.message);
  createWindow();
});

app.on('window-all-closed', () => {
  stopServer();
  app.quit();
});

app.on('before-quit', () => {
  stopServer();
});

ipcMain.handle('app:getVersion', () => app.getVersion());
ipcMain.handle('app:getServerPort', () => {
  const portFilePath = getServerPortFilePath();
  try {
    if (fs.existsSync(portFilePath)) {
      const portStr = fs.readFileSync(portFilePath, 'utf8').trim();
      const port = parseInt(portStr, 10);
      if (!isNaN(port)) {
        return port;
      }
    }
  } catch (e) {
    console.error('[Electron] Failed to read server.port file:', e.message);
  }
  return null;
});

// ROI 템플릿 파일 저장/읽기
const roiTemplatePath = path.join(app.getPath('userData'), 'roi_template.json');

ipcMain.handle('roi:save', (_event, data) => {
  try {
    fs.writeFileSync(roiTemplatePath, JSON.stringify(data, null, 2), 'utf8');
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('roi:load', () => {
  try {
    if (fs.existsSync(roiTemplatePath)) {
      const raw = fs.readFileSync(roiTemplatePath, 'utf8');
      return { success: true, data: JSON.parse(raw) };
    }
    return { success: true, data: null };
  } catch (e) {
    return { success: false, error: e.message };
  }
});
ipcMain.handle('webview:getPreloadPath', () => {
  const filePath = path.join(__dirname, 'preload-webview.js');
  const formattedPath = filePath.replace(/\\/g, '/');
  return `file:///${formattedPath}`;
});
ipcMain.handle('shell:openFile', async (_event, filePath) => {
  const err = await shell.openPath(filePath);
  if (err) throw new Error(err);
  return { ok: true };
});
ipcMain.handle('app:checkForUpdates', () => {
  return checkForUpdates();
});
ipcMain.handle('app:downloadUpdate', () => {
  return downloadUpdate();
});
ipcMain.handle('app:quitAndInstall', () => {
  return quitAndInstall();
});

ipcMain.handle('pdf:save', async (_event, options = {}) => {
  if (!mainWindow || mainWindow.isDestroyed()) {
    throw new Error('메인 윈도우가 준비되지 않았습니다.');
  }

  const { defaultFileName = 'report.pdf', printBackground = true, htmlContent = '' } = options;

  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    title: 'PDF로 저장',
    defaultPath: defaultFileName,
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  });

  if (canceled || !filePath) {
    return { canceled: true };
  }

  const pdfBuffer = htmlContent
    ? await buildPdfBufferFromHtml(htmlContent, printBackground)
    : await mainWindow.webContents.printToPDF({
      printBackground,
      pageSize: 'A4',
    });

  fs.writeFileSync(filePath, pdfBuffer);
  return { canceled: false, filePath };
});

// 파일 다운로드 (기본 다운로드 폴더에 자동 저장)
ipcMain.handle('file:download', async (_event, { url, fileName }) => {
  try {
    const downloadsPath = app.getPath('downloads');
    const filePath = path.join(downloadsPath, fileName);
    
    // URL에서 파일 다운로드
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Download failed: ${response.status}`);
    }
    
    const buffer = Buffer.from(await response.arrayBuffer());
    fs.writeFileSync(filePath, buffer);
    
    return { success: true, filePath };
  } catch (err) {
    console.error('[file:download] Error:', err);
    return { success: false, error: err.message };
  }
});

// 바이너리 버퍼를 다운로드 폴더에 저장 (대화상자 없음)
ipcMain.handle('file:saveBuffer', async (_event, { fileName, buffer }) => {
  try {
    const downloadsPath = app.getPath('downloads');
    const filePath = path.join(downloadsPath, fileName);
    
    // Uint8Array를 Buffer로 변환
    const nodeBuffer = Buffer.from(buffer);
    fs.writeFileSync(filePath, nodeBuffer);
    
    console.log('[file:saveBuffer] Saved:', filePath);
    return { success: true, filePath };
  } catch (err) {
    console.error('[file:saveBuffer] Error:', err);
    return { success: false, error: err.message };
  }
});

// 바이너리 버퍼를 임시 폴더(Temp)에 저장 후 바로 열기용
ipcMain.handle('file:saveBufferToTemp', async (_event, { fileName, buffer }) => {
  try {
    const tempPath = app.getPath('temp');
    const filePath = path.join(tempPath, fileName);
    
    const nodeBuffer = Buffer.from(buffer);
    fs.writeFileSync(filePath, nodeBuffer);
    
    console.log('[file:saveBufferToTemp] Saved:', filePath);
    return { success: true, filePath };
  } catch (err) {
    console.error('[file:saveBufferToTemp] Error:', err);
    return { success: false, error: err.message };
  }
});
