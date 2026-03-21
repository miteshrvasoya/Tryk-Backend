import { query as dbQuery } from '../db';
import { KBDocument, KBQueryService, IntentCategory } from './kb-query.service';

export interface RetrievalOptions {
  limit?: number;
  sourceTypes?: string[];
  minSimilarity?: number;
  includeKeywordSearch?: boolean;
}

export interface RetrievalResult {
  documents: KBDocument[];
  method: 'vector' | 'keyword' | 'hybrid';
  totalFound: number;
  queryTime: number;
}

export class KBRetrievalService {

  /**
   * Vector similarity search using pgvector
   */
  static async vectorSearch(
    shopId: string, 
    queryEmbedding: number[], 
    options: RetrievalOptions = {}
  ): Promise<KBDocument[]> {
    const startTime = Date.now();
    
    const {
      limit = 10,
      sourceTypes,
      minSimilarity = 0.3
    } = options;

    try {
      let sql = `
        SELECT 
          id, shop_id, source_type, source_url, title, content, 
          token_count, metadata, created_at, updated_at,
          1 - (embedding <=> $1::vector) as similarity
        FROM kb_documents 
        WHERE shop_id = $2 
          AND 1 - (embedding <=> $1::vector) >= $3
      `;

      const params: any[] = [`[${queryEmbedding.join(',')}]`, shopId, minSimilarity];

      // Add source type filter if specified
      if (sourceTypes && sourceTypes.length > 0) {
        sql += ` AND source_type = ANY($${params.length + 1})`;
        params.push(sourceTypes);
      }

      sql += `
        ORDER BY similarity DESC 
        LIMIT $${params.length + 1}
      `;
      params.push(limit);

      const result = await dbQuery(sql, params);
      
      console.log(`[KBRetrieval] Vector search found ${result.rows.length} documents in ${Date.now() - startTime}ms`);

      return result.rows.map((row: any) => ({
        ...row,
        embedding: [], // Don't return embedding to save bandwidth
        similarity: parseFloat(row.similarity)
      }));

    } catch (error: any) {
      console.error(`[KBRetrieval] Vector search failed: ${error.message}`);
      return [];
    }
  }

  /**
   * Full-text keyword search using PostgreSQL GIN index
   */
  static async keywordSearch(
    shopId: string, 
    query: string, 
    options: RetrievalOptions = {}
  ): Promise<KBDocument[]> {
    const startTime = Date.now();
    
    const {
      limit = 10,
      sourceTypes
    } = options;

    try {
      let sql = `
        SELECT 
          id, shop_id, source_type, source_url, title, content, 
          token_count, metadata, created_at, updated_at,
          ts_rank(to_tsvector('english', content || ' ' || COALESCE(title, '')), 
                   websearch_to_tsquery('english', $2)) as rank
        FROM kb_documents 
        WHERE shop_id = $1 
          AND to_tsvector('english', content || ' ' || COALESCE(title, '')) @@ websearch_to_tsquery('english', $2)
      `;

      const params: any[] = [shopId, query];

      // Add source type filter if specified
      if (sourceTypes && sourceTypes.length > 0) {
        sql += ` AND source_type = ANY($${params.length + 1})`;
        params.push(sourceTypes);
      }

      sql += `
        ORDER BY rank DESC 
        LIMIT $${params.length + 1}
      `;
      params.push(limit);

      const result = await dbQuery(sql, params);
      
      console.log(`[KBRetrieval] Keyword search found ${result.rows.length} documents in ${Date.now() - startTime}ms`);

      return result.rows.map((row: any) => ({
        ...row,
        embedding: [],
        similarity: parseFloat(row.rank) * 0.1 // Normalize rank to similarity scale
      }));

    } catch (error: any) {
      console.error(`[KBRetrieval] Keyword search failed: ${error.message}`);
      return [];
    }
  }

  /**
   * Hybrid search combining vector and keyword results
   */
  static async hybridSearch(
    shopId: string, 
    query: string, 
    queryEmbedding: number[],
    options: RetrievalOptions = {}
  ): Promise<RetrievalResult> {
    const startTime = Date.now();
    const { limit = 10, includeKeywordSearch = true } = options;

    try {
      // Get intent-based source type preferences
      const intent = KBQueryService.detectIntent(query);
      const sourceTypes = this.getPreferredSourceTypes(intent);

      // Run both searches in parallel
      const [vectorResults, keywordResults] = await Promise.all([
        this.vectorSearch(shopId, queryEmbedding, { 
          ...options, 
          limit: limit * 2, // Get more to allow for reranking
          sourceTypes 
        }),
        includeKeywordSearch 
          ? this.keywordSearch(shopId, query, { 
              ...options, 
              limit: limit * 2,
              sourceTypes 
            })
          : Promise.resolve([])
      ]);

      // Merge and deduplicate results
      const allResults = this.mergeResults(vectorResults, keywordResults);

      // Rerank combined results
      const rerankedResults = await this.rerankByRelevance(query, allResults);

      const finalResults = rerankedResults.slice(0, limit);

      console.log(`[KBRetrieval] Hybrid search: ${vectorResults.length} vector, ${keywordResults.length} keyword, ${finalResults.length} final in ${Date.now() - startTime}ms`);

      return {
        documents: finalResults,
        method: includeKeywordSearch ? 'hybrid' : 'vector',
        totalFound: allResults.length,
        queryTime: Date.now() - startTime
      };

    } catch (error: any) {
      console.error(`[KBRetrieval] Hybrid search failed: ${error.message}`);
      return {
        documents: [],
        method: 'hybrid',
        totalFound: 0,
        queryTime: Date.now() - startTime
      };
    }
  }

  /**
   * Merge vector and keyword results, removing duplicates
   */
  static mergeResults(vectorResults: KBDocument[], keywordResults: KBDocument[]): KBDocument[] {
    const seen = new Set<string>();
    const merged: KBDocument[] = [];

    // Add vector results first (higher priority)
    for (const doc of vectorResults) {
      if (!seen.has(doc.id)) {
        seen.add(doc.id);
        merged.push(doc);
      }
    }

    // Add keyword results that weren't already included
    for (const doc of keywordResults) {
      if (!seen.has(doc.id)) {
        seen.add(doc.id);
        merged.push(doc);
      }
    }

    return merged;
  }

  /**
   * Basic reranking by relevance score
   */
  static async rerankByRelevance(query: string, documents: KBDocument[]): Promise<KBDocument[]> {
    const queryLower = query.toLowerCase();
    
    return documents
      .map(doc => {
        let score = doc.similarity || 0;

        // Boost for title matches
        if (doc.title) {
          const titleLower = doc.title.toLowerCase();
          if (titleLower.includes(queryLower)) {
            score += 0.2;
          }
        }

        // Boost for exact phrase matches in content
        if (doc.content.toLowerCase().includes(queryLower)) {
          score += 0.1;
        }

        // Boost for recent documents (freshness)
        const daysSinceCreation = (Date.now() - new Date(doc.created_at || '').getTime()) / (1000 * 60 * 60 * 24);
        if (daysSinceCreation < 30) {
          score += 0.05;
        }

        return { ...doc, rank: score };
      })
      .sort((a, b) => (b.rank || 0) - (a.rank || 0));
  }

  /**
   * Get preferred source types based on intent
   */
  static getPreferredSourceTypes(intent: IntentCategory): string[] {
    switch (intent) {
      case 'shipping_policy':
        return ['shipping_policy'];
      case 'return_policy':
        return ['return_policy'];
      case 'product_availability':
        return ['general', 'product_docs'];
      case 'general_faq':
        return ['faq', 'help', 'contact'];
      case 'order_status':
        return []; // Will be handled by Shopify API
      default:
        return []; // Search all types
    }
  }

  /**
   * Get documents by source type for a shop
   */
  static async getDocumentsBySourceType(
    shopId: string, 
    sourceType: string, 
    limit: number = 50
  ): Promise<KBDocument[]> {
    const result = await dbQuery(`
      SELECT 
        id, shop_id, source_type, source_url, title, content, 
        token_count, metadata, created_at, updated_at
      FROM kb_documents 
      WHERE shop_id = $1 AND source_type = $2
      ORDER BY created_at DESC
      LIMIT $3
    `, [shopId, sourceType, limit]);

    return result.rows.map((row: any) => ({
      ...row,
      embedding: [],
      similarity: 0
    }));
  }

  /**
   * Search within a specific source URL (for debugging)
   */
  static async searchWithinSource(
    shopId: string,
    sourceUrl: string,
    query: string,
    limit: number = 5
  ): Promise<KBDocument[]> {
    const result = await dbQuery(`
      SELECT 
        id, shop_id, source_type, source_url, title, content, 
        token_count, metadata, created_at, updated_at,
        ts_rank(to_tsvector('english', content || ' ' || COALESCE(title, '')), 
                 websearch_to_tsquery('english', $3)) as rank
      FROM kb_documents 
      WHERE shop_id = $1 AND source_url = $2
        AND to_tsvector('english', content || ' ' || COALESCE(title, '')) @@ websearch_to_tsquery('english', $3)
      ORDER BY rank DESC
      LIMIT $4
    `, [shopId, sourceUrl, query, limit]);

    return result.rows.map((row: any) => ({
      ...row,
      embedding: [],
      similarity: parseFloat(row.rank) * 0.1
    }));
  }

  /**
   * Get similar documents to a given document
   */
  static async findSimilarDocuments(
    shopId: string,
    documentId: string,
    limit: number = 5
  ): Promise<KBDocument[]> {
    // First get the document's embedding
    const docResult = await dbQuery(`
      SELECT embedding FROM kb_documents 
      WHERE shop_id = $1 AND id = $2
    `, [shopId, documentId]);

    if (docResult.rows.length === 0) {
      return [];
    }

    const embedding = docResult.rows[0].embedding;
    
    // Find similar documents
    const result = await dbQuery(`
      SELECT 
        id, shop_id, source_type, source_url, title, content, 
        token_count, metadata, created_at, updated_at,
        1 - (embedding <=> $2::vector) as similarity
      FROM kb_documents 
      WHERE shop_id = $1 
        AND id != $3
        AND 1 - (embedding <=> $2::vector) >= 0.5
      ORDER BY similarity DESC
      LIMIT $4
    `, [shopId, embedding, documentId, limit]);

    return result.rows.map((row: any) => ({
      ...row,
      embedding: [],
      similarity: parseFloat(row.similarity)
    }));
  }

  /**
   * Get search statistics for a shop
   */
  static async getSearchStats(shopId: string, days: number = 7): Promise<any> {
    const result = await dbQuery(`
      SELECT 
        COUNT(*) as total_searches,
        AVG(CASE WHEN method = 'vector' THEN query_time ELSE NULL END) as avg_vector_time,
        AVG(CASE WHEN method = 'keyword' THEN query_time ELSE NULL END) as avg_keyword_time,
        AVG(CASE WHEN method = 'hybrid' THEN query_time ELSE NULL END) as avg_hybrid_time,
        AVG(total_found) as avg_results_found
      FROM kb_query_logs 
      WHERE shop_id = $1 
        AND created_at >= NOW() - INTERVAL '${days} days'
    `, [shopId]);

    return result.rows[0];
  }
}
