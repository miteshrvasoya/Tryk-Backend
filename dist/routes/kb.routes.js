"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_middleware_1 = require("../middleware/auth.middleware");
const kb_ingestion_service_1 = require("../services/kb-ingestion.service");
const kb_query_service_1 = require("../services/kb-query.service");
const kb_retrieval_service_1 = require("../services/kb-retrieval.service");
const kb_reranker_service_1 = require("../services/kb-reranker.service");
const kb_answer_service_1 = require("../services/kb-answer.service");
const db_1 = require("../db");
const router = (0, express_1.Router)();
/**
 * POST /api/kb/ingest
 * Trigger manual knowledge ingestion for a shop
 */
router.post('/ingest', auth_middleware_1.authenticateToken, async (req, res) => {
    try {
        const { shopId, baseUrl, options } = req.body;
        if (!shopId || !baseUrl) {
            return res.status(400).json({ error: 'shopId and baseUrl are required' });
        }
        // Verify user has access to this shop
        const userShops = req.user.shop_ids || [];
        if (!userShops.includes(shopId)) {
            return res.status(403).json({ error: 'Access denied for this shop' });
        }
        console.log(`[KB Routes] Starting ingestion for ${shopId}`);
        // Start ingestion (async - don't wait for completion)
        kb_ingestion_service_1.KnowledgeIngestionService.ingestWebsite(shopId, baseUrl, options)
            .then(() => {
            console.log(`[KB Routes] Ingestion completed for ${shopId}`);
        })
            .catch((error) => {
            console.error(`[KB Routes] Ingestion failed for ${shopId}:`, error);
        });
        res.json({
            message: 'Knowledge ingestion started',
            shopId,
            baseUrl
        });
    }
    catch (error) {
        console.error('[KB Routes] Ingestion error:', error);
        res.status(500).json({ error: error.message });
    }
});
/**
 * POST /api/kb/query
 * Full query pipeline with retrieval and answer generation
 */
router.post('/query', auth_middleware_1.authenticateToken, async (req, res) => {
    const startTime = Date.now();
    try {
        const { shopId, query: userQuery, conversationId } = req.body;
        if (!shopId || !userQuery) {
            return res.status(400).json({ error: 'shopId and query are required' });
        }
        // Verify user has access to this shop
        const userShops = req.user.shop_ids || [];
        if (!userShops.includes(shopId)) {
            return res.status(403).json({ error: 'Access denied for this shop' });
        }
        console.log(`[KB Routes] Processing query for ${shopId}: "${userQuery}"`);
        // Step 1: Process query
        const normalizedQuery = await kb_query_service_1.KBQueryService.processQuery(shopId, userQuery);
        // Step 2: Check if should use Shopify API instead
        if (kb_query_service_1.KBQueryService.shouldUseShopifyAPI(normalizedQuery.intent, userQuery)) {
            const orderNumber = kb_query_service_1.KBQueryService.extractOrderNumber(userQuery);
            if (orderNumber) {
                // This would integrate with existing Shopify service
                return res.json({
                    answer: `I'll help you track order #${orderNumber}. Let me check the status...`,
                    confidence: 0.95,
                    intent: 'order_status',
                    sources: [],
                    responseTime: Date.now() - startTime,
                    requiresShopifyAPI: true,
                    orderNumber
                });
            }
        }
        // Step 3: Hybrid retrieval
        const retrievalResult = await kb_retrieval_service_1.KBRetrievalService.hybridSearch(shopId, normalizedQuery.normalized, normalizedQuery.embedding, {
            limit: 10,
            includeKeywordSearch: true
        });
        // Step 4: Rerank results
        const rerankedDocuments = await kb_reranker_service_1.KBRerankerService.rerankByRelevance(userQuery, retrievalResult.documents, normalizedQuery.intent, {
            maxResults: 5,
            boostRecent: true,
            boostTitleMatches: true
        });
        // Step 5: Generate grounded answer
        const answer = await kb_answer_service_1.KBAnswerService.generateGroundedAnswer(shopId, userQuery, rerankedDocuments, normalizedQuery.intent);
        // Step 6: Log query for analytics
        const totalTime = Date.now() - startTime;
        await kb_query_service_1.KBQueryService.logQuery(shopId, normalizedQuery, answer, totalTime);
        res.json({
            ...answer,
            retrievalMethod: retrievalResult.method,
            documentsFound: retrievalResult.totalFound,
            processingTime: totalTime
        });
    }
    catch (error) {
        console.error('[KB Routes] Query error:', error);
        res.status(500).json({ error: error.message });
    }
});
/**
 * GET /api/kb/search
 * Direct KB search without answer generation
 */
router.get('/search', auth_middleware_1.authenticateToken, async (req, res) => {
    try {
        const { shopId, q: query, limit = 10, sourceType } = req.query;
        if (!shopId || !query) {
            return res.status(400).json({ error: 'shopId and query are required' });
        }
        // Verify user has access to this shop
        const userShops = req.user.shop_ids || [];
        if (!userShops.includes(shopId)) {
            return res.status(403).json({ error: 'Access denied for this shop' });
        }
        // Process query
        const normalizedQuery = await kb_query_service_1.KBQueryService.normalizeQuery(query);
        // Generate embedding
        const embedding = await kb_query_service_1.KBQueryService.generateQueryEmbedding(normalizedQuery.normalized);
        // Search
        const retrievalResult = await kb_retrieval_service_1.KBRetrievalService.hybridSearch(shopId, normalizedQuery.normalized, embedding, {
            limit: parseInt(limit),
            sourceTypes: sourceType ? [sourceType] : undefined
        });
        res.json({
            query: query,
            normalizedQuery: normalizedQuery.normalized,
            intent: normalizedQuery.intent,
            documents: retrievalResult.documents,
            method: retrievalResult.method,
            totalFound: retrievalResult.totalFound,
            queryTime: retrievalResult.queryTime
        });
    }
    catch (error) {
        console.error('[KB Routes] Search error:', error);
        res.status(500).json({ error: error.message });
    }
});
/**
 * GET /api/kb/documents
 * List knowledge base documents for a shop
 */
router.get('/documents', auth_middleware_1.authenticateToken, async (req, res) => {
    try {
        const { shopId, sourceType, limit = 50, offset = 0 } = req.query;
        if (!shopId) {
            return res.status(400).json({ error: 'shopId is required' });
        }
        // Verify user has access to this shop
        const userShops = req.user.shop_ids || [];
        if (!userShops.includes(shopId)) {
            return res.status(403).json({ error: 'Access denied for this shop' });
        }
        let sql = `
      SELECT 
        id, source_type, source_url, title, content, 
        token_count, metadata, created_at, updated_at
      FROM kb_documents 
      WHERE shop_id = $1
    `;
        const params = [shopId];
        if (sourceType) {
            sql += ` AND source_type = $${params.length + 1}`;
            params.push(sourceType);
        }
        sql += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
        params.push(parseInt(limit), parseInt(offset));
        const result = await (0, db_1.query)(sql, params);
        // Get total count
        let countSql = `SELECT COUNT(*) FROM kb_documents WHERE shop_id = $1`;
        const countParams = [shopId];
        if (sourceType) {
            countSql += ` AND source_type = $${countParams.length + 1}`;
            countParams.push(sourceType);
        }
        const countResult = await (0, db_1.query)(countSql, countParams);
        const total = parseInt(countResult.rows[0].count);
        res.json({
            documents: result.rows,
            pagination: {
                limit: parseInt(limit),
                offset: parseInt(offset),
                total
            }
        });
    }
    catch (error) {
        console.error('[KB Routes] Documents error:', error);
        res.status(500).json({ error: error.message });
    }
});
/**
 * DELETE /api/kb/documents/:id
 * Delete a specific knowledge base document
 */
router.delete('/documents/:id', auth_middleware_1.authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        // Get document to verify shop ownership
        const docResult = await (0, db_1.query)('SELECT shop_id FROM kb_documents WHERE id = $1', [id]);
        if (docResult.rows.length === 0) {
            return res.status(404).json({ error: 'Document not found' });
        }
        const documentShopId = docResult.rows[0].shop_id;
        // Verify user has access to this shop
        const userShops = req.user.shop_ids || [];
        if (!userShops.includes(documentShopId)) {
            return res.status(403).json({ error: 'Access denied for this document' });
        }
        // Delete document
        await (0, db_1.query)('DELETE FROM kb_documents WHERE id = $1', [id]);
        res.json({ message: 'Document deleted successfully' });
    }
    catch (error) {
        console.error('[KB Routes] Delete error:', error);
        res.status(500).json({ error: error.message });
    }
});
/**
 * POST /api/kb/reindex
 * Re-index all knowledge base documents for a shop
 */
router.post('/reindex', auth_middleware_1.authenticateToken, async (req, res) => {
    try {
        const { shopId } = req.body;
        if (!shopId) {
            return res.status(400).json({ error: 'shopId is required' });
        }
        // Verify user has access to this shop
        const userShops = req.user.shop_ids || [];
        if (!userShops.includes(shopId)) {
            return res.status(403).json({ error: 'Access denied for this shop' });
        }
        console.log(`[KB Routes] Starting reindex for ${shopId}`);
        // Get all documents for this shop
        const docsResult = await (0, db_1.query)('SELECT id, content FROM kb_documents WHERE shop_id = $1', [shopId]);
        console.log(`[KB Routes] Reindexing ${docsResult.rows.length} documents`);
        // Re-generate embeddings for all documents
        for (const doc of docsResult.rows) {
            try {
                const embedding = await kb_query_service_1.KBQueryService.generateQueryEmbedding(doc.content);
                await (0, db_1.query)('UPDATE kb_documents SET embedding = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [`[${embedding.join(',')}]`, doc.id]);
            }
            catch (error) {
                console.error(`[KB Routes] Failed to reindex document ${doc.id}:`, error.message);
            }
        }
        res.json({
            message: 'Reindex completed',
            documentsProcessed: docsResult.rows.length
        });
    }
    catch (error) {
        console.error('[KB Routes] Reindex error:', error);
        res.status(500).json({ error: error.message });
    }
});
/**
 * GET /api/kb/analytics
 * Get knowledge base analytics for a shop
 */
router.get('/analytics', auth_middleware_1.authenticateToken, async (req, res) => {
    try {
        const { shopId, days = 7 } = req.query;
        if (!shopId) {
            return res.status(400).json({ error: 'shopId is required' });
        }
        // Verify user has access to this shop
        const userShops = req.user.shop_ids || [];
        if (!userShops.includes(shopId)) {
            return res.status(403).json({ error: 'Access denied for this shop' });
        }
        // Get query analytics
        const queryAnalytics = await kb_query_service_1.KBQueryService.getQueryAnalytics(shopId, parseInt(days));
        // Get top queries
        const topQueries = await kb_query_service_1.KBQueryService.getTopQueries(shopId, 10);
        // Get document counts by type
        const docCountsResult = await (0, db_1.query)(`
      SELECT source_type, COUNT(*) as count
      FROM kb_documents 
      WHERE shop_id = $1
      GROUP BY source_type
      ORDER BY count DESC
    `, [shopId]);
        res.json({
            queryAnalytics,
            topQueries,
            documentCounts: docCountsResult.rows,
            period: `${days} days`
        });
    }
    catch (error) {
        console.error('[KB Routes] Analytics error:', error);
        res.status(500).json({ error: error.message });
    }
});
exports.default = router;
