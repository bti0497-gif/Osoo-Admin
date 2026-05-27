'use strict';

/**
 * boardRoutes.cjs
 * ─────────────────────────────────────────────────────────────────────
 * 게시판 REST API (환경변수 BOARD_BACKEND에 따라 BigQuery 또는 Firebase)
 *
 * GET    /api/board/posts              게시글 목록
 * POST   /api/board/posts              게시글 작성
 * PUT    /api/board/posts/:id          게시글 수정
 * DELETE /api/board/posts/:id          게시글 삭제 (소프트)
 * GET    /api/board/posts/:id          게시글 단건
 * GET    /api/board/posts/:id/comments 댓글 목록
 * POST   /api/board/posts/:id/comments 댓글 작성
 * DELETE /api/board/comments/:id       댓글 삭제 (소프트)
 *
 * 요청 헤더: x-user-role, x-user-site, x-user-name
 * (프론트엔드 apiClient가 현재 로그인 사용자 정보를 헤더에 포함한다)
 */

const express = require('express');
const router  = express.Router();
const {
  getPosts, getPost, createPost, updatePost, deletePost,
  getComments, createComment, deleteComment, getComment,
  isAdminRole, canViewPost
} = require('../services/boardService.cjs');
const { decodeUserContextHeader } = require('../utils/httpUserHeaders.cjs');

function normalizeAttachments(value) {
  if (typeof value === 'string') return value || '[]';
  return JSON.stringify(value || []);
}

// ── 요청에서 현재 사용자 추출 ──────────────────────────────────────
// 우선순위: 헤더 > body._user > query params
function extractUser(req) {
  const u = req.body?._user || {};
  const fromHeader = (h, fallback) => decodeUserContextHeader(h || '') || fallback;
  return {
    name: fromHeader(req.headers['x-user-name'], u.name || req.query._name || 'unknown'),
    role: fromHeader(req.headers['x-user-role'], u.role || req.query._role || 'user'),
    site: fromHeader(req.headers['x-user-site'], u.site || req.query._site || ''),
  };
}

// ── 오류 응답 헬퍼 ────────────────────────────────────────────────
function handleError(res, err, context) {
  console.error(`[BoardRoutes] ${context}:`, err.message);
  res.status(500).json({ success: false, message: err.message });
}

module.exports = function () {

  // 1. 게시글 목록
  router.get('/api/board/posts', async (req, res) => {
    const user = extractUser(req);
    try {
      const posts = await getPosts(user.role, user.site, user.name);
      res.json({ success: true, data: posts });
    } catch (err) { handleError(res, err, 'getPosts'); }
  });

  // 2. 게시글 단건
  router.get('/api/board/posts/:id', async (req, res) => {
    const user = extractUser(req);
    try {
      const post = await getPost(req.params.id);
      if (!post) return res.status(404).json({ success: false, message: '게시글 없음' });
      if (!canViewPost(post, user)) {
        return res.status(403).json({ success: false, message: '게시글 조회 권한 없음' });
      }
      res.json({ success: true, data: post });
    } catch (err) { handleError(res, err, 'getPost'); }
  });

  // 3. 게시글 작성
  router.post('/api/board/posts', async (req, res) => {
    const user = extractUser(req);
    const body = req.body || {};
    try {
      const post = await createPost({
        author:      user.name,
        author_role: isAdminRole(user.role) ? user.role : 'user',
        author_site: isAdminRole(user.role) ? 'CENTRAL' : user.site,
        target_site: isAdminRole(user.role) ? (body.target_site ?? '') : '',
        title:       body.title        || '',
        content:     body.content      || '',
        is_notice:   isAdminRole(user.role) ? Boolean(body.is_notice) : false,
        attachments: normalizeAttachments(body.attachments),
        parent_id:   body.parent_id    || null
      });
      res.json({ success: true, data: post });
    } catch (err) { handleError(res, err, 'createPost'); }
  });

  // 4. 게시글 수정 (작성자 or admin만 허용)
  router.put('/api/board/posts/:id', async (req, res) => {
    const user = extractUser(req);
    const body = req.body || {};
    try {
      // 권한 확인: 원글 조회
      const existing = await getPost(req.params.id);
      if (!existing) return res.status(404).json({ success: false, message: '게시글 없음' });
      if (!isAdminRole(user.role) && existing.author !== user.name) {
        return res.status(403).json({ success: false, message: '수정 권한 없음' });
      }
      if (!canViewPost(existing, user)) {
        return res.status(403).json({ success: false, message: '게시글 조회 권한 없음' });
      }

      await updatePost(req.params.id, {
        title:       body.title,
        content:     body.content,
        is_notice:   isAdminRole(user.role) ? body.is_notice : false,
        attachments: body.attachments != null ? normalizeAttachments(body.attachments) : undefined,
        target_site: isAdminRole(user.role) ? body.target_site : existing.target_site,
        author_role: existing.author_role || user.role
      });
      res.json({ success: true });
    } catch (err) { handleError(res, err, 'updatePost'); }
  });

  // 5. 게시글 삭제
  router.delete('/api/board/posts/:id', async (req, res) => {
    const user = extractUser(req);
    try {
      const existing = await getPost(req.params.id);
      if (!existing) return res.status(404).json({ success: false, message: '게시글 없음' });
      if (!isAdminRole(user.role) && existing.author !== user.name) {
        return res.status(403).json({ success: false, message: '삭제 권한 없음' });
      }
      if (!canViewPost(existing, user)) {
        return res.status(403).json({ success: false, message: '게시글 조회 권한 없음' });
      }
      await deletePost(req.params.id);
      res.json({ success: true });
    } catch (err) { handleError(res, err, 'deletePost'); }
  });

  // 6. 댓글 목록
  router.get('/api/board/posts/:id/comments', async (req, res) => {
    const user = extractUser(req);
    try {
      const post = await getPost(req.params.id);
      if (!post) return res.status(404).json({ success: false, message: '게시글 없음' });
      if (!canViewPost(post, user)) {
        return res.status(403).json({ success: false, message: '댓글 조회 권한 없음' });
      }
      const comments = await getComments(req.params.id);
      res.json({ success: true, data: comments });
    } catch (err) { handleError(res, err, 'getComments'); }
  });

  // 7. 댓글 작성
  router.post('/api/board/posts/:id/comments', async (req, res) => {
    const user = extractUser(req);
    const body = req.body || {};
    try {
      const post = await getPost(req.params.id);
      if (!post) return res.status(404).json({ success: false, message: '게시글 없음' });
      if (!canViewPost(post, user)) {
        return res.status(403).json({ success: false, message: '댓글 작성 권한 없음' });
      }
      const comment = await createComment(req.params.id, {
        author:  user.name,
        content: body.content || '',
        parent_id: body.parent_id || null
      });
      res.json({ success: true, data: comment });
    } catch (err) { handleError(res, err, 'createComment'); }
  });

  // 8. 댓글 삭제
  router.delete('/api/board/comments/:id', async (req, res) => {
    const user = extractUser(req);
    try {
      const comment = await getComment(req.params.id);
      if (!comment) return res.status(404).json({ success: false, message: '댓글 없음' });
      const post = await getPost(comment.post_id);
      if (!canViewPost(post, user)) {
        return res.status(403).json({ success: false, message: '댓글 삭제 권한 없음' });
      }
      if (!isAdminRole(user.role) && comment.author !== user.name) {
        return res.status(403).json({ success: false, message: '댓글 삭제 권한 없음' });
      }
      await deleteComment(req.params.id);
      res.json({ success: true });
    } catch (err) { handleError(res, err, 'deleteComment'); }
  });

  return router;
};
