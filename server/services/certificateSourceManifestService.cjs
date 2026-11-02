const path = require('path');
const fs = require('fs');
const {
  drive,
  findFileInFolder,
  uploadBufferToFolder,
  downloadDriveFileBuffer,
} = require('./driveService.cjs');
const { getAuditLogPath, logCertDiagnostic } = require('./certAuditLogger.cjs');
const { getBigQueryClient, DATASET_ID } = require('./bigQueryClientService.cjs');

const CERTIFICATE_ROOT_FOLDER_ID = String(
  process.env.CERTIFICATE_DRIVE_FOLDER_ID || '1Po-gd-OKlaeGyL-Ppjc6_wKgSLEM4iX4'
).trim();

const SOURCE_MANIFEST_FILE = '_uploaded_source_files.json';

/**
 * Google Drive 성적서 루트 폴더에서 원본 파일명 매니페스트를 조회합니다.
 */
async function getCertificateSourceManifestFromDrive() {
  if (!drive || !CERTIFICATE_ROOT_FOLDER_ID) return { files: {} };
  try {
    const existing = await findFileInFolder(CERTIFICATE_ROOT_FOLDER_ID, SOURCE_MANIFEST_FILE);
    if (!existing?.id) return { files: {} };
    const buf = await downloadDriveFileBuffer(existing.id);
    if (!buf || buf.length === 0) return { files: {} };
    const parsed = JSON.parse(buf.toString('utf8'));
    return parsed && typeof parsed === 'object' ? parsed : { files: {} };
  } catch (err) {
    console.warn('[getCertificateSourceManifestFromDrive] 매니페스트 읽기 실패:', err.message);
    return { files: {} };
  }
}

/**
 * Google Drive 성적서 루트 폴더에 원본 파일명 매니페스트를 저장(업데이트)합니다.
 */
async function saveCertificateSourceManifestToDrive(manifest) {
  if (!drive || !CERTIFICATE_ROOT_FOLDER_ID) return;
  try {
    const buffer = Buffer.from(JSON.stringify(manifest, null, 2), 'utf8');
    await uploadBufferToFolder({
      folderId: CERTIFICATE_ROOT_FOLDER_ID,
      fileName: SOURCE_MANIFEST_FILE,
      buffer,
      mimeType: 'application/json',
    });
  } catch (err) {
    console.warn('[saveCertificateSourceManifestToDrive] 매니페스트 저장 실패:', err.message);
  }
}

/**
 * 업로드된 원본 파일명을 감사 로그 및 Google Drive 공유 매니페스트에 기록합니다.
 */
async function recordUploadedCertificateSourceFile(fileName, category = 'pdf', meta = {}) {
  const cleanFileName = String(fileName || '').trim();
  if (!cleanFileName) return;

  // 1) 로컬 감사 로그에 기록
  logCertDiagnostic('RECORD_SOURCE_FILE', {
    fileName: cleanFileName,
    sourceFileName: cleanFileName,
    sourcePdfName: cleanFileName,
    category,
    ...meta,
  });

  // 2) Google Drive 매니페스트에 기록 (다른 중앙관리자 PC와 실시간 공유)
  try {
    const manifest = await getCertificateSourceManifestFromDrive();
    manifest.files = manifest.files || {};
    manifest.files[cleanFileName] = {
      fileName: cleanFileName,
      category,
      uploadedAt: new Date().toISOString(),
      ...meta,
    };
    await saveCertificateSourceManifestToDrive(manifest);
  } catch (err) {
    console.warn('[recordUploadedCertificateSourceFile] Drive 기록 오류:', err.message);
  }
}

/**
 * 성적서 원본 파일명(PDF 또는 엑셀)이 이미 업로드된 이력이 있는지 3단계로 검사합니다:
 * 1) 로컬 cert_upload_audit.log
 * 2) Google Drive CERTIFICATE_ROOT_FOLDER_ID 직하위 _uploaded_source_files.json
 * 3) BigQuery certificate_water_quality 테이블의 source_pdf_name 컬럼
 */
async function checkUploadedCertificateSourceFile(fileName) {
  const cleanFileName = String(fileName || '').trim();
  if (!cleanFileName) return { exists: false };

  // 1) 로컬 cert_upload_audit.log 확인
  try {
    const auditPath = getAuditLogPath();
    if (fs.existsSync(auditPath)) {
      const content = fs.readFileSync(auditPath, 'utf8');
      const lines = content.split('\n');
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const entry = JSON.parse(line);
          const candidateNames = [
            entry.fileName,
            entry.sourceFileName,
            entry.sourcePdfName,
            entry.originalFileName,
          ].filter(Boolean);
          if (candidateNames.some((name) => String(name).trim() === cleanFileName)) {
            return { exists: true, source: 'audit_log' };
          }
        } catch (_) {}
      }
    }
  } catch (err) {
    console.warn('[checkUploadedCertificateSourceFile] 감사 로그 확인 오류:', err.message);
  }

  // 2) Google Drive 매니페스트 확인
  try {
    const manifest = await getCertificateSourceManifestFromDrive();
    if (manifest.files && manifest.files[cleanFileName]) {
      return { exists: true, source: 'drive_manifest' };
    }
  } catch (err) {
    console.warn('[checkUploadedCertificateSourceFile] Drive 매니페스트 확인 오류:', err.message);
  }

  // 3) BigQuery certificate_water_quality 테이블 확인
  try {
    const bq = getBigQueryClient();
    if (bq) {
      const query = `SELECT 1 FROM \`${DATASET_ID}.certificate_water_quality\` WHERE source_pdf_name = @fileName LIMIT 1`;
      const [rows] = await bq.query({ query, params: { fileName: cleanFileName } });
      if (rows && rows.length > 0) {
        return { exists: true, source: 'bigquery' };
      }
    }
  } catch (bqErr) {
    console.warn('[checkUploadedCertificateSourceFile] BigQuery 확인 예외 (무시):', bqErr.message);
  }

  return { exists: false };
}

module.exports = {
  CERTIFICATE_ROOT_FOLDER_ID,
  getCertificateSourceManifestFromDrive,
  saveCertificateSourceManifestToDrive,
  recordUploadedCertificateSourceFile,
  checkUploadedCertificateSourceFile,
};
