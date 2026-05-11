const express = require('express');
const { getCurrentRecordMetadata } = require('../services/syncMetadataService.cjs');
const { decodeUserContextHeader } = require('../utils/httpUserHeaders.cjs');
const router = express.Router();

function isAdminRole(role) {
  return role === 'admin' || role === 'group_admin';
}

function extractUser(req) {
  const u = req.body?._user || {};
  const fromHeader = (h, fallback) => decodeUserContextHeader(h || '') || fallback;
  return {
    id: fromHeader(req.headers['x-user-id'], u.id || req.query._member_id || ''),
    name: fromHeader(req.headers['x-user-name'], u.name || req.query._name || 'unknown'),
    role: fromHeader(req.headers['x-user-role'], u.role || req.query._role || 'user'),
    siteId: fromHeader(req.headers['x-user-site-id'], u.site_id || req.query.site_id || ''),
    siteName: fromHeader(req.headers['x-user-site'], u.site_name || req.query.site_name || ''),
  };
}

module.exports = function(db) {
  function canAccessSite(user, siteId) {
    if (isAdminRole(user.role)) return true;
    const normalizedSiteId = String(siteId || '').trim();
    if (!normalizedSiteId) return false;

    if (user.id) {
      const link = db.prepare(`
        SELECT 1
        FROM member_sites
        WHERE member_id = ? AND site_id = ? AND can_manage = 1
        LIMIT 1
      `).get(String(user.id), normalizedSiteId);
      if (link) return true;
    }

    const byManager = db.prepare(`
      SELECT 1
      FROM sites
      WHERE id = ? AND manager_name = ? AND COALESCE(is_active, 1) = 1
      LIMIT 1
    `).get(normalizedSiteId, String(user.name || '').trim());
    return Boolean(byManager);
  }

  function resolveRequestSiteId(req, user) {
    const requestedSiteId = String(req.body?.site_id || req.query.site_id || user.siteId || '').trim();
    if (isAdminRole(user.role)) return requestedSiteId || null;
    return canAccessSite(user, requestedSiteId) ? requestedSiteId : null;
  }

  function assertRowAccess(row, user) {
    if (!row) return { ok: false, status: 404, message: '시설관리 기록 없음' };
    if (isAdminRole(user.role)) return { ok: true };
    if (!canAccessSite(user, row.site_id)) {
      return { ok: false, status: 403, message: '시설관리 기록 접근 권한 없음' };
    }
    return { ok: true };
  }

  // 전체 목록 조회 (검색, 최신순)
  router.get('/api/facilities', (req, res) => {
    const user = extractUser(req);
    const { q } = req.query;
    const siteId = resolveRequestSiteId(req, user);
    if (!isAdminRole(user.role) && !siteId) {
      return res.status(403).json({ success: false, error: '시설관리 조회 권한 없음' });
    }

    let sql = 'SELECT * FROM facility_logs';
    let params = [];
    const whereParts = [];
    if (siteId) {
      whereParts.push('site_id = ?');
      params.push(String(siteId));
    }
    if (q && q.trim()) {
      whereParts.push('(location LIKE ? OR facility_name LIKE ? OR content LIKE ? OR notes LIKE ?)');
      const like = `%${q.trim()}%`;
      params.push(like, like, like, like);
    }
    if (whereParts.length > 0) {
      sql += ` WHERE ${whereParts.join(' AND ')}`;
    }
    sql += ' ORDER BY date DESC, id DESC';
    const rows = db.prepare(sql).all(...params);
    res.json(rows);
  });

  // 등록
  router.post('/api/facilities', (req, res) => {
    const user = extractUser(req);
    const siteId = resolveRequestSiteId(req, user);
    if (!isAdminRole(user.role) && !siteId) {
      return res.status(403).json({ success: false, error: '시설관리 등록 권한 없음' });
    }

    const { date, location, facility_name, content, company, price, notes } = req.body;
    try {
      const metadata = getCurrentRecordMetadata(db, { ...req.body, site_id: siteId || req.body.site_id });
      const info = db.prepare(`
        INSERT INTO facility_logs (
          date, location, facility_name, content, company, price, notes,
          site_id, site_name, author, created_at, last_modified, is_synced
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        date, location || '', facility_name || '', content || '',
        company || '', price ?? null, notes || '',
        metadata.siteId, metadata.siteName, metadata.author,
        metadata.createdAt, metadata.lastModified, metadata.isSynced
      );
      res.json({ success: true, id: info.lastInsertRowid });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 수정
  router.put('/api/facilities/:id', (req, res) => {
    const user = extractUser(req);
    const { id } = req.params;
    const { date, location, facility_name, content, company, price, notes } = req.body;
    try {
      const existing = db.prepare('SELECT id, site_id FROM facility_logs WHERE id = ?').get(id);
      const access = assertRowAccess(existing, user);
      if (!access.ok) {
        return res.status(access.status).json({ success: false, error: access.message });
      }

      const now = new Date().toISOString();
      db.prepare(`
        UPDATE facility_logs
        SET date = ?, location = ?, facility_name = ?, content = ?, company = ?, price = ?, notes = ?,
            last_modified = ?, is_synced = 0
        WHERE id = ?
      `).run(date, location || '', facility_name || '', content || '', company || '', price ?? null, notes || '', now, id);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 삭제
  router.delete('/api/facilities/:id', (req, res) => {
    const user = extractUser(req);
    const { id } = req.params;
    try {
      const existing = db.prepare('SELECT id, site_id FROM facility_logs WHERE id = ?').get(id);
      const access = assertRowAccess(existing, user);
      if (!access.ok) {
        return res.status(access.status).json({ success: false, error: access.message });
      }

      db.prepare('DELETE FROM facility_logs WHERE id = ?').run(id);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
};
