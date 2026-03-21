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
exports.KnowledgeIngestionService = void 0;
const axios_1 = __importDefault(require("axios"));
const cheerio = __importStar(require("cheerio"));
const db_1 = require("../db");
const uuid_1 = require("uuid");
class KnowledgeIngestionService {
    /**
     * Main ingestion orchestrator
     */
    static async ingestWebsite(shopId, baseUrl, options = {}) {
        console.log(`[KB Ingestion] Starting ingestion for ${shopId}: ${baseUrl}`);
        const { maxDepth = 2, maxPages = 25, prioritizePolicies = true } = options;
        try {
            // Step 1: Extract relevant pages
            const relevantPages = prioritizePolicies
                ? await this.extractRelevantPages(baseUrl, maxPages)
                : await this.crawlWebsite(baseUrl, maxDepth, maxPages);
            console.log(`[KB Ingestion] Found ${relevantPages.length} relevant pages`);
            // Step 2: Process each page
            const allChunks = [];
            for (const page of relevantPages) {
                try {
                    const chunks = await this.processPage(shopId, page);
                    allChunks.push(...chunks);
                }
                catch (error) {
                    console.warn(`[KB Ingestion] Failed to process ${page.url}: ${error.message}`);
                }
            }
            console.log(`[KB Ingestion] Generated ${allChunks.length} chunks`);
            // Step 3: Generate embeddings and store
            await this.storeKnowledgeChunks(allChunks);
            console.log(`[KB Ingestion] Successfully ingested ${allChunks.length} chunks for ${shopId}`);
        }
        catch (error) {
            console.error(`[KB Ingestion] Failed for ${shopId}: ${error.message}`);
            throw error;
        }
    }
    /**
     * Extract only relevant pages (FAQ, policies, help, contact)
     */
    static async extractRelevantPages(baseUrl, maxPages = 25) {
        const origin = baseUrl.startsWith('http') ? baseUrl : `https://${baseUrl}`;
        const relevantPages = [];
        // First, check policy pages
        for (const policy of this.POLICY_PATHS) {
            if (relevantPages.length >= maxPages)
                break;
            const url = `${origin}${policy.path}`;
            try {
                const response = await axios_1.default.head(url, {
                    headers: { 'User-Agent': 'TrykBot/1.0 (KB Ingestion)' },
                    timeout: 5000,
                    validateStatus: (status) => status === 200
                });
                if (response.status === 200) {
                    relevantPages.push({ url, type: policy.type });
                }
            }
            catch (error) {
                // 404 is expected for many policies, just ignore
            }
        }
        // Then, discover additional relevant pages by crawling homepage
        if (relevantPages.length < maxPages) {
            try {
                const discoveredPages = await this.discoverRelevantPages(origin, maxPages - relevantPages.length);
                relevantPages.push(...discoveredPages);
            }
            catch (error) {
                console.warn(`[KB Ingestion] Failed to discover pages: ${error.message}`);
            }
        }
        return relevantPages;
    }
    /**
     * Discover relevant pages from homepage navigation
     */
    static async discoverRelevantPages(baseUrl, limit) {
        try {
            const response = await axios_1.default.get(baseUrl, {
                headers: { 'User-Agent': 'TrykBot/1.0 (KB Ingestion)' },
                timeout: 10000
            });
            const $ = cheerio.load(response.data);
            const discovered = [];
            // First pass: Look for highly relevant links
            $('a[href]').each((_, el) => {
                if (discovered.length >= limit)
                    return false;
                const href = $(el).attr('href');
                if (!href)
                    return;
                const text = $(el).text().toLowerCase().trim();
                const hrefLower = href.toLowerCase();
                // Check if link text or href contains relevant keywords
                const isRelevant = this.RELEVANT_KEYWORDS.some(keyword => text.includes(keyword) || hrefLower.includes(keyword));
                // Also check for substantial link text (likely important content)
                const isSubstantial = text.length > 15 && text.length < 100;
                const isNotNavigation = !this.isNavigationText(text);
                if (isRelevant || (isSubstantial && isNotNavigation)) {
                    try {
                        const absUrl = new URL(href, baseUrl).href;
                        const parsed = new URL(absUrl);
                        if (parsed.hostname === new URL(baseUrl).hostname) {
                            const type = this.inferPageType(text, hrefLower);
                            discovered.push({ url: absUrl, type });
                        }
                    }
                    catch (e) {
                        // Invalid URL, skip
                    }
                }
            });
            // Second pass: If still need more pages, look for any internal links
            if (discovered.length < limit) {
                $('a[href]').each((_, el) => {
                    if (discovered.length >= limit)
                        return false;
                    const href = $(el).attr('href');
                    if (!href)
                        return;
                    const text = $(el).text().toLowerCase().trim();
                    const hrefLower = href.toLowerCase();
                    // Skip navigation, social links, and very short text
                    if (this.isNavigationText(text) || text.length < 5)
                        return;
                    try {
                        const absUrl = new URL(href, baseUrl).href;
                        const parsed = new URL(absUrl);
                        // Only include internal links and exclude common non-content pages
                        if (parsed.hostname === new URL(baseUrl).hostname &&
                            !hrefLower.includes('#') &&
                            !hrefLower.includes('tel:') &&
                            !hrefLower.includes('mailto:') &&
                            !hrefLower.includes('javascript:') &&
                            !hrefLower.includes('login') &&
                            !hrefLower.includes('register') &&
                            !hrefLower.includes('cart') &&
                            !hrefLower.includes('checkout')) {
                            const type = this.inferPageType(text, hrefLower);
                            discovered.push({ url: absUrl, type });
                        }
                    }
                    catch (e) {
                        // Invalid URL, skip
                    }
                });
            }
            return [...new Set(discovered)]; // Remove duplicates
        }
        catch (error) {
            console.warn(`[KB Ingestion] Discovery failed: ${error.message}`);
            return [];
        }
    }
    /**
     * Process a single page into knowledge chunks
     */
    static async processPage(shopId, pageInfo) {
        console.log(`[KB Ingestion] Processing: ${pageInfo.url}`);
        const response = await axios_1.default.get(pageInfo.url, {
            headers: { 'User-Agent': 'TrykBot/1.0 (KB Ingestion)' },
            timeout: 10000
        });
        // Step 1: Clean HTML aggressively
        const cleanedContent = this.cleanHTML(response.data, pageInfo.url);
        if (!cleanedContent || cleanedContent.length < 50) {
            console.warn(`[KB Ingestion] Too little content after cleaning: ${pageInfo.url} (${cleanedContent?.length || 0} chars)`);
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
     * Clean HTML aggressively using cheerio and custom extraction
     */
    static cleanHTML(html, url) {
        try {
            // Use cheerio for Node.js HTML parsing
            const $ = cheerio.load(html);
            // Remove noise elements aggressively
            $('script, style, nav, footer, header, aside, .sidebar, .menu, .navigation, .ads, .cookie-banner, .popup, .modal, .overlay').remove();
            $('img, svg, video, audio, iframe, object, embed').remove();
            $('form, input, button, select, textarea').remove();
            $('.social-share, .comments, .related-posts, .advertisement').remove();
            // Remove elements with common spam/ad classes
            $('[class*="ad-"], [class*="ads-"], [class*="banner"], [class*="popup"], [class*="modal"], [class*="overlay"]').remove();
            $('[id*="ad-"], [id*="ads-"], [id*="banner"], [id*="popup"], [id*="modal"]').remove();
            // Try to find main content areas first
            let content = '';
            // Priority content selectors
            const contentSelectors = [
                'main', 'article', '.content', '.main-content', '.page-content',
                '.post-content', '.entry-content', '.article-content', '.section-content',
                '.policy-content', '.faq-content', '.help-content', '.documentation',
                '#content', '#main', '#article', '#post', '.container .row', '.wrapper'
            ];
            for (const selector of contentSelectors) {
                const $element = $(selector);
                if ($element.length > 0) {
                    content = this.extractTextFromElement($element);
                    if (content.length > 200) {
                        break; // Found substantial content
                    }
                }
            }
            // If no substantial content found, extract from body
            if (content.length < 200) {
                content = this.extractTextFromElement($('body'));
            }
            // Final cleanup
            content = content
                .replace(/\s+/g, ' ')
                .replace(/\n+/g, ' ')
                .replace(/\t+/g, ' ')
                .replace(/[^\w\s\.\,\!\?\;\:\-\(\)\[\]\{\}\"\'\/\\@#\$%\^&\*\+\=\|\~\`]/g, ' ')
                .replace(/\s{2,}/g, ' ')
                .trim();
            return content;
        }
        catch (error) {
            console.warn(`[KB Ingestion] HTML cleaning failed: ${error.message}`);
            return '';
        }
    }
    /**
     * Extract meaningful text from a cheerio element
     */
    static extractTextFromElement($element) {
        // Simply get all text content from the element and its children
        const content = $element.text().trim();
        // Clean up the content
        return content
            .replace(/\s+/g, ' ')
            .replace(/\n+/g, ' ')
            .replace(/\t+/g, ' ')
            .trim();
    }
    /**
     * Filter out navigation and menu text
     */
    static isNavigationText(text) {
        const navKeywords = [
            'menu', 'home', 'about', 'contact', 'login', 'register', 'signup',
            'cart', 'checkout', 'search', 'browse', 'category', 'products',
            'facebook', 'twitter', 'instagram', 'linkedin', 'youtube',
            '©', 'copyright', 'all rights reserved', 'privacy policy', 'terms'
        ];
        const lowerText = text.toLowerCase();
        return navKeywords.some(keyword => lowerText.includes(keyword)) && text.length < 50;
    }
    /**
     * Semantic chunking - split content into logical chunks
     */
    static semanticChunking(content, metadata) {
        const chunks = [];
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
            }
            else {
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
    static createChunk(content, metadata, index) {
        return {
            id: (0, uuid_1.v4)(),
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
    static estimateTokenCount(text) {
        // Rough approximation: ~4 characters per token
        return Math.ceil(text.length / 4);
    }
    /**
     * Generate embeddings for chunks and store in database
     */
    static async storeKnowledgeChunks(chunks) {
        console.log(`[KB Ingestion] Generating embeddings for ${chunks.length} chunks`);
        for (const chunk of chunks) {
            try {
                // Generate embedding using OpenAI
                const embedding = await this.generateEmbedding(chunk.content);
                // Store in database
                await (0, db_1.query)(`
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
            }
            catch (error) {
                console.error(`[KB Ingestion] Failed to store chunk ${chunk.id}: ${error.message}`);
            }
        }
    }
    /**
     * Generate embedding for text
     */
    static async generateEmbedding(text) {
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
        }
        catch (error) {
            console.error(`[KB Ingestion] Embedding generation failed: ${error.message}`);
            throw error;
        }
    }
    /**
     * Infer page type from URL and text
     */
    static inferPageType(text, href) {
        const lowerText = text.toLowerCase();
        const lowerHref = href.toLowerCase();
        if (lowerText.includes('shipping') || lowerHref.includes('shipping'))
            return 'shipping_policy';
        if (lowerText.includes('return') || lowerText.includes('refund'))
            return 'return_policy';
        if (lowerText.includes('privacy'))
            return 'privacy_policy';
        if (lowerText.includes('terms'))
            return 'terms_of_service';
        if (lowerText.includes('faq') || lowerHref.includes('faq'))
            return 'faq';
        if (lowerText.includes('contact') || lowerText.includes('help'))
            return 'help';
        return 'general';
    }
    /**
     * Extract title from content when HTML title is not available
     */
    static extractTitleFromContent(content) {
        const lines = content.split('\n').map(line => line.trim()).filter(line => line.length > 0);
        return lines[0] || 'Untitled';
    }
    /**
     * Fallback website crawler (used when prioritizePolicies = false)
     */
    static async crawlWebsite(baseUrl, depth = 2, maxPages = 25) {
        // This would implement a full crawler similar to the existing CrawlerService
        // For now, return policy pages
        return this.extractRelevantPages(baseUrl, maxPages);
    }
}
exports.KnowledgeIngestionService = KnowledgeIngestionService;
KnowledgeIngestionService.POLICY_PATHS = [
    { type: 'shipping_policy', path: '/policies/shipping-policy', priority: 1 },
    { type: 'return_policy', path: '/policies/refund-policy', priority: 1 },
    { type: 'privacy_policy', path: '/policies/privacy-policy', priority: 2 },
    { type: 'terms_of_service', path: '/policies/terms-of-service', priority: 2 },
    { type: 'faq', path: '/pages/faqs', priority: 1 },
    { type: 'faq', path: '/pages/faq', priority: 1 },
    { type: 'help', path: '/pages/contact', priority: 2 },
    { type: 'help', path: '/pages/help', priority: 2 },
];
KnowledgeIngestionService.RELEVANT_KEYWORDS = [
    'shipping', 'delivery', 'returns', 'refund', 'policy', 'faq', 'help',
    'contact', 'support', 'about', 'terms', 'privacy', 'order', 'tracking',
    'service', 'features', 'pricing', 'product', 'how', 'guide', 'tutorial',
    'documentation', 'blog', 'news', 'announcement', 'update', 'what',
    'why', 'getting started', 'learn', 'knowledge', 'information', 'details'
];
