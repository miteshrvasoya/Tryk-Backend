import axios from 'axios';
import * as cheerio from 'cheerio';
import { query } from '../db';
import { WebsiteManagementService } from './website-management.service';

interface ScrapedChunk {
  title: string;
  sourceUrl: string;
  heading: string;
  content: string;
  tokenCount: number;
}

export class WebsiteCrawlerService {
  
  private static readonly MAX_DEPTH = 2;
  private static readonly MAX_PAGES = 30;
  
  private static readonly IMPORTANT_PATHS = [
    '/policies/shipping-policy',
    '/policies/refund-policy',
    '/policies/privacy-policy',
    '/policies/terms-of-service',
    '/pages/faqs',
    '/pages/faq',
    '/pages/contact',
    '/pages/help',
    '/help',
    '/faq',
    '/shipping',
    '/returns',
    '/contact'
  ];

  static async startCrawl(websiteId: string, userId: number, baseUrl: string) {
    try {
      console.log(`[Crawler] Starting background crawl for website ${websiteId} for user ${userId} (${baseUrl})`);
      
      // Update status to processing
      await WebsiteManagementService.updateWebsiteStatus(websiteId, { status: 'processing' });
      
      const normalizedUrl = this.normalizeUrl(baseUrl);
      const origin = new URL(normalizedUrl).origin;
      
      const visited = new Set<string>();
      const toVisit = new Set<string>();
      const results: ScrapedChunk[] = [];
      
      // Seed with highly important URLs
      for (const path of this.IMPORTANT_PATHS) {
         try {
             toVisit.add(new URL(path, origin).href);
         } catch(e) {}
      }
      
      // Also add the base url
      toVisit.add(origin);

      let currentLevel = Array.from(toVisit);
      let depth = 0;
      let pagesCount = 0;

      while (currentLevel.length > 0 && depth <= this.MAX_DEPTH && pagesCount < this.MAX_PAGES) {
          const nextLevel = new Set<string>();

          for (const url of currentLevel) {
              if (visited.has(url) || visited.size >= this.MAX_PAGES) continue;
              visited.add(url);

              try {
                  const chunks = await this.scrapePage(url, origin, nextLevel);
                  if (chunks.length > 0) {
                      results.push(...chunks);
                      pagesCount++;
                      
                      // Update progress internally, e.g.
                      await WebsiteManagementService.updateWebsiteStatus(websiteId, { pages_count: pagesCount });
                  }
              } catch (error: any) {
                  console.warn(`[Crawler] Failed fetching ${url}:`, error.message);
              }
          }
          
          depth++;
          currentLevel = Array.from(nextLevel);
      }
      
      console.log(`[Crawler] Finished scraping. Found ${results.length} chunks from ${pagesCount} pages.`);
      
      // Delete old chunks for this website
      await query(`DELETE FROM kb_documents WHERE website_id = $1`, [websiteId]);

      // Deduplicate and insert
      const uniqueChunks = this.deduplicateChunks(results);
      
      for (const chunk of uniqueChunks) {
         await this.storeChunk(userId, websiteId, chunk);
      }

      // Mark completed
      await WebsiteManagementService.updateWebsiteStatus(websiteId, {
        status: 'completed',
        pages_count: pagesCount,
        last_crawled_at: new Date()
      });
      
    } catch (error: any) {
      console.error(`[Crawler] Critical error during crawl for ${websiteId}:`, error);
      await WebsiteManagementService.updateWebsiteStatus(websiteId, { status: 'failed' });
    }
  }

  private static normalizeUrl(url: string): string {
    let normalized = url.trim();
    if (!/^https?:\/\//i.test(normalized)) {
      normalized = 'https://' + normalized;
    }
    // Remove trailing slash
    return normalized.replace(/\/$/, "");
  }

  private static deduplicateChunks(chunks: ScrapedChunk[]): ScrapedChunk[] {
      const seen = new Set<string>();
      return chunks.filter(c => {
          // simple hash simulation
          const signature = `${c.title}|${c.heading}|${c.content.substring(0, 50)}`;
          if (seen.has(signature)) return false;
          seen.add(signature);
          return true;
      });
  }

  private static async scrapePage(url: string, origin: string, nextLevel: Set<string>): Promise<ScrapedChunk[]> {
      const response = await axios.get(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (TrykBot; +https://tryk.store)' },
          timeout: 10000
      });

      const contentType = response.headers['content-type'];
      if (!contentType || !contentType.includes('text/html')) {
          return [];
      }

      const $ = cheerio.load(response.data);
      
      // Clean up common noise
      $('nav, footer, header, script, style, iframe, img, svg, form, noscript, .cookie-banner, .modal, .popup, #shopify-av-picker, .announcement-bar').remove();

      const pageTitle = $('title').text().trim() || 'Untitled Page';
      const chunks: ScrapedChunk[] = [];
      
      const body = $('body');
      let currentHeadingText = pageTitle;
      let currentTextBuffer: string[] = [];

      function walkDOM(node: any) {
          if (node.type === 'text') {
              const text = (node.data || '').replace(/\s+/g, ' ').trim();
              if (text.length > 0 && text !== 'undefined') {
                  currentTextBuffer.push(text);
              }
          } else if (node.type === 'tag') {
              const tagName = node.name.toLowerCase();
              if (/^h[1-6]$/.test(tagName)) {
                  // Flush current buffer
                  const joined = currentTextBuffer.join(' ').replace(/\s+/g, ' ').trim();
                  if (joined.length > 50) {
                      chunks.push({
                          title: pageTitle,
                          sourceUrl: url,
                          heading: currentHeadingText,
                          content: joined.substring(0, 3000), // Protect against massive blocks
                          tokenCount: Math.ceil(joined.substring(0, 3000).length / 4)
                      });
                  }
                  currentHeadingText = $(node).text().replace(/\s+/g, ' ').trim();
                  currentTextBuffer = [];
              } else {
                  // Traverse children
                  $(node).contents().each((_, child) => walkDOM(child));
              }
          }
      }

      body.contents().each((_, child) => walkDOM(child));
      
      const lastJoined = currentTextBuffer.join(' ').replace(/\s+/g, ' ').trim();
      if (lastJoined.length > 50) {
          chunks.push({
              title: pageTitle,
              sourceUrl: url,
              heading: currentHeadingText,
              content: lastJoined.substring(0, 3000),
              tokenCount: Math.ceil(lastJoined.substring(0, 3000).length / 4)
          });
      }

      // Find links for next depth
      $('a[href]').each((_, el) => {
          const href = $(el).attr('href');
          if (!href) return;
          try {
              const parsed = new URL(href, origin);
              if (parsed.origin === origin && !parsed.hash && !href.includes('mailto:') && !href.includes('tel:')) {
                  // Exclude obvious assets
                  const h = parsed.pathname.toLowerCase();
                  if (!h.endsWith('.pdf') && !h.endsWith('.jpg') && !h.endsWith('.png') && !h.includes('/cart')) {
                      nextLevel.add(parsed.href);
                  }
              }
          } catch(e) {}
      });

      return chunks;
  }

  private static async storeChunk(userId: number, websiteId: string, chunk: ScrapedChunk) {
      if (!chunk.content || chunk.content.length < 20) return;
      
      try {
          // Assume fake generation for embedding vectors or we map to null if no vector extension
          await query(`
              INSERT INTO kb_documents 
              (user_id, website_id, source_type, source_url, title, content, token_count, metadata)
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          `, [
              userId,
              websiteId,
              this.inferSourceType(chunk.sourceUrl),
              chunk.sourceUrl,
              `${chunk.title} - ${chunk.heading}`,
              chunk.content,
              chunk.tokenCount,
              JSON.stringify({ heading: chunk.heading })
          ]);
      } catch (e: any) {
          console.error(`[Crawler] Failed to store chunk for ${chunk.sourceUrl}:`, e.message);
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
