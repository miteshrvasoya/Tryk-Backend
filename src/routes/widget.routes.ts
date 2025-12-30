import { Router } from 'express';
import { WidgetService } from '../services/widget.service';
import { authenticateToken } from '../middleware/auth.middleware';

const router = Router();

// Create widget
router.post('/generate', authenticateToken, async (req, res) => {
    try {
        const { shopId, config } = req.body;
        if (!shopId) return res.status(400).json({ error: 'shopId is required' });
        
        // Check if already exists
        const existing = await WidgetService.getWidgetByShopId(shopId);
        if (existing) {
             return res.status(200).json(existing);
        }
        
        const result = await WidgetService.createWidget(shopId, config);
        res.status(201).json(result);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Public: Get widget config (called by the widget script)
router.get('/config/:key', async (req, res) => {
    try {
        const { key } = req.params;
        const widget = await WidgetService.getWidget(key);
        if (!widget) return res.status(404).json({ error: 'Widget not found' });
        res.json(widget.config);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Get widget by shopId (for dashboard)
router.get('/shop/:shopId', authenticateToken, async (req, res) => {
    try {
        const { shopId } = req.params;
        const widget = await WidgetService.getWidgetByShopId(shopId);
        
        if (!widget) {
            // Not found is fine, means user hasn't generated one yet
            return res.status(200).json({ exists: false });
        }
        
        res.json({ exists: true, ...widget });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Update config
router.put('/:key/config', authenticateToken, async (req, res) => {
    try {
        const { key } = req.params;
        const { config } = req.body;
        const result = await WidgetService.updateConfig(key, config);
        res.json(result);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

export default router;
