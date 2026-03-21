"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const passport_1 = __importDefault(require("passport"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const db_1 = require("../db");
const router = (0, express_1.Router)();
// Google OAuth - Initiate
router.get('/google', passport_1.default.authenticate('google', {
    scope: ['profile', 'email'],
    session: false
}));
// Google OAuth - Callback
router.get('/google/callback', passport_1.default.authenticate('google', { session: false, failureRedirect: '/login?error=google_auth_failed' }), async (req, res) => {
    try {
        const oauthData = req.user;
        const { profile } = oauthData;
        // Find or create user
        const googleId = profile.id;
        const email = profile.emails?.[0]?.value;
        const fullName = profile.displayName;
        const profilePicture = profile.photos?.[0]?.value;
        if (!email) {
            return res.redirect('/login?error=no_email');
        }
        // Check if user exists by google_id
        let userResult = await (0, db_1.query)('SELECT * FROM users WHERE google_id = $1', [googleId]);
        let user;
        if (userResult.rows.length === 0) {
            // Check if email exists (linking scenario)
            const emailCheck = await (0, db_1.query)('SELECT * FROM users WHERE email = $1', [email]);
            if (emailCheck.rows.length > 0) {
                // Link Google account to existing user
                user = await (0, db_1.query)('UPDATE users SET google_id = $1, oauth_provider = $2, oauth_profile = $3, updated_at = NOW() WHERE email = $4 RETURNING *', [googleId, 'google', JSON.stringify(profile), email]);
                user = user.rows[0];
            }
            else {
                // Create new user
                user = await (0, db_1.query)(`INSERT INTO users (email, password_hash, full_name, google_id, oauth_provider, oauth_profile, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW()) RETURNING *`, [email, '', fullName || email.split('@')[0], googleId, 'google', JSON.stringify(profile)]);
                user = user.rows[0];
            }
        }
        else {
            user = userResult.rows[0];
        }
        // Generate JWT token
        const token = jsonwebtoken_1.default.sign({
            id: user.id,
            email: user.email,
            role: user.role
        }, process.env.JWT_SECRET || 'your-secret-key', { expiresIn: '7d' });
        // Redirect to frontend with token
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3001';
        res.redirect(`${frontendUrl}/auth/callback?token=${token}&provider=google`);
    }
    catch (error) {
        console.error('Google OAuth error:', error);
        res.redirect('/login?error=server_error');
    }
});
// Shopify OAuth - Initiate
router.get('/shopify/oauth', (req, res, next) => {
    const shop = req.query.shop;
    if (!shop) {
        return res.status(400).json({ error: 'Shop parameter required' });
    }
    passport_1.default.authenticate('shopify', {
        shop: shop,
        session: false
    })(req, res, next);
});
// Shopify OAuth - Callback
router.get('/shopify/oauth/callback', passport_1.default.authenticate('shopify', { session: false, failureRedirect: '/login?error=shopify_auth_failed' }), async (req, res) => {
    try {
        const oauthData = req.user;
        const { profile } = oauthData;
        const shopifyId = profile.id;
        const email = profile.emails?.[0]?.value || profile.username + '@shopify.com';
        const fullName = profile.displayName || profile.username;
        // Check if user exists by shopify_id
        let userResult = await (0, db_1.query)('SELECT * FROM users WHERE shopify_id = $1', [shopifyId]);
        let user;
        if (userResult.rows.length === 0) {
            // Check if email exists (linking scenario)
            const emailCheck = await (0, db_1.query)('SELECT * FROM users WHERE email = $1', [email]);
            if (emailCheck.rows.length > 0) {
                // Link Shopify account to existing user
                user = await (0, db_1.query)('UPDATE users SET shopify_id = $1, oauth_provider = $2, oauth_profile = $3, updated_at = NOW() WHERE email = $4 RETURNING *', [shopifyId, 'shopify', JSON.stringify(profile), email]);
                user = user.rows[0];
            }
            else {
                // Create new user
                user = await (0, db_1.query)(`INSERT INTO users (email, password_hash, full_name, shopify_id, oauth_provider, oauth_profile, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW()) RETURNING *`, [email, '', fullName, shopifyId, 'shopify', JSON.stringify(profile)]);
                user = user.rows[0];
            }
        }
        else {
            user = userResult.rows[0];
        }
        // Generate JWT token
        const token = jsonwebtoken_1.default.sign({
            id: user.id,
            email: user.email,
            role: user.role
        }, process.env.JWT_SECRET || 'your-secret-key', { expiresIn: '7d' });
        // Redirect to frontend with token
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3001';
        res.redirect(`${frontendUrl}/auth/callback?token=${token}&provider=shopify`);
    }
    catch (error) {
        console.error('Shopify OAuth error:', error);
        res.redirect('/login?error=server_error');
    }
});
exports.default = router;
