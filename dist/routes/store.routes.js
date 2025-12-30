"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const db_1 = require("../db");
const auth_middleware_1 = require("../middleware/auth.middleware");
const faq_service_1 = require("../services/faq.service");
const router = (0, express_1.Router)();
// List stores
router.get('/', auth_middleware_1.authenticateToken, async (req, res) => {
    try {
        // In real app, filter by user's access
        const result = await (0, db_1.query)('SELECT * FROM shops');
        res.json(result.rows);
    }
    catch (err) {
        res.status(500).json({ error: 'Internal error' });
    }
});
// Rescan FAQs (Mock)
router.post('/:storeId/rescan', auth_middleware_1.authenticateToken, async (req, res) => {
    const { storeId } = req.params;
    const { websiteUrl } = req.body;
    // Trigger in bg
    (0, faq_service_1.scanAndLearnFAQ)(storeId, websiteUrl).then(output => {
        console.log(`Scan complete for ${storeId}:`, output);
    }).catch(err => console.error(err));
    res.json({ status: 'scanning', estimatedTime: '2 min' });
});
const shopify_service_1 = require("../services/shopify.service");
router.post('/:storeId/setup-webhook', auth_middleware_1.authenticateToken, async (req, res) => {
    const { storeId } = req.params;
    // In real app, fetch access token for storeId from DB
    const accessToken = 'mock_token';
    try {
        await (0, shopify_service_1.registerWebhooks)(storeId, accessToken);
        res.json({ success: true });
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    }
});
exports.default = router;
