'use strict';
const express = require('express');
const { getVendors, upsertVendor, deleteVendor } = require('../services/vendorsSheetsService.cjs');
const router = express.Router();
router.get('/api/vendors', async (_req, res) => { try { const vendors = await getVendors(); res.json({ success: true, vendors }); } catch (e) { res.status(500).json({ success: false, error: e.message }); } });
router.post('/api/vendors', async (req, res) => { try { const vendor = await upsertVendor(req.body || {}); res.json({ success: true, vendor }); } catch (e) { res.status(500).json({ success: false, error: e.message }); } });
router.delete('/api/vendors/:id', async (req, res) => { try { await deleteVendor(req.params.id); res.json({ success: true }); } catch (e) { res.status(500).json({ success: false, error: e.message }); } });
module.exports = router;
