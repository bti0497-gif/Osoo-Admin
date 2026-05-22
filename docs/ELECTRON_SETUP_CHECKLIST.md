# Electron 앱에 WebviewPdfParser 통합 체크리스트

## 전제 조건

- [ ] Google AI Studio 웹앱이 배포됨 (URL 확인)
- [ ] BigQuery 테이블이 생성됨 (`certificate_water_quality`)
- [ ] Google Drive 폴더가 생성됨
- [ ] 서비스 계정 키가 발급됨 (BigQuery + Drive 권한)

## 1. Electron Main Process 설정

### 1.1 핸들러 등록

`electron/main.js` 파일 상단에 추가:

```javascript
const { registerWaterQualityHandlers } = require('./main-water-quality');
```

`app.whenReady()` 내부에 추가:

```javascript
app.whenReady().then(() => {
  // ... 기존 코드 ...
  
  // 수질성적서 핸들러 등록
  registerWaterQualityHandlers();
  
  createWindow();
});
```

### 1.2 Preload 스크립트 설정

BrowserWindow 생성 시 `webPreferences` 확인:

```javascript
const mainWindow = new BrowserWindow({
  width: 1200,
  height: 800,
  webPreferences: {
    preload: path.join(__dirname, 'preload.js'),
    contextIsolation: true,
    nodeIntegration: false,
    webSecurity: true,
    allowRunningInsecureContent: false,
  },
});
```

### 1.3 환경 변수 로드

`electron/main.js` 최상단에 추가:

```javascript
require('dotenv').config({ path: path.join(__dirname, '.env.local') });
```

## 2. 환경 변수 파일 생성

`electron/.env.local` 파일 생성:

```bash
# Google Cloud Project
BQ_PROJECT_ID=your-project-id
BQ_DATASET=daily_log_system
BQ_TABLE=certificate_water_quality

# 서비스 계정 키 (JSON 문자열, 줄바꿈 없이)
GOOGLE_APPLICATION_CREDENTIALS_JSON={"type":"service_account","project_id":"...",...}

# Google Drive
GDRIVE_FOLDER_ID=your-folder-id

# 웹앱 URL (선택, 기본값 있음)
REACT_APP_PDF_PARSER_WEBAPP_URL=https://ais-pre-...
```

## 3. 의존성 설치

```bash
# BigQuery
npm install @google-cloud/bigquery

# Google APIs (Drive)
npm install googleapis

# 환경 변수
npm install dotenv
```

## 4. 파일 구조 확인

```
electron/
├── main.js                    # ← 핸들러 등록 필요
├── preload.js                 # ← 이미 생성됨
├── preload-webview.js         # ← 이미 생성됨
├── main-water-quality.js      # ← 이미 생성됨
└── .env.local                 # ← 직접 생성
```

## 5. 빌드 및 테스트

### 개발 모드

```bash
# React 개발 서버
npm run dev

# Electron (별도 터미널)
npm run electron:dev
```

### 프로덕션 빌드

```bash
# React 빌드
npm run build

# Electron 패키징
npm run electron:build
```

## 6. 테스트 시나리오

### 6.1 웹뷰 로드 테스트

1. 앱 실행
2. "수질성적서 AI 파싱" 메뉴 선택
3. 웹뷰에 웹앱이 정상 로드되는지 확인
4. DevTools (F12)에서 콘솔 오류 확인

### 6.2 IPC 통신 테스트

1. 웹앱에서 PDF 업로드
2. 처리 완료 후 Electron 콘솔에서 메시지 수신 확인
3. BigQuery/Drive에 데이터 업로드 확인

### 6.3 오류 처리 테스트

1. 잘못된 API 키로 업로드 시도
2. 네트워크 단절 상황 테스트
3. 큰 파일 (10MB+) 처리 테스트

## 7. 보안 검증

- [ ] `.env.local`이 Git에 커밋되지 않음
- [ ] 서비스 계정 키에 과도한 권한이 없음
- [ ] 웹뷰 `nodeIntegration: false` 설정됨
- [ ] `contextIsolation: true` 설정됨
- [ ] preload 스크립트가 검증된 경로에서 로드됨

## 8. 문제 해결

### 웹뷰가 표시되지 않음

```bash
# DevTools 콘솔 확인
# webview 관련 CSP 오류 확인
```

### IPC 메시지 수신 안됨

```javascript
// main.js에서 디버깅
ipcMain.on('water-quality-message', (event, data) => {
  console.log('Received:', data);  // 로그 확인
});
```

### BigQuery 업로드 실패

```bash
# 서비스 계정 키 유효성 확인
gcloud auth activate-service-account --key-file=...

# 테이블 접근 권한 확인
bq ls daily_log_system
```

## 완료 후

- [ ] 기능 테스트 완료
- [ ] 보안 검증 완료
- [ ] 배포 준비 완료
