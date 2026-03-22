import { Router } from 'express';
import { WebsiteManagementService } from '../services/website-management.service';
import { WebsiteCrawlerService } from '../services/website-crawler.service';
import { authenticateToken } from '../middleware/auth.middleware';

const router = Router();

// Helper to get userId
const getUserId = (req: any) => req.user?.id;

// Get status for the dashboard
router.get('/status', authenticateToken, async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized user' });
    const status = await WebsiteManagementService.getWebsiteStatus(userId);
    res.json(status);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Register a new website
router.post('/register', authenticateToken, async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized user' });
    const websiteData = req.body;
    const result = await WebsiteManagementService.registerWebsite(userId, websiteData);
    
    // Automatically trigger scraping job in the background asynchronously
    WebsiteCrawlerService.startCrawl(result.id, userId, websiteData.websiteUrl).catch(console.error);
    
    res.status(201).json({ message: 'Website registered and ingestion started', websiteId: result.id });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// Ingest / Rescan website
router.post('/ingest', authenticateToken, async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized user' });
    const { websiteUrl, websiteId } = req.body;
    
    const targetUrl = websiteUrl; // from request or looking up by id

    let id = websiteId;
    if (!id) {
        // Register if not provided
        const result = await WebsiteManagementService.registerWebsite(userId, { websiteUrl: targetUrl });
        id = result.id;
    } else {
        await WebsiteManagementService.updateWebsiteStatus(id, { status: 'processing' });
    }

    // Trigger crawl async
    WebsiteCrawlerService.startCrawl(id, userId, targetUrl).catch(console.error);

    res.json({ message: 'Website ingestion started', websiteId: id });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// Retry ingestion mapping to ingest
router.post('/retry', authenticateToken, async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized user' });
    const { websiteId, websiteUrl } = req.body;
    
    await WebsiteManagementService.updateWebsiteStatus(websiteId, { status: 'processing' });
    WebsiteCrawlerService.startCrawl(websiteId, userId, websiteUrl).catch(console.error);

    res.json({ message: 'Website ingestion retried', websiteId });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// Get all websites for a shop
router.get('/', authenticateToken, async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized user' });
    const websites = await WebsiteManagementService.getUserWebsites(userId);
    res.json(websites);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get ingestion history (mocked for frontend backward compatibility)
router.get('/ingestion/history', authenticateToken, async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized user' });
    const websites = await WebsiteManagementService.getUserWebsites(userId);
    
    const history = websites.filter(w => w.status === 'completed' || w.pages_count > 0).map(w => ({
        id: w.id,
        website_url: w.website_url,
        chunks_count: w.pages_count, // rough mapping
        status: w.status,
        created_at: w.last_crawled_at || w.updated_at
    }));
    
    res.json(history);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Delete website
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized user' });
    const { id } = req.params;
    await WebsiteManagementService.deleteWebsite(id, userId);
    res.json({ message: 'Website deleted successfully' });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// Get website statistics
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized user' });
    const stats = await WebsiteManagementService.getWebsiteStats(userId);
    res.json(stats);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
