import { Router } from 'express';
import { authenticateToken } from '../middleware/auth.middleware';
import { EnhancedChatEngineService, EnhancedChatResponse } from '../services/enhanced-chat-engine.service';

const router = Router();

/**
 * POST /api/chat/enhanced
 * Enhanced chat endpoint with full RAG + tool-based pipeline
 */
router.post('/enhanced', authenticateToken, async (req, res) => {
  try {
    const { shopId, message, conversationId, metadata } = req.body;
    
    if (!shopId || !message) {
      return res.status(400).json({ 
        error: 'shopId and message are required' 
      });
    }

    // Verify user has access to this shop
    const userShops = (req as any).user.shop_ids || [];
    if (!userShops.includes(shopId)) {
      return res.status(403).json({ 
        error: 'Access denied for this shop' 
      });
    }

    console.log(`[ChatRoutes] Enhanced chat request for ${shopId}: "${message}"`);

    const response = await EnhancedChatEngineService.processMessage(shopId, message, {
      ...metadata,
      conversationId
    });

    res.json(response);

  } catch (error: any) {
    console.error('[ChatRoutes] Enhanced chat error:', error);
    res.status(500).json({ 
      error: error.message 
    });
  }
});

/**
 * GET /api/chat/analytics/:shopId
 * Get chat analytics for a specific shop
 */
router.get('/analytics/:shopId', authenticateToken, async (req, res) => {
  try {
    const { shopId } = req.params;
    const { days = 7 } = req.query;
    
    // Verify user has access to this shop
    const userShops = (req as any).user.shop_ids || [];
    if (!userShops.includes(shopId)) {
      return res.status(403).json({ 
        error: 'Access denied for this shop' 
      });
    }

    console.log(`[ChatRoutes] Analytics request for ${shopId}`);

    const analytics = await EnhancedChatEngineService.getConversationAnalytics(shopId, parseInt(days as string));
    const intentAnalytics = await EnhancedChatEngineService.getIntentAnalytics(shopId, parseInt(days as string));

    res.json({
      shopId,
      period: `${days} days`,
      conversationAnalytics: analytics,
      intentDistribution: intentAnalytics,
      generatedAt: new Date().toISOString()
    });

  } catch (error: any) {
    console.error('[ChatRoutes] Analytics error:', error);
    res.status(500).json({ 
      error: error.message 
    });
  }
});

/**
 * GET /api/chat/health
 * Health check for enhanced chat engine
 */
router.get('/health', async (req, res) => {
  try {
    const health = await EnhancedChatEngineService.healthCheck();
    res.json(health);
  } catch (error: any) {
    console.error('[ChatRoutes] Health check error:', error);
    res.status(500).json({ 
      status: 'unhealthy',
      error: error.message 
    });
  }
});

/**
 * POST /api/chat/feedback
 * Log user feedback for response quality
 */
router.post('/feedback', authenticateToken, async (req, res) => {
  try {
    const { shopId, conversationId, messageId, rating, feedback } = req.body;
    
    if (!shopId || !conversationId || !messageId || rating === undefined) {
      return res.status(400).json({ 
        error: 'shopId, conversationId, messageId, and rating are required' 
      });
    }

    // Verify user has access to this shop
    const userShops = (req as any).user.shop_ids || [];
    if (!userShops.includes(shopId)) {
      return res.status(403).json({ 
        error: 'Access denied for this shop' 
      });
    }

    console.log(`[ChatRoutes] Feedback logged for ${shopId}: rating ${rating}`);

    // Log feedback (would integrate with analytics service)
    // This would be expanded to track response quality and improve the system
    
    res.json({ 
      message: 'Feedback logged successfully',
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    console.error('[ChatRoutes] Feedback error:', error);
    res.status(500).json({ 
      error: error.message 
    });
  }
});

export default router;
