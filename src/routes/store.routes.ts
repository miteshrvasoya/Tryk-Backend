import { Router } from 'express';
import { query } from '../db';
import { authenticateToken } from '../middleware/auth.middleware';
import { scanAndLearnFAQ } from '../services/faq.service';

const router = Router();

// List stores
router.get('/', authenticateToken, async (req, res) => {
    try {
        // In real app, filter by user's access
        const result = await query('SELECT * FROM shops');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: 'Internal error' });
    }
});

// Create Generic Store
router.post('/create', authenticateToken, async (req, res) => {
    try {
        const { name, websiteUrl } = req.body;
        const userId = (req as any).user.id;
        
        // Generate a unique ID (e.g. uuid)
        // For simplicity, we can use a timestamp-random string or import uuid
        const { v4: uuidv4 } = require('uuid');
        const shopId = uuidv4(); 
        
        // Insert into DB
        await query(`
            INSERT INTO shops (shop_id, name, website_url, domain, platform, user_id, onboarding_complete)
            VALUES ($1, $2, $3, $4, 'generic', $5, true)
        `, [shopId, name, websiteUrl, websiteUrl, userId]);
        
        // Update user's shop_ids (if we store them in user table, though it's better to just query shops table)
        // Note: Our User table has shop_ids jsonb, we should update it or rely on relational query
        // Let's rely on relation for listing, but update for session consistency if needed
        
        res.status(201).json({ success: true, shopId });
    } catch (err: any) {
        console.error('Error creating store:', err);
        res.status(500).json({ error: err.message });
    }
});

// Get Shopify details for a specific shop
router.get('/:shopId/shopify-details', authenticateToken, async (req, res) => {
    try {
        const { shopId } = req.params;
        
        // Fetch shop details
        const shopResult = await query('SELECT * FROM shops WHERE shop_id = $1', [shopId]);
        
        if (shopResult.rows.length === 0) {
            return res.status(404).json({ error: 'Shop not found' });
        }
        
        const shop = shopResult.rows[0];
        
        // Check if Shopify is connected
        const isConnected = shop.platform === 'shopify' && !!shop.access_token;
        
        if (!isConnected) {
            return res.json({
                connected: false,
                shopId: shopId
            });
        }
        
        // Fetch product count
        const productCountResult = await query(
            'SELECT COUNT(*) as count FROM products WHERE shop_id = $1',
            [shopId]
        );
        const productCount = parseInt(productCountResult.rows[0].count) || 0;
        
        // Fetch recent products (first 6 with images)
        const productsResult = await query(
            `SELECT id, title, description, price, image_url, created_at, updated_at 
             FROM products 
             WHERE shop_id = $1 
             ORDER BY updated_at DESC 
             LIMIT 6`,
            [shopId]
        );
        
        res.json({
            connected: true,
            shopId: shop.shop_id,
            shopName: shop.name || shop.shop_id,
            websiteUrl: shop.website_url,
            platform: shop.platform,
            productCount: productCount,
            lastSync: productsResult.rows.length > 0 ? productsResult.rows[0].updated_at : null,
            recentProducts: productsResult.rows.map(p => ({
                id: p.id,
                title: p.title,
                price: parseFloat(p.price) || 0,
                imageUrl: p.image_url,
                updatedAt: p.updated_at
            }))
        });
    } catch (err: any) {
        console.error('Error fetching Shopify details:', err);
        res.status(500).json({ error: 'Internal error' });
    }
});

// Rescan FAQs (Mock)
router.post('/:storeId/rescan', authenticateToken, async (req, res) => {
    const { storeId } = req.params;
    const { websiteUrl } = req.body;
    
    // Trigger in bg
    scanAndLearnFAQ(storeId, websiteUrl).then(output => {
        console.log(`Scan complete for ${storeId}:`, output);
    }).catch(err => console.error(err));
    
    
    res.json({ status: 'scanning', estimatedTime: '2 min' });
});

import { registerWebhooks } from '../services/shopify.service';

router.post('/:storeId/setup-webhook', authenticateToken, async (req, res) => {
    const { storeId } = req.params;
    // In real app, fetch access token for storeId from DB
    const accessToken = 'mock_token'; 
    
    try {
        await registerWebhooks(storeId, accessToken);
        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Sync Shopify Data
router.post('/:storeId/shopify-sync', authenticateToken, async (req, res) => {
    const { storeId } = req.params;
    
    try {
        // Get store access token
        const shopResult = await query('SELECT access_token FROM shops WHERE shop_id = $1', [storeId]);
        if (shopResult.rows.length === 0) {
            return res.status(404).json({ error: 'Store not found' });
        }
        
        const { access_token } = shopResult.rows[0];
        if (!access_token) {
            return res.status(400).json({ error: 'Shopify not connected' });
        }
        
        // Dynamic import to avoid circular dep issues if any
        const { syncProducts, syncOrders } = await import('../services/shopify.service');
        
        // Run syncs
        const [productsResult, ordersResult] = await Promise.all([
            syncProducts(storeId, access_token),
            syncOrders(storeId, access_token)
        ]);
        
        // Get updated stats
        const productCountResult = await query(
            'SELECT COUNT(*) as count FROM products WHERE shop_id = $1',
            [storeId]
        );
        
        // Get last sync time (updated_at of store or product)
        // We might want to update a last_sync field on the shop table in the future
        // For now, let's just return the current time as last sync time
        const now = new Date();
        
        res.json({
            success: true,
            productCount: parseInt(productCountResult.rows[0].count) || 0,
            productsSynced: productsResult.synced,
            ordersSynced: ordersResult.synced,
            lastSync: now.toISOString()
        });
        
    } catch (e: any) {
        console.error('Sync error:', e);
        res.status(500).json({ error: e.message || 'Sync failed' });
    }
});

export default router;
