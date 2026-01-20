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

import fs from 'fs';
import multer from 'multer';
import { parse } from 'csv-parse/sync';

const upload = multer({ dest: 'uploads/' });

router.post('/:storeId/faqs/import', authenticateToken, upload.single('file'), async (req, res) => {
    const { storeId } = req.params;
    
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }

    const filePath = req.file.path;
    const entries: any[] = [];

    try {
        const fileContent = fs.readFileSync(filePath, 'utf-8');

        // Determine format based on extension or mimetype (simple extension check here)
        // Multer doesn't keep extension by default in 'dest', so we might check originalname
        const isJson = req.file.originalname.toLowerCase().endsWith('.json');

        if (isJson) {
            const data = JSON.parse(fileContent);
            if (Array.isArray(data)) {
                entries.push(...data);
            }
        } else {
            // Assume CSV
            const records = parse(fileContent, {
                columns: true,
                skip_empty_lines: true,
                trim: true
            });
            entries.push(...records);
        }

        // Validate and Insert
        // Using a transaction would be better, but loop insert is acceptable for MVP volume
        const inserted = [];
        let skipped = 0;

        for (const entry of entries) {
            // Flexible column names: question/Question, answer/Answer
            const q = entry.question || entry.Question || entry.prompt;
            const a = entry.answer || entry.Answer || entry.response;
            const cat = entry.category || entry.Category || 'general';

            if (q && a) {
                const result = await query(
                    'INSERT INTO faqs (shop_id, question, answer, category, is_active) VALUES ($1, $2, $3, $4, true) RETURNING *',
                    [storeId, q, a, cat]
                );
                inserted.push(result.rows[0]);
            } else {
                skipped++;
            }
        }

        res.json({
            success: true,
            total: entries.length,
            imported: inserted.length,
            skipped
        });

    } catch (error: any) {
        console.error("Import error:", error);
        res.status(500).json({ error: 'Failed to process file: ' + error.message });
    } finally {
        // Cleanup
        try {
            fs.unlinkSync(filePath);
        } catch (e) {
            console.error("Failed to delete temp file", e);
        }
    }
});

export default router;
