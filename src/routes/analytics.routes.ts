import { Router } from 'express';
import { query } from '../db';
import { authenticateToken } from '../middleware/auth.middleware';

const router = Router();

import { AnalyticsService } from '../services/analytics.service';

router.get('/:storeId/analytics', authenticateToken, async (req, res) => {
    const { storeId } = req.params;
    
    try {
        const stats = await AnalyticsService.getDashboardMetrics(storeId);
        res.json(stats);
    } catch (error: any) {
        console.error('Dashboard Analytics Error:', error);
        res.status(500).json({ error: error.message });
    }
});

router.get('/:storeId/analytics/volume', authenticateToken, async (req, res) => {
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

router.get('/:storeId/analytics/intents', authenticateToken, async (req, res) => {
    // Mock intent distribution
    const data = [
        { intent: 'order_status', count: 45 },
        { intent: 'product_question', count: 30 },
        { intent: 'return_request', count: 15 },
        { intent: 'other', count: 10 }
    ];
    res.json(data);
});

export default router;
