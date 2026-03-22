import { Router } from 'express';
import { FAQScanService } from '../services/faq-scan.service';
import { authenticateToken } from '../middleware/auth.middleware';
import { query } from '../db';
import { KBQueryService } from '../services/kb-query.service';
import { KnowledgeIngestionService } from '../services/kb-ingestion.service';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

// Start scan
router.post('/scan', authenticateToken, async (req, res) => {
    try {
        const userId = (req as any).user.id;
        const { shopId, websiteUrl, crawlDepth } = req.body;
        if (!websiteUrl) {
            return res.status(400).json({ error: 'websiteUrl is required' });
        }
        // shopId is now optional
        const result = await FAQScanService.startScan(userId, shopId || null, websiteUrl, crawlDepth);
        res.status(202).json(result);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Get scan results (drafts)
router.get('/scan/:jobId/results', authenticateToken, async (req, res) => {
    try {
        const { jobId } = req.params;
        
        // Basic validation: jobId should be numeric (BigInt)
        if (!/^\d+$/.test(jobId)) {
            return res.status(404).json({ error: 'Invalid Job ID format' });
        }

        const drafts = await query('SELECT * FROM faq_drafts WHERE job_id = $1', [jobId]);
        const job = await FAQScanService.getJobStatus(parseInt(jobId));
        
        res.json({
            jobId,
            status: job?.status,
            results: drafts.rows
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Approve batch
router.post('/approve-batch', authenticateToken, async (req, res) => {
    try {
        const { jobId, approvedIds } = req.body; // approvedIds is array of draft IDs
        
        if (!approvedIds || !Array.isArray(approvedIds)) {
             return res.status(400).json({ error: 'approvedIds array is required' });
        }

        // Fetch drafts
        const placeholders = approvedIds.map((_, i) => `$${i + 1}`).join(',');
        const draftsResult = await query(
            `SELECT * FROM faq_drafts WHERE id IN (${placeholders}) AND status = 'pending_review'`,
            approvedIds
        );

        // Move to faqs and kb_documents tables
        for (const draft of draftsResult.rows) {
            const combinedContent = (draft.question && draft.question !== 'Extracted Content') 
                ? draft.question + "\n\n" + draft.answer 
                : draft.answer;
                
            const embedding = await KBQueryService.generateQueryEmbedding(combinedContent);
            const tokenCount = KnowledgeIngestionService.estimateTokenCount(combinedContent);

            await query(`
                INSERT INTO faqs (user_id, shop_id, question, answer, category, source_url, is_active)
                VALUES ($1, $2, $3, $4, $5, $6, true)
            `, [draft.user_id, draft.shop_id, draft.question || "N/A", draft.answer, draft.category, draft.source_url]);

            await query(`
                INSERT INTO kb_documents (id, user_id, shop_id, source_type, source_url, title, content, embedding, token_count, metadata)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            `, [
                uuidv4(),
                draft.user_id,
                draft.shop_id,
                draft.category || 'faq',
                draft.source_url,
                draft.question,
                combinedContent,
                `[${embedding.join(',')}]`,
                tokenCount,
                JSON.stringify({ isDraftApproved: true, draftId: draft.id })
            ]);

            // Update draft status
            await query('UPDATE faq_drafts SET status = $1 WHERE id = $2', ['approved', draft.id]);
        }

        res.json({ success: true, count: draftsResult.rows.length });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Reject batch
router.post('/reject-batch', authenticateToken, async (req, res) => {
    try {
        const { jobId, rejectedIds } = req.body;
        
        if (!rejectedIds || !Array.isArray(rejectedIds)) {
             return res.status(400).json({ error: 'rejectedIds array is required' });
        }

        const placeholders = rejectedIds.map((_, i) => `$${i + 1}`).join(',');
        
        // Update draft status to rejected
        await query(
            `UPDATE faq_drafts SET status = 'rejected' WHERE id IN (${placeholders})`,
            rejectedIds
        );

        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

export default router;
