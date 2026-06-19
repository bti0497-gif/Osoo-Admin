'use strict';

const express = require('express');
const { getBigQueryClient, DATASET_ID } = require('../services/bigQueryClientService.cjs');

const router = express.Router();

const TABLES = {
  flow_readings: {
    label: '유량관리',
    keyFields: ['site_id', 'local_id'],
    dateField: 'date',
    searchFields: ['site_name', 'author', 'type'],
    columns: ['site_id', 'site_name', 'author', 'local_id', 'created_at', 'date', 'type', 'raw_value', 'calculated_flow', 'is_reset', 'is_manual', 'sludge_export', 'updated_at', 'uploaded_at'],
  },
  medicine_logs: {
    label: '약품관리',
    keyFields: ['site_id', 'local_id'],
    dateField: 'date',
    searchFields: ['site_name', 'author', 'medicine_name'],
    columns: ['site_id', 'site_name', 'author', 'local_id', 'created_at', 'medicine_name', 'date', 'purchase_amount', 'usage_amount', 'current_inventory', 'photo_url', 'updated_at', 'uploaded_at'],
  },
  water_quality: {
    label: '성적서',
    keyFields: ['id'],
    dateField: 'report_date',
    searchFields: ['category', 'drive_file_name', 'site_name', 'source_pdf_name'],
    columns: ['id', 'uploaded_at', 'report_date', 'category', 'site_id', 'site_name', 'ss', 'bod', 'tn', 'tp', 'total_coliform', 'mlss', 'do', 'ph', 'drive_file_name', 'source_pdf_name', 'is_synced'],
  },
  kit_logs: {
    label: '키트관리',
    keyFields: ['site_id', 'local_id'],
    dateField: 'date',
    searchFields: ['site_name', 'author', 'kit_name'],
    columns: ['site_id', 'site_name', 'author', 'local_id', 'created_at', 'kit_name', 'date', 'purchase_amount', 'usage_amount', 'current_inventory', 'photo_url', 'updated_at', 'uploaded_at'],
  },
  facility_logs: {
    label: '시설관리',
    keyFields: ['site_id', 'local_id'],
    dateField: 'date',
    searchFields: ['site_name', 'author', 'location', 'facility_name', 'company', 'content', 'notes'],
    columns: ['site_id', 'site_name', 'author', 'local_id', 'created_at', 'date', 'location', 'facility_name', 'content', 'company', 'price', 'notes', 'updated_at', 'uploaded_at'],
  },
  posts: {
    label: '게시글',
    keyFields: ['id'],
    dateField: 'created_at',
    softDeleteField: 'is_deleted',
    searchFields: ['author', 'author_role', 'author_site', 'target_site', 'title', 'content'],
    columns: ['id', 'author', 'author_role', 'author_site', 'target_site', 'title', 'content', 'is_notice', 'attachments', 'parent_id', 'is_deleted', 'created_at', 'updated_at'],
  },
  comments: {
    label: '댓글',
    keyFields: ['id'],
    dateField: 'created_at',
    softDeleteField: 'is_deleted',
    searchFields: ['post_id', 'parent_id', 'author', 'content'],
    columns: ['id', 'post_id', 'parent_id', 'author', 'content', 'is_deleted', 'created_at'],
  },
  attendance: {
    label: '출결',
    keyFields: ['id'],
    dateField: 'date',
    searchFields: ['site_name', 'member_id', 'member_name', 'remote_session_type'],
    columns: ['id', 'site_id', 'site_name', 'member_id', 'member_name', 'date', 'login_time', 'logout_time', 'login_lat', 'login_lng', 'logout_lat', 'logout_lng', 'location_matched', 'remote_session_detected', 'remote_session_type', 'remote_session_evidence', 'auto_logout', 'uploaded_at'],
  },
  sites: {
    label: '현장',
    keyFields: ['id'],
    searchFields: ['id', 'site_name', 'manager_name', 'method', 'series'],
    columns: ['id', 'site_name', 'manager_name', 'method', 'series', 'is_active', 'updated_at', 'uploaded_at'],
  },
  members: {
    label: '회원',
    keyFields: ['id'],
    searchFields: ['id', 'name', 'role', 'phone', 'notes'],
    columns: ['id', 'name', 'role', 'phone', 'target_lat', 'target_lng', 'radius_m', 'notes', 'updated_at', 'uploaded_at'],
  },
};

function isAdminRole(role) {
  return role === 'admin' || role === 'group_admin';
}

function extractRole(req) {
  return req.headers['x-user-role'] || req.query.role || req.body?.role || 'user';
}

function assertAdmin(req, res) {
  if (isAdminRole(extractRole(req))) return true;
  res.status(403).json({ error: '관리자 권한이 필요합니다.' });
  return false;
}

function getTableMeta(tableName) {
  const meta = TABLES[tableName];
  if (!meta) {
    const err = new Error('허용되지 않은 테이블입니다.');
    err.status = 400;
    throw err;
  }
  return meta;
}

function rowKey(row, keyFields) {
  const key = Object.fromEntries(keyFields.map((field) => [field, row[field] ?? null]));
  return Buffer.from(JSON.stringify(key), 'utf8').toString('base64url');
}

function decodeRowKey(encoded) {
  return JSON.parse(Buffer.from(String(encoded || ''), 'base64url').toString('utf8'));
}

function buildWhere(meta, query) {
  const where = [];
  const params = {};

  if (query.siteName && meta.columns.includes('site_name')) {
    where.push('LOWER(CAST(site_name AS STRING)) LIKE @siteName');
    params.siteName = `%${String(query.siteName).toLowerCase()}%`;
  }
  if (query.siteId && meta.columns.includes('site_id')) {
    where.push('CAST(site_id AS STRING) = @siteId');
    params.siteId = String(query.siteId);
  }
  if (query.dateFrom && meta.dateField) {
    where.push(`${meta.dateField} >= @dateFrom`);
    params.dateFrom = query.dateFrom;
  }
  if (query.dateTo && meta.dateField) {
    where.push(`${meta.dateField} <= @dateTo`);
    params.dateTo = query.dateTo;
  }
  if (query.search && meta.searchFields?.length) {
    const searchParts = meta.searchFields
      .filter((field) => meta.columns.includes(field))
      .map((field) => `LOWER(CAST(${field} AS STRING)) LIKE @search`);
    if (searchParts.length) {
      where.push(`(${searchParts.join(' OR ')})`);
      params.search = `%${String(query.search).toLowerCase()}%`;
    }
  }

  return {
    clause: where.length ? `WHERE ${where.join(' AND ')}` : '',
    params,
  };
}

function buildKeyWhere(meta, decodedKey, params) {
  return meta.keyFields.map((field, index) => {
    if (!(field in decodedKey)) {
      const err = new Error(`행 키에 ${field} 값이 없습니다.`);
      err.status = 400;
      throw err;
    }
    const name = `key${index}`;
    params[name] = decodedKey[field];
    return `${field} = @${name}`;
  }).join(' AND ');
}

router.get('/api/admin-data/tables', (req, res) => {
  if (!assertAdmin(req, res)) return;
  res.json({
    tables: Object.entries(TABLES).map(([id, meta]) => ({
      id,
      label: meta.label,
      keyFields: meta.keyFields,
      columns: meta.columns,
    })),
  });
});

router.get('/api/admin-data/:table', async (req, res) => {
  if (!assertAdmin(req, res)) return;
  try {
    const tableName = req.params.table;
    const meta = getTableMeta(tableName);
    const bq = getBigQueryClient();
    if (!bq) throw new Error('BigQuery 클라이언트 초기화 실패');

    const limit = Math.min(Math.max(Number(req.query.limit || 100), 1), 200);
    const offset = Math.max(Number(req.query.offset || 0), 0);
    const { clause, params } = buildWhere(meta, req.query);
    const orderField = meta.dateField || (meta.columns.includes('updated_at') ? 'updated_at' : meta.keyFields[0]);

    const [rows] = await bq.query({
      query: `
        SELECT ${meta.columns.join(', ')}
        FROM \`${DATASET_ID}.${tableName}\`
        ${clause}
        ORDER BY ${orderField} DESC
        LIMIT @limit OFFSET @offset
      `,
      params: { ...params, limit, offset },
    });

    res.json({
      table: tableName,
      columns: meta.columns,
      rows: rows.map((row) => ({ __rowKey: rowKey(row, meta.keyFields), ...row })),
      limit,
      offset,
    });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.put('/api/admin-data/:table/:rowKey', async (req, res) => {
  if (!assertAdmin(req, res)) return;
  try {
    const tableName = req.params.table;
    const meta = getTableMeta(tableName);
    const bq = getBigQueryClient();
    if (!bq) throw new Error('BigQuery 클라이언트 초기화 실패');

    const decodedKey = decodeRowKey(req.params.rowKey);
    const changes = req.body?.changes || {};
    const params = {};
    const editableFields = meta.columns.filter((field) => !meta.keyFields.includes(field));
    const sets = [];

    for (const field of editableFields) {
      if (Object.prototype.hasOwnProperty.call(changes, field)) {
        const name = `value_${field}`;
        sets.push(`${field} = @${name}`);
        params[name] = changes[field];
      }
    }
    if (meta.columns.includes('updated_at') && !sets.some((set) => set.startsWith('updated_at ='))) {
      sets.push('updated_at = CURRENT_TIMESTAMP()');
    }
    if (!sets.length) {
      return res.status(400).json({ error: '수정할 허용 필드가 없습니다.' });
    }

    const keyWhere = buildKeyWhere(meta, decodedKey, params);
    const [job] = await bq.createQueryJob({
      query: `UPDATE \`${DATASET_ID}.${tableName}\` SET ${sets.join(', ')} WHERE ${keyWhere}`,
      params,
    });
    await job.getQueryResults();
    res.json({ ok: true });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.delete('/api/admin-data/:table/:rowKey', async (req, res) => {
  if (!assertAdmin(req, res)) return;
  try {
    const tableName = req.params.table;
    const meta = getTableMeta(tableName);
    const bq = getBigQueryClient();
    if (!bq) throw new Error('BigQuery 클라이언트 초기화 실패');

    const decodedKey = decodeRowKey(req.params.rowKey);
    const params = {};
    const keyWhere = buildKeyWhere(meta, decodedKey, params);
    const query = meta.softDeleteField
      ? `UPDATE \`${DATASET_ID}.${tableName}\` SET ${meta.softDeleteField} = TRUE${meta.columns.includes('updated_at') ? ', updated_at = CURRENT_TIMESTAMP()' : ''} WHERE ${keyWhere}`
      : `DELETE FROM \`${DATASET_ID}.${tableName}\` WHERE ${keyWhere}`;

    const [job] = await bq.createQueryJob({ query, params });
    await job.getQueryResults();
    res.json({ ok: true });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

module.exports = function adminDataRoutes() {
  return router;
};
