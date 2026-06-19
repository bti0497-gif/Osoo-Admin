# AI Agent 지침서

## 프로젝트 개요

- 앱: 오수처리장 중앙관리자 앱 (Osoo Admin App)
- 대상 사용자: 최고관리자, 중앙관리자
- 프론트엔드: React 19 + Vite
- 백엔드: Express
- 데이터 원본: Google Sheets, Google Drive, BigQuery
- 패키징: Electron + electron-builder

## 중요한 구조 원칙

- 중앙관리자 앱은 로컬 SQLite DB를 사용하지 않는다.
- 회원과 현장 정보는 Google Sheets를 기준으로 조회, 수정, 삭제한다.
- 운영 데이터는 BigQuery 테이블을 직접 조회, 수정, 삭제한다.
- 성적서 파일은 Google Drive에 저장하고, 데이터/조회 기준 메타데이터는 BigQuery를 기준으로 관리한다.
- 현장관리자 앱의 출퇴근, 로컬 캐시, 오프라인 입력, BigQuery 업로드 동기화 코드는 이 앱에 넣지 않는다.

## 현재 초기 메뉴

- 회원 및 현장 관리
- 데이터관리
- 소통게시판
- 성적서
- 접속자 정보 위젯

## MVVM 규칙

- `Model`은 API 호출만 담당한다.
- `ViewModel`은 상태와 비즈니스 로직을 담당한다.
- `View`는 렌더링만 담당한다.
- 프론트엔드 기능은 `src/features/{feature}/` 아래에 둔다.
- 서버 API는 `server/routes/` 아래에 기능별 라우트로 둔다.

## 민감 파일

`.env.local`, `client_secret*.json`, `server/config/*.json`은 로컬 실행과 패키징에는 필요할 수 있지만 Git에 커밋하지 않는다.

## 성적서 PDF 파서와 업로드 흐름

- 현재 성적서 PDF 파서는 `src/features/certificate/pdf-parser/` 아래에 있다.
- PDF 파싱 결과는 프론트에서 서버 API로 전송한다.
- BigQuery 저장 API: `POST /api/certificates/import-from-ai`
- Drive 이미지 업로드 API: `POST /api/certificates/manual-upload-file`
- 업로드 훅: `src/features/certificate/pdf-parser/viewmodels/usePdfUpload.js`
- 진행 위젯: `src/features/certificate/pdf-parser/components/PdfUploadProgressWidget.jsx`
- 서버 라우트: `server/routes/certificateRoutes.cjs`

### 성적서 테이블 기준

- 신규 성적서 수질 데이터 기준 테이블은 `daily_log_system.water_quality`이다.
- 과거 호환 테이블 `daily_log_system.certificate_water_quality`를 신규 기능 기준으로 사용하지 않는다.
- 현재 실제 `water_quality` 스키마에는 `drive_file_id`, `drive_web_view_link`, `certificate_file_name` 컬럼이 없을 수 있다.
- 따라서 Drive 업로드 후 메타 업데이트는 실제 스키마에 해당 컬럼이 있을 때만 수행한다.
- 현재 조회/다운로드 흐름은 BigQuery의 `drive_file_name`과 Drive 폴더 구조를 기준으로 파일을 찾는 방식이다.

### 2026-06-15 성적서 업로드 이슈 정리

- 증상: 데이터와 이미지는 실제로 BigQuery/Drive에 올라갔는데 콘솔에는 Drive 업로드 실패가 표시됨.
- 원인: `manual-upload-file` 처리 중 업로드 자체는 성공했으나, 후처리에서 과거 테이블 `certificate_water_quality`에 메타데이터 연결을 시도했고 해당 테이블이 없어 실패로 표시됨.
- 수정: `upsertCertificateFileMeta`가 `water_quality`를 기준으로 후보 행을 찾도록 변경.
- 수정: 실제 `water_quality` 스키마에 메타 컬럼이 없으면 업데이트를 건너뛰도록 변경.
- 수정: 프론트 업로드 훅은 로컬 큐가 아니라 기존 서버 API(`import-from-ai`, `manual-upload-file`)를 직접 사용.
- 수정: `PdfUploadProgressWidget`에서 Hook 호출보다 먼저 `return null`이 실행될 수 있던 구조를 수정해 React 19 내부 경고를 방지.

## 로컬 큐 관련 주의

- `server/config/database.cjs`, `server/routes/certificateQueueRoutes.cjs` 같은 로컬 SQLite 업로드 큐 방식은 중앙관리자 앱 원칙과 맞지 않는다.
- 시간 절약용 임시 구현으로 보이더라도 중앙관리자 앱에서는 기본 흐름으로 채택하지 않는다.
- 네트워크 재시도나 배치 업로드가 필요하면 BigQuery/Drive API를 직접 사용하는 서버 측 재시도 로직 또는 명시적인 상태 관리로 설계한다.

## React 19 주의사항

- 조건부 return 전에 Hook이 빠지지 않게 한다. 모든 Hook은 컴포넌트 최상단에서 항상 같은 순서로 호출한다.
- render 중 `ref.current`를 읽어 UI prop에 넘기지 않는다. React Compiler가 `react-hooks/refs` 오류로 잡는다.
- effect 안에서 단순 초기값 설정을 위해 즉시 `setState`를 호출하지 않는다. 가능하면 `useState(initialValue)`로 처리한다.
- `Expected static flag was missing` 같은 React 내부 경고가 나오면 조건부 Hook 또는 render 중 ref 접근을 먼저 의심한다.

## 인코딩/한글 깨짐 주의

- PowerShell `Get-Content` 출력은 한글이 깨져 보일 수 있다. 실제 파일이 깨졌다고 단정하지 않는다.
- 실제 파일 검사는 UTF-8 기준으로 수행한다. Node의 `fs.readFileSync(file, 'utf8')`로 읽어 replacement character, NUL, CJK 한자 섞임을 검사하면 안전하다.
- 2026-06-15 전체 소스 스캔 결과 실제 깨짐으로 남아 있던 것은 분석키트 오표기 두 파일뿐이었고 `분석키트`로 수정했다.
- `server-log.txt`는 UTF-16/NUL이 섞인 오래된 로그라 UTF-8 텍스트로 초기화했다.
- 코드/문서 파일을 새로 만들 때는 UTF-8로 저장한다.

## 개발 검증 명령

- 전체 빌드: `npm run build`
- 특정 파일 lint 예:
  - `npx eslint src/features/certificate/pdf-parser/viewmodels/usePdfUpload.js`
  - `npx eslint src/features/certificate/pdf-parser/components/PdfUploadProgressWidget.jsx`
- 서버 CommonJS 문법 체크 예:
  - `node --check server/routes/certificateRoutes.cjs`

## 현재 알려진 상태

- `npm run build`는 통과한다.
- 전체 `npm run lint`는 기존 코드의 여러 React Compiler/unused 오류 때문에 실패할 수 있다.
- 수정 파일 단위 lint를 우선 수행하고, 전체 lint 정리는 별도 작업으로 다룬다.
- 실행 중인 Express 로컬 브릿지 서버는 서버 코드 변경 후 재시작해야 한다.
