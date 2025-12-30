import { Router } from 'express';
import { query } from '../db';
import { authenticateToken } from '../middleware/auth.middleware';

const router = Router();

router.get('/:storeId/faqs', authenticateToken, async (req, res) => {
    const { storeId } = req.params;
    const result = await query('SELECT * FROM faqs WHERE shop_id = $1', [storeId]);
    res.json(result.rows);
});

router.post('/:storeId/faqs', authenticateToken, async (req, res) => {
    const { storeId } = req.params;
    const { question, answer } = req.body;
    
    // In real app, generate embedding here
    const result = await query(
        'INSERT INTO faqs (shop_id, question, answer) VALUES ($1, $2, $3) RETURNING *',
        [storeId, question, answer]
    );
    res.status(201).json(result.rows[0]);
});

export default router;
