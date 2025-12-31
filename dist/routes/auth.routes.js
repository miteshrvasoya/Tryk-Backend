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
const authService = __importStar(require("../services/auth.service"));
const shopify_service_1 = require("../services/shopify.service");
const auth_middleware_1 = require("../middleware/auth.middleware");
const db_1 = require("../db");
const router = (0, express_1.Router)();
// ... Previous routes
router.post('/signup', async (req, res) => {
    try {
        const { email, password, fullName } = req.body;
        const user = await authService.register(email, password, fullName);
        res.status(201).json(user);
    }
    catch (error) {
        res.status(400).json({ error: error.message });
    }
});
router.post('/login', async (req, res) => {
    console.log("Login called");
    try {
        const { email, password } = req.body;
        const result = await authService.login(email, password);
        res.json(result);
    }
    catch (error) {
        res.status(401).json({ error: error.message });
    }
});
// Admin Login
router.post('/admin/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const result = await authService.adminLogin(email, password);
        res.json(result);
    }
    catch (error) {
        res.status(401).json({ error: error.message });
    }
});
// OAuth Callback
router.get('/shopify', async (req, res) => {
    try {
        const { shop } = req.query;
        if (!shop) {
            res.status(400).send('Missing shop parameter');
            return;
        }
        await (0, shopify_service_1.generateAuthUrl)(shop, req, res);
    }
    catch (e) {
        console.error("Shopify Auth Error", e);
        res.status(500).send(e.message);
    }
});
router.get('/shopify/callback', async (req, res) => {
    try {
        const session = await (0, shopify_service_1.validateAuthCallback)(req, res);
        const shopDetails = await (0, shopify_service_1.getShopData)(session);
        console.log(`[Shopify OAuth] Shop details:`, { shop: session.shop, name: shopDetails.name, email: shopDetails.email });
        // Upsert Shop
        await (0, db_1.query)(`
            INSERT INTO shops (shop_id, name, platform_store_id, access_token, website_url, platform, email_domain)
            VALUES ($1, $2, $3, $4, $5, 'shopify', $6)
            ON CONFLICT (shop_id) 
            DO UPDATE SET name = $2, platform_store_id = $3, access_token = $4, website_url = $5, updated_at = NOW()
        `, [session.shop, shopDetails.name, session.shop, session.accessToken, `https://${session.shop}`, shopDetails.email]);
        console.log(`[Shopify OAuth] Shop upserted: ${session.shop}`);
        // Find or Create User (Admin/Owner)
        // Check if user exists with this email
        const userCheck = await (0, db_1.query)('SELECT * FROM users WHERE email = $1', [shopDetails.email]);
        let userId;
        if (userCheck.rows.length === 0) {
            // Create user
            // Password blank/random since they use OAuth? Or temp password?
            // For now, let's just create them. In real app, might want to send invite email.
            const newUser = await (0, db_1.query)(`
                INSERT INTO users (email, password_hash, full_name, role, shop_ids)
                VALUES ($1, 'oauth_user', $2, 'owner', $3)
                RETURNING id
             `, [shopDetails.email, shopDetails.name, JSON.stringify([session.shop])]);
            userId = newUser.rows[0].id;
            console.log(`[Shopify OAuth] New user created: ${userId}`);
        }
        else {
            userId = userCheck.rows[0].id;
            // Update shop_ids if needed
            const currentShops = userCheck.rows[0].shop_ids || [];
            if (!currentShops.includes(session.shop)) {
                currentShops.push(session.shop);
                await (0, db_1.query)('UPDATE users SET shop_ids = $1 WHERE id = $2', [JSON.stringify(currentShops), userId]);
                console.log(`[Shopify OAuth] Updated user shop_ids: ${userId}`);
            }
            else {
                console.log(`[Shopify OAuth] User ${userId} already has shop ${session.shop}`);
            }
        }
        // Link shop to user
        await (0, db_1.query)('UPDATE shops SET user_id = $1 WHERE shop_id = $2', [userId, session.shop]);
        console.log(`[Shopify OAuth] Linked shop to user: ${session.shop} -> ${userId}`);
        // Register Shopify webhooks (non-blocking - don't fail OAuth if this fails)
        try {
            console.log(`[Shopify OAuth] Registering webhooks for shop: ${session.shop}`);
            const { registerWebhooks } = await Promise.resolve().then(() => __importStar(require('../services/shopify.service')));
            await registerWebhooks(session.shop, session.accessToken);
            console.log(`[Shopify OAuth] Successfully registered webhooks for ${session.shop}`);
        }
        catch (webhookError) {
            console.error(`[Shopify OAuth] Failed to register webhooks for ${session.shop}:`, webhookError.message);
            // Don't throw - we want OAuth to succeed even if webhook registration fails
        }
        // Initial sync (Products + Orders)
        setTimeout(async () => {
            try {
                console.log(`[Shopify OAuth] Starting initial data sync for ${session.shop}`);
                const { syncProducts, syncOrders } = await Promise.resolve().then(() => __importStar(require('../services/shopify.service')));
                // Run in parallel
                await Promise.all([
                    syncProducts(session.shop, session.accessToken).catch(e => console.error(e)),
                    syncOrders(session.shop, session.accessToken).catch(e => console.error(e))
                ]);
                console.log(`[Shopify OAuth] Initial data sync complete for ${session.shop}`);
            }
            catch (syncError) {
                console.error(`[Shopify OAuth] Initial sync failed for ${session.shop}:`, syncError.message);
            }
        }, 2000); // Wait 2 seconds
        // Fetch user's shops to include in token
        const shopsResult = await (0, db_1.query)('SELECT shop_id FROM shops WHERE user_id = $1', [userId]);
        const shop_ids = shopsResult.rows.map((row) => row.shop_id);
        const token = await authService.generateToken({
            id: userId,
            email: shopDetails.email,
            role: 'owner',
            shop_ids: shop_ids
        });
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3001';
        res.redirect(`${frontendUrl}/auth/callback?token=${token}&shop=${session.shop}&connected=shopify`);
    }
    catch (e) {
        console.error("Shopify Callback Error", e);
        res.status(500).send(e.message);
    }
});
router.post('/oauth/shopify', async (req, res) => {
    try {
        const { code, shop } = req.body;
        const result = await authService.handleShopifyOAuthCallback(shop, code);
        res.json(result);
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: 'OAuth failed' });
    }
});
router.get('/me', auth_middleware_1.authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        // Fetch fresh user data
        const userResult = await (0, db_1.query)('SELECT id, email, full_name, role FROM users WHERE id = $1', [userId]);
        if (userResult.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        const user = userResult.rows[0];
        // Fetch shops associated with user
        const shopsResult = await (0, db_1.query)('SELECT shop_id FROM shops WHERE user_id = $1', [userId]);
        user.shop_ids = shopsResult.rows.map((row) => row.shop_id);
        res.json(user);
    }
    catch (error) {
        console.error('Error fetching /me:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});
exports.default = router;
