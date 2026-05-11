const express = require('express');
const crypto = require('crypto');
const { getSites, upsertSite, deleteSite } = require('../services/sitesSheetsService.cjs');
const { upsertMember } = require('../services/membersSheetsService.cjs');

module.exports = () => {
    const router = express.Router();

    router.get('/api/settings/sites', async (req, res) => {
        try {
            const sites = await getSites();
            res.json({ success: true, sites, currentSiteId: sites[0]?.id || null });
        } catch (err) {
            res.status(500).json({ success: false, message: err.message });
        }
    });

    router.post('/api/settings/sites', async (req, res) => {
        try {
            const site = {
                id: String(req.body.siteId || req.body.id || crypto.randomUUID()),
                site_name: String(req.body.siteName || req.body.site_name || '').trim(),
                manager_name: String(req.body.managerName || req.body.manager_name || '').trim(),
                method: String(req.body.method || 'A2O').trim(),
                series: String(req.body.series || '1계열').trim(),
                is_active: req.body.isActive === undefined ? 1 : (req.body.isActive ? 1 : 0),
            };
            if (!site.site_name) {
                return res.status(400).json({ success: false, message: '현장명은 필수입니다.' });
            }
            await upsertSite(site);
            res.json({ success: true, site });
        } catch (err) {
            res.status(500).json({ success: false, message: err.message });
        }
    });

    router.delete('/api/settings/sites/:siteId', async (req, res) => {
        try {
            await deleteSite(req.params.siteId);
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ success: false, message: err.message });
        }
    });

    router.post('/api/settings/select-site', async (req, res) => {
        try {
            const sites = await getSites();
            const site = sites.find((item) => String(item.id) === String(req.body.siteId)) || null;
            res.json({ success: true, site });
        } catch (err) {
            res.status(500).json({ success: false, message: err.message });
        }
    });

    router.post('/api/settings/bootstrap-site-member', async (req, res) => {
        try {
            const site = {
                id: String(req.body.site?.siteId || req.body.siteId || crypto.randomUUID()),
                site_name: String(req.body.site?.siteName || req.body.siteName || '').trim(),
                manager_name: String(req.body.member?.name || req.body.managerName || '').trim(),
                method: String(req.body.site?.method || req.body.method || 'A2O').trim(),
                series: String(req.body.site?.series || req.body.series || '1계열').trim(),
                is_active: 1,
            };
            const member = {
                ...(req.body.member || {}),
                id: String(req.body.member?.id || crypto.randomUUID()),
                site_name1: site.site_name,
                role: req.body.member?.role || 'user',
            };
            await upsertSite(site);
            await upsertMember(member);
            res.json({ success: true, site, member });
        } catch (err) {
            res.status(500).json({ success: false, message: err.message });
        }
    });

    return router;
};
