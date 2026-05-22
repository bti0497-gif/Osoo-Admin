# Webview 통합 가이드

## 개요

수질성적서 AI 파싱 기능을 **Google AI Studio 웹앱**으로 외주하고, Electron 앱 내에서 **Webview**로 임베드하는 구조입니다.

### 장점
- **유지보수 간소화**: AI 모델 튜닝, UI 수정 등을 웹앱에서만 처리
- **보안**: API 키가 Electron Main Process에서만 사용됨
- **호환성**: 외부 도메인 로드 시 CORS 문제 없음

## 아키텍처

```
┌─────────────────────────────────────────────────────────┐
│  Electron App (Windsurf)                               │
│  ┌─────────────────────────────────────────────────────┐│
│  │  React Frontend                                     ││
│  │  ┌────────────────────────────────────────────────┐ ││
│  │  │  WebviewPdfParser.jsx                          │ ││
│  │  │  ┌───────────────────────────────────────────┐   │ ││
│  │  │  │  <webview src="https://ais-pre-...">      │   │ ││
│  │  │  │  └─ Google AI Studio 웹앱              │   │ ││
│  │  │  │      ↓ postMessage                      │   │ ││
│  │  │  │      WATER_QUALITY_BATCH_COMPLETE       │   │ ││
│  │  │  └───────────────────────────────────────────┘   │ ││
│  │  └────────────────────────────────────────────────┘ ││
│  └─────────────────────────────────────────────────────┘│
│                          ↓ IPC                          │
│  ┌─────────────────────────────────────────────────────┐│
│  │  Main Process (Node.js)                             ││
│  │  ┌───────────────────────────────────────────────┐ ││
│  │  │  main-water-quality.js                        │ ││
│  │  │  - BigQuery INSERT                            │ ││
│  │  │  - Google Drive Upload                        │ ││
│  │  │  ↓ .env.local (API 키)                        │ ││
│  │  └───────────────────────────────────────────────┘ ││
│  └─────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────┘
```

## 통신 프로토콜

### 웹앱 → Electron (수신)

#### 단일 페이지 완료
```json
{
  "type": "WATER_QUALITY_SINGLE_COMPLETE",
  "payload": {
    "record": {
      "site_name": "OO휴게소",
      "report_date": "2024-01-15",
      "results": [...]
    },
    "image": {
      "filename": "OO휴게소_2024-01-15.jpg",
      "content": "base64_encoded_image_string"
    }
  }
}
```

#### 일괄 처리 완료
```json
{
  "type": "WATER_QUALITY_BATCH_COMPLETE",
  "payload": {
    "validRecords": [
      { "site_name": "...", "report_date": "...", ... }
    ],
    "omittedRecords": [
      { "reason": "날짜 누락", ... }
    ],
    "images": [
      { "filename": "...", "content": "base64..." }
    ]
  }
}
```

### Electron → 웹앱 (응답)

```json
{
  "source": "electron-host",
  "status": "success|error",
  "message": "..."
}
```

## 파일 구조

```
electron/
├── preload.js              # Renderer ↔ Main IPC
├── preload-webview.js      # Webview 내부 IPC
└── main-water-quality.js   # Main process 핸들러

src/features/certificate/pdf-parser/
├── WebviewPdfParser.jsx    # Webview 컴포넌트
├── WebviewPdfParser.legacy.jsx  # (이전 버전 백업)
└── index.js                # Export
```

## IPC 채널

| 채널 | 방향 | 설명 |
|------|------|------|
| `water-quality-message` | Webview → Main | 웹앱에서 데이터 수신 |
| `water-quality-upload` | Renderer ↔ Main | 업로드 요청/응답 |
| `upload-progress` | Main → Renderer | 진행 상황 전송 |
| `upload-complete` | Main → Renderer | 완료 알림 |

## 설정 방법

### 1. 환경 변수

`electron/.env.local` 파일에 설정:

```bash
# 필수
BQ_PROJECT_ID=your-project
GOOGLE_APPLICATION_CREDENTIALS_JSON={...}

# 선택
REACT_APP_PDF_PARSER_WEBAPP_URL=https://ais-pre-...
```

### 2. Main Process 등록

`electron/main.js`에 핸들러 등록:

```javascript
const { registerWaterQualityHandlers } = require('./main-water-quality');

app.whenReady().then(() => {
  registerWaterQualityHandlers();
});
```

### 3. Preload 스크립트 설정

`electron/main.js`의 BrowserWindow 설정:

```javascript
new BrowserWindow({
  webPreferences: {
    preload: path.join(__dirname, 'preload.js'),
    contextIsolation: true,
    nodeIntegration: false,
  }
});
```

## 배포 및 업데이트

### 웹앱 업데이트 시

1. Google AI Studio에서 수정
2. 새 버전 배포
3. Electron 앱은 **자동으로 최신 버전 로드** (URL 동일)

### Electron 업데이트 시

1. 코드 수정
2. 버전 업데이트
3. 패키징 및 배포

## 보안 체크리스트

- [ ] `.env.local`이 Git에 포함되지 않음
- [ ] 서비스 계정 키에 최소 권한만 부여
- [ ] BigQuery 테이블 접근 제한 (IP 화이트리스트)
- [ ] Google Drive 폴더 권한 검토
- [ ] 웹앱 URL이 HTTPS인지 확인

## 문제 해결

### 웹뷰가 로드되지 않음
- DevTools에서 Network 탭 확인
- URL 접근 가능 여부 확인 (브라우저에서 직접)
- `allowpopups` 속성 확인

### IPC 메시지 수신 안됨
- Preload 스크립트 경로 확인
- `contextIsolation` 설정 확인
- 콘솔 로그로 메시지 흐름 추적

### BigQuery 업로드 실패
- 서비스 계정 키 유효성 확인
- 테이블 스키마 일치 여부 확인
- Quota 초과 여부 확인
