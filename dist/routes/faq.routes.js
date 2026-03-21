"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const db_1 = require("../db");
const auth_middleware_1 = require("../middleware/auth.middleware");
const router = (0, express_1.Router)();
router.get('/:storeId/faqs', auth_middleware_1.authenticateToken, async (req, res) => {
    const { storeId } = req.params;
    const result = await (0, db_1.query)('SELECT * FROM faqs WHERE shop_id = $1', [storeId]);
    res.json(result.rows);
});
router.post('/:storeId/faqs', auth_middleware_1.authenticateToken, async (req, res) => {
    const { storeId } = req.params;
    const { question, answer, category } = req.body;
    // In real app, generate embedding here
    const result = await (0, db_1.query)('INSERT INTO faqs (shop_id, question, answer, category, is_active) VALUES ($1, $2, $3, $4, true) RETURNING *', [storeId, question, answer, category || 'general']);
    res.status(201).json(result.rows[0]);
});
router.put('/:storeId/faqs/:id', auth_middleware_1.authenticateToken, async (req, res) => {
    const { storeId, id } = req.params;
    const { question, answer, category, is_active } = req.body;
    const result = await (0, db_1.query)(`UPDATE faqs 
         SET question = $1, answer = $2, category = $3, is_active = COALESCE($4, is_active)
         WHERE id = $5 AND shop_id = $6
         RETURNING *`, [question, answer, category, is_active, id, storeId]);
    if (result.rows.length === 0) {
        return res.status(404).json({ error: 'FAQ not found' });
    }
    res.json(result.rows[0]);
});
router.delete('/:storeId/faqs/:id', auth_middleware_1.authenticateToken, async (req, res) => {
    const { storeId, id } = req.params;
    const result = await (0, db_1.query)('DELETE FROM faqs WHERE id = $1 AND shop_id = $2 RETURNING *', [id, storeId]);
    if (result.rows.length === 0) {
        return res.status(404).json({ error: 'FAQ not found' });
    }
    res.json({ success: true });
});
const fs_1 = __importDefault(require("fs"));
const multer_1 = __importDefault(require("multer"));
const sync_1 = require("csv-parse/sync");
const upload = (0, multer_1.default)({ dest: 'uploads/' });
router.post('/:storeId/faqs/import', auth_middleware_1.authenticateToken, upload.single('file'), async (req, res) => {
    const { storeId } = req.params;
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }
    const filePath = req.file.path;
    const entries = [];
    try {
        const fileContent = fs_1.default.readFileSync(filePath, 'utf-8');
        // Determine format based on extension or mimetype (simple extension check here)
        // Multer doesn't keep extension by default in 'dest', so we might check originalname
        const isJson = req.file.originalname.toLowerCase().endsWith('.json');
        if (isJson) {
            const data = JSON.parse(fileContent);
            if (Array.isArray(data)) {
                entries.push(...data);
            }
        }
        else {
            // Assume CSV
            const records = (0, sync_1.parse)(fileContent, {
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
                const result = await (0, db_1.query)('INSERT INTO faqs (shop_id, question, answer, category, is_active) VALUES ($1, $2, $3, $4, true) RETURNING *', [storeId, q, a, cat]);
                inserted.push(result.rows[0]);
            }
            else {
                skipped++;
            }
        }
        res.json({
            success: true,
            total: entries.length,
            imported: inserted.length,
            skipped
        });
    }
    catch (error) {
        console.error("Import error:", error);
        res.status(500).json({ error: 'Failed to process file: ' + error.message });
    }
    finally {
        // Cleanup
        try {
            fs_1.default.unlinkSync(filePath);
        }
        catch (e) {
            console.error("Failed to delete temp file", e);
        }
    }
});
exports.default = router;
