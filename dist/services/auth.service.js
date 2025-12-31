"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateToken = exports.adminLogin = exports.login = exports.register = exports.handleShopifyOAuthCallback = exports.requestShopifyOAuth = void 0;
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
    // 4. Fetch user's shops
    const shopsResult = await (0, db_1.query)('SELECT shop_id FROM shops WHERE user_id = $1', [userId]);
    const shop_ids = shopsResult.rows.map(row => row.shop_id);
    // 5. Return JWT with shop_ids
    const token = jsonwebtoken_1.default.sign({
        id: userId,
        email,
        role: 'owner',
        shop_ids,
        name: email.split('@')[0] // Use email prefix as default name
    }, JWT_SECRET, { expiresIn: '24h' });
    return { token, shop };
};
exports.handleShopifyOAuthCallback = handleShopifyOAuthCallback;
const register = async (email, password, fullName) => {
    console.log("Register called");
    // ... (Previous implementation)
    const hashedPassword = await bcryptjs_1.default.hash(password, 10);
    const check = await (0, db_1.query)('SELECT * FROM users WHERE email = $1', [email]);
    console.log("User found: ", check.rows.length);
    if (check.rows.length > 0)
        throw new Error('User already exists');
    console.log("User not found, creating new user");
    const result = await (0, db_1.query)(`INSERT INTO users (email, password_hash, full_name) VALUES ($1, $2, $3) RETURNING id, email, full_name`, [email, hashedPassword, fullName]);
    console.log("User registered: ", result.rows[0]);
    return result.rows[0];
};
exports.register = register;
const login = async (email, password) => {
    console.log("Login called asdadsad");
    // ... (Previous implementation)
    const result = await (0, db_1.query)('SELECT * FROM users WHERE email = $1', [email]);
    const user = result.rows[0];
    console.log("User found: ", user);
    if (!user)
        throw new Error('Invalid credentials');
    const valid = await bcryptjs_1.default.compare(password, user.password_hash);
    if (!valid)
        throw new Error('Invalid credentials');
    // Fetch user's shops
    const shopsResult = await (0, db_1.query)('SELECT shop_id FROM shops WHERE user_id = $1', [user.id]);
    const shop_ids = shopsResult.rows.map((row) => row.shop_id);
    const token = jsonwebtoken_1.default.sign({
        id: user.id,
        email: user.email,
        role: user.role,
        shop_ids,
        name: user.full_name || user.email.split('@')[0]
    }, JWT_SECRET, { expiresIn: '24h' });
    return { user: { id: user.id, email: user.email, role: user.role, shop_ids }, token };
};
exports.login = login;
const adminLogin = async (email, password) => {
    const result = await (0, db_1.query)('SELECT * FROM users WHERE email = $1', [email]);
    const user = result.rows[0];
    if (!user)
        throw new Error('Invalid credentials');
    // Check if role is admin (or owner for now if we haven't strictly migrated)
    // For "Platform Owner", we expect role "admin"
    if (user.role !== 'admin')
        throw new Error('Access denied: Not an administrator');
    const valid = await bcryptjs_1.default.compare(password, user.password_hash);
    if (!valid)
        throw new Error('Invalid credentials');
    const token = jsonwebtoken_1.default.sign({ id: user.id, email: user.email, role: 'admin' }, JWT_SECRET, { expiresIn: '24h' });
    return { user: { id: user.id, email: user.email, role: 'admin' }, token };
};
exports.adminLogin = adminLogin;
const generateToken = (payload) => {
    return jsonwebtoken_1.default.sign(payload, JWT_SECRET, { expiresIn: '24h' });
};
exports.generateToken = generateToken;
