"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const faq_scan_service_1 = require("../services/faq-scan.service");
const auth_middleware_1 = require("../middleware/auth.middleware");
const db_1 = require("../db");
const router = (0, express_1.Router)();
// Start scan
router.post('/scan', auth_middleware_1.authenticateToken, async (req, res) => {
    try {
        const { shopId, websiteUrl, crawlDepth } = req.body;
        if (!shopId || !websiteUrl) {
            return res.status(400).json({ error: 'shopId and websiteUrl are required' });
        }
        const result = await faq_scan_service_1.FAQScanService.startScan(shopId, websiteUrl, crawlDepth);
        res.status(202).json(result);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// Get scan results (drafts)
router.get('/scan/:jobId/results', auth_middleware_1.authenticateToken, async (req, res) => {
    try {
        const { jobId } = req.params;
        const drafts = await (0, db_1.query)('SELECT * FROM faq_drafts WHERE job_id = $1', [jobId]);
        const job = await faq_scan_service_1.FAQScanService.getJobStatus(parseInt(jobId));
        res.json({
            jobId,
            status: job?.status,
            results: drafts.rows
        });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// Approve batch
router.post('/approve-batch', auth_middleware_1.authenticateToken, async (req, res) => {
    try {
        const { jobId, approvedIds } = req.body; // approvedIds is array of draft IDs
        if (!approvedIds || !Array.isArray(approvedIds)) {
            return res.status(400).json({ error: 'approvedIds array is required' });
        }
        // Fetch drafts
        const placeholders = approvedIds.map((_, i) => `$${i + 1}`).join(',');
        const draftsResult = await (0, db_1.query)(`SELECT * FROM faq_drafts WHERE id IN (${placeholders}) AND status = 'pending_review'`, approvedIds);
        // Move to faqs table
        for (const draft of draftsResult.rows) {
            // Very simple mapping for now
            // In real app, generate embedding here
            await (0, db_1.query)(`
                INSERT INTO faqs (shop_id, question, answer, category, source_url, is_active)
                VALUES ($1, $2, $3, $4, $5, true)
            `, [draft.shop_id, draft.question || "N/A", draft.answer, draft.category, draft.source_url]);
            // Update draft status
            await (0, db_1.query)('UPDATE faq_drafts SET status = $1 WHERE id = $2', ['approved', draft.id]);
        }
        res.json({ success: true, count: draftsResult.rows.length });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// Reject batch
router.post('/reject-batch', auth_middleware_1.authenticateToken, async (req, res) => {
    try {
        const { jobId, rejectedIds } = req.body;
        if (!rejectedIds || !Array.isArray(rejectedIds)) {
            return res.status(400).json({ error: 'rejectedIds array is required' });
        }
        const placeholders = rejectedIds.map((_, i) => `$${i + 1}`).join(',');
        // Update draft status to rejected
        await (0, db_1.query)(`UPDATE faq_drafts SET status = 'rejected' WHERE id IN (${placeholders})`, rejectedIds);
        res.json({ success: true });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
exports.default = router;
