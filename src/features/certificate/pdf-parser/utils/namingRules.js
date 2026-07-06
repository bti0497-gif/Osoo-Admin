/**
 * namingRules.js — 성적서 이미지 명명규칙
 *
 * 규칙:
 * - 접두어: PDF 파일명에 '포기조' 또는 '폭기조'가 있으면 'mlss', 없으면 '성적서(5개 항목)'
 * - 날짜: PDF 파일명에서 추출 (YYYYMMDD 형식)
 *   - 앞에 하나만 있는 경우도 있고
 *   - 앞부분과 뒷부분 두 군데에 있는 경우도 있음 (주로 mlss 파일)
 *   - 사용자가 두 날짜 중 하나를 선택할 수 있어야 함
 * - 전체: {접두어}_{YYYYMMDD}_{현장명}.jpg
 * - 중복: 같은 이름이 생성되면 두 번째 파일 뒤에 ...(2).jpg 추가
 */

/**
 * PDF 파일명에서 날짜 패턴 추출 (YYYYMMDD)
 * @param {string} fileName
 * @returns {string[]} 추출된 날짜 배열 (최대 2개)
 */
export function extractDatesFromFileName(fileName) {
  const pattern4Y = /(\d{4})[-._]?(\d{2})[-._]?(\d{2})/g;
  const pattern2Y = /(?:^|[^0-9])(\d{2})[-._](\d{2})[-._](\d{2})/g;
  const matches = [];
  let match;

  // 먼저 4자리 연도 검사 (예: 2026-04-21)
  while ((match = pattern4Y.exec(fileName)) !== null) {
    const [, year, month, day] = match;
    matches.push(`${year}${month}${day}`);
    if (matches.length >= 2) return matches;
  }

  // 없거나 부족하면 2자리 연도 검사 (예: 26.04.21)
  pattern2Y.lastIndex = 0;
  while ((match = pattern2Y.exec(fileName)) !== null) {
    const [, year, month, day] = match;
    const fullYear = `20${year}`;
    const dateStr = `${fullYear}${month}${day}`;
    if (!matches.includes(dateStr)) {
      matches.push(dateStr);
    }
    if (matches.length >= 2) break;
  }

  return matches;
}

/**
 * PDF 파일명에서 접두어 결정
 * @param {string} fileName
 * @returns {string} 'mlss' 또는 '성적서(5개 항목)'
 */
export function determinePrefix(fileName) {
  if (fileName.includes('포기조') || fileName.includes('폭기조')) {
    return 'mlss';
  }
  return '성적서(5개 항목)';
}

/**
 * 파일명 생성
 * @param {string} prefix — 접두어
 * @param {string} date — YYYYMMDD
 * @param {string} siteName — 현장명
 * @param {number} duplicateIndex — 중복 인덱스 (0: 중복 없음, 1: 첫 중복, 2: 두 번째 중복...)
 * @returns {string} 파일명
 */
export function generateFileName(prefix, date, siteName, duplicateIndex = 0) {
  const base = `${prefix}_${date}_${siteName}.jpg`;
  if (duplicateIndex === 0) return base;
  return `${base.slice(0, -4)}...(${duplicateIndex + 1}).jpg`;
}

/**
 * 중복 파일명 체크 및 인덱스 계산
 * @param {string} baseFileName — 중복 처리 전 기본 파일명
 * @param {Set<string>} existingNames — 이미 존재하는 파일명 집합
 * @returns {number} 사용할 중복 인덱스
 */
export function resolveDuplicateIndex(baseFileName, existingNames) {
  if (!existingNames.has(baseFileName)) return 0;

  let index = 1;
  while (existingNames.has(generateFileName(baseFileName.split('_')[0], baseFileName.split('_')[1], baseFileName.split('_')[2].slice(0, -4), index))) {
    index++;
  }
  return index;
}
