"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const chat_engine_service_1 = require("../services/chat-engine.service");
const widget_service_1 = require("../services/widget.service");
const db_1 = require("../db");
const auth_middleware_1 = require("../middleware/auth.middleware");
const router = (0, express_1.Router)();
// Send message from Widget
router.post('/message', async (req, res) => {
    const { shopId, message, customerId, metadata, widgetKey } = req.body;
    if (!message) {
        return res.status(400).json({ error: 'message is required' });
    }
    try {
        let finalShopId = shopId;
        // Module 2.1: Validate widgetKey
        if (widgetKey) {
            const widget = await widget_service_1.WidgetService.getWidget(widgetKey);
            console.log(`[Chat] Validating Widget Key: ${widgetKey}`, widget);
            // Loose check for is_active matching false explicitly, or widget missing
            if (!widget || widget.is_active === false) {
                console.warn(`[Chat] Invalid widget key or inactive: ${widgetKey}`);
                return res.status(403).json({ error: 'Invalid or inactive widget key' });
            }
            finalShopId = widget.shop_id;
        }
        if (!finalShopId) {
            return res.status(400).json({ error: 'shopId or widgetKey is required' });
        }
        const result = await chat_engine_service_1.ChatEngineService.processMessage(finalShopId, message, metadata);
        // Note: Conversation and Message logging is currently inside ChatEngineService or handled as a side-effect
        res.json(result);
    }
    catch (err) {
        console.error('Chat Route Error:', err);
        res.status(500).json({ error: err.message });
    }
});
// Admin: List conversations
router.get('/conversations', auth_middleware_1.authenticateToken, async (req, res) => {
    try {
        const result = await (0, db_1.query)('SELECT * FROM conversations ORDER BY created_at DESC LIMIT 50');
        res.json(result.rows);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
exports.default = router;
