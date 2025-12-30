"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const db_1 = require("../db");
const auth_middleware_1 = require("../middleware/auth.middleware");
const router = (0, express_1.Router)();
// Get Settings
router.get('/:storeId/settings', auth_middleware_1.authenticateToken, async (req, res) => {
    const { storeId } = req.params;
    const result = await (0, db_1.query)('SELECT settings, plan FROM shops WHERE shop_id = $1', [storeId]);
    if (result.rows.length === 0)
        return res.status(404).json({ error: 'Store not found' });
    res.json(result.rows[0]);
});
// Update Settings
router.put('/:storeId/settings', auth_middleware_1.authenticateToken, async (req, res) => {
    const { storeId } = req.params;
    const { settings } = req.body; // { botName, tone, escalationEmail, timezone }
    try {
        const result = await (0, db_1.query)('UPDATE shops SET settings = $1 WHERE shop_id = $2 RETURNING settings', [settings, storeId]);
        res.json(result.rows[0]);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
exports.default = router;
