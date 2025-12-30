"use strict";
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
    const { question, answer } = req.body;
    // In real app, generate embedding here
    const result = await (0, db_1.query)('INSERT INTO faqs (shop_id, question, answer) VALUES ($1, $2, $3) RETURNING *', [storeId, question, answer]);
    res.status(201).json(result.rows[0]);
});
exports.default = router;
