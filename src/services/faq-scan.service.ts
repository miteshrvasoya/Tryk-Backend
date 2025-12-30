import { SimpleQueue } from '../lib/simple-queue';
import { query } from '../db';
import { CrawlerService } from './crawler.service';

export const faqScanQueue = new SimpleQueue('faqScan');

export class FAQScanService {
  /**
   * Starts a new website scan job.
   */
  static async startScan(shopId: string, websiteUrl: string, crawlDepth: number = 3) {
    // 1. Create job entry in DB
    const result = await query(
      `INSERT INTO faq_scan_jobs (shop_id, website_url, status) VALUES ($1, $2, 'pending') RETURNING id`,
      [shopId, websiteUrl]
    );
    const jobId = result.rows[0].id;

    // 2. Queue the job
    await faqScanQueue.add('scan', {
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
  static async getJobStatus(jobId: number) {
    const result = await query('SELECT * FROM faq_scan_jobs WHERE id = $1', [jobId]);
    if (result.rows.length === 0) return null;
    return result.rows[0];
  }
}

// Initialize Worker Logic
faqScanQueue.process(async (job) => {
  const { jobId, shopId, websiteUrl } = job.data;

  try {
    // Update DB status to processing
    await query('UPDATE faq_scan_jobs SET status = $1, updated_at = NOW() WHERE id = $2', ['processing', jobId]);

    console.log(`Worker: Starting scan for job ${jobId} (${websiteUrl})...`);

    const scraped = await CrawlerService.scanWebsite(websiteUrl);

    // Save to faq_drafts
    for (const content of scraped.content) {
      if (content.length < 50) continue;
      
      await query(`
        INSERT INTO faq_drafts (job_id, shop_id, question, answer, source_url, status)
        VALUES ($1, $2, $3, $4, $5, 'pending_review')
      `, [jobId, shopId, "Extracted Content", content, scraped.url]);
    }

    // Update DB status to completed
    await query('UPDATE faq_scan_jobs SET status = $1, updated_at = NOW() WHERE id = $2', ['completed', jobId]);
    console.log(`Worker: Job ${jobId} completed.`);

  } catch (error: any) {
    console.error(`Worker: Job ${jobId} failed:`, error.message);
    await query('UPDATE faq_scan_jobs SET status = $1, error_message = $2, updated_at = NOW() WHERE id = $3', ['error', error.message, jobId]);
    // Don't rethrow, just log, as SimpleQueue doesn't retry automatically yet
  }
});
