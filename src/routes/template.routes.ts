import { Router } from 'express';
import { TemplateService } from '../services/template.service';
import { authenticateToken } from '../middleware/auth.middleware';

const router = Router();

// Get all templates for a shop
router.get('/:shopId', authenticateToken, async (req, res) => {
    try {
        const { shopId } = req.params;
        // Verify user has access to this shop (TODO: Add strict ownership check)
        const templates = await TemplateService.getTemplatesByShop(shopId);
        res.json(templates);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Create
router.post('/create', authenticateToken, async (req, res) => {
    try {
        const { shopId, name, trigger_intent, content, is_default } = req.body;
        if (!shopId || !content || !name) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        
        const template = await TemplateService.createTemplate(shopId, { name, trigger_intent, content, is_default });
        res.status(201).json(template);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Update
router.put('/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { shopId, ...data } = req.body;
        
        const updated = await TemplateService.updateTemplate(id, shopId, data);
        res.json(updated);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Delete
router.delete('/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { shopId } = req.query; // Pass shopId in query for safety check in service
        
        await TemplateService.deleteTemplate(id, shopId as string);
        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

export default router;
