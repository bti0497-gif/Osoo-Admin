/**
 * 로컬 SQLite 데이터베이스 설정
 * 업로드 큐 및 동기화 상태 관리
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// DB 파일 경로 (사용자 데이터 폴더)
const getDbPath = () => {
  const userDataPath = process.env.APP_DATA_PATH
    || path.join(process.env.APPDATA || process.cwd(), 'Osoo_Handle_App');
  if (!fs.existsSync(userDataPath)) {
    fs.mkdirSync(userDataPath, { recursive: true });
  }
  return path.join(userDataPath, 'upload_queue.db');
};

let db = null;

/**
 * 데이터베이스 연결 및 테이블 생성
 */
function initDatabase() {
  if (db) return db;
  
  const dbPath = getDbPath();
  console.log('[Database] Initializing SQLite at:', dbPath);
  
  db = new Database(dbPath);
  
  // 업로드 큐 테이블 생성
  db.exec(`
    CREATE TABLE IF NOT EXISTS certificate_upload_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_name TEXT NOT NULL,
      file_path TEXT,
      extracted_data TEXT,
      source_pdf_name TEXT,
      
      -- 동기화 상태
      bq_status TEXT DEFAULT 'pending',
      drive_status TEXT DEFAULT 'pending',
      
      -- 재시도 카운트
      bq_retry_count INTEGER DEFAULT 0,
      drive_retry_count INTEGER DEFAULT 0,
      
      -- 에러 메시지
      bq_error TEXT,
      drive_error TEXT,
      
      -- 타임스탬프
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      bq_synced_at DATETIME,
      drive_synced_at DATETIME
    );
    
    -- 동기화 로그 테이블 (선택적)
    CREATE TABLE IF NOT EXISTS certificate_sync_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      queue_id INTEGER,
      action TEXT,
      status TEXT,
      message TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_certificate_upload_queue_status
      ON certificate_upload_queue (bq_status, drive_status);

    CREATE INDEX IF NOT EXISTS idx_certificate_upload_queue_created
      ON certificate_upload_queue (created_at);
  `);
  
  console.log('[Database] Tables created successfully');
  return db;
}

/**
 * DB 연결 가져오기
 */
function getDb() {
  if (!db) {
    return initDatabase();
  }
  return db;
}

/**
 * 업로드 큐에 추가 (중복 체크 포함)
 * - 같은 파일명 + 같은 채수날짜(report_date)가 이미 pending/completed 상태로 있으면 스킵
 */
function addToQueue(fileData) {
  const db = getDb();
  
  // 중복 체크: 같은 파일명으로 아직 처리되지 않은 항목이 있는지 확인
  const checkStmt = db.prepare(`
    SELECT id FROM certificate_upload_queue
    WHERE file_name = ?
      AND source_pdf_name = ?
      AND (bq_status = 'pending' OR bq_status = 'completed' OR drive_status = 'pending' OR drive_status = 'completed')
      AND created_at > datetime('now', '-1 hour')
  `);
  
  const existing = checkStmt.get(fileData.fileName, fileData.sourcePdfName);
  if (existing) {
    console.log(`[addToQueue] 중복 항목 스킵: ${fileData.fileName}`);
    return existing.id; // 기존 ID 반환
  }
  
  const stmt = db.prepare(`
    INSERT INTO certificate_upload_queue 
    (file_name, file_path, extracted_data, source_pdf_name)
    VALUES (?, ?, ?, ?)
  `);
  
  const result = stmt.run(
    fileData.fileName,
    fileData.filePath,
    JSON.stringify(fileData.extractedData),
    fileData.sourcePdfName
  );
  
  return result.lastInsertRowid;
}

/**
 * 대기 중인 항목 가져오기
 */
function getPendingItems(limit = 10) {
  const db = getDb();
  const stmt = db.prepare(`
    SELECT * FROM certificate_upload_queue
    WHERE (bq_status = 'pending' OR drive_status = 'pending' 
           OR bq_status = 'failed' OR drive_status = 'failed')
      AND bq_retry_count < 3
      AND drive_retry_count < 3
    ORDER BY created_at ASC
    LIMIT ?
  `);
  
  return stmt.all(limit).map(row => ({
    ...row,
    extracted_data: JSON.parse(row.extracted_data || '{}')
  }));
}

/**
 * 상태 업데이트
 */
function updateStatus(id, type, status, error = null) {
  const db = getDb();
  
  const updates = [];
  const values = [];
  
  if (type === 'bq') {
    updates.push('bq_status = ?');
    updates.push('bq_synced_at = CURRENT_TIMESTAMP');
    values.push(status);
    if (error) {
      updates.push('bq_error = ?');
      updates.push('bq_retry_count = bq_retry_count + 1');
      values.push(error);
    }
  } else if (type === 'drive') {
    updates.push('drive_status = ?');
    updates.push('drive_synced_at = CURRENT_TIMESTAMP');
    values.push(status);
    if (error) {
      updates.push('drive_error = ?');
      updates.push('drive_retry_count = drive_retry_count + 1');
      values.push(error);
    }
  }
  
  values.push(id);
  
  const stmt = db.prepare(`
    UPDATE certificate_upload_queue
    SET ${updates.join(', ')}
    WHERE id = ?
  `);
  
  return stmt.run(...values);
}

/**
 * 실패한 항목 가져오기 (3회 초과)
 */
function getFailedItems() {
  const db = getDb();
  const stmt = db.prepare(`
    SELECT * FROM certificate_upload_queue
    WHERE (bq_retry_count >= 3 OR drive_retry_count >= 3)
      AND (bq_status = 'failed' OR drive_status = 'failed')
    ORDER BY created_at DESC
  `);
  
  return stmt.all().map(row => ({
    ...row,
    extracted_data: JSON.parse(row.extracted_data || '{}')
  }));
}

/**
 * 동기화 완료된 항목 정리 (선택적)
 */
function cleanupCompletedItems(days = 7) {
  const db = getDb();
  const stmt = db.prepare(`
    DELETE FROM certificate_upload_queue
    WHERE bq_status = 'completed' 
      AND drive_status = 'completed'
      AND created_at < datetime('now', '-${days} days')
  `);
  
  return stmt.run();
}

module.exports = {
  initDatabase,
  getDb,
  addToQueue,
  getPendingItems,
  updateStatus,
  getFailedItems,
  cleanupCompletedItems
};
