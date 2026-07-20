# 중앙관리자 앱 소통게시판 팝업 공지 연동 작업서

작성일: 2026-07-20  
연동 대상: 중앙관리자 앱 → 현장관리자 앱 소통게시판 팝업 공지

## 목적

중앙관리자 이상 사용자가 소통게시판 글을 작성할 때 기존 `전체 현장/특정 현장` 대상 선택에 더해 `팝업 공지`와 게시 기간을 지정한다. 현장 앱은 로그인 후 대시보드에 진입하면 자기 현장에 보이는 유효한 팝업 글을 토스트 카드로 표시한다.

현장 앱 쪽 구현 및 보호 계약은 다음 파일을 기준으로 한다.

- `E:\Wastewater Treatment Plant\docs\BOARD_POPUP_NOTICE_CONTRACT.md`
- `E:\Wastewater Treatment Plant\server\routes\boardRoutes.cjs`
- `E:\Wastewater Treatment Plant\server\services\boardFirebaseService.cjs`
- `E:\Wastewater Treatment Plant\src\features\board\BoardPopupNotice.jsx`

## 공통 데이터 계약

기존 게시글 필드는 그대로 유지하고 아래 두 필드만 추가한다.

| 필드 | 형식 | 의미 |
|---|---|---|
| `is_popup` | Boolean | 중앙 팝업 공지 지정 여부 |
| `popup_expires_at` | ISO 8601 문자열(Firebase) / TIMESTAMP(BigQuery) | 팝업 노출 종료 시각 |

글쓰기 화면의 기간 선택값은 저장 필드가 아니라 요청용 `popup_days` 정수로 보낸다.

```json
{
  "title": "중요 안내",
  "content": "안내 내용",
  "is_notice": true,
  "is_popup": true,
  "popup_days": 3,
  "target_site": "천등산휴게소(평택방향)"
}
```

- `target_site: ""`는 전체 현장이다.
- 특정 현장은 현재 드롭다운의 현장명을 그대로 사용한다.
- 팝업 여부와 관계없이 기존 `visible_sites` 계산을 반드시 유지한다.
- 팝업 대상 판정을 위해 별도의 현장 필터를 만들지 않는다. 기존 `target_site → visible_sites` 결과가 유일한 가시성 기준이다.

## 중앙관리자 글쓰기 UI

수정 대상 후보:

- `src/features/board/BoardView.jsx`
- `src/features/board/useBoardViewModel.js`
- 필요하면 `src/features/board/BoardModel.js`

구현 항목:

1. 공지 체크 옆에 `팝업 공지` 체크박스를 추가한다.
2. 팝업 체크 시에만 `1일간`부터 `7일간`까지 기간 선택을 표시한다.
3. 기본 기간은 1일이다.
4. 기존 전체/특정 현장 드롭다운 값을 `target_site`로 함께 전송한다.
5. 수정 화면에서는 만료된 글을 팝업 체크 해제 상태로 표시한다.
6. 답글은 기본적으로 팝업이 아니어야 한다.
7. 목록에는 관리자가 식별할 수 있도록 유효한 팝업 글에 작은 `팝업` 배지를 표시해도 된다.

권장 폼 초기값:

```js
{
  title: '',
  content: '',
  is_notice: 0,
  is_popup: 0,
  popup_days: 1,
  attachments: '',
  parent_id: null,
  target_site: ''
}
```

## 서버 권한 및 만료 처리

수정 대상 후보:

- `server/routes/boardRoutes.cjs`
- `server/services/boardFirebaseService.cjs`
- 예비 BigQuery 백엔드를 유지한다면 `server/services/boardBigQueryService.cjs`
- `server/scripts/initBigQuery.cjs`

서버가 반드시 담당해야 할 규칙:

```js
function popupExpiry(isPopup, requestedDays) {
  if (!isPopup) return null;
  const days = Math.min(7, Math.max(1, Number.parseInt(requestedDays, 10) || 1));
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}
```

- 허용 역할: `admin`, `group_admin`, `super_admin`, `central_admin`.
- 일반 사용자가 body를 조작해도 서버는 `is_popup=false`, `popup_expires_at=null`로 저장한다.
- 생성 시 서버가 `popup_days`를 1~7로 제한하고 `popup_expires_at`을 계산한다.
- 수정 시 팝업 해제라면 `popup_expires_at=null`로 만든다.
- 만료된 글은 삭제하거나 공지에서 내리지 않는다. 조회 결과만 `is_popup=false`로 정규화한다.
- 클라이언트 시계가 아니라 서버 시각을 기준으로 만료시각을 만든다.

Firebase 조회 정규화 예:

```js
function isPopupActive(post) {
  if (!post?.is_popup || !post?.popup_expires_at) return false;
  const expiresAt = new Date(post.popup_expires_at).getTime();
  return Number.isFinite(expiresAt) && expiresAt > Date.now();
}
```

Firestore는 스키마 변경이 필요 없지만 생성·수정 문서에 두 필드를 포함해야 한다. BigQuery를 계속 지원하면 `posts`에 다음 컬럼을 추가한다.

```sql
ALTER TABLE `daily_log_system.posts`
ADD COLUMN IF NOT EXISTS is_popup BOOL;

ALTER TABLE `daily_log_system.posts`
ADD COLUMN IF NOT EXISTS popup_expires_at TIMESTAMP;
```

## 현장 앱 표시 정책

중앙관리자 앱은 팝업을 직접 띄우는 앱이 아니라 작성·대상 지정 앱이다. 현장 앱이 다음 정책으로 표시한다.

- 로그인 및 세션 복원 후 대시보드에서만 표시
- 중앙관리자 역할에는 표시하지 않고 현장근무자에게 표시
- 기존 게시판 API에서 자기 현장에 보이는 글을 받은 뒤 `is_popup=true`인 글만 사용
- 최신 팝업부터 차례로 표시
- `다시 보지 않기`는 사용자·현장·게시글 ID별 로컬 저장
- 조회 실패가 로그인이나 대시보드 진입을 막지 않음
- 앱을 계속 켜 둔 상태에서도 만료 시각이 지나면 최대 1분 안에 숨김

## 호환성과 주의사항

1. 중앙관리자 앱과 현장 앱이 같은 Firebase 프로젝트와 `posts` 컬렉션을 바라보는지 먼저 확인한다.
2. `visible_sites`를 제거하거나 `target_site`만으로 새 필터를 만들지 않는다.
3. 기존 `is_notice`와 `is_popup`은 독립 속성이다. 팝업을 체크했다고 일반 공지를 자동 체크할 필요는 없다.
4. 필드가 없는 과거 게시글은 `is_popup=false`로 취급한다.
5. 기존 댓글 권한, 공지 정렬, 첨부파일 다운로드 로직은 변경하지 않는다.
6. 중앙관리자 프로젝트는 현재 작업 중인 변경사항이 있으므로 이 문서 외 파일을 일괄 되돌리거나 정리하지 않는다.

## 완료 검증 시나리오

1. 중앙관리자가 `전체 현장 + 팝업 1일` 글을 작성하면 서로 다른 두 현장 계정에서 모두 보인다.
2. `특정 현장 + 팝업 3일` 글은 지정 현장에서만 보이고 다른 현장에는 목록과 팝업 모두 나타나지 않는다.
3. 일반 사용자가 API body에 `is_popup=true`, `popup_days=999`를 보내도 팝업 글이 만들어지지 않는다.
4. 관리자가 `popup_days=999`를 보내면 서버가 7일로 제한한다.
5. 만료시각이 지난 글은 게시판 목록에는 남고 `is_popup=false`로 반환된다.
6. `다시 보지 않기`를 선택한 현장 사용자는 재로그인 후에도 같은 게시글을 다시 보지 않는다.
7. 확인만 누른 사용자는 다음 로그인 때 유효기간이 남아 있으면 다시 본다.
8. 팝업 조회가 실패해도 로그인과 대시보드의 다른 기능은 정상 작동한다.

## 현장 앱 현재 구현 상태

2026-07-20 기준 현장 앱 작업 트리에는 위 계약을 구현한 변경이 있으며 아직 별도 릴리스 전이다. 중앙관리자 앱 구현 시 필드명과 의미를 임의로 바꾸지 말고 이 문서의 계약에 맞춘다.
