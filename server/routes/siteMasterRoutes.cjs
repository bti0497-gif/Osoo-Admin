'use strict';

/**
 * siteMasterRoutes.cjs
 * GET  /api/site-master         — 캐시된 현장 목록 반환
 * POST /api/site-master/refresh — 구글시트 재fetch + 캐시 갱신
 */

const express = require('express');
const { getSiteMaster, refreshSiteMasterCache, invalidateMemCache } = require('../services/siteMasterCacheService.cjs');
const { getSites: getSitesFromSheets } = require('../services/sitesSheetsService.cjs');

const router = express.Router();

router.get('/api/site-master', (req, res) => {
  try {
    const sites = getSiteMaster();
    return res.json({ success: true, count: sites.length, sites });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/api/site-master/refresh', async (req, res) => {
  try {
    invalidateMemCache();
    const sites = await refreshSiteMasterCache(getSitesFromSheets);
    return res.json({ success: true, count: sites.length, sites, refreshed: true });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
