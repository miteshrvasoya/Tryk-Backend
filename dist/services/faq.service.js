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
exports.scanAndLearnFAQ = void 0;
const axios_1 = __importDefault(require("axios"));
const cheerio = __importStar(require("cheerio"));
const db_1 = require("../db");
// Mock embedding generation for now
const generateEmbedding = async (text) => {
    return new Array(1536).fill(0.1);
};
const scanAndLearnFAQ = async (storeId, websiteUrl) => {
    try {
        // 1. Scrape Website
        // Simple scraper: just the homepage + typical FAQ paths
        // In reality, needs crawler logic.
        const pagesToScan = [
            websiteUrl,
            `${websiteUrl}/pages/faq`,
            `${websiteUrl}/pages/shipping`,
            `${websiteUrl}/pages/returns`
        ];
        const documents = [];
        for (const url of pagesToScan) {
            try {
                const response = await axios_1.default.get(url, { timeout: 5000 });
                const $ = cheerio.load(response.data);
                // Heuristic: specific to Shopify free themes or general
                // Extract headings and paragraphs
                // Very naive extraction
                const title = $('title').text();
                const bodyText = $('body').text().replace(/\s+/g, ' ').trim().slice(0, 1000); // Limit size
                if (bodyText.length > 50) {
                    documents.push({
                        title: title || 'Page Content',
                        content: bodyText,
                        category: 'general',
                        source_url: url
                    });
                }
            }
            catch (e) {
                // Ignore 404s
                console.log(`Failed to scrape ${url}`);
            }
        }
        // 2. Generate Embeddings & Store
        let count = 0;
        for (const doc of documents) {
            const embedding = await generateEmbedding(doc.content);
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
