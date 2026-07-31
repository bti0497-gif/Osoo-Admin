const fs = require('fs');
const path = require('path');

function getAuditLogPath() {
  const baseDir = process.env.APPDATA
    ? path.join(process.env.APPDATA, 'Osoo-Admin', 'logs')
    : path.join(__dirname, '../../logs');

  if (!fs.existsSync(baseDir)) {
    try {
      fs.mkdirSync(baseDir, { recursive: true });
    } catch (_) {}
  }
  return path.join(baseDir, 'cert_upload_audit.log');
}

function logCertDiagnostic(action, details = {}) {
  const timestamp = new Date().toISOString();
  const logLine = JSON.stringify({
    timestamp,
    action,
    ...details,
  });

  console.log(`[CERT_DIAGNOSTIC] ${action}:`, details);

  try {
    const logFilePath = getAuditLogPath();
    fs.appendFileSync(logFilePath, logLine + '\n', 'utf8');
  } catch (err) {
    console.warn('[CERT_DIAGNOSTIC] Failed to write file log:', err.message);
  }
}

module.exports = {
  logCertDiagnostic,
  getAuditLogPath,
};
