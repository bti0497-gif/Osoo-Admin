'use strict';

/**
 * [CRITICAL] 사용자 컨텍스트 헤더 디코딩
 * Fetch/브라우저는 Request 헤더 값을 ISO-8859-1로만 허용하여
 * 클라이언트는 encodeURIComponent로 인코딩하여 전송한다.
 * 
 * 이 함수는:
 * 1. 퍼센트 인코딩된 값은 decodeURIComponent로 디코딩
 * 2. 이미 디코딩된 값(퍼센트 패턴 없음)은 그대로 반환
 * 3. 모든 반환값은 .trim()으로 공백/줄바꿈 제거
 * 
 * WARNING: 이 함수는 인증의 핵심입니다. 수정 시 boardRoutes 테스트 필수
 */
function decodeUserContextHeader(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  // 퍼센트 인코딩 패턴(%XX)이 없으면 이미 디코딩된 것으로 간주
  if (!/%[0-9A-Fa-f]{2}/.test(raw)) return raw.trim();
  try {
    return decodeURIComponent(raw).trim();
  } catch {
    // 디코딩 실패 시 원본 반환 (trim 적용)
    return raw.trim();
  }
}

module.exports = { decodeUserContextHeader };
