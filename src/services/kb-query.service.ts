import { query } from '../db';
import { KnowledgeIngestionService } from './kb-ingestion.service';

export type IntentCategory = 'order_status' | 'shipping_policy' | 'return_policy' | 'product_availability' | 'general_faq' | 'unknown';

export interface NormalizedQuery {
  original: string;
  normalized: string;
  intent: IntentCategory;
  embedding?: number[];
}

export interface KBDocument {
  id: string;
  shop_id: string;
  source_type: string;
  source_url?: string;
  title?: string;
  content: string;
  embedding: number[];
  token_count: number;
  metadata?: any;
  similarity?: number;
  rank?: number;
  created_at?: string;
  updated_at?: string;
}

export class KBQueryService {

  /**
   * Normalize and process user query
   */
  static async normalizeQuery(query: string): Promise<NormalizedQuery> {
    const trimmed = query.trim().toLowerCase();
    
    // Remove noise words and normalize
    let normalized = trimmed
      .replace(/\b(please|can you|could you|would you|i want to know|i need to know|tell me|show me|what is|how do i)\b/gi, '')
      .replace(/\b(the|a|an|and|or|but|in|on|at|to|for|of|with|by)\b/g, '')
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    // Detect intent
    const intent = this.detectIntent(trimmed);

    return {
      original: query,
      normalized: normalized || trimmed, // Fallback to original if normalization removes everything
      intent
    };
  }

  /**
   * Detect query intent category
   */
  static detectIntent(query: string): IntentCategory {
    const lower = query.toLowerCase();

    // Order status patterns - skip KB and call Shopify API
    if (lower.match(/\b(where is|track|status|order)\b/) && lower.match(/#\d+|\b\d{4,}\b/)) {
      return 'order_status';
    }

    // Shipping policy patterns
    if (lower.match(/\b(shipping|delivery|ship|deliver|transit|package)\b/)) {
      return 'shipping_policy';
    }

    // Return/refund policy patterns
    if (lower.match(/\b(return|refund|exchange|cancel|money back)\b/)) {
      return 'return_policy';
    }

    // Product availability patterns
    if (lower.match(/\b(stock|available|inventory|have|sell|price|cost|buy)\b/)) {
      return 'product_availability';
    }

    // FAQ patterns
    if (lower.match(/\b(faq|help|support|contact|question|how to|what is|when do|can i)\b/)) {
      return 'general_faq';
    }

    return 'unknown';
  }

  /**
   * Generate embedding for query
   */
  static async generateQueryEmbedding(query: string): Promise<number[]> {
    try {
      // In production, this would call OpenAI:
      // const response = await openai.embeddings.create({
      //   model: "text-embedding-3-small",
      //   input: query
      // });
      // return response.data[0].embedding;
      
      // Mock embedding for development
      return Array(1536).fill(0).map(() => Math.random() - 0.5);
    } catch (error: any) {
      console.error(`[KBQuery] Embedding generation failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Process query with full pipeline
   */
  static async processQuery(shopId: string, query: string): Promise<NormalizedQuery> {
    console.log(`[KBQuery] Processing query for ${shopId}: "${query}"`);

    // Step 1: Normalize query
    const normalized = await this.normalizeQuery(query);
    
    // Step 2: Generate embedding (only if not order_status)
    if (normalized.intent !== 'order_status') {
      normalized.embedding = await this.generateQueryEmbedding(normalized.normalized);
    }

    return normalized;
  }

  /**
   * Log query for analytics
   */
  static async logQuery(shopId: string, normalizedQuery: NormalizedQuery, response: any, responseTimeMs: number): Promise<void> {
    try {
      await query(`
        INSERT INTO kb_query_logs (shop_id, query, normalized_query, intent_category, response_text, confidence_score, response_time_ms, sources_used)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [
        shopId,
        normalizedQuery.original,
        normalizedQuery.normalized,
        normalizedQuery.intent,
        response.answer || response.response || '',
        response.confidence || 0,
        responseTimeMs,
        JSON.stringify(response.sources || [])
      ]);
    } catch (error: any) {
      console.error(`[KBQuery] Failed to log query: ${error.message}`);
    }
  }

  /**
   * Get query analytics for a shop
   */
  static async getQueryAnalytics(shopId: string, days: number = 7): Promise<any> {
    const result = await query(`
      SELECT 
        intent_category,
        COUNT(*) as query_count,
        AVG(confidence_score) as avg_confidence,
        AVG(response_time_ms) as avg_response_time
      FROM kb_query_logs 
      WHERE shop_id = $1 
        AND created_at >= NOW() - INTERVAL '${days} days'
      GROUP BY intent_category
      ORDER BY query_count DESC
    `, [shopId]);

    return result.rows;
  }

  /**
   * Get top queries for a shop
   */
  static async getTopQueries(shopId: string, limit: number = 10): Promise<any> {
    const result = await query(`
      SELECT 
        query,
        COUNT(*) as count,
        AVG(confidence_score) as avg_confidence
      FROM kb_query_logs 
      WHERE shop_id = $1 
        AND created_at >= NOW() - INTERVAL '30 days'
      GROUP BY query
      ORDER BY count DESC
      LIMIT $2
    `, [shopId, limit]);

    return result.rows;
  }

  /**
   * Expand query with synonyms for better recall
   */
  static async expandQuery(query: string): Promise<string[]> {
    const expansions: string[] = [query];

    const synonyms: Record<string, string[]> = {
      'shipping': ['delivery', 'transit', 'package', 'mail'],
      'return': ['refund', 'exchange', 'money back', 'send back'],
      'cost': ['price', 'amount', 'fee', 'charge'],
      'available': ['in stock', 'have', 'sell', 'inventory'],
      'policy': ['rule', 'guideline', 'terms', 'conditions']
    };

    const lowerQuery = query.toLowerCase();
    
    for (const [term, syns] of Object.entries(synonyms)) {
      if (lowerQuery.includes(term)) {
        for (const syn of syns) {
          expansions.push(query.replace(new RegExp(term, 'gi'), syn));
        }
      }
    }

    return [...new Set(expansions)]; // Remove duplicates
  }

  /**
   * Check if query should be handled by Shopify API instead of KB
   */
  static shouldUseShopifyAPI(intent: IntentCategory, query: string): boolean {
    if (intent === 'order_status') return true;
    
    // Check for specific order number patterns
    const hasOrderNumber = query.match(/#\d+|\b\d{4,}\b/);
    const hasOrderKeywords = query.toLowerCase().match(/\b(order|track|status|where is)\b/);
    
    return !!(hasOrderNumber && hasOrderKeywords);
  }

  /**
   * Extract order number from query
   */
  static extractOrderNumber(query: string): string | null {
    const match = query.match(/#?(\d{4,})/);
    return match ? match[1] : null;
  }

  /**
   * Get conversation context for multi-turn conversations
   */
  static async getConversationContext(shopId: string, conversationId: string, limit: number = 5): Promise<any[]> {
    const result = await query(`
      SELECT role, content, intent_category
      FROM kb_query_logs kql
      JOIN conversations c ON kql.shop_id = c.shop_id
      WHERE c.shop_id = $1 AND c.id = $2
      ORDER BY kql.created_at DESC
      LIMIT $3
    `, [shopId, conversationId, limit]);

    return result.rows.reverse(); // Return in chronological order
  }
}
