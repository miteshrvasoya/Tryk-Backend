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
Object.defineProperty(exports, "__esModule", { value: true });
exports.FAQScanService = exports.faqScanQueue = void 0;
const simple_queue_1 = require("../lib/simple-queue");
const db_1 = require("../db");
const crawler_service_1 = require("./crawler.service");
exports.faqScanQueue = new simple_queue_1.SimpleQueue('faqScan');
class FAQScanService {
    /**
     * Starts a new website scan job.
     */
    static async startScan(shopId, websiteUrl, crawlDepth = 3) {
        // 1. Create job entry in DB
        const result = await (0, db_1.query)(`INSERT INTO faq_scan_jobs (shop_id, website_url, status) VALUES ($1, $2, 'pending') RETURNING id`, [shopId, websiteUrl]);
        const jobId = result.rows[0].id;
        // 2. Queue the job
        await exports.faqScanQueue.add('scan', {
            jobId,
            shopId,
            websiteUrl,
            crawlDepth
        }, {
            jobId: `scan-${jobId}`
        });
        return { jobId, status: 'queued' };
    }
    /**
     * Gets the status of a scan job.
     */
    static async getJobStatus(jobId) {
        const result = await (0, db_1.query)('SELECT * FROM faq_scan_jobs WHERE id = $1', [jobId]);
        if (result.rows.length === 0)
            return null;
        return result.rows[0];
    }
}
exports.FAQScanService = FAQScanService;
// Initialize Worker Logic
exports.faqScanQueue.process(async (job) => {
    const { jobId, shopId, websiteUrl } = job.data;
    try {
        // Update DB status to processing
        await (0, db_1.query)('UPDATE faq_scan_jobs SET status = $1, updated_at = NOW() WHERE id = $2', ['processing', jobId]);
        console.log(`Worker: Starting scan for job ${jobId} (${websiteUrl})...`);
        // 1. Regular Crawl (Scrape Content)
        const scraped = await crawler_service_1.CrawlerService.scanWebsite(websiteUrl);
        // Save Crawled Content to faq_drafts
        for (const content of scraped.content) {
            if (content.length < 50)
                continue;
            await (0, db_1.query)(`
        INSERT INTO faq_drafts (job_id, shop_id, question, answer, source_url, status)
        VALUES ($1, $2, $3, $4, $5, 'pending_review')
      `, [jobId, shopId, "Extracted Content", content, scraped.url]);
        }
        // 2. Policy Scraping (NEW)
        const { PolicyScraperService } = await Promise.resolve().then(() => __importStar(require('./policy-scraper.service')));
        const policies = await PolicyScraperService.scrapePolicies(websiteUrl);
        for (const policy of policies) {
            // We'll store policies as "Answer" and the Policy Type as "Question" for now, 
            // effectively treating them as pre-approved FAQs or reference docs.
            // We might want a 'source_type' column later, but for MVP drafts work fine.
            await (0, db_1.query)(`
            INSERT INTO faq_drafts (job_id, shop_id, question, answer, source_url, status)
            VALUES ($1, $2, $3, $4, $5, 'approved') 
        `, [jobId, shopId, policy.type, policy.content, policy.url]);
        }
        console.log(`Worker: Saved ${policies.length} policy pages.`);
        // Update DB status to completed
        await (0, db_1.query)('UPDATE faq_scan_jobs SET status = $1, updated_at = NOW() WHERE id = $2', ['completed', jobId]);
        console.log(`Worker: Job ${jobId} completed.`);
    }
    catch (error) {
        console.error(`Worker: Job ${jobId} failed:`, error.message);
        await (0, db_1.query)('UPDATE faq_scan_jobs SET status = $1, error_message = $2, updated_at = NOW() WHERE id = $3', ['error', error.message, jobId]);
        // Don't rethrow, just log, as SimpleQueue doesn't retry automatically yet
    }
});
