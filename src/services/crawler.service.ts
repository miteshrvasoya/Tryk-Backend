import axios from 'axios';
import * as cheerio from 'cheerio';

interface ScrapedContent {
  title: string;
  url: string;
  content: string[];
}

export class CrawlerService {
  /**
   * Scans a website with a depth limit and returns aggregated content.
   */
  static async scanWebsite(url: string, depth: number = 2): Promise<ScrapedContent> {
    console.log(`Crawler: Starting recursive scan of ${url} (depth: ${depth})`);
    
    // Normalize initial URL
    const startUrl = url.startsWith('http') ? url : `https://${url}`;
    const visited = new Set<string>();
    const results: ScrapedContent[] = [];
    
    await this.crawlRecursive(startUrl, startUrl, depth, visited, results);

    // Flatten results for convenience
    const allContent = results.flatMap(r => r.content);
    return {
        title: results[0]?.title || 'Scanned Site',
        url: startUrl,
        content: [...new Set(allContent)] // Deduplicate
    };
  }

  private static async crawlRecursive(
    baseUrl: string,
    currentUrl: string,
    depth: number,
    visited: Set<string>,
    results: ScrapedContent[]
  ) {
    // Limits: depth, already visited, or max pages (limit to 25 to prevent abuse)
    if (depth < 0 || visited.has(currentUrl) || visited.size >= 25) return;
    visited.add(currentUrl);

    try {
        const response = await axios.get(currentUrl, {
            headers: { 'User-Agent': 'TrykBot/1.0 (AI Support Assistant)' },
            timeout: 10000
        });
        const $ = cheerio.load(response.data);
        
        // Extract content from current page
        const title = $('title').text().trim() || 'Untitled';
        const content: string[] = [];
        
        // Remove noise
        $('script, style, nav, footer, ads').remove();

        $('h1, h2, h3, p, li').each((_, el) => {
            const text = $(el).text().trim();
            if (text.length > 40 && text.length < 2000) {
                content.push(text);
            }
        });

        results.push({ title, url: currentUrl, content });

        // If we still have depth, find more links
        if (depth > 0) {
            const domain = new URL(baseUrl).hostname;
            const links: string[] = [];
            
            $('a[href]').each((_, el) => {
                let href = $(el).attr('href');
                if (!href) return;

                // Normalize href
                try {
                    const absUrl = new URL(href, currentUrl).href;
                    const parsed = new URL(absUrl);
                    
                    // Only stay on same domain, internal links, no hashes
                    if (parsed.hostname === domain && !parsed.hash) {
                        links.push(absUrl);
                    }
                } catch (e) {}
            });

            // Cull duplicates and crawl
            const uniqueLinks = [...new Set(links)];
            for (const link of uniqueLinks) {
                await this.crawlRecursive(baseUrl, link, depth - 1, visited, results);
            }
        }
    } catch (error: any) {
        console.warn(`Crawler: Failed to fetch ${currentUrl}: ${error.message}`);
    }
  }
}
