"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_middleware_1 = require("../middleware/auth.middleware");
const router = (0, express_1.Router)();
const analytics_service_1 = require("../services/analytics.service");
router.get('/:storeId/analytics', auth_middleware_1.authenticateToken, async (req, res) => {
    const { storeId } = req.params;
    try {
        const stats = await analytics_service_1.AnalyticsService.getDashboardMetrics(storeId);
        res.json(stats);
    }
    catch (error) {
        console.error('Dashboard Analytics Error:', error);
        res.status(500).json({ error: error.message });
    }
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
