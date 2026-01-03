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

        const result = await ChatEngineService.processMessage(finalShopId, message, {
            ...metadata,
            customerId: customerId
        });
        
        // Note: Conversation and Message logging is currently inside ChatEngineService or handled as a side-effect
        
        res.json(result);
    } catch (err: any) {
        console.error('Chat Route Error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Get Chat History for Widget (Polling)
router.get('/history', async (req: Request, res: Response) => {
    const { widgetKey, customerId } = req.query;
    
    console.log(`[History] Polling for Key: ${widgetKey}, Cust: ${customerId}`);

    if (!widgetKey || !customerId) {
        return res.status(400).json({ error: 'widgetKey and customerId are required' });
    }

    try {
        const widget = await WidgetService.getWidget(widgetKey as string);
        if (!widget) { 
             console.log(`[History] Widget not found: ${widgetKey}`);
             return res.status(404).json({ error: 'Widget not found' });
        }
        
        const shopId = widget.shop_id;
        console.log(`[History] Resolved Shop: ${shopId}`);

        // Find active conversation
        const convResult = await query(
            `SELECT id FROM conversations WHERE shop_id = $1 AND customer_id = $2 ORDER BY updated_at DESC LIMIT 1`,
            [shopId, customerId]
        );

        if (convResult.rows.length === 0) {
            console.log(`[History] No conversation found for Shop: ${shopId}, Cust: ${customerId}`);
            return res.json([]); // No history
        }

        const conversationId = convResult.rows[0].id;
        console.log(`[History] Found Conversation: ${conversationId}`);

        // Fetch messages
        const messages = await query(
            `SELECT id, role, content, created_at, sender FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC`,
            [conversationId]
        );
        
        console.log(`[History] Returning ${messages.rows.length} messages`);
        res.json(messages.rows);

    } catch (err: any) {
        console.error('Chat History Error:', err);
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

// Admin: Get messages for a specific conversation
router.get('/conversations/:id/messages', authenticateToken, async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const result = await query(
            'SELECT * FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC',
            [id]
        );
        res.json(result.rows);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
