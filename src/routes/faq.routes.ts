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
    const { question, answer, category } = req.body;
    
    // In real app, generate embedding here
    const result = await query(
        'INSERT INTO faqs (shop_id, question, answer, category, is_active) VALUES ($1, $2, $3, $4, true) RETURNING *',
        [storeId, question, answer, category || 'general']
    );
    res.status(201).json(result.rows[0]);
});

router.put('/:storeId/faqs/:id', authenticateToken, async (req, res) => {
    const { storeId, id } = req.params;
    const { question, answer, category, is_active } = req.body;

    const result = await query(
        `UPDATE faqs 
         SET question = $1, answer = $2, category = $3, is_active = COALESCE($4, is_active)
         WHERE id = $5 AND shop_id = $6
         RETURNING *`,
        [question, answer, category, is_active, id, storeId]
    );

    if (result.rows.length === 0) {
        return res.status(404).json({ error: 'FAQ not found' });
    }

    res.json(result.rows[0]);
});

router.delete('/:storeId/faqs/:id', authenticateToken, async (req, res) => {
    const { storeId, id } = req.params;
    
    const result = await query(
        'DELETE FROM faqs WHERE id = $1 AND shop_id = $2 RETURNING *',
        [id, storeId]
    );

    if (result.rows.length === 0) {
        return res.status(404).json({ error: 'FAQ not found' });
    }

    res.json({ success: true });
});

export default router;
