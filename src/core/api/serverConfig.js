/**
 * 서버 포트 자동 탐색 모듈
 * 서버가 포트 충돌로 8901 이 아닌 다른 포트를 사용할 경우에도 자동으로 찾아 연결합니다.
 */

const PORT_MIN = 26241;
const PORT_MAX = 26245;
const PING_TIMEOUT_MS = 600;
const CACHE_KEY = 'osoo_server_port';

let _cachedBase = null;

async function pingPort(port) {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), PING_TIMEOUT_MS);
    const res = await fetch(`http://localhost:${port}/api/ping`, { signal: ctrl.signal });
    clearTimeout(timer);
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * 앱 시작 시 한 번 호출. 서버 포트를 탐색하고 캐시합니다.
 */
export async function initServerConfig() {
  // 1. Electron 환경인지 확인하고 IPC로 포트 알아내기
  const hasElectron = typeof window !== 'undefined' && (window.electronAPI || window.electron);
  if (hasElectron) {
    const api = window.electronAPI || window.electron;
    if (typeof api.getServerPort === 'function') {
      console.log('[ServerConfig] Electron 환경 감지. IPC 포트 조회를 시도합니다.');
      // 서버가 뜨는 중일 수 있으므로, 포트 파일을 읽고 핑이 성공할 때까지 재시도
      for (let attempt = 1; attempt <= 15; attempt++) {
        const port = await api.getServerPort();
        if (port) {
          if (await pingPort(port)) {
            _cachedBase = `http://localhost:${port}`;
            localStorage.setItem(CACHE_KEY, String(port));
            console.log(`[ServerConfig] IPC 포트 연결 성공: ${port} (시도 #${attempt})`);
            return _cachedBase;
          }
        }
        await new Promise(resolve => setTimeout(resolve, 200)); // 200ms 대기
      }
      console.warn('[ServerConfig] IPC 포트 획득 또는 연결에 실패했습니다. 포트 스캔을 진행합니다.');
    }
  }

  // 2. 캐시된 포트 검사
  const cached = localStorage.getItem(CACHE_KEY);
  if (cached) {
    const port = parseInt(cached, 10);
    if (!isNaN(port) && await pingPort(port)) {
      _cachedBase = `http://localhost:${port}`;
      console.log(`[ServerConfig] 캐시된 포트 ${port} 연결 성공`);
      return _cachedBase;
    }
    localStorage.removeItem(CACHE_KEY);
  }

  // 3. 병렬 포트 스캔 (일반 브라우저 환경 및 백업용)
  const ports = [];
  for (let port = PORT_MIN; port <= PORT_MAX; port++) {
    ports.push(port);
  }

  try {
    const scanResults = await Promise.all(
      ports.map(async (port) => {
        const ok = await pingPort(port);
        return { port, ok };
      })
    );
    const found = scanResults.find((r) => r.ok);
    if (found) {
      _cachedBase = `http://localhost:${found.port}`;
      localStorage.setItem(CACHE_KEY, String(found.port));
      console.log(`[ServerConfig] 병렬 스캔을 통해 포트 ${found.port}에서 서버 발견`);
      return _cachedBase;
    }
  } catch (err) {
    console.error('[ServerConfig] 병렬 포트 스캔 중 에러:', err);
  }

  _cachedBase = `http://localhost:${PORT_MIN}`;
  console.warn(`[ServerConfig] 서버를 찾지 못했습니다. 기본 포트(${PORT_MIN}) 사용`);
  return _cachedBase;
}

/**
 * 현재 연결된 서버 베이스 URL을 반환합니다.
 */
export function getApiBase() {
  return _cachedBase || `http://localhost:${PORT_MIN}`;
}

/**
 * 서버 연결이 끊겼을 때 재탐색 후 새 포트를 캐시합니다.
 */
export async function rediscoverServer() {
  localStorage.removeItem(CACHE_KEY);
  _cachedBase = null;
  return await initServerConfig();
}
