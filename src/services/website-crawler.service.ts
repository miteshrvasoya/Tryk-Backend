import axios from 'axios';
import * as cheerio from 'cheerio';
import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';
import { query } from '../db';
import { WebsiteManagementService } from './website-management.service';
import crypto from 'crypto';

interface ScrapedChunk {
  title: string;
  sourceUrl: string;
  heading: string;
  content: string;
  tokenCount: number;
}

export class WebsiteCrawlerService {
  
  private static readonly MAX_DEPTH = 3;
  private static readonly MAX_PAGES = 40;
  private static readonly TARGET_PAGES = 15; // Stop early if we find this many high-quality pages
  
  private static readonly URL_WEIGHTS: Record<string, number> = {
    'faq': 15,
    'support': 12,
    'help': 10,
    'refund': 15,
    'return': 15,
    'shipping': 12,
    'delivery': 10,
    'policy': 10,
    'terms': 8,
    'privacy': 8,
    'contact': 5,
    'about': 2,
    'blog': -10,
    'product': -5,
    'collection': -5,
    'cart': -20
  };

  private static readonly CONTENT_KEYWORDS = [
    'refund policy', 'return policy', 'shipping policy', 'delivery time',
    'contact us', 'support', 'help center', 'frequently asked questions',
    'terms of service', 'privacy policy'
  ];

  static async startCrawl(websiteId: string, userId: number, baseUrl: string, jobId?: number) {
    const startTime = Date.now();
    try {
      console.log(`[Crawler] Starting intelligent crawl for website ${websiteId} (${baseUrl})`);
      await WebsiteManagementService.updateWebsiteStatus(websiteId, { status: 'processing' });
      
      const normalizedBase = this.normalizeUrl(baseUrl);
      const origin = new URL(normalizedBase).origin;
      
      const visited = new Set<string>();
      const queue: { url: string; score: number; depth: number }[] = [
        { url: normalizedBase, score: 100, depth: 0 } // Start with home
      ];
      
      const results: ScrapedChunk[] = [];
      let pagesVisited = 0;
      let highQualityPagesFound = 0;

      while (queue.length > 0 && pagesVisited < this.MAX_PAGES) {
        // Sort queue by score descending (Priority Queue behavior)
        queue.sort((a, b) => b.score - a.score);
        const current = queue.shift()!;

        if (visited.has(current.url) || current.depth > this.MAX_DEPTH) continue;
        visited.add(current.url);
        pagesVisited++;

        try {
          console.log(`[Crawler] Processing (${pagesVisited}/${this.MAX_PAGES}): ${current.url} (Score: ${current.score})`);
          const { chunks, links, contentScore } = await this.scrapePage(current.url, origin);
          
          if (chunks.length > 0) {
            results.push(...chunks);
            if (contentScore > 5) highQualityPagesFound++;
          }

          // Add new links to queue
          for (const link of links) {
            if (!visited.has(link)) {
              const urlScore = this.calculateURLScore(link);
              queue.push({ url: link, score: urlScore, depth: current.depth + 1 });
            }
          }

          // Progress update
          await WebsiteManagementService.updateWebsiteStatus(websiteId, { pages_count: pagesVisited });

          // Smart Stop
          if (highQualityPagesFound >= this.TARGET_PAGES) {
            console.log(`[Crawler] Target high-quality pages reached (${highQualityPagesFound}). Finishing early.`);
            break;
          }
        } catch (error: any) {
          console.warn(`[Crawler] Failed ${current.url}:`, error.message);
        }
      }

      console.log(`[Crawler] Crawl finished in ${Math.round((Date.now() - startTime) / 1000)}s. Visited ${pagesVisited} pages, Found ${results.length} chunks.`);

      // Deduplicate and store
      const uniqueChunks = this.deduplicateChunks(results);
      await query(`DELETE FROM kb_documents WHERE website_id = $1`, [websiteId]);

      for (const chunk of uniqueChunks) {
        await this.storeChunk(userId, websiteId, chunk, jobId);
      }

      await WebsiteManagementService.updateWebsiteStatus(websiteId, {
        status: 'completed',
        pages_count: pagesVisited,
        last_crawled_at: new Date()
      });

      if (jobId) {
        await query('UPDATE faq_scan_jobs SET status = $1, updated_at = NOW() WHERE id = $2', ['completed', jobId]);
      }
    } catch (error: any) {
      console.error(`[Crawler] Critical error:`, error);
      await WebsiteManagementService.updateWebsiteStatus(websiteId, { status: 'failed' });
      if (jobId) {
        await query('UPDATE faq_scan_jobs SET status = $1, error_message = $2, updated_at = NOW() WHERE id = $3', ['error', error.message, jobId]);
      }
    }
  }

  private static normalizeUrl(url: string): string {
    try {
      let u = url.trim();
      if (!u.startsWith('http')) u = 'https://' + u;
      const parsed = new URL(u);
      // Remove trailing slash, fragments, and common tracking params
      let normalized = parsed.origin + parsed.pathname.replace(/\/$/, "");
      return normalized;
    } catch (e) {
      return url;
    }
  }

  private static calculateURLScore(url: string): number {
    let score = 5; // Base score
    const path = url.toLowerCase();
    
    for (const [key, weight] of Object.entries(this.URL_WEIGHTS)) {
      if (path.includes(key)) score += weight;
    }
    
    return score;
  }

  private static calculateContentScore(text: string): number {
    let score = 0;
    const lowerText = text.toLowerCase();
    
    for (const keyword of this.CONTENT_KEYWORDS) {
      const regex = new RegExp(keyword, 'gi');
      const matches = lowerText.match(regex);
      if (matches) score += matches.length * 2;
    }
    
    return score;
  }

  private static async scrapePage(url: string, origin: string): Promise<{ chunks: ScrapedChunk[], links: string[], contentScore: number }> {
    const response = await axios.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (TrykBot; +https://tryk.store)' },
      timeout: 15000,
      validateStatus: (s) => s < 400
    });

    const contentType = response.headers['content-type'];
    if (!contentType || !contentType.includes('text/html')) {
      return { chunks: [], links: [], contentScore: 0 };
    }

    const html = response.data;
    const $ = cheerio.load(html);
    
    // 1. Extract Links first while DOM is full
    const links: string[] = [];
    $('a[href]').each((_, el) => {
      const href = $(el).attr('href');
      if (!href) return;
      try {
        const parsed = new URL(href, origin);
        if (parsed.origin === origin && !parsed.hash && !href.startsWith('mailto:') && !href.startsWith('tel:')) {
          const path = parsed.pathname.toLowerCase();
          if (!/\.(pdf|jpg|png|zip|css|js)$/.test(path) && !path.includes('/cart') && !path.includes('/account')) {
            links.push(this.normalizeUrl(parsed.href));
          }
        }
      } catch(e) {}
    });

    // 2. Use Readability for Content Extraction
    const dom = new JSDOM(html, { url });
    const reader = new Readability(dom.window.document);
    const article = reader.parse();

    if (!article || !article.textContent || article.textContent.length < 200) {
      return { chunks: [], links: [...new Set(links)], contentScore: 0 };
    }

    const cleanText = article.textContent.replace(/\s+/g, ' ').trim();
    const contentScore = this.calculateContentScore(cleanText);
    
    // 3. Chunk the content
    const chunks = this.chunkText(article.title || 'Untitled Page', url, cleanText);

    return { chunks, links: [...new Set(links)], contentScore };
  }

  private static chunkText(title: string, url: string, text: string): ScrapedChunk[] {
    const chunks: ScrapedChunk[] = [];
    const MAX_CHUNK_LENGTH = 1500; // ~400 tokens
    const MIN_CHUNK_LENGTH = 100;

    // Simple sentence-based chunking
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
    let currentChunk = "";

    for (const sentence of sentences) {
      if ((currentChunk + sentence).length > MAX_CHUNK_LENGTH && currentChunk.length > MIN_CHUNK_LENGTH) {
        chunks.push({
          title,
          sourceUrl: url,
          heading: title,
          content: currentChunk.trim(),
          tokenCount: Math.ceil(currentChunk.length / 4)
        });
        currentChunk = "";
      }
      currentChunk += " " + sentence;
    }

    if (currentChunk.trim().length > MIN_CHUNK_LENGTH) {
      chunks.push({
        title,
        sourceUrl: url,
        heading: title,
        content: currentChunk.trim(),
        tokenCount: Math.ceil(currentChunk.length / 4)
      });
    }

    return chunks;
  }

  private static deduplicateChunks(chunks: ScrapedChunk[]): ScrapedChunk[] {
    const seen = new Set<string>();
    return chunks.filter(c => {
      const hash = crypto.createHash('md5').update(c.content.substring(0, 500)).digest('hex');
      if (seen.has(hash)) return false;
      seen.add(hash);
      return true;
    });
  }

  private static async storeChunk(userId: number, websiteId: string, chunk: ScrapedChunk, jobId?: number) {
    if (!chunk.content || chunk.content.length < 50) return;
    
    try {
      if (jobId) {
        await query(`
          INSERT INTO faq_drafts (job_id, shop_id, user_id, question, answer, source_url, status)
          VALUES ($1, (SELECT shop_id FROM websites WHERE id = $2), $3, $4, $5, $6, 'pending_review')
        `, [jobId, websiteId, userId, chunk.title, chunk.content, chunk.sourceUrl]);
      } else {
        await query(`
          INSERT INTO kb_documents (user_id, website_id, source_type, source_url, title, content, token_count, metadata)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `, [
          userId,
          websiteId,
          this.inferSourceType(chunk.sourceUrl),
          chunk.sourceUrl,
          chunk.title,
          chunk.content,
          chunk.tokenCount,
          JSON.stringify({ heading: chunk.heading })
        ]);
      }
    } catch (e: any) {
      console.error(`[Crawler] DB Store Error:`, e.message);
    }
  }

  private static inferSourceType(url: string): string {
    const lower = url.toLowerCase();
    if (lower.includes('shipping')) return 'shipping_policy';
    if (lower.includes('refund') || lower.includes('return')) return 'return_policy';
    if (lower.includes('privacy')) return 'privacy_policy';
    if (lower.includes('terms')) return 'terms_of_service';
    if (lower.includes('faq')) return 'faq';
    if (lower.includes('contact') || lower.includes('help')) return 'help';
    return 'general';
  }
}
