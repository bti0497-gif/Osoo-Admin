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
  // 1. Electron 환경인 경우 IPC 포트 우선 탐색 (100% 최우선)
  const hasElectron = typeof window !== 'undefined' && (window.electronAPI || window.electron);
  if (hasElectron) {
    const api = window.electronAPI || window.electron;
    if (typeof api.getServerPort === 'function') {
      for (let attempt = 1; attempt <= 10; attempt++) {
        const port = await api.getServerPort();
        if (port && await pingPort(port)) {
          _cachedBase = `http://localhost:${port}`;
          localStorage.setItem(CACHE_KEY, String(port));
          return _cachedBase;
        }
        await new Promise(resolve => setTimeout(resolve, 150));
      }
    }
  }

  // 2. 캐시된 포트 검사 (유효한 범주의 포트만 허용: PORT_MIN ~ PORT_MAX)
  const cached = localStorage.getItem(CACHE_KEY);
  if (cached) {
    const port = parseInt(cached, 10);
    if (!isNaN(port) && port >= PORT_MIN && port <= PORT_MAX && await pingPort(port)) {
      _cachedBase = `http://localhost:${port}`;
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
