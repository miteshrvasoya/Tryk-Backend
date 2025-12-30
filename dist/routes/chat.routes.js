"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const support_service_1 = require("../services/support.service");
const db_1 = require("../db");
const router = (0, express_1.Router)();
// Send message from Widget
router.post('/send', async (req, res) => {
    const { storeId, conversationId, message, customerId } = req.body;
    try {
        const response = await (0, support_service_1.handleIncomingMessage)({
            shopId: storeId,
            customerId: customerId, // Ensure type matches what support service expects
            messageReceived: message,
            accessToken: 'mock_token'
        });
        res.json({ response, conversationId });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// Admin: List conversations
const auth_middleware_1 = require("../middleware/auth.middleware");
router.get('/conversations', auth_middleware_1.authenticateToken, async (req, res) => {
    const result = await (0, db_1.query)('SELECT * FROM conversations ORDER BY created_at DESC LIMIT 50');
    res.json(result.rows);
});
exports.default = router;
