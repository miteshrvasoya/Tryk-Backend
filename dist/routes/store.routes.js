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
const express_1 = require("express");
const db_1 = require("../db");
const auth_middleware_1 = require("../middleware/auth.middleware");
const faq_service_1 = require("../services/faq.service");
const router = (0, express_1.Router)();
// List stores
router.get('/', auth_middleware_1.authenticateToken, async (req, res) => {
    try {
        // In real app, filter by user's access
        const result = await (0, db_1.query)('SELECT * FROM shops');
        res.json(result.rows);
    }
    catch (err) {
        res.status(500).json({ error: 'Internal error' });
    }
});
// Get Shopify details for a specific shop
router.get('/:shopId/shopify-details', auth_middleware_1.authenticateToken, async (req, res) => {
    try {
        const { shopId } = req.params;
        // Fetch shop details
        const shopResult = await (0, db_1.query)('SELECT * FROM shops WHERE shop_id = $1', [shopId]);
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
        const productCountResult = await (0, db_1.query)('SELECT COUNT(*) as count FROM products WHERE shop_id = $1', [shopId]);
        const productCount = parseInt(productCountResult.rows[0].count) || 0;
        // Fetch recent products (first 6 with images)
        const productsResult = await (0, db_1.query)(`SELECT id, title, description, price, image_url, created_at, updated_at 
             FROM products 
             WHERE shop_id = $1 
             ORDER BY updated_at DESC 
             LIMIT 6`, [shopId]);
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
    }
    catch (err) {
        console.error('Error fetching Shopify details:', err);
        res.status(500).json({ error: 'Internal error' });
    }
});
// Rescan FAQs (Mock)
router.post('/:storeId/rescan', auth_middleware_1.authenticateToken, async (req, res) => {
    const { storeId } = req.params;
    const { websiteUrl } = req.body;
    // Trigger in bg
    (0, faq_service_1.scanAndLearnFAQ)(storeId, websiteUrl).then(output => {
        console.log(`Scan complete for ${storeId}:`, output);
    }).catch(err => console.error(err));
    res.json({ status: 'scanning', estimatedTime: '2 min' });
});
const shopify_service_1 = require("../services/shopify.service");
router.post('/:storeId/setup-webhook', auth_middleware_1.authenticateToken, async (req, res) => {
    const { storeId } = req.params;
    // In real app, fetch access token for storeId from DB
    const accessToken = 'mock_token';
    try {
        await (0, shopify_service_1.registerWebhooks)(storeId, accessToken);
        res.json({ success: true });
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    }
});
// Sync Shopify Data
router.post('/:storeId/shopify-sync', auth_middleware_1.authenticateToken, async (req, res) => {
    const { storeId } = req.params;
    try {
        // Get store access token
        const shopResult = await (0, db_1.query)('SELECT access_token FROM shops WHERE shop_id = $1', [storeId]);
        if (shopResult.rows.length === 0) {
            return res.status(404).json({ error: 'Store not found' });
        }
        const { access_token } = shopResult.rows[0];
        if (!access_token) {
            return res.status(400).json({ error: 'Shopify not connected' });
        }
        // Dynamic import to avoid circular dep issues if any
        const { syncProducts, syncOrders } = await Promise.resolve().then(() => __importStar(require('../services/shopify.service')));
        // Run syncs
        const [productsResult, ordersResult] = await Promise.all([
            syncProducts(storeId, access_token),
            syncOrders(storeId, access_token)
        ]);
        // Get updated stats
        const productCountResult = await (0, db_1.query)('SELECT COUNT(*) as count FROM products WHERE shop_id = $1', [storeId]);
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
    }
    catch (e) {
        console.error('Sync error:', e);
        res.status(500).json({ error: e.message || 'Sync failed' });
    }
});
exports.default = router;
