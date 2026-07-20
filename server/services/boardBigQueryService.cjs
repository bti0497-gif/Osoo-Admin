'use strict';

/**
 * boardBigQueryService.cjs
 * ─────────────────────────────────────────────────────────────────────
 * 게시판(posts / comments) BigQuery CRUD 서비스
 *
 * 가시성 규칙:
 *   - 관리자 계열(admin/group_admin): 모든 글 조회 가능
 *   - 현장관리자(user): 전체 공지/관리자 대상 글 + 자신이 올린 글
 *
 * BigQuery 특성 대응:
 *   - 삭제: is_deleted = TRUE 소프트 삭제 (DML UPDATE — 수초 소요, 저빈도)
 *   - 수정: DML UPDATE
 *   - 생성: streaming insert (즉시 반영)
 *   - 조회: SELECT 쿼리 (파라미터화)
 */

const crypto = require('crypto');
const { getBigQueryClient, DATASET_ID } = require('./bigQueryClientService.cjs');

// ─────────────────────────────────────────────────────────────────────
// UUID 생성
// ─────────────────────────────────────────────────────────────────────
function newUUID() {
  return crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
}

// ─────────────────────────────────────────────────────────────────────
// 조회 필터 SQL (파라미터화 불가 부분은 role 검사 후 보간)
// ─────────────────────────────────────────────────────────────────────
function isAdminRole(role) {
  return role === 'admin' || role === 'group_admin' || role === 'central_admin';
}

function isPrivilegedPostRole(role) {
  return role === 'admin' || role === 'group_admin' || role === 'central_admin';
}

function popupExpiry(isPopup, requestedDays) {
  if (!isPopup) return null;
  const days = Math.min(7, Math.max(1, Number.parseInt(requestedDays, 10) || 1));
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

function isPopupActive(post) {
  if (!post?.is_popup || !post?.popup_expires_at) return false;
  const expiresAt = new Date(post.popup_expires_at?.value || post.popup_expires_at).getTime();
  return Number.isFinite(expiresAt) && expiresAt > Date.now();
}

function buildVisibilityFilter(role, siteName, userName) {
  if (isAdminRole(role)) {
    return { where: 'p.is_deleted = FALSE', params: {} };
  }
  // 현장관리자: 내 글 or 전체/내 현장 대상 관리자글. 같은 현장 다른 사용자의 글은 보지 않는다.
  return {
    where: `p.is_deleted = FALSE AND (
      p.author = @userName
      OR (p.author_role IN ('admin', 'group_admin', 'central_admin') AND (p.target_site IS NULL OR p.target_site = '' OR p.target_site = @siteName))
    )`,
    params: { siteName, userName }
  };
}

function canViewPost(post, user) {
  if (!post || post.is_deleted) return false;
  if (isAdminRole(user.role)) return true;
  if (String(post.author || '') === String(user.name || '')) return true;
  if (!isPrivilegedPostRole(post.author_role)) return false;

  const targetSite = String(post.target_site || '').trim();
  if (!targetSite) return true;
  return targetSite === String(user.site || '').trim();
}

// ─────────────────────────────────────────────────────────────────────
// Posts
// ─────────────────────────────────────────────────────────────────────

/**
 * 게시글 목록 조회 (댓글 수 포함)
 * @param {string} role      'admin' | 'group_admin' | 'user'
 * @param {string} siteName  현장관리자 현장명 (admin이면 무시)
 * @returns {Promise<Array>}
 */
async function getPosts(role, siteName, userName) {
  const bq = getBigQueryClient();
  if (!bq) throw new Error('BigQuery 클라이언트 초기화 실패');

  const { where, params } = buildVisibilityFilter(role, siteName, userName);

  const query = `
    SELECT
      p.*,
      (SELECT COUNT(1) FROM \`${DATASET_ID}.comments\` c
        WHERE c.post_id = p.id AND c.is_deleted = FALSE) AS comment_count
    FROM \`${DATASET_ID}.posts\` p
    WHERE ${where}
    ORDER BY p.is_notice DESC, p.created_at DESC
    LIMIT 300
  `;

  const [rows] = await bq.query({ query, params });
  return rows.map(r => ({
    ...r,
    is_popup: isPopupActive(r),
    popup_expires_at: r.popup_expires_at ? (r.popup_expires_at.value || r.popup_expires_at) : null
  }));
}

/**
 * 게시글 단건 조회
 */
async function getPost(id) {
  const bq = getBigQueryClient();
  if (!bq) throw new Error('BigQuery 클라이언트 초기화 실패');

  const query = `
    SELECT * FROM \`${DATASET_ID}.posts\`
    WHERE id = @id AND is_deleted = FALSE
    LIMIT 1
  `;
  const [rows] = await bq.query({ query, params: { id } });
  if (!rows[0]) return null;
  const post = rows[0];
  post.is_popup = isPopupActive(post);
  post.popup_expires_at = post.popup_expires_at ? (post.popup_expires_at.value || post.popup_expires_at) : null;
  return post;
}

async function getComment(id) {
  const bq = getBigQueryClient();
  if (!bq) throw new Error('BigQuery 클라이언트 초기화 실패');

  const query = `
    SELECT * FROM \`${DATASET_ID}.comments\`
    WHERE id = @id AND is_deleted = FALSE
    LIMIT 1
  `;
  const [rows] = await bq.query({ query, params: { id } });
  return rows[0] || null;
}

/**
 * 게시글 생성
 * @param {{author, author_role, author_site, target_site, title, content, is_notice, is_popup, popup_days, attachments, parent_id}} data
 */
async function createPost(data) {
  const bq = getBigQueryClient();
  if (!bq) throw new Error('BigQuery 클라이언트 초기화 실패');

  const now = new Date().toISOString();
  const id = newUUID();

  const isPopup = isAdminRole(data.author_role) ? Boolean(data.is_popup) : false;
  const popupExpiresAt = isPopup ? popupExpiry(true, data.popup_days) : null;

  const row = {
    id,
    author:       data.author      || '',
    author_role:  data.author_role || 'manager',
    author_site:  data.author_site || '',
    target_site:  data.target_site || '',   // '' = 전체
    title:        data.title       || '',
    content:      data.content     || '',
    is_notice:    Boolean(data.is_notice),
    is_popup:     isPopup,
    popup_expires_at: popupExpiresAt,
    attachments:  data.attachments || '[]',
    parent_id:    data.parent_id   || null,
    is_deleted:   false,
    created_at:   now,
    updated_at:   now
  };

  await bq.dataset(DATASET_ID).table('posts').insert([row]);
  return row;
}

/**
 * 게시글 수정 (DML UPDATE — 수초 소요)
 */
async function updatePost(id, data) {
  const bq = getBigQueryClient();
  if (!bq) throw new Error('BigQuery 클라이언트 초기화 실패');

  const now = new Date().toISOString();
  const sets = [];
  const params = { id, updated_at: now };

  if (data.title     !== undefined) { sets.push('title = @title');         params.title       = data.title; }
  if (data.content   !== undefined) { sets.push('content = @content');     params.content     = data.content; }
  if (data.is_notice !== undefined) { sets.push('is_notice = @is_notice'); params.is_notice   = Boolean(data.is_notice); }
  if (data.attachments !== undefined) { sets.push('attachments = @attachments'); params.attachments = data.attachments; }
  if (data.target_site !== undefined) { sets.push('target_site = @target_site'); params.target_site = data.target_site; }
  if (data.is_popup !== undefined) {
    const isPopup = isAdminRole(data.user_role || data.author_role) ? Boolean(data.is_popup) : false;
    sets.push('is_popup = @is_popup');
    params.is_popup = isPopup;
    sets.push('popup_expires_at = @popup_expires_at');
    params.popup_expires_at = isPopup ? popupExpiry(true, data.popup_days) : null;
  }
  sets.push('updated_at = @updated_at');

  await bq.query({
    query: `UPDATE \`${DATASET_ID}.posts\` SET ${sets.join(', ')} WHERE id = @id`,
    params
  });
}

/**
 * 게시글 소프트 삭제 (DML UPDATE)
 */
async function deletePost(id) {
  const bq = getBigQueryClient();
  if (!bq) throw new Error('BigQuery 클라이언트 초기화 실패');

  await bq.query({
    query: `UPDATE \`${DATASET_ID}.posts\` SET is_deleted = TRUE, updated_at = @now WHERE id = @id`,
    params: { id, now: new Date().toISOString() }
  });
}

// ─────────────────────────────────────────────────────────────────────
// Comments
// ─────────────────────────────────────────────────────────────────────

/**
 * 댓글 목록 조회 (특정 게시글)
 */
async function getComments(postId) {
  const bq = getBigQueryClient();
  if (!bq) throw new Error('BigQuery 클라이언트 초기화 실패');

  const query = `
    SELECT * FROM \`${DATASET_ID}.comments\`
    WHERE post_id = @postId AND is_deleted = FALSE
    ORDER BY created_at ASC
  `;
  const [rows] = await bq.query({ query, params: { postId } });
  return rows;
}

/**
 * 댓글 생성
 */
async function createComment(postId, data) {
  const bq = getBigQueryClient();
  if (!bq) throw new Error('BigQuery 클라이언트 초기화 실패');

  const row = {
    id:         newUUID(),
    post_id:    postId,
    parent_id:  data.parent_id || null,
    author:     data.author  || '',
    content:    data.content || '',
    is_deleted: false,
    created_at: new Date().toISOString()
  };
  await bq.dataset(DATASET_ID).table('comments').insert([row]);
  return row;
}

/**
 * 댓글 소프트 삭제
 */
async function deleteComment(id) {
  const bq = getBigQueryClient();
  if (!bq) throw new Error('BigQuery 클라이언트 초기화 실패');

  await bq.query({
    query: `UPDATE \`${DATASET_ID}.comments\` SET is_deleted = TRUE WHERE id = @id`,
    params: { id }
  });
}

module.exports = {
  getPosts,
  getPost,
  getComment,
  createPost,
  updatePost,
  deletePost,
  getComments,
  createComment,
  deleteComment,
  isAdminRole,
  canViewPost
};
