import { Router } from 'express';
import { query } from '../db';
import { authenticateToken } from '../middleware/auth.middleware';

const router = Router();

// Get Settings
router.get('/:storeId/settings', authenticateToken, async (req, res) => {
    const { storeId } = req.params;
    const result = await query('SELECT settings, plan FROM shops WHERE shop_id = $1', [storeId]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Store not found' });
    res.json(result.rows[0]);
});

// Update Settings
router.put('/:storeId/settings', authenticateToken, async (req, res) => {
    const { storeId } = req.params;
    const { settings } = req.body; // { botName, tone, escalationEmail, timezone }
    
    try {
        const result = await query(
            'UPDATE shops SET settings = $1 WHERE shop_id = $2 RETURNING settings',
            [settings, storeId]
        );
        res.json(result.rows[0]);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
