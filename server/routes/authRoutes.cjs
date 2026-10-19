const express = require('express');
const crypto = require('crypto');
const { getMembers, upsertMember, deleteMember, isSheetsConfigured } = require('../services/membersSheetsService.cjs');
const { normalizeRole, getAssignedSitesForManager } = require('../services/centralManagersSheetsService.cjs');

module.exports = () => {
    const router = express.Router();

    const requireSheets = (res) => {
        if (isSheetsConfigured()) return true;
        res.status(400).json({ success: false, error: 'Google Sheets가 설정되지 않았습니다.' });
        return false;
    };

    router.get('/login-hint', (req, res) => {
        res.json({ success: true, name: '' });
    });

    router.get('/assigned-sites', async (req, res) => {
        try {
            const { userId, userName } = req.query || {};
            const assignedSites = await getAssignedSitesForManager(userId, userName);
            const isSuperAdmin =
                String(userId || '').toLowerCase() === 'admin' ||
                String(userName || '').toLowerCase() === 'admin' ||
                assignedSites.includes('*');

            res.json({
                success: true,
                assignedSites: isSuperAdmin ? ['*'] : assignedSites,
                isSuperAdmin,
            });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    router.post('/local-login', async (req, res) => {
        try {
            if (!requireSheets(res)) return;
            const { name, password } = req.body || {};
            const members = await getMembers();
            const member = members.find((item) =>
                String(item.name || '').trim() === String(name || '').trim() &&
                String(item.password || '').trim() === String(password || '').trim()
            );

            if (!member) {
                return res.status(401).json({ success: false, message: '이름 또는 비밀번호가 올바르지 않습니다.' });
            }

            const normalizedRole = normalizeRole(member.role, member.name);
            if (normalizedRole !== 'admin' && normalizedRole !== 'group_admin') {
                return res.status(403).json({ success: false, message: '중앙관리자 또는 최고관리자만 접속할 수 있습니다.' });
            }

            const assignedSites = await getAssignedSitesForManager(member.id, member.name);
            const isSuperAdmin = member.id === 'admin' || normalizedRole === 'admin' || assignedSites.includes('*');

            const authenticatedMember = {
                ...member,
                role: normalizedRole,
                isSuperAdmin,
                assignedSites: isSuperAdmin ? ['*'] : assignedSites,
            };

            res.json({ success: true, member: authenticatedMember });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    router.get('/members', async (req, res) => {
        try {
            if (!requireSheets(res)) return;
            const members = await getMembers();
            res.json({ success: true, members });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    router.post('/members', async (req, res) => {
        try {
            if (!requireSheets(res)) return;
            const member = {
                ...req.body,
                id: String(req.body?.id || crypto.randomUUID()),
                role: req.body?.role || 'user'
            };
            await upsertMember(member);
            res.json({ success: true, member });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    router.delete('/members/:id', async (req, res) => {
        try {
            if (!requireSheets(res)) return;
            await deleteMember(req.params.id);
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    router.post('/session', (req, res) => {
        res.json({ success: true, session: null });
    });

    return router;
};
