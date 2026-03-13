import { Router } from 'express';
import { authenticateToken } from '../middleware/auth.middleware';
import { KnowledgeIngestionService } from '../services/kb-ingestion.service';
import { KBQueryService } from '../services/kb-query.service';
import { KBRetrievalService } from '../services/kb-retrieval.service';
import { KBRerankerService } from '../services/kb-reranker.service';
import { KBAnswerService } from '../services/kb-answer.service';
import { query } from '../db';

const router = Router();

/**
 * POST /api/kb/ingest
 * Trigger manual knowledge ingestion for a shop
 */
router.post('/ingest', authenticateToken, async (req, res) => {
  try {
    const { shopId, baseUrl, options } = req.body;
    
    if (!shopId || !baseUrl) {
      return res.status(400).json({ error: 'shopId and baseUrl are required' });
    }

    // Verify user has access to this shop
    const userShops = (req as any).user.shop_ids || [];
    if (!userShops.includes(shopId)) {
      return res.status(403).json({ error: 'Access denied for this shop' });
    }

    console.log(`[KB Routes] Starting ingestion for ${shopId}`);
    
    // Start ingestion (async - don't wait for completion)
    KnowledgeIngestionService.ingestWebsite(shopId, baseUrl, options)
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

  } catch (error: any) {
    console.error('[KB Routes] Ingestion error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/kb/query
 * Full query pipeline with retrieval and answer generation
 */
router.post('/query', authenticateToken, async (req, res) => {
  const startTime = Date.now();
  
  try {
    const { shopId, query: userQuery, conversationId } = req.body;
    
    if (!shopId || !userQuery) {
      return res.status(400).json({ error: 'shopId and query are required' });
    }

    // Verify user has access to this shop
    const userShops = (req as any).user.shop_ids || [];
    if (!userShops.includes(shopId)) {
      return res.status(403).json({ error: 'Access denied for this shop' });
    }

    console.log(`[KB Routes] Processing query for ${shopId}: "${userQuery}"`);

    // Step 1: Process query
    const normalizedQuery = await KBQueryService.processQuery(shopId, userQuery);

    // Step 2: Check if should use Shopify API instead
    if (KBQueryService.shouldUseShopifyAPI(normalizedQuery.intent, userQuery)) {
      const orderNumber = KBQueryService.extractOrderNumber(userQuery);
      
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
    const retrievalResult = await KBRetrievalService.hybridSearch(
      shopId,
      normalizedQuery.normalized,
      normalizedQuery.embedding!,
      {
        limit: 10,
        includeKeywordSearch: true
      }
    );

    // Step 4: Rerank results
    const rerankedDocuments = await KBRerankerService.rerankByRelevance(
      userQuery,
      retrievalResult.documents,
      normalizedQuery.intent,
      {
        maxResults: 5,
        boostRecent: true,
        boostTitleMatches: true
      }
    );

    // Step 5: Generate grounded answer
    const answer = await KBAnswerService.generateGroundedAnswer(
      shopId,
      userQuery,
      rerankedDocuments,
      normalizedQuery.intent
    );

    // Step 6: Log query for analytics
    const totalTime = Date.now() - startTime;
    await KBQueryService.logQuery(shopId, normalizedQuery, answer, totalTime);

    res.json({
      ...answer,
      retrievalMethod: retrievalResult.method,
      documentsFound: retrievalResult.totalFound,
      processingTime: totalTime
    });

  } catch (error: any) {
    console.error('[KB Routes] Query error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/kb/search
 * Direct KB search without answer generation
 */
router.get('/search', authenticateToken, async (req, res) => {
  try {
    const { shopId, q: query, limit = 10, sourceType } = req.query;
    
    if (!shopId || !query) {
      return res.status(400).json({ error: 'shopId and query are required' });
    }

    // Verify user has access to this shop
    const userShops = (req as any).user.shop_ids || [];
    if (!userShops.includes(shopId)) {
      return res.status(403).json({ error: 'Access denied for this shop' });
    }

    // Process query
    const normalizedQuery = await KBQueryService.normalizeQuery(query as string);
    
    // Generate embedding
    const embedding = await KBQueryService.generateQueryEmbedding(normalizedQuery.normalized);

    // Search
    const retrievalResult = await KBRetrievalService.hybridSearch(
      shopId as string,
      normalizedQuery.normalized,
      embedding,
      {
        limit: parseInt(limit as string),
        sourceTypes: sourceType ? [sourceType as string] : undefined
      }
    );

    res.json({
      query: query,
      normalizedQuery: normalizedQuery.normalized,
      intent: normalizedQuery.intent,
      documents: retrievalResult.documents,
      method: retrievalResult.method,
      totalFound: retrievalResult.totalFound,
      queryTime: retrievalResult.queryTime
    });

  } catch (error: any) {
    console.error('[KB Routes] Search error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/kb/documents
 * List knowledge base documents for a shop
 */
router.get('/documents', authenticateToken, async (req, res) => {
  try {
    const { shopId, sourceType, limit = 50, offset = 0 } = req.query;
    
    if (!shopId) {
      return res.status(400).json({ error: 'shopId is required' });
    }

    // Verify user has access to this shop
    const userShops = (req as any).user.shop_ids || [];
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
    const params: any[] = [shopId];

    if (sourceType) {
      sql += ` AND source_type = $${params.length + 1}`;
      params.push(sourceType);
    }

    sql += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(parseInt(limit as string), parseInt(offset as string));

    const result = await query(sql, params);
    
    // Get total count
    let countSql = `SELECT COUNT(*) FROM kb_documents WHERE shop_id = $1`;
    const countParams: any[] = [shopId];
    
    if (sourceType) {
      countSql += ` AND source_type = $${countParams.length + 1}`;
      countParams.push(sourceType);
    }
    
    const countResult = await query(countSql, countParams);
    const total = parseInt(countResult.rows[0].count);

    res.json({
      documents: result.rows,
      pagination: {
        limit: parseInt(limit as string),
        offset: parseInt(offset as string),
        total
      }
    });

  } catch (error: any) {
    console.error('[KB Routes] Documents error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/kb/documents/:id
 * Delete a specific knowledge base document
 */
router.delete('/documents/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get document to verify shop ownership
    const docResult = await query(
      'SELECT shop_id FROM kb_documents WHERE id = $1',
      [id]
    );

    if (docResult.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const documentShopId = docResult.rows[0].shop_id;
    
    // Verify user has access to this shop
    const userShops = (req as any).user.shop_ids || [];
    if (!userShops.includes(documentShopId)) {
      return res.status(403).json({ error: 'Access denied for this document' });
    }

    // Delete document
    await query('DELETE FROM kb_documents WHERE id = $1', [id]);

    res.json({ message: 'Document deleted successfully' });

  } catch (error: any) {
    console.error('[KB Routes] Delete error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/kb/reindex
 * Re-index all knowledge base documents for a shop
 */
router.post('/reindex', authenticateToken, async (req, res) => {
  try {
    const { shopId } = req.body;
    
    if (!shopId) {
      return res.status(400).json({ error: 'shopId is required' });
    }

    // Verify user has access to this shop
    const userShops = (req as any).user.shop_ids || [];
    if (!userShops.includes(shopId)) {
      return res.status(403).json({ error: 'Access denied for this shop' });
    }

    console.log(`[KB Routes] Starting reindex for ${shopId}`);

    // Get all documents for this shop
    const docsResult = await query(
      'SELECT id, content FROM kb_documents WHERE shop_id = $1',
      [shopId]
    );

    console.log(`[KB Routes] Reindexing ${docsResult.rows.length} documents`);

    // Re-generate embeddings for all documents
    for (const doc of docsResult.rows) {
      try {
        const embedding = await KBQueryService.generateQueryEmbedding(doc.content);
        
        await query(
          'UPDATE kb_documents SET embedding = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
          [`[${embedding.join(',')}]`, doc.id]
        );
      } catch (error: any) {
        console.error(`[KB Routes] Failed to reindex document ${doc.id}:`, error.message);
      }
    }

    res.json({ 
      message: 'Reindex completed',
      documentsProcessed: docsResult.rows.length
    });

  } catch (error: any) {
    console.error('[KB Routes] Reindex error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/kb/analytics
 * Get knowledge base analytics for a shop
 */
router.get('/analytics', authenticateToken, async (req, res) => {
  try {
    const { shopId, days = 7 } = req.query;
    
    if (!shopId) {
      return res.status(400).json({ error: 'shopId is required' });
    }

    // Verify user has access to this shop
    const userShops = (req as any).user.shop_ids || [];
    if (!userShops.includes(shopId)) {
      return res.status(403).json({ error: 'Access denied for this shop' });
    }

    // Get query analytics
    const queryAnalytics = await KBQueryService.getQueryAnalytics(shopId as string, parseInt(days as string));
    
    // Get top queries
    const topQueries = await KBQueryService.getTopQueries(shopId as string, 10);
    
    // Get document counts by type
    const docCountsResult = await query(`
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

  } catch (error: any) {
    console.error('[KB Routes] Analytics error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
