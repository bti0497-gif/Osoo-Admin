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
- 성적서 파일은 Google Drive에 저장하고, 메타데이터는 BigQuery를 기준으로 관리한다.
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
