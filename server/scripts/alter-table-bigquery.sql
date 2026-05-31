-- BigQuery 콘솔에서 실행할 스키마 변경 쿼리
-- https://console.cloud.google.com/bigquery 실행 후 아래 쿼리를 순서대로 실행

-- BigQuery 콘솔에서 실행: work-jindan 프로젝트의 daily_log_system.water_quality 테이블 스키마 변경

-- 1. 기존 테이블 백업 (개발 중이라 선택)
-- CREATE TABLE `work-jindan.daily_log_system.water_quality_backup_20260531` 
-- CLONE `work-jindan.daily_log_system.water_quality`;

-- 2. 기존 테이블 삭제 (개발 데이터라 바로 삭제)
DROP TABLE IF EXISTS `work-jindan.daily_log_system.water_quality`;

-- 3. 새 테이블 생성 (간소화된 스키마)
CREATE TABLE `work-jindan.daily_log_system.water_quality` (
  site_name STRING,
  site_name_raw STRING,
  report_date DATE,
  items STRING,
  results STRING,
  source_pdf_name STRING,
  source_page_index INT64,
  uploaded_at TIMESTAMP
);

-- 4. 확인
SELECT * FROM `work-jindan.daily_log_system.water_quality` LIMIT 5;
