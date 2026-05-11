const express = require('express');
const crypto = require('crypto');
const { getMembers, upsertMember, deleteMember, isSheetsConfigured } = require('../services/membersSheetsService.cjs');

const ADMIN_ROLES = new Set(['admin', 'group_admin']);

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

    router.post('/local-login', async (req, res) => {
        try {
            if (!requireSheets(res)) return;
            const { name, password } = req.body || {};
            const members = await getMembers();
            const member = members.find((item) =>
                String(item.name || '') === String(name || '') &&
                String(item.password || '') === String(password || '')
            );

            if (!member) {
                return res.status(401).json({ success: false, message: '이름 또는 비밀번호가 올바르지 않습니다.' });
            }
            if (!ADMIN_ROLES.has(String(member.role || ''))) {
                return res.status(403).json({ success: false, message: '관리자 전용 앱입니다.' });
            }

            res.json({ success: true, member });
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
