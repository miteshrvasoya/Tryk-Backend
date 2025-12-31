"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CrawlerService = void 0;
const axios_1 = __importDefault(require("axios"));
const cheerio = __importStar(require("cheerio"));
class CrawlerService {
    /**
     * Scans a website with a depth limit and returns aggregated content.
     */
    static async scanWebsite(url, depth = 2) {
        console.log(`Crawler: Starting recursive scan of ${url} (depth: ${depth})`);
        // Normalize initial URL
        const startUrl = url.startsWith('http') ? url : `https://${url}`;
        const visited = new Set();
        const results = [];
        await this.crawlRecursive(startUrl, startUrl, depth, visited, results);
        // Flatten results for convenience
        const allContent = results.flatMap(r => r.content);
        return {
            title: results[0]?.title || 'Scanned Site',
            url: startUrl,
            content: [...new Set(allContent)] // Deduplicate
        };
    }
    static async crawlRecursive(baseUrl, currentUrl, depth, visited, results) {
        // Limits: depth, already visited, or max pages (limit to 25 to prevent abuse)
        if (depth < 0 || visited.has(currentUrl) || visited.size >= 25)
            return;
        visited.add(currentUrl);
        try {
            const response = await axios_1.default.get(currentUrl, {
                headers: { 'User-Agent': 'TrykBot/1.0 (AI Support Assistant)' },
                timeout: 10000
            });
            const $ = cheerio.load(response.data);
            // Extract content from current page
            const title = $('title').text().trim() || 'Untitled';
            const content = [];
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
                const links = [];
                $('a[href]').each((_, el) => {
                    let href = $(el).attr('href');
                    if (!href)
                        return;
                    // Normalize href
                    try {
                        const absUrl = new URL(href, currentUrl).href;
                        const parsed = new URL(absUrl);
                        // Only stay on same domain, internal links, no hashes
                        if (parsed.hostname === domain && !parsed.hash) {
                            links.push(absUrl);
                        }
                    }
                    catch (e) { }
                });
                // Cull duplicates and crawl
                const uniqueLinks = [...new Set(links)];
                for (const link of uniqueLinks) {
                    await this.crawlRecursive(baseUrl, link, depth - 1, visited, results);
                }
            }
        }
        catch (error) {
            console.warn(`Crawler: Failed to fetch ${currentUrl}: ${error.message}`);
        }
    }
}
exports.CrawlerService = CrawlerService;
