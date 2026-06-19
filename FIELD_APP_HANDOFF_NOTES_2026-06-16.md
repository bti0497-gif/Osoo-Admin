# 현장관리자 앱 핸드오프 메모 - 2026-06-16

## 현재 앱 구분

- 이 작업 대상은 **현장관리자용 앱**이다.
- 중앙관리자용 앱 원칙과 섞어서 판단하면 안 된다.
- 현장관리자 앱은 로컬 SQLite DB(`osoo.db`)를 중심으로 현장 운영 데이터를 관리한다.
- 현장관리자 앱 로컬 DB에는 기본적으로 다른 현장 데이터가 섞인다고 가정하지 않는다.

## 로컬 DB 위치

- 실제 DB:
  - `C:\Users\ASUS\AppData\Roaming\Osoo_Handle_App\osoo.db`
- 현재 선택 현장 설정 테이블:
  - `app_settings`
- 현재 확인된 현장:
  - `site_id`: `2c4866e5-2dc3-468d-9098-459376918b19`
  - `site_name`: `횡성휴게소(인천방향)`
  - `manager_name`: `박승진`

## 주요 로컬 테이블

- `app_settings`
  - 현재 현장 세션/설정 기준
  - `site_id`, `site_name`, `manager_name`, `method`, `series`, `flow_option`
- `flow_readings`
  - 유량/전력/슬러지 입력값
  - 주요 컬럼: `date`, `type`, `raw_value`, `calculated_flow`, `sludge_export`, `site_id`, `site_name`
- `medicine_logs`
  - 약품 구입/사용/재고
- `kit_logs`
  - 분석키트 구입/사용/재고
- `certificate_water_quality`
  - 현장 앱 로컬 성적서 캐시 테이블 이름
  - BigQuery 테이블 이름이 아니다.

## 브라우저/DOM 저장 관련

앱 세션/설정이 저장되는 곳은 크게 두 갈래다.

1. 로컬 DB
   - 현장 세션의 신뢰 기준은 `app_settings.site_id/site_name`이다.
   - 서버 API는 이 값을 읽어 현재 현장 기준으로 동작해야 한다.

2. Renderer localStorage
   - 인증 세션 키:
     - `osoo_admin_user_session`
     - 파일: `src/features/auth/AuthModel.js`
   - 유량 전력량 역계산 모드:
     - `flowElecReverse`
     - 파일: `src/features/flow/FlowManagementView.jsx`
   - PDF/성적서 관련 캐시 키들도 있으나, 공사입력 도우미와 직접 관련은 낮다.

현재 “메뉴 이동 후 돌아와도 사이트 세션 유지”는 `localStorage`만 믿으면 안 되고, **서버의 `app_settings`와 프론트 currentUser가 함께 같은 현장으로 복원되어야 한다.**

## 세션 유지 관련 오늘 수정

### 1. 서버 엔트리

파일:

- `server/index.cjs`

수정 내용:

- 서버가 현장 앱 DB 경로를 열도록 변경:
  - 기존: `Osoo_Admin_App`
  - 변경: `Osoo_Handle_App`
- `better-sqlite3`로 `osoo.db`를 열어 현장 앱 라우트에 전달.
- 현장 앱 주요 라우트를 마운트:
  - `settingsRoutes`
  - `flowRoutes`
  - `medicineRoutes`
  - `kitRoutes`
  - `waterQualityRoutes`
  - `dailyWorkLogRoutes`
  - `excelRoutes`
  - `facilityRoutes`
  - `medicineInRoutes`
  - `medicineRegisterRoutes`
  - `sludgePhotoRoutes`

주의:

- 이 파일에는 중앙관리자용 라우트도 아직 남아 있다.
- 현장 앱 기준으로 불필요한 라우트 정리는 별도 작업으로 보는 것이 안전하다.

### 2. 프론트 인증/세션

파일:

- `src/features/auth/AuthModel.js`
- `src/features/auth/useAuthViewModel.js`

수정 내용:

- `AuthModel.getActiveSiteSession()` 추가
  - `/api/settings`에서 `app_settings`를 읽어 현장 세션 복원.
- `AuthModel.selectActiveSite(siteId)` 추가
  - `/api/settings/select-site` 호출.
- `useAuthViewModel`의 로그인 우회 모드에서도 `app_settings` 기준으로 `currentUser`를 복원하도록 변경.
- `switchActiveSite(siteId)`가 실제 서버의 현재 현장 설정을 바꾸고, `currentUser`도 갱신하도록 변경.

점검 포인트:

- 현재 코드에는 `BYPASS_LOGIN = true`가 남아 있다.
- 그래서 로그인 세션보다 `app_settings` 복원이 더 중요하다.
- `ADMIN_ROLES`는 `['admin', 'group_admin']`이고, 기본 사용자 role을 `site_admin`으로 바꿨다. 이 role 변경이 게시판/권한 UI에 영향을 주는지 별도 점검 필요.

## 유량/약품/키트 API 세션 기준

파일:

- `server/routes/flowRoutes.cjs`
- `server/routes/medicineRoutes.cjs`
- `server/routes/kitRoutes.cjs`

수정 내용:

- API query에 `site_id`가 없어도 `app_settings.site_id`를 기본값으로 사용하도록 변경.
- 유량/약품의 이전 날짜 계산도 현재 `site_id` 기준으로 제한.

의도:

- 메뉴 이동 후 돌아와도, 각 메뉴가 따로 `site_id`를 넘기지 않아도 현재 현장 세션 기준으로 조회되게 하기 위함.

## 일일운영일지/공사입력 데이터 바인딩 관련

파일:

- `server/services/dailyWorkLogService.cjs`

수정 내용:

- `getSiteSettings()`가 `site_id`도 읽도록 변경.
- `getSiteScope()` 추가.
- 유량/약품/키트 조회 및 월간/연간 합계가 `site_id` 우선 기준으로 동작.
- 성적서 로컬 캐시 조회도 `site_id` 기준.
- BigQuery 성적서 동기화는 `certificateCacheSyncService.cjs`의 `syncCertificateCacheForSiteMonth()`로 위임.

주의:

- 이 서비스는 엑셀 일일운영일지/미리보기/출력 흐름에도 쓰인다.
- 사용자가 말한 “공사홈페이지 입력란”은 엑셀 템플릿이 아니라, 로컬 DB 값을 웹페이지 입력란에 넣는 흐름이다.
- 현재 코드 검색상 공사홈페이지 DOM에 직접 주입하는 로직은 명확히 발견되지 않았다. Electron webview 관련 파일은 있지만, 직접 주입 스크립트는 별도 파일/브랜치/미구현일 수 있다.

## 방류수 미입력 이슈

확인된 로컬 DB 값:

- 날짜: `2026-06-16`
- `flow_readings`:
  - `방류유량계.raw_value = 123334`
  - `방류유량계.calculated_flow = 100`
- 전일 `2026-06-15`:
  - `방류유량계.raw_value = 123234`
  - `방류유량계.calculated_flow = -174346`

해석:

- 방류수 칸이 비는 것은 DB에 값이 없어서가 아니다.
- 바인딩 키 이름이 맞지 않는 문제가 유력하다.
- 기존 바인딩 키는 `방류전일`, `방류금일`, `방류누계`, `월간방류`, `연간방류`였다.
- 공사홈페이지 입력란이 `방류수전일`, `방류수금일`, `방류수처리량` 같은 이름을 기대하면 값이 비게 된다.

오늘 추가한 별칭:

- `방류수전일`
- `방류수전일지침`
- `방류수금일`
- `방류수금일지침`
- `방류수처리량`
- `방류수사용량`
- `방류수누계`
- `방류수월간`
- `방류수월간누계`
- `월간방류수`
- `방류수연간`
- `방류수연간누계`
- `연간방류수`

같은 이유로 유입수 별칭도 추가:

- `유입수전일`
- `유입수전일지침`
- `유입수금일`
- `유입수금일지침`
- `유입수처리량`
- `유입수사용량`
- `유입수누계`
- `유입수월간`
- `유입수월간누계`
- `월간유입수`
- `유입수연간`
- `유입수연간누계`
- `연간유입수`

검증 결과:

- `방류수전일 = 123234`
- `방류수금일 = 123334`
- `방류수처리량 = 100`

남은 문제:

- 월간/연간 방류 누계는 아직 음수다.
- 이유는 `2026-06-15` 더미 데이터의 `calculated_flow`가 음수로 저장되어 있기 때문.
- 이건 별칭 문제가 아니라 더미 데이터 재입력/보정 문제다.

## 오늘 로컬 DB 상태 요약

날짜: `2026-06-16`

유량 저장됨:

- `유입유량계`
- `방류유량계`
- `내부반송유량계`
- `전력량계`
- `슬러지`

유량 빠짐:

- `외부반송유량계`

약품 저장됨:

- `중탄산나트륨`
- `포도당`
- `팩(PAC)`
- `알민산나트륨`
- `폴리머`

약품 화면/일지에 안 보이는 이유 후보:

- 로컬 DB에는 저장되어 있다.
- 화면/공사홈페이지/일지 템플릿이 `메탄올`, `응집제`, `가성소다`, `차염소산나트륨` 같은 이름을 기대하면 현재 활성 약품명과 매칭되지 않는다.
- 별칭 매핑 필요:
  - 예: `응집제` ↔ `팩(PAC)`
  - 예: 현장별 실제 약품명과 공사홈페이지 입력란 라벨을 별도 매핑 테이블/설정으로 관리하는 것이 좋다.

## 반드시 다시 확인할 것

1. 공사홈페이지 DOM 직접 입력 코드 위치
   - 현재 검색으로는 명확히 찾지 못했다.
   - 후보:
     - Electron webview 관련 파일
     - 별도 미등록 feature
     - 아직 미구현/외부 플랫폼 코드

2. 공사홈페이지 입력란 DOM selector/key
   - `방류수` 입력란이 실제로 어떤 `name`, `id`, `label`, `placeholder`를 갖는지 확인 필요.
   - 바인딩 키가 `방류수처리량`인지 `방류수사용량`인지 `방류량`인지 DOM에서 직접 확인해야 한다.

3. 메뉴 이동 후 세션 유지
   - 앱 시작 시 `useAuthViewModel`이 `/api/settings`를 읽어 currentUser를 복원하는지 확인.
   - 메뉴 이동 후 `currentUser.site_id/site_name1`이 유지되는지 React DevTools 또는 console로 확인.
   - 서버 재시작 후에도 `app_settings.site_id`가 유지되는지 확인.

4. `server/index.cjs`의 중앙/현장 혼재
   - 현재는 현장 앱 라우트를 먼저 마운트했다.
   - 같은 API path가 중앙 라우트와 겹칠 수 있다.
   - 특히 `/api/settings/select-site`는 `settingsRoutes.cjs`와 `adminSettingsRoutes.cjs` 둘 다 가지고 있으므로, 현장 라우트가 먼저 마운트되어야 한다.

## 검증 완료

실행한 검증:

- `node --check server/services/dailyWorkLogService.cjs`
- `npx eslint server/services/dailyWorkLogService.cjs`
- `npm run build`

모두 통과.

## 다음 작업 제안

1. 실제 공사홈페이지 DOM 입력 코드 찾기.
2. DOM selector/key와 `buildBindingsForDate()` 결과 키를 매핑.
3. `방류수` 외에도 `유입수`, `내부반송슬러지`, `약품명` 라벨이 실제 입력란 명칭과 일치하는지 확인.
4. `2026-06-15` 더미 유량 음수값 재입력 또는 보정.
5. 메뉴 이동 후 currentUser와 `app_settings`가 같은 현장을 바라보는지 런타임에서 확인.
