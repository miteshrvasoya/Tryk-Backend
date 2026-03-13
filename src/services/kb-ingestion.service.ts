import axios from 'axios';
import * as cheerio from 'cheerio';
import { Readability } from '@mozilla/readability';
import { query } from '../db';
import { AIService } from './ai.service';
import { v4 as uuidv4 } from 'uuid';

export interface KnowledgeChunk {
  id: string;
  shop_id: string;
  source_type: string;
  source_url?: string;
  title?: string;
  content: string;
  token_count: number;
  metadata?: any;
}

export interface PartialKnowledgeChunk {
  id: string;
  title?: string;
  content: string;
  token_count: number;
  metadata?: any;
}

export interface IngestionOptions {
  maxDepth?: number;
  maxPages?: number;
  prioritizePolicies?: boolean;
}

export class KnowledgeIngestionService {
  
  private static readonly POLICY_PATHS = [
    { type: 'shipping_policy', path: '/policies/shipping-policy', priority: 1 },
    { type: 'return_policy', path: '/policies/refund-policy', priority: 1 },
    { type: 'privacy_policy', path: '/policies/privacy-policy', priority: 2 },
    { type: 'terms_of_service', path: '/policies/terms-of-service', priority: 2 },
    { type: 'faq', path: '/pages/faqs', priority: 1 },
    { type: 'faq', path: '/pages/faq', priority: 1 },
    { type: 'help', path: '/pages/contact', priority: 2 },
    { type: 'help', path: '/pages/help', priority: 2 },
  ];

  private static readonly RELEVANT_KEYWORDS = [
    'shipping', 'delivery', 'returns', 'refund', 'policy', 'faq', 'help', 
    'contact', 'support', 'about', 'terms', 'privacy', 'order', 'tracking'
  ];

  /**
   * Main ingestion orchestrator
   */
  static async ingestWebsite(shopId: string, baseUrl: string, options: IngestionOptions = {}): Promise<void> {
    console.log(`[KB Ingestion] Starting ingestion for ${shopId}: ${baseUrl}`);
    
    const {
      maxDepth = 2,
      maxPages = 25,
      prioritizePolicies = true
    } = options;

    try {
      // Step 1: Extract relevant pages
      const relevantPages = prioritizePolicies 
        ? await this.extractRelevantPages(baseUrl, maxPages)
        : await this.crawlWebsite(baseUrl, maxDepth, maxPages);

      console.log(`[KB Ingestion] Found ${relevantPages.length} relevant pages`);

      // Step 2: Process each page
      const allChunks: KnowledgeChunk[] = [];
      
      for (const page of relevantPages) {
        try {
          const chunks = await this.processPage(shopId, page);
          allChunks.push(...chunks);
        } catch (error: any) {
          console.warn(`[KB Ingestion] Failed to process ${page.url}: ${error.message}`);
        }
      }

      console.log(`[KB Ingestion] Generated ${allChunks.length} chunks`);

      // Step 3: Generate embeddings and store
      await this.storeKnowledgeChunks(allChunks);

      console.log(`[KB Ingestion] Successfully ingested ${allChunks.length} chunks for ${shopId}`);

    } catch (error: any) {
      console.error(`[KB Ingestion] Failed for ${shopId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Extract only relevant pages (FAQ, policies, help, contact)
   */
  static async extractRelevantPages(baseUrl: string, maxPages: number = 25): Promise<Array<{url: string, type: string}>> {
    const origin = baseUrl.startsWith('http') ? baseUrl : `https://${baseUrl}`;
    const relevantPages: Array<{url: string, type: string}> = [];

    // First, check policy pages
    for (const policy of this.POLICY_PATHS) {
      if (relevantPages.length >= maxPages) break;
      
      const url = `${origin}${policy.path}`;
      try {
        const response = await axios.head(url, {
          headers: { 'User-Agent': 'TrykBot/1.0 (KB Ingestion)' },
          timeout: 5000,
          validateStatus: (status) => status === 200
        });

        if (response.status === 200) {
          relevantPages.push({ url, type: policy.type });
        }
      } catch (error) {
        // 404 is expected for many policies, just ignore
      }
    }

    // Then, discover additional relevant pages by crawling homepage
    if (relevantPages.length < maxPages) {
      try {
        const discoveredPages = await this.discoverRelevantPages(origin, maxPages - relevantPages.length);
        relevantPages.push(...discoveredPages);
      } catch (error: any) {
        console.warn(`[KB Ingestion] Failed to discover pages: ${error.message}`);
      }
    }

    return relevantPages;
  }

  /**
   * Discover relevant pages from homepage navigation
   */
  static async discoverRelevantPages(baseUrl: string, limit: number): Promise<Array<{url: string, type: string}>> {
    try {
      const response = await axios.get(baseUrl, {
        headers: { 'User-Agent': 'TrykBot/1.0 (KB Ingestion)' },
        timeout: 10000
      });

      const $ = cheerio.load(response.data);
      const discovered: Array<{url: string, type: string}> = [];

      $('a[href]').each((_, el) => {
        if (discovered.length >= limit) return false;

        const href = $(el).attr('href');
        if (!href) return;

        const text = $(el).text().toLowerCase();
        const hrefLower = href.toLowerCase();

        // Check if link text or href contains relevant keywords
        const isRelevant = this.RELEVANT_KEYWORDS.some(keyword => 
          text.includes(keyword) || hrefLower.includes(keyword)
        );

        if (isRelevant) {
          try {
            const absUrl = new URL(href, baseUrl).href;
            const parsed = new URL(absUrl);
            
            if (parsed.hostname === new URL(baseUrl).hostname) {
              const type = this.inferPageType(text, hrefLower);
              discovered.push({ url: absUrl, type });
            }
          } catch (e) {
            // Invalid URL, skip
          }
        }
      });

      return [...new Set(discovered)]; // Remove duplicates
    } catch (error: any) {
      console.warn(`[KB Ingestion] Discovery failed: ${error.message}`);
      return [];
    }
  }

  /**
   * Process a single page into knowledge chunks
   */
  static async processPage(shopId: string, pageInfo: {url: string, type: string}): Promise<KnowledgeChunk[]> {
    console.log(`[KB Ingestion] Processing: ${pageInfo.url}`);

    const response = await axios.get(pageInfo.url, {
      headers: { 'User-Agent': 'TrykBot/1.0 (KB Ingestion)' },
      timeout: 10000
    });

    // Step 1: Clean HTML aggressively
    const cleanedContent = this.cleanHTML(response.data, pageInfo.url);

    if (!cleanedContent || cleanedContent.length < 100) {
      console.warn(`[KB Ingestion] Too little content after cleaning: ${pageInfo.url}`);
      return [];
    }

    // Step 2: Extract title
    const $ = cheerio.load(response.data);
    const title = $('title').text().trim() || this.extractTitleFromContent(cleanedContent);

    // Step 3: Semantic chunking
    const chunks = this.semanticChunking(cleanedContent, {
      sourceType: pageInfo.type,
      sourceUrl: pageInfo.url,
      title
    });

    // Step 4: Add shop_id and prepare for storage
    return chunks.map(chunk => ({
      ...chunk,
      shop_id: shopId,
      source_type: pageInfo.type,
      source_url: pageInfo.url
    }));
  }

  /**
   * Clean HTML aggressively using Readability algorithm
   */
  static cleanHTML(html: string, url: string): string {
    try {
      // Create a virtual DOM
      const dom = new DOMParser().parseFromString(html, 'text/html');
      
      // Use Readability to extract main content
      const reader = new Readability(dom, {
        charThreshold: 100,
        classesToPreserve: ['policy-content', 'faq-content', 'help-content']
      });
      
      const article = reader.parse();
      
      if (article && article.textContent) {
        return article.textContent
          .replace(/\s+/g, ' ')
          .replace(/\n+/g, ' ')
          .trim();
      }

      // Fallback: manual cleaning
      const $ = cheerio.load(html);
      
      // Remove noise aggressively
      $('script, style, nav, footer, header, aside, .sidebar, .menu, .navigation, .ads, .cookie-banner').remove();
      $('img, svg, video, audio').remove();
      
      // Extract text from content elements
      let content = '';
      $('h1, h2, h3, h4, h5, h6, p, li, dd, dt').each((_, el) => {
        const text = $(el).text().trim();
        if (text.length > 20) {
          content += text + '\n\n';
        }
      });

      return content
        .replace(/\s+/g, ' ')
        .replace(/\n+/g, ' ')
        .trim();

    } catch (error: any) {
      console.warn(`[KB Ingestion] HTML cleaning failed: ${error.message}`);
      return '';
    }
  }

  /**
   * Semantic chunking - split content into logical chunks
   */
  static semanticChunking(content: string, metadata: {sourceType: string, sourceUrl: string, title?: string}): PartialKnowledgeChunk[] {
    const chunks: PartialKnowledgeChunk[] = [];
    
    // Split by paragraphs first
    const paragraphs = content
      .split(/\n\s*\n/)
      .map(p => p.trim())
      .filter(p => p.length > 50);

    let currentChunk = '';
    let tokenCount = 0;
    const maxTokens = 300; // Target 200-400 tokens
    const minTokens = 100;

    for (const paragraph of paragraphs) {
      const paragraphTokens = this.estimateTokenCount(paragraph);
      
      // If adding this paragraph exceeds max tokens and we have enough content, create a chunk
      if (tokenCount + paragraphTokens > maxTokens && tokenCount >= minTokens) {
        chunks.push(this.createChunk(currentChunk, metadata, chunks.length));
        currentChunk = paragraph;
        tokenCount = paragraphTokens;
      } else {
        currentChunk += (currentChunk ? '\n\n' : '') + paragraph;
        tokenCount += paragraphTokens;
      }
    }

    // Add the last chunk if it has content
    if (currentChunk.trim() && tokenCount >= minTokens) {
      chunks.push(this.createChunk(currentChunk, metadata, chunks.length));
    }

    return chunks;
  }

  /**
   * Create a knowledge chunk object
   */
  static createChunk(content: string, metadata: any, index: number): PartialKnowledgeChunk {
    return {
      id: uuidv4(),
      content: content.trim(),
      token_count: this.estimateTokenCount(content),
      title: metadata.title,
      metadata: {
        ...metadata,
        chunkIndex: index,
        extractedAt: new Date().toISOString()
      }
    };
  }

  /**
   * Estimate token count (rough approximation)
   */
  static estimateTokenCount(text: string): number {
    // Rough approximation: ~4 characters per token
    return Math.ceil(text.length / 4);
  }

  /**
   * Generate embeddings for chunks and store in database
   */
  static async storeKnowledgeChunks(chunks: KnowledgeChunk[]): Promise<void> {
    console.log(`[KB Ingestion] Generating embeddings for ${chunks.length} chunks`);

    for (const chunk of chunks) {
      try {
        // Generate embedding using OpenAI
        const embedding = await this.generateEmbedding(chunk.content);
        
        // Store in database
        await query(`
          INSERT INTO kb_documents (id, shop_id, source_type, source_url, title, content, embedding, token_count, metadata)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          ON CONFLICT (id) DO UPDATE SET
            content = EXCLUDED.content,
            embedding = EXCLUDED.embedding,
            updated_at = CURRENT_TIMESTAMP
        `, [
          chunk.id,
          chunk.shop_id,
          chunk.source_type,
          chunk.source_url,
          chunk.title,
          chunk.content,
          `[${embedding.join(',')}]`, // Convert array to PostgreSQL vector format
          chunk.token_count,
          JSON.stringify(chunk.metadata)
        ]);

      } catch (error: any) {
        console.error(`[KB Ingestion] Failed to store chunk ${chunk.id}: ${error.message}`);
      }
    }
  }

  /**
   * Generate embedding for text
   */
  static async generateEmbedding(text: string): Promise<number[]> {
    // This would use OpenAI's embedding API
    // For now, return a mock embedding
    try {
      // In production, this would call OpenAI:
      // const response = await openai.embeddings.create({
      //   model: "text-embedding-3-small",
      //   input: text
      // });
      // return response.data[0].embedding;
      
      // Mock embedding for development
      return Array(1536).fill(0).map(() => Math.random() - 0.5);
    } catch (error: any) {
      console.error(`[KB Ingestion] Embedding generation failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Infer page type from URL and text
   */
  static inferPageType(text: string, href: string): string {
    const lowerText = text.toLowerCase();
    const lowerHref = href.toLowerCase();

    if (lowerText.includes('shipping') || lowerHref.includes('shipping')) return 'shipping_policy';
    if (lowerText.includes('return') || lowerText.includes('refund')) return 'return_policy';
    if (lowerText.includes('privacy')) return 'privacy_policy';
    if (lowerText.includes('terms')) return 'terms_of_service';
    if (lowerText.includes('faq') || lowerHref.includes('faq')) return 'faq';
    if (lowerText.includes('contact') || lowerText.includes('help')) return 'help';
    
    return 'general';
  }

  /**
   * Extract title from content when HTML title is not available
   */
  static extractTitleFromContent(content: string): string {
    const lines = content.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    return lines[0] || 'Untitled';
  }

  /**
   * Fallback website crawler (used when prioritizePolicies = false)
   */
  static async crawlWebsite(baseUrl: string, depth: number = 2, maxPages: number = 25): Promise<Array<{url: string, type: string}>> {
    // This would implement a full crawler similar to the existing CrawlerService
    // For now, return policy pages
    return this.extractRelevantPages(baseUrl, maxPages);
  }
}
