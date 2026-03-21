import { Router } from 'express';
import { WebsiteManagementService } from '../services/website-management.service';
import { authenticateToken } from '../middleware/auth.middleware';

const router = Router();

// Get all website types
router.get('/types', (req, res) => {
  try {
    const types = WebsiteManagementService.getWebsiteTypes();
    res.json(types);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get dashboard widgets
router.get('/dashboard/widgets', (req, res) => {
  try {
    const widgets = WebsiteManagementService.getDashboardWidgets();
    res.json(widgets);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Register a new website
router.post('/register', authenticateToken, async (req, res) => {
  try {
    const { shopId } = (req as any).user;
    const websiteData = req.body;
    await WebsiteManagementService.registerWebsite(shopId, websiteData);
    res.status(201).json({ message: 'Website registered successfully' });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// Get all websites for a shop
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { shopId } = (req as any).user;
    const websites = await WebsiteManagementService.getShopWebsites(shopId);
    res.json(websites);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Update website
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { shopId } = (req as any).user;
    const { id } = req.params;
    const updates = req.body;
    await WebsiteManagementService.updateWebsite(id, updates, shopId);
    res.json({ message: 'Website updated successfully' });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// Delete website
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { shopId } = (req as any).user;
    const { id } = req.params;
    await WebsiteManagementService.deleteWebsite(id, shopId);
    res.json({ message: 'Website deleted successfully' });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// Ingest website content
router.post('/ingest', authenticateToken, async (req, res) => {
  try {
    const { shopId } = (req as any).user;
    const ingestionRequest = req.body;
    await WebsiteManagementService.ingestWebsiteContent(ingestionRequest);
    res.json({ message: 'Website ingestion started' });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// Get ingestion history
router.get('/ingestion/history', authenticateToken, async (req, res) => {
  try {
    const { shopId } = (req as any).user;
    const { limit = 10 } = req.query;
    const history = await WebsiteManagementService.getIngestionHistory(shopId, Number(limit));
    res.json(history);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get website statistics
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    const { shopId } = (req as any).user;
    const stats = await WebsiteManagementService.getWebsiteStats(shopId);
    res.json(stats);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
