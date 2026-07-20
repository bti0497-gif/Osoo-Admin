const express = require('express');
const path = require('path');
const fs = require('fs');
const net = require('net');
const cors = require('cors');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });

const BASE_DIR = path.join(__dirname, '..');
const appDataPath = path.join(process.env.APPDATA || BASE_DIR, 'Osoo_Handle_App');
if (!fs.existsSync(appDataPath)) {
  fs.mkdirSync(appDataPath, { recursive: true });
}
// 중앙관리자 앱은 SQLite 사용 안함
const db = null;

// 현장 마스터 캐시 초기화 (appDataPath 결정 후 바로 실행)
const siteMasterCache = require('./services/siteMasterCacheService.cjs');
const { getSites: getSitesForCache } = require('./services/sitesSheetsService.cjs');

const app = express();
app.use(cors({
  exposedHeaders: ['Content-Disposition'],
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use('/uploads', express.static(path.join(BASE_DIR, 'uploads')));

process.on('uncaughtException', (err) => {
  console.error('[UncaughtException]', err.message);
  console.error(err.stack);
});
process.on('unhandledRejection', (reason) => {
  console.error('[UnhandledRejection]', reason instanceof Error ? reason.message : reason);
});

app.get('/', (req, res) => {
  res.send(`
    <div style="font-family: sans-serif; padding: 2rem; line-height: 1.6;">
      <h1 style="color: #1e293b;">Osoo Admin App - Local Bridge Server</h1>
      <p>백엔드 API 서버가 정상적으로 작동 중입니다.</p>
      <p><strong>참고:</strong> 사용자 인터페이스(UI)를 보려면 프론트엔드 개발 서버(포트 8900)를 실행해야 합니다.</p>
      <div style="background: #f1f5f9; padding: 1rem; border-radius: 8px; display: inline-block;">
        <code>npm run dev</code> 를 터미널에서 실행하세요.
      </div>
    </div>
  `);
});

app.get('/api/ping', (req, res) => res.json({ ok: true }));

// [CRITICAL] API 라우트 등록 - 삭제/수정 시 해당 기능 완전 테스트 필수
// 순서: 일반 라우트 먼저, 마지막에 에러 처리
app.use(require('./routes/settingsRoutes.cjs')(db, BASE_DIR, appDataPath)); // 현장 설정/현장 선택
app.use(require('./routes/flowRoutes.cjs')(db));              // 유량 관리
app.use(require('./routes/medicineRoutes.cjs')(db));          // 약품 관리
app.use(require('./routes/kitRoutes.cjs')(db));               // 키트 관리
app.use(require('./routes/waterQualityRoutes.cjs')(db, BASE_DIR)); // 수질 분석
app.use(require('./routes/dailyWorkLogRoutes.cjs')(db, BASE_DIR, appDataPath)); // 일일운영일지
app.use(require('./routes/excelRoutes.cjs')(db, BASE_DIR, appDataPath)); // 일지 미리보기/엑셀
app.use(require('./routes/facilityRoutes.cjs')(db));          // 시설 관리
app.use(require('./routes/medicineInRoutes.cjs')(db, BASE_DIR, appDataPath)); // 공사입력 도우미
app.use(require('./routes/medicineRegisterRoutes.cjs')(db, BASE_DIR, appDataPath)); // 약품관리대장
app.use(require('./routes/sludgePhotoRoutes.cjs')(db, BASE_DIR, appDataPath)); // 슬러지 사진
app.use(require('./routes/adminSettingsRoutes.cjs')());    // 관리자 설정 (/api/admin/*)
app.use(require('./routes/boardRoutes.cjs')());            // 게시판 (/api/board/*) - 인증/권한 중요
app.use(require('./routes/certificateRoutes.cjs')());      // 성적서 (/api/certificates/*)
app.use(require('./routes/certificateQueueRoutes.cjs')());  // 성적서 업로드 큐 (로컬 저장 + 순차 동기화)
app.use(require('./routes/siteMasterRoutes.cjs'));             // 현장 마스터 캐시
app.use(require('./routes/monthlyReportRoutes.cjs'));          // 월운영일지 Excel 내보내기
app.use(require('./routes/certificateWaterQualityRoutes.cjs')); // 수질 데이터
app.use(require('./routes/adminDataRoutes.cjs')());        // 데이터 관리
app.use(require('./routes/aiRoutes.cjs')());               // AI 기능
app.use(require('./routes/locationRoutes.cjs')(BASE_DIR)); // 위치 정보
app.use(require('./routes/gyeonggiRoutes.cjs').gyeonggiRouter); // 경기도 API
app.use(require('./routes/periodReportRoutes.cjs'));            // 기간 데이터 조회 Excel 내보내기
app.use(require('./routes/gyeonggiMonthlyReportRoutes.cjs'));   // 경기대 월운영보고서 출력
app.use('/api/auth', require('./routes/authRoutes.cjs')()); // 인증
app.use(require('./routes/attendanceRoutes.cjs'));        // 출근부
app.use(require('./routes/uploadRoutes.cjs')(BASE_DIR));   // 파일 업로드/다운로드 (/api/upload, /api/download)

async function findFreePort(startPort, endPort) {
  for (let p = startPort; p <= endPort; p++) {
    const free = await new Promise((resolve) => {
      const srv = net.createServer();
      srv.once('error', () => resolve(false));
      srv.once('listening', () => { srv.close(); resolve(true); });
      srv.listen(p, '127.0.0.1');
    });
    if (free) return p;
  }
  return startPort;
}

const API_PORT_MIN = (Number(process.env.VITE_PORT) || 26240) + 1;
const API_PORT_MAX = API_PORT_MIN + 4;

function writePortFile(port) {
  const portFilePath = path.join(appDataPath, 'server.port');
  try { fs.writeFileSync(portFilePath, String(port), 'utf8'); } catch (_) { }
}

function startListening(actualPort) {
  writePortFile(actualPort);

  // 현장 마스터 캐시 로컬 파일 즉시 메모리 적재 (0ms)
  siteMasterCache.init(appDataPath);

  const server = app.listen(actualPort, '127.0.0.1', () => {
    console.log(`Local Bridge Server running at http://localhost:${actualPort}`);
    if (actualPort !== API_PORT_MIN) {
      console.warn(`[주의] 기본 포트(${API_PORT_MIN})가 이미 사용 중이어서 포트 ${actualPort}로 시작했습니다.`);
    }

    // 서버 시작 완료 후 비동기 백그라운드로 구글시트 최신 갱신 진행 (Non-blocking)
    setTimeout(() => {
      siteMasterCache.refreshSiteMasterCache(getSitesForCache).catch((err) => {
        console.warn('[siteMasterCache] 백그라운드 갱신 실패 (캐시 파일 사용):', err.message);
      });
    }, 1000);
  });
  server.on('error', (err) => { console.error('[Server Error]', err.message); });
}

if (process.env.ELECTRON === '1') {
  findFreePort(API_PORT_MIN, API_PORT_MAX).then((actualPort) => {
    startListening(actualPort);
  });
} else {
  siteMasterCache.init(appDataPath);

  const fixedPort = API_PORT_MIN;
  const server = app.listen(fixedPort, '127.0.0.1', () => {
    writePortFile(fixedPort);
    console.log(`Local Bridge Server running at http://localhost:${fixedPort}`);

    setTimeout(() => {
      siteMasterCache.refreshSiteMasterCache(getSitesForCache).catch((err) => {
        console.warn('[siteMasterCache] 백그라운드 갱신 실패 (캐시 파일 사용):', err.message);
      });
    }, 1000);
  });

  server.on('error', (err) => {
    console.error('[Server Error]', err.message);
    if (err.code === 'EADDRINUSE') {
      console.error(`[Server Error] 개발 환경에서는 백엔드 포트 ${fixedPort}를 고정 사용합니다. 기존 프로세스를 종료한 뒤 다시 시작해 주세요.`);
    }
    process.exit(1);
  });
}
