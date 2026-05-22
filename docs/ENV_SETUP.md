# Electron 환경 변수 설정 가이드

## 수질성적서 AI 파싱 (Webview 연동)

### 0. 루트 .env.local (Vite 개발 모드용)

**브라우저 개발 모드**(`npm run dev`)에서 테스트 시 필요:

```bash
# 프로젝트 루트의 .env.local
VITE_GEMINI_API_KEY=your-gemini-api-key
```

### 1. Electron .env.local 파일 설정

**패키징된 Electron 앱**에서 사용됩니다.

`electron/.env.local` 파일을 생성하고 다음 값들을 설정합니다:

```bash
# ============================================
# Google Cloud 프로젝트 설정
# ============================================
BQ_PROJECT_ID=your-project-id
BQ_DATASET=daily_log_system
BQ_TABLE=certificate_water_quality

# ============================================
# Google 서비스 계정 키 (JSON 문자열)
# ============================================
GOOGLE_APPLICATION_CREDENTIALS_JSON={
  "type": "service_account",
  "project_id": "your-project-id",
  "private_key_id": "...",
  "private_key": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n",
  "client_email": "service-account@your-project-id.iam.gserviceaccount.com",
  "client_id": "...",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
  "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/..."
}

# ============================================
# Google Drive 설정
# ============================================
GDRIVE_FOLDER_ID=your-drive-folder-id

# ============================================
# AI Studio 웹앱 URL (선택)
# ============================================
REACT_APP_PDF_PARSER_WEBAPP_URL=https://waterquality-analyzer-874923267324.us-east1.run.app

# ============================================
# Gemini API 키 (웹앱 파싱용 - 중요!)
# ============================================
# Google AI Studio 웹앱에서 Gemini API 호출 시 사용
# 이 키는 Electron에서 웹앱으로 주입됩니다
VITE_GEMINI_API_KEY=your-gemini-api-key-from-google-ai-studio
```

### 1.1 Gemini API 키 발급 방법

1. **Google AI Studio** 접속: https://makersuite.google.com/app/apikey
2. **API 키 생성** 클릭
3. 생성된 키를 복사하여 `VITE_GEMINI_API_KEY`에 설정

### 1.2 웹앱 측 수정 필요사항

웹앱이 Electron으로부터 API 키를 받아 사용하도록 수정 필요:

```javascript
// AI Studio 웹앱 프로토콜

// 1. API 키 수신 (Electron -> 웹앱) - 직접 주입 방식 (가장 확실함)
// Electron에서 webview.executeJavaScript()로 직접 실행:
webview.executeJavaScript(`
  localStorage.setItem('custom_gemini_api_key', '${GEMINI_API_KEY}');
  window._GEMINI_API_KEY = '${GEMINI_API_KEY}';
  console.log('[Electron->Webapp] API Key forced injected.');
`);

// 2. 파싱 결과 전송 (웹앱 -> Electron)
// 방법 A: window.electron.send() 사용 (권장)
window.electron.send('water-quality-message', {
  type: 'WATER_QUALITY_BATCH_COMPLETE',
  payload: { validRecords: [...], images: [...] }
});

// 방법 B: postMessage 사용
window.parent.postMessage({
  type: 'WATER_QUALITY_BATCH_COMPLETE',
  payload: { validRecords: [...], images: [...] }
}, '*');
```

### 2. Google Cloud Console 설정

1. **BigQuery API** 활성화
2. **Google Drive API** 활성화  
3. **서비스 계정** 생성 및 키 다운로드 (JSON)
4. BigQuery 테이블에 데이터 편집 권한 부여
5. Google Drive 폴더에 쓰기 권한 부여

### 3. 서비스 계정 키 변환

다운로드한 JSON 키를 한 줄 문자열로 변환:

```bash
# Linux/Mac
jq -c . service-account-key.json

# 또는 Python
python -c "import json; import sys; print(json.dumps(json.load(open('service-account-key.json'))))"
```

### 4. Electron 빌드 시 주의사항

- `.env.local` 파일은 **Git에 커밋하지 않음** (이미 .gitignore에 등록됨)
- Electron 패키징 시 `electron/` 폴더 내용 포함 확인
- 프로덕션 빌드 시 환경 변수는 `electron-builder` 설정에서 관리

### 5. 보안 프로토콜

```
[Google AI Studio 웹앱]
        ↓ postMessage
[Electron Webview (preload-webview.js)]
        ↓ IPC
[Electron Main (main-water-quality.js)]
        ↓ API 호출
[BigQuery / Google Drive]
```

**키 관리 원칙:**
- API 키는 **Main Process**에서만 사용
- Renderer/Webview에는 키가 노출되지 않음
- .env.local은 로컬 개발용, 프로덕션은 별도 관리

### 6. 테스트 방법

1. 개발 모드 실행:
```bash
npm run electron:dev
```

2. 메뉴에서 "수질성적서 AI 파싱" 선택
3. 웹앱에서 PDF 업로드 및 처리
4. Electron 콘솔에서 업로드 로그 확인
