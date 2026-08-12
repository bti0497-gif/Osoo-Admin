# 월정산 Google Drive 폴더 관리 정책

> **문서 버전**: 1.0.0  
> **개정일**: 2026-08-12  
> **적용 대상**: Osoo Admin App 백엔드 개발자 및 중앙관리자

---

## 1. 개요 및 목적

본 정책은 Osoo Admin App(오수처리장 중앙관리자 앱)에서 생성·관리하는 공사 및 수질 처리장의 월정산 관련 자료(계산서, 입금표, 사진, 성적서, 증명서 등)가 Google Drive 상에서 통합적이고 일관된 규칙으로 저장 및 다운로드되도록 보장합니다.

무분별한 폴더 중복 생성을 방지하고, 단 1개의 표준 `월정산` 루트 폴더를 기준으로 3계층 체계를 엄격히 준수합니다.

---

## 2. 드라이브 폴더 표준 3계층 구조

Drive 루트(`GOOGLE_DRIVE_FOLDER_ID`) 아래에는 오직 **단 1개의 `월정산` 폴더**만 존재해야 합니다.

```text
Google Drive Root (GOOGLE_DRIVE_FOLDER_ID)
└─ 월정산/                          <-- [1계층: 유일한 단일 루트 폴더]
   ├─ 202607/                       <-- [2계층: YYYYMM 연월 폴더 (6자리 숫자)]
   │  ├─ 충청현장/                  <-- [3계층: 현장명 폴더]
   │  │  ├─ 2026-07-25_충청현장_슬러지반출1.jpg
   │  │  ├─ 2026-07-25_충청현장_청소필증.jpg
   │  │  ├─ 계산서_202607_충청현장.jpg
   │  │  └─ 입금표_202607_충청현장.jpg
   │  └─ 경기현장/
   │     └─ ...
   └─ 202608/
      ├─ 충청현장/
      └─ ...
```

---

## 3. 폴더 생성 및 관리 원칙

1. **단일 루트 보장 (Singleton Root)**:
   - `월정산` 폴더 생성/조회 시 반드시 `getSingleSettlementRootFolder()` 또는 생성일시 기준 가장 오래된 최상위 폴더 1개만을 대상으로 접근합니다.
   - 문서 카테고리별(계산서, 입금표 등) 루트 분리 폴더 생성을 금지합니다.
2. **3계층 구조 (`월정산/YYYYMM/현장명/`) 준수**:
   - 2계층: 연월 6자리(`YYYYMM`, 예: `202608`)
   - 3계층: 현장명(예: `충청현장`)
   - 모든 파일은 3계층 현장명 폴더 내부에 바로 저장됩니다.
3. **파일명 정규화 규칙**:
   - `YYYY-MM-DD_현장명_업무항목[순번].확장자` 또는 `서류종류_YYYYMM_현장명.확장자`
   - 특수문자(`\ / : * ? " < > |`)는 `_`로 치환됩니다.

---

## 4. 관련 소스 코드 및 API 라우트

- **Drive 서비스 싱글톤 로직**: [driveService.cjs](file:///e:/Wastewater%20Treatment%20Plant%20Admin/server/services/driveService.cjs) (`getSingleSettlementRootFolder()`)
- **월정산 라우트**: [settlementRoutes.cjs](file:///e:/Wastewater%20Treatment%20Plant%20Admin/server/routes/settlementRoutes.cjs)
- **월정산 사진 백엔드 서비스**: [photoExportService.cjs](file:///e:/Wastewater%20Treatment%20Plant%20Admin/server/services/photoExportService.cjs)
- **자동 마이그레이션 스크립트**: [cleanupAndMigrateSettlementFolders.cjs](file:///e:/Wastewater%20Treatment%20Plant%20Admin/scripts/cleanupAndMigrateSettlementFolders.cjs)
