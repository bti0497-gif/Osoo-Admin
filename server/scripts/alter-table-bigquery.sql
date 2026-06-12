-- BigQuery 콘솔에서 실행할 스키마 변경 쿼리
-- https://console.cloud.google.com/bigquery
-- 프로젝트: work-jindan / 데이터셋: daily_log_system

-- 1. 임시 백업 테이블 삭제 (이전 swap 시 생긴 것)
DROP TABLE IF EXISTS `work-jindan.daily_log_system.water_quality-2026-05-31T12_55_19`;

-- 2. 기존 water_quality 삭제 (개발 데이터라 바로 삭제)
DROP TABLE IF EXISTS `work-jindan.daily_log_system.water_quality`;

-- 3. 새 테이블 생성 (성적서 파싱 전용 스키마)
CREATE TABLE `work-jindan.daily_log_system.water_quality` (
  id              STRING,       -- UUID (report_date + site_name 기반 고유키)
  uploaded_at     TIMESTAMP,    -- 입력날짜 (이 데이터가 BigQuery에 저장된 시각)
  report_date     DATE,         -- 분석날짜 (채수일)
  category        STRING,       -- 성적서 종류: 성적서 / mlss / ss / 기타_성적서
  site_name       STRING,       -- 현장명 (정제된)
  site_name_raw   STRING,       -- 현장명 원본 (OCR 추출값)
  bod             FLOAT64,      -- BOD 측정값
  ss              FLOAT64,      -- SS 측정값
  tn              FLOAT64,      -- TN 측정값
  tp              FLOAT64,      -- TP 측정값
  mlss            FLOAT64,      -- MLSS 측정값
  total_coliform  FLOAT64,      -- 총대장균군 측정값
  drive_file_name STRING,       -- 이미지 파일명: {category}_{YYYYMMDD}_{site_name}.jpg
  source_pdf_name STRING        -- 원본 PDF 파일명
);

-- 4. certificate_water_quality는 과거 호환용 - 사용 안 함 (필요시 나중에 DROP)
-- DROP TABLE IF EXISTS `work-jindan.daily_log_system.certificate_water_quality`;

-- 5. 확인
SELECT * FROM `work-jindan.daily_log_system.water_quality` LIMIT 5;
