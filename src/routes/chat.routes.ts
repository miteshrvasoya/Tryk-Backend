import { Router, Request, Response } from 'express';
import { ChatEngineService } from '../services/chat-engine.service';
import { WidgetService } from '../services/widget.service';
import { query } from '../db';
import { authenticateToken } from '../middleware/auth.middleware';

const router = Router();

// Send message from Widget
router.post('/message', async (req: Request, res: Response) => {
    const { shopId, message, customerId, metadata, widgetKey } = req.body;
    
    if (!message) {
        return res.status(400).json({ error: 'message is required' });
    }

    try {
        let finalShopId = shopId;

        // Module 2.1: Validate widgetKey
        if (widgetKey) {
            const widget = await WidgetService.getWidget(widgetKey);
            console.log(`[Chat] Validating Widget Key: ${widgetKey}`, widget);
            
            // Loose check for is_active matching false explicitly, or widget missing
            if (!widget || widget.is_active === false) {
                console.warn(`[Chat] Invalid widget key or inactive: ${widgetKey}`);
                return res.status(403).json({ error: 'Invalid or inactive widget key' });
            }
            finalShopId = widget.shop_id;
        }

        if (!finalShopId) {
            return res.status(400).json({ error: 'shopId or widgetKey is required' });
        }

        const result = await ChatEngineService.processMessage(finalShopId, message, metadata);
        
        // Note: Conversation and Message logging is currently inside ChatEngineService or handled as a side-effect
        
        res.json(result);
    } catch (err: any) {
        console.error('Chat Route Error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Admin: List conversations
router.get('/conversations', authenticateToken, async (req: Request, res: Response) => {
    try {
        const result = await query('SELECT * FROM conversations ORDER BY created_at DESC LIMIT 50');
        res.json(result.rows);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
