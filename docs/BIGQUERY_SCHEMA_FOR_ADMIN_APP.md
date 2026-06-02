# BigQuery Schema Handoff for Admin App

작성일: 2026-06-02  
대상 데이터셋: `daily_log_system`

이 문서는 현장관리자용 앱의 로컬 DB 및 BigQuery 동기화 구조를 중앙관리자용 앱 개발에 전달하기 위한 기준 문서입니다.

## 핵심 원칙

- `site_id`는 현장 구분의 기준 키입니다.
- 중앙관리자용 앱은 전국 현장 데이터를 `site_id` 기준으로 필터링/집계해야 합니다.
- 현장관리자용 앱에서 올라오는 운영 데이터와 중앙관리자용 앱에서 올리는 성적서 파싱 데이터는 분리되어야 합니다.
- BigQuery `water_quality`는 성적서 파싱용 테이블로 고정합니다.
- QnTech/현장 수질분석 메뉴 데이터는 BigQuery `qntech_water_quality`를 사용합니다.

## 수질 테이블 분리

### `water_quality`

용도: 전문업체 성적서 파싱 데이터 저장 테이블입니다.

중앙관리자용 앱 또는 성적서 파싱 모듈이 성적서를 파싱한 뒤 이 테이블에 업로드합니다. 현장관리자용 앱은 이 테이블을 내려받아 로컬 캐시에 저장하고, 업무일지 작성 시 성적서 수질 항목을 바인딩하는 데 사용합니다.

주요 조회 기준:

- `site_id`
- `site_name`
- `report_date`
- `source_pdf_name`
- `drive_file_id`

스키마:

```text
site_name STRING
site_name_raw STRING
report_date DATE
items STRING
results STRING
source_pdf_name STRING
source_page_index INTEGER
uploaded_at TIMESTAMP
site_id STRING
local_id INTEGER
ss FLOAT
bod FLOAT
tn FLOAT
tp FLOAT
total_coliform FLOAT
mlss FLOAT
do FLOAT
ph FLOAT
ai_confidence FLOAT
site_match_confidence FLOAT
manual_review_required BOOLEAN
warnings_json STRING
source_payload_json STRING
certificate_category STRING
certificate_file_name STRING
certificate_original_file_name STRING
drive_file_id STRING
drive_web_view_link STRING
created_at TIMESTAMP
updated_at TIMESTAMP
```

비고:

- 기존 `items`, `results`는 이전 파싱 결과 호환용 문자열 컬럼입니다.
- 중앙관리자용 앱에서 쿼리하기 좋은 기준 컬럼은 `bod`, `ss`, `tn`, `tp`, `total_coliform`, `mlss`, `do`, `ph`입니다.
- 성적서 파일 조회/다운로드는 `drive_file_id`, `drive_web_view_link`, `certificate_file_name`을 사용합니다.

### `qntech_water_quality`

용도: 현장관리자용 앱의 수질분석 메뉴 및 QnTech에서 내려받은 측정 데이터 저장 테이블입니다.

이 테이블은 항목별 컬럼을 만들지 않고 세로형 구조로 저장합니다. 즉 같은 날짜, 같은 회차, 같은 장소라도 측정항목마다 한 행씩 저장됩니다.

예:

```text
2026-06-02 | site001 | 1회차 | 포기조 | nh3_n      | 암모니아성질소(NH3-N) | 2.1
2026-06-02 | site001 | 1회차 | 포기조 | no3_n      | 질산성질소(NO3-N)     | 0.8
2026-06-02 | site001 | 1회차 | 포기조 | po4_p      | 인산염인(PO4-P)       | 0.2
2026-06-02 | site001 | 1회차 | 포기조 | alkalinity | 알칼리도(ALK)         | 75
```

스키마:

```text
site_id STRING
site_name STRING REQUIRED
author STRING
local_id INTEGER REQUIRED
created_at TIMESTAMP
date DATE
measurement_group STRING
measurement_order INTEGER
source_type STRING
source_label STRING
qntech_project_id STRING
location STRING
item_name STRING
item_code STRING
result_value STRING
result_numeric FLOAT
unit STRING
updated_at TIMESTAMP
uploaded_at TIMESTAMP
```

주요 컬럼 설명:

```text
date: 측정일
measurement_group: 같은 측정 회차를 묶는 그룹 키. 예: qntech:{projectId}, excel:{date}:001, manual:{date}
measurement_order: 같은 날짜 내 회차 번호
source_type: qntech | excel | manual | legacy
source_label: 회차명, 공정명, 엑셀 시트명 등 표시용 라벨
qntech_project_id: QnTech 프로젝트 ID
location: 분석 장소. 예: 유량조정조, 무산소조, 포기조, 침전조, 방류조
item_name: 표시용 측정항목명
item_code: 쿼리용 측정항목 코드
result_value: 화면 표시용 측정결과 문자열. 예: 초과
result_numeric: 숫자로 변환 가능한 측정결과
unit: 단위
```

기본 `item_code`:

```text
nh3_n
no3_n
po4_p
alkalinity
tn
tp
cod
ss
```

권장 조회 예:

```sql
SELECT
  site_id,
  site_name,
  date,
  measurement_order,
  location,
  item_code,
  result_value,
  result_numeric
FROM `daily_log_system.qntech_water_quality`
WHERE site_id = @siteId
  AND date BETWEEN @startDate AND @endDate
ORDER BY date, measurement_order, location, item_code;
```

## 운영 데이터 테이블

### `flow_readings`

용도: 유량관리 데이터

```text
site_id STRING
site_name STRING REQUIRED
author STRING
local_id INTEGER REQUIRED
created_at TIMESTAMP
date DATE REQUIRED
type STRING
raw_value FLOAT
calculated_flow FLOAT
is_reset BOOLEAN
is_manual BOOLEAN
sludge_export FLOAT
updated_at TIMESTAMP
uploaded_at TIMESTAMP
```

### `medicine_logs`

용도: 약품관리 데이터

```text
site_id STRING
site_name STRING REQUIRED
author STRING
local_id INTEGER REQUIRED
created_at TIMESTAMP
medicine_name STRING
date DATE
purchase_amount FLOAT
usage_amount FLOAT
current_inventory FLOAT
photo_url STRING
updated_at TIMESTAMP
uploaded_at TIMESTAMP
```

### `kit_logs`

용도: 분석키트 구매/사용/재고 데이터

```text
site_id STRING
site_name STRING REQUIRED
author STRING
local_id INTEGER REQUIRED
created_at TIMESTAMP
kit_name STRING
date DATE
purchase_amount FLOAT
usage_amount FLOAT
current_inventory FLOAT
photo_url STRING
updated_at TIMESTAMP
uploaded_at TIMESTAMP
```

### `facility_logs`

용도: 시설관리 이력

```text
site_id STRING
site_name STRING REQUIRED
author STRING
local_id INTEGER REQUIRED
created_at TIMESTAMP
date DATE
location STRING
facility_name STRING
content STRING
company STRING
price INTEGER
notes STRING
updated_at TIMESTAMP
uploaded_at TIMESTAMP
```

## 출결 테이블

### `attendance`

용도: 현장관리자 출퇴근 기록

현재 BigQuery 스키마:

```text
id STRING REQUIRED
site_id STRING
site_name STRING
member_id STRING REQUIRED
member_name STRING
date DATE REQUIRED
login_time TIMESTAMP
logout_time TIMESTAMP
login_lat FLOAT
login_lng FLOAT
logout_lat FLOAT
logout_lng FLOAT
location_matched BOOLEAN
remote_session_detected BOOLEAN
remote_session_type STRING
remote_session_evidence STRING
auto_logout BOOLEAN
uploaded_at TIMESTAMP
```

주의:

- 현장관리자용 앱에서는 현장 위치 기준과 로그인 위치를 비교해 정상/비정상을 판단합니다.
- 향후에는 위경도 원본 컬럼을 줄이고 `location_matched`, `remote_session_type` 중심으로 정리할 수 있습니다.
- 중앙관리자용 앱은 우선 `site_id`, `member_id`, `date`, `login_time`, `logout_time`, `location_matched`, `remote_session_type` 기준으로 조회하면 됩니다.

## 현장/회원 기준 테이블

### `sites`

```text
id STRING REQUIRED
site_name STRING
manager_name STRING
method STRING
series STRING
is_active BOOLEAN
updated_at TIMESTAMP
uploaded_at TIMESTAMP
```

### `members`

```text
id STRING REQUIRED
name STRING
role STRING
phone STRING
target_lat FLOAT
target_lng FLOAT
radius_m FLOAT
notes STRING
updated_at TIMESTAMP
uploaded_at TIMESTAMP
```

### `member_sites`

```text
member_id STRING REQUIRED
site_id STRING REQUIRED
is_primary BOOLEAN
can_manage BOOLEAN
is_bidirectional BOOLEAN
updated_at TIMESTAMP
uploaded_at TIMESTAMP
```

## 동기화 방향

현장관리자용 앱에서 BigQuery로 업로드:

```text
flow_readings
medicine_logs
kit_logs
facility_logs
qntech_water_quality
attendance
sites / members / member_sites
```

중앙관리자용 앱 또는 성적서 파싱 모듈에서 BigQuery로 업로드:

```text
water_quality
posts / comments
```

현장관리자용 앱에서 BigQuery로부터 내려받아 로컬 캐시:

```text
water_quality
```

## 구현 주의사항

- 중앙관리자용 앱에서 수질분석 메뉴 데이터를 조회할 때는 `water_quality`가 아니라 `qntech_water_quality`를 사용해야 합니다.
- 중앙관리자용 앱에서 성적서 파싱 결과를 조회/수정/업로드할 때는 `water_quality`를 사용해야 합니다.
- `certificate_water_quality`는 과거 호환용 테이블입니다. 신규 개발은 `water_quality` 기준으로 진행합니다.
- 현장별 조회는 가능하면 `site_id`를 사용하고, 보조적으로 `site_name`을 표시용으로 사용합니다.
- `local_id`는 현장 앱 로컬 DB의 행 ID입니다. 전국 통합 고유키로 쓰지 말고 `site_id + local_id + table_name` 조합으로 해석해야 합니다.
