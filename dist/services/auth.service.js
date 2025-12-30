"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.login = exports.register = exports.handleShopifyOAuthCallback = exports.requestShopifyOAuth = void 0;
const db_1 = require("../db");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const shopify_api_1 = require("@shopify/shopify-api");
require("@shopify/shopify-api/adapters/node");
const JWT_SECRET = process.env.JWT_SECRET || 'secret';
// Initialize Shopify for OAuth
const shopify = (0, shopify_api_1.shopifyApi)({
    apiKey: process.env.SHOPIFY_API_KEY,
    apiSecretKey: process.env.SHOPIFY_API_SECRET || '',
    scopes: ['read_products', 'read_orders', 'read_customers'],
    hostName: 'localhost:3000', // Should be external URL in prod
    apiVersion: shopify_api_1.LATEST_API_VERSION,
    isEmbeddedApp: false,
});
const requestShopifyOAuth = async (shop) => {
    // Return the auth URL
    // In a real app we'd construct the URL manually or use the library's beginAuth
    // Simplified manual construction:
    const redirectUri = `http://localhost:3000/api/auth/oauth/shopify/callback`; // Should be env var
    const state = 'nonce'; // Should be random
    const url = `https://${shop}/admin/oauth/authorize?client_id=${process.env.SHOPIFY_API_KEY}&scope=read_products,read_orders&redirect_uri=${redirectUri}&state=${state}`;
    return url;
};
exports.requestShopifyOAuth = requestShopifyOAuth;
const handleShopifyOAuthCallback = async (shop, code) => {
    // 1. Exchange code for access token
    // Using simple fetch b/c library requires full request/response objects usually
    const params = new URLSearchParams({
        client_id: process.env.SHOPIFY_API_KEY,
        client_secret: process.env.SHOPIFY_API_SECRET,
        code,
    });
    const response = await fetch(`https://${shop}/admin/oauth/access_token`, {
        method: 'POST',
        body: params
    });
    const data = await response.json();
    const accessToken = data.access_token;
    // 2. Create/Get User
    // For MVP, if no user logged in, we create one based on shop email (requires extra call)
    // We'll mock user creation for now or assume a default "shop owner"
    let userId = null;
    // Mock user for the store
    const email = `admin@${shop}`;
    const checkUser = await (0, db_1.query)('SELECT * FROM users WHERE email = $1', [email]);
    if (checkUser.rows.length === 0) {
        const hashedPassword = await bcryptjs_1.default.hash('password', 10);
        const newUser = await (0, db_1.query)(`INSERT INTO users (email, password_hash, full_name, role) VALUES ($1, $2, $3, 'owner') RETURNING id`, [email, hashedPassword, shop]);
        userId = newUser.rows[0].id;
    }
    else {
        userId = checkUser.rows[0].id;
    }
    // 3. Create/Update Shop
    await (0, db_1.query)(`
        INSERT INTO shops (shop_id, user_id, access_token, platform, onboarding_complete)
        VALUES ($1, $2, $3, 'shopify', true)
        ON CONFLICT (shop_id) DO UPDATE 
        SET access_token = $3, user_id = $2, onboarding_complete = true
    `, [shop, userId, accessToken]);
    // 4. Return JWT
    const token = jsonwebtoken_1.default.sign({ id: userId, email, role: 'owner' }, JWT_SECRET, { expiresIn: '24h' });
    return { token, shop };
};
exports.handleShopifyOAuthCallback = handleShopifyOAuthCallback;
const register = async (email, password, fullName) => {
    // ... (Previous implementation)
    const hashedPassword = await bcryptjs_1.default.hash(password, 10);
    const check = await (0, db_1.query)('SELECT * FROM users WHERE email = $1', [email]);
    if (check.rows.length > 0)
        throw new Error('User already exists');
    const result = await (0, db_1.query)(`INSERT INTO users (email, password_hash, full_name) VALUES ($1, $2, $3) RETURNING id, email, full_name`, [email, hashedPassword, fullName]);
    return result.rows[0];
};
exports.register = register;
const login = async (email, password) => {
    // ... (Previous implementation)
    const result = await (0, db_1.query)('SELECT * FROM users WHERE email = $1', [email]);
    const user = result.rows[0];
    if (!user)
        throw new Error('Invalid credentials');
    const valid = await bcryptjs_1.default.compare(password, user.password_hash);
    if (!valid)
        throw new Error('Invalid credentials');
    const token = jsonwebtoken_1.default.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
    return { user: { id: user.id, email: user.email, role: user.role }, token };
};
exports.login = login;
