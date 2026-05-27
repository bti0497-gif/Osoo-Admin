'use strict';

/**
 * boardService.cjs
 * ─────────────────────────────────────────────────────────────────────
 * 게시판 백엔드 어댑터 (Strategy Pattern)
 *
 * 환경변수 BOARD_BACKEND에 따라 실제 구현을 선택한다.
 *   - 'firebase' (기본값) → boardFirebaseService.cjs
 *   - 'bigquery'          → boardBigQueryService.cjs
 *
 * 두 서비스 모두 동일한 export 인터페이스를 구현하므로
 * boardRoutes.cjs는 이 어댑터만 참조하면 된다.
 *
 * 롤백: .env.local에서 BOARD_BACKEND=bigquery 로 변경 후 서버 재시작
 */

const backend = (process.env.BOARD_BACKEND || 'firebase').toLowerCase().trim();

let service;

if (backend === 'bigquery') {
  service = require('./boardBigQueryService.cjs');
  console.log('[BoardService] 백엔드: BigQuery');
} else {
  service = require('./boardFirebaseService.cjs');
  console.log('[BoardService] 백엔드: Firebase Firestore');
}

module.exports = service;
