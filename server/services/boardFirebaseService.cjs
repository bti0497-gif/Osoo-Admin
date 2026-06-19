'use strict';

/**
 * boardFirebaseService.cjs
 * ─────────────────────────────────────────────────────────────────────
 * 게시판(posts / comments) Firebase Firestore CRUD 서비스
 *
 * 현장관리자용 앱과 동일한 Firestore 컬렉션/스키마를 사용한다.
 * boardBigQueryService.cjs와 동일한 export 인터페이스를 유지하여
 * boardService.cjs 어댑터에서 투명하게 교체 가능하다.
 *
 * 가시성 규칙:
 *   - 관리자 계열(admin/group_admin): 모든 글 조회 가능
 *   - 현장관리자(user/manager): visible_sites에 'ALL' 또는 자기 현장명이 있는 글만 조회
 *
 * 정렬:
 *   - Firestore 복합 인덱스 요구를 피하기 위해 서버 메모리에서 정렬
 *   - is_notice DESC, created_at DESC
 */

const path = require('path');
const crypto = require('crypto');

// ─────────────────────────────────────────────────────────────────────
// Firebase Admin 초기화 (싱글턴)
// ─────────────────────────────────────────────────────────────────────
let _db = null;

function getFirestore() {
  if (_db) return _db;

  const admin = require('firebase-admin');

  if (!admin.apps.length) {
    const keyPath = path.resolve(__dirname, '../config/firebase-service-account.json');
    const serviceAccount = require(keyPath);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    console.log('[BoardFirebase] Firebase Admin 초기화 완료');
  }

  _db = admin.firestore();
  return _db;
}

// ─────────────────────────────────────────────────────────────────────
// UUID 생성
// ─────────────────────────────────────────────────────────────────────
function newUUID() {
  return crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
}

// ─────────────────────────────────────────────────────────────────────
// 권한 헬퍼
// ─────────────────────────────────────────────────────────────────────
function isAdminRole(role) {
  return role === 'admin' || role === 'group_admin' || role === 'central_admin';
}

/**
 * [CRITICAL] 게시글 가시성 판단 - 권한 체크 핵심 함수
 * - admin/group_admin/central_admin: 모든 글 열람 가능
 * - user/manager: visible_sites에 'ALL' 또는 자기 현장명이 포함된 글만, 또는 자기가 쓴 글
 * 
 * WARNING: 수정 시 반드시 다음 시나리오 테스트:
 * 1. 관리자가 모든 글 보기
 * 2. 현장관리자가 자기 현장 글 보기
 * 3. 현장관리자가 자기가 쓴 글 보기
 * 4. 답글(parent_id) 상속 권한 테스트
 */
function canViewPost(post, user) {
  if (!post || post.is_deleted) return false;
  if (isAdminRole(user.role)) return true;

  // 자기가 쓴 글은 항상 볼 수 있다
  if (String(post.author || '') === String(user.name || '')) return true;

  const sites = Array.isArray(post.visible_sites) ? post.visible_sites : [];
  if (sites.includes('ALL')) return true;
  if (user.site && sites.includes(user.site)) return true;

  return false;
}

// ─────────────────────────────────────────────────────────────────────
// Posts
// ─────────────────────────────────────────────────────────────────────

/**
 * 게시글 목록 조회
 */
async function getPosts(role, siteName, userName) {
  const db = getFirestore();

  // posts와 comments를 병렬로 조회
  const [snapshot, commentSnapshot] = await Promise.all([
    db.collection('posts').where('is_deleted', '==', false).get(),
    db.collection('comments').where('is_deleted', '==', false).get()
  ]);

  const user = { role, site: siteName, name: userName };
  let posts = [];

  snapshot.forEach(doc => {
    const data = { id: doc.id, ...doc.data() };
    if (canViewPost(data, user)) {
      posts.push(data);
    }
  });

  const commentCounts = {};
  commentSnapshot.forEach(doc => {
    const d = doc.data();
    const pid = d.post_id;
    if (pid) commentCounts[pid] = (commentCounts[pid] || 0) + 1;
  });

  posts = posts.map(p => ({
    ...p,
    comment_count: commentCounts[p.id] || 0,
    // Firestore Timestamp → ISO string 변환
    created_at: toISOString(p.created_at),
    updated_at: toISOString(p.updated_at)
  }));

  // 서버 메모리 정렬: is_notice DESC, created_at DESC
  posts.sort((a, b) => {
    const na = a.is_notice ? 1 : 0;
    const nb = b.is_notice ? 1 : 0;
    if (nb !== na) return nb - na;
    return new Date(b.created_at || 0) - new Date(a.created_at || 0);
  });

  return posts.slice(0, 300);
}

/**
 * 게시글 단건 조회
 */
async function getPost(id, { incrementView = false } = {}) {
  const db = getFirestore();
  const ref = db.collection('posts').doc(id);
  const doc = await ref.get();
  if (!doc.exists) return null;
  const data = { id: doc.id, ...doc.data() };
  if (data.is_deleted) return null;
  data.created_at = toISOString(data.created_at);
  data.updated_at = toISOString(data.updated_at);
  if (incrementView) {
    const newCount = (data.view_count || 0) + 1;
    ref.update({ view_count: newCount }).catch(() => {});
    data.view_count = newCount;
  } else {
    data.view_count = data.view_count || 0;
  }
  return data;
}

/**
 * 게시글 생성
 * - 답글(parent_id 존재)인 경우 부모 게시글의 visible_sites 상속
 */
async function createPost(data) {
  const db = getFirestore();
  const now = new Date().toISOString();
  const id = newUUID();

  // 답글인 경우 부모 게시글의 visible_sites 상속
  let visibleSites = buildVisibleSites(data);
  if (data.parent_id) {
    const parentDoc = await db.collection('posts').doc(data.parent_id).get();
    if (parentDoc.exists) {
      const parentData = parentDoc.data();
      if (parentData.visible_sites) {
        visibleSites = parentData.visible_sites;
      }
    }
  }

  const row = {
    id,
    author:        data.author       || '',
    author_role:   data.author_role  || 'manager',
    author_site:   data.author_site  || '',
    target_site:   data.target_site  || '',
    visible_sites: visibleSites,
    title:         data.title        || '',
    content:       data.content      || '',
    is_notice:     Boolean(data.is_notice),
    attachments:   data.attachments  || '[]',
    parent_id:     data.parent_id    || null,
    is_deleted:    false,
    view_count:    0,
    created_at:    now,
    updated_at:    now
  };

  await db.collection('posts').doc(id).set(row);
  return row;
}

/**
 * 게시글 수정
 */
async function updatePost(id, data) {
  const db = getFirestore();
  const now = new Date().toISOString();
  const updates = { updated_at: now };

  if (data.title       !== undefined) updates.title       = data.title;
  if (data.content     !== undefined) updates.content     = data.content;
  if (data.is_notice   !== undefined) updates.is_notice   = Boolean(data.is_notice);
  if (data.attachments !== undefined) updates.attachments = data.attachments;
  if (data.target_site !== undefined) {
    updates.target_site = data.target_site;
    // visible_sites도 함께 갱신
    updates.visible_sites = buildVisibleSitesFromTarget(data.target_site, data.author_role);
  }

  await db.collection('posts').doc(id).update(updates);
}

/**
 * 게시글 소프트 삭제
 */
async function deletePost(id) {
  const db = getFirestore();
  await db.collection('posts').doc(id).update({
    is_deleted: true,
    updated_at: new Date().toISOString()
  });
}

// ─────────────────────────────────────────────────────────────────────
// Comments
// ─────────────────────────────────────────────────────────────────────

/**
 * 댓글 단건 조회
 */
async function getComment(id) {
  const db = getFirestore();
  const doc = await db.collection('comments').doc(id).get();
  if (!doc.exists) return null;
  const data = { id: doc.id, ...doc.data() };
  if (data.is_deleted) return null;
  data.created_at = toISOString(data.created_at);
  return data;
}

/**
 * 댓글 목록 조회 (특정 게시글)
 */
async function getComments(postId) {
  const db = getFirestore();
  const snapshot = await db.collection('comments')
    .where('post_id', '==', postId)
    .where('is_deleted', '==', false)
    .get();

  const comments = [];
  snapshot.forEach(doc => {
    const data = { id: doc.id, ...doc.data() };
    data.created_at = toISOString(data.created_at);
    comments.push(data);
  });

  // created_at ASC
  comments.sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0));
  return comments;
}

/**
 * 댓글 생성
 */
async function createComment(postId, data) {
  const db = getFirestore();
  const id = newUUID();
  const row = {
    id,
    post_id:    postId,
    parent_id:  data.parent_id || null,
    author:     data.author    || '',
    content:    data.content   || '',
    is_deleted: false,
    created_at: new Date().toISOString()
  };
  await db.collection('comments').doc(id).set(row);
  return row;
}

/**
 * 댓글 소프트 삭제
 */
async function deleteComment(id) {
  const db = getFirestore();
  await db.collection('comments').doc(id).update({
    is_deleted: true
  });
}

// ─────────────────────────────────────────────────────────────────────
// 유틸리티
// ─────────────────────────────────────────────────────────────────────

/**
 * visible_sites 배열 생성
 * - admin 전체공지:       ['ALL']
 * - admin 특정 현장 대상: ['현장명']
 * - 현장관리자 작성글:    ['해당 현장명']
 */
function buildVisibleSites(data) {
  const targetSite = (data.target_site || '').trim();
  const authorSite = (data.author_site || '').trim();
  const authorRole = data.author_role || '';

  if (isAdminRole(authorRole)) {
    if (!targetSite || targetSite === '' || targetSite === 'ALL') {
      return ['ALL'];
    }
    return [targetSite];
  }

  // 현장관리자: 자기 현장
  return authorSite ? [authorSite] : ['ALL'];
}

function buildVisibleSitesFromTarget(targetSite, authorRole) {
  const target = (targetSite || '').trim();
  if (isAdminRole(authorRole)) {
    if (!target || target === 'ALL') return ['ALL'];
    return [target];
  }
  return ['ALL'];
}

/**
 * Firestore Timestamp 또는 문자열을 ISO string으로 변환
 */
function toISOString(value) {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (value instanceof Date) return value.toISOString();
  // Firestore Timestamp 객체
  if (typeof value.toDate === 'function') return value.toDate().toISOString();
  if (typeof value.seconds === 'number') {
    return new Date(value.seconds * 1000).toISOString();
  }
  return String(value);
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
