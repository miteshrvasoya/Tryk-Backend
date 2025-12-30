"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_middleware_1 = require("../middleware/auth.middleware");
const router = (0, express_1.Router)();
router.get('/:storeId/analytics', auth_middleware_1.authenticateToken, async (req, res) => {
    const { storeId } = req.params;
    // In real implementation, these would be robust SQL queries on 'conversations' and 'messages'
    // 1. Overview Stats
    const stats = {
        totalConversations: 120,
        aiHandledCount: 100,
        escalatedCount: 20,
        avgConfidence: 0.92,
        messagesProcessed: 543
    };
    res.json(stats);
});
router.get('/:storeId/analytics/volume', auth_middleware_1.authenticateToken, async (req, res) => {
    // Mock daily volume
    const data = [
        { date: '2025-12-01', count: 12 },
        { date: '2025-12-02', count: 15 },
        { date: '2025-12-03', count: 8 },
        { date: '2025-12-04', count: 20 },
        { date: '2025-12-05', count: 18 },
    ];
    res.json(data);
});
router.get('/:storeId/analytics/intents', auth_middleware_1.authenticateToken, async (req, res) => {
    // Mock intent distribution
    const data = [
        { intent: 'order_status', count: 45 },
        { intent: 'product_question', count: 30 },
        { intent: 'return_request', count: 15 },
        { intent: 'other', count: 10 }
    ];
    res.json(data);
});
exports.default = router;
