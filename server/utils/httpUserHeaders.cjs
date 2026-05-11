'use strict';

/**
 * Fetch/브라우저는 Request 헤더 값을 ISO-8859-1로만 허용한다.
 * 클라이언트는 encodeURIComponent로 넘기고, 서버에서 이 함수로 복원한다.
 * 예전(미인코딩) 값은 URIError 시 원문을 그대로 쓴다.
 */
function decodeUserContextHeader(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

module.exports = { decodeUserContextHeader };
