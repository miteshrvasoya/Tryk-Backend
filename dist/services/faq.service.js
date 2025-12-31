"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.scanAndLearnFAQ = void 0;
const crawler_service_1 = require("./crawler.service");
const db_1 = require("../db");
// Mock embedding generation for now
const generateEmbedding = async (text) => {
    return new Array(1536).fill(0.1);
};
const scanAndLearnFAQ = async (storeId, websiteUrl) => {
    try {
        // 1. Scrape Website
        // Uses CrawlerService
        const documents = [];
        // Scan main page
        try {
            const homeContent = await crawler_service_1.CrawlerService.scanWebsite(websiteUrl);
            documents.push({
                title: homeContent.title,
                content: homeContent.content.join('\n\n'),
                category: 'general',
                source_url: websiteUrl
            });
        }
        catch (e) {
            console.error(e);
        }
        // Scan common pages
        const commonPaths = ['/pages/faq', '/pages/shipping', '/pages/returns', '/faq', '/shipping'];
        for (const path of commonPaths) {
            const url = websiteUrl.replace(/\/$/, '') + path; // naive join
            try {
                const pageContent = await crawler_service_1.CrawlerService.scanWebsite(url);
                if (pageContent.content.length > 0) {
                    documents.push({
                        title: pageContent.title,
                        content: pageContent.content.join('\n\n'),
                        category: 'general',
                        source_url: url
                    });
                }
            }
            catch (e) {
                // Ignore 404s
            }
        }
        // 2. Generate Embeddings & Store
        let count = 0;
        for (const doc of documents) {
            // skip empty
            if (!doc.content || doc.content.length < 50)
                continue;
            const embedding = await generateEmbedding(doc.content.substring(0, 1000)); // limit for embedding
            const vectorStr = `[${embedding.join(',')}]`;
            await (0, db_1.query)(`
                INSERT INTO faqs (shop_id, title, content, category, source_url, embedding)
                VALUES ($1, $2, $3, $4, $5, $6)
            `, [storeId, doc.title, doc.content, doc.category, doc.source_url, vectorStr]);
            count++;
        }
        return { success: true, documentsCount: count };
    }
    catch (error) {
        console.error('Scan failed:', error);
        throw new Error('Scan failed');
    }
};
exports.scanAndLearnFAQ = scanAndLearnFAQ;
