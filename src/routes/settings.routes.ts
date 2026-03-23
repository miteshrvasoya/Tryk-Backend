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
    const { settings, name } = req.body; 
    
    try {
        // First, handle the shop name if provided
        if (name) {
            await query('UPDATE shops SET name = $1 WHERE shop_id = $2', [name, storeId]);
        }

        // Then, merge the specifically provided settings into the existing settings JSONB
        // Using the || operator in PG for JSONB merge
        const result = await query(
            `UPDATE shops 
             SET settings = settings || $1::jsonb 
             WHERE shop_id = $2 
             RETURNING settings, name`,
            [settings || {}, storeId]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Store not found' });
        }
        
        res.json(result.rows[0]);
    } catch (err: any) {
        console.error('Error updating settings:', err);
        res.status(500).json({ error: err.message });
    }
});

export default router;
