'use strict';

const path = require('path');
const fs = require('fs');

/**
 * 사용자 업로드 및 번들 포함 템플릿 파일 저장/조회 전용 디렉토리 경로 계산
 */
function getAppDataTemplatesDir() {
  const appDataDir = process.env.APPDATA || (process.platform === 'darwin' ? path.join(process.env.HOME || '', 'Library', 'Preferences') : process.env.HOME || '');
  return path.join(appDataDir, 'Osoo-Admin', 'templates', 'gyeonggi');
}

function getBundleTemplatesDir() {
  const relPath = path.join('templates', 'gyeonggi');
  const candidates = [
    path.join(__dirname, '..', '..', relPath),
    process.resourcesPath ? path.join(process.resourcesPath, relPath) : '',
    process.resourcesPath ? path.join(process.resourcesPath, 'app.asar.unpacked', relPath) : '',
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return path.join(__dirname, '..', '..', relPath);
}

/**
 * 특정 템플릿 파일(예: '기간 데이타 조회.xlsx', '월운영보고서.xlsx')의 실제 존재하는 최우선 경로 탐색
 * @param {string} filename
 * @returns {string} 최우선 파일 경로 (없을 경우 AppData 쓰기 경로 반환)
 */
function resolveTemplatePath(filename) {
  const safeFilename = path.basename(filename);
  const relPath = path.join('templates', 'gyeonggi', safeFilename);
  const appDataDir = process.env.APPDATA || (process.platform === 'darwin' ? path.join(process.env.HOME || '', 'Library', 'Preferences') : process.env.HOME || '');

  const candidates = [
    // 1. 사용자 업로드 템플릿 (AppData - Osoo-Admin)
    path.join(appDataDir, 'Osoo-Admin', 'templates', 'gyeonggi', safeFilename),
    // 2. 과거/호환 AppData 경로 (Osoo_Admin_App)
    path.join(appDataDir, 'Osoo_Admin_App', 'templates', 'gyeonggi', safeFilename),
    // 3. 소스코드 / 번들 템플릿 (templates/gyeonggi)
    path.join(__dirname, '..', '..', relPath),
    // 4. 일렉트론 패키징 리소스 경로
    process.resourcesPath ? path.join(process.resourcesPath, relPath) : '',
    process.resourcesPath ? path.join(process.resourcesPath, 'app.asar.unpacked', relPath) : '',
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  // 파일이 없으면 업로드 대상이 될 AppData 기본 경로 반환
  return path.join(appDataDir, 'Osoo-Admin', 'templates', 'gyeonggi', safeFilename);
}

module.exports = {
  getAppDataTemplatesDir,
  getBundleTemplatesDir,
  resolveTemplatePath,
};
