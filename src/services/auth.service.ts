import { query } from '../db';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { shopifyApi, LATEST_API_VERSION, Session } from '@shopify/shopify-api';
import '@shopify/shopify-api/adapters/node';

const JWT_SECRET = process.env.JWT_SECRET || 'secret';

// Initialize Shopify for OAuth
const shopify = shopifyApi({
    apiKey: process.env.SHOPIFY_API_KEY,
    apiSecretKey: process.env.SHOPIFY_API_SECRET || '',
    scopes: ['read_products', 'read_orders', 'read_customers'],
    hostName: 'localhost:3000', // Should be external URL in prod
    apiVersion: LATEST_API_VERSION, 
    isEmbeddedApp: false, 
});

export const requestShopifyOAuth = async (shop: string) => {
    // Return the auth URL
    // In a real app we'd construct the URL manually or use the library's beginAuth
    // Simplified manual construction:
    // Use standardized BACKEND_URL from environment
    const backendUrl = process.env.BACKEND_URL || "http://localhost:3000";
    const redirectUri = `${backendUrl}/api/auth/oauth/shopify/callback`;

    const state = 'nonce'; // Should be random
    const url = `https://${shop}/admin/oauth/authorize?client_id=${process.env.SHOPIFY_API_KEY}&scope=read_products,read_orders&redirect_uri=${redirectUri}&state=${state}`;
    return url;
};

export const handleShopifyOAuthCallback = async (shop: string, code: string) => {
    // 1. Exchange code for access token
    // Using simple fetch b/c library requires full request/response objects usually
    const params = new URLSearchParams({
        client_id: process.env.SHOPIFY_API_KEY as string,
        client_secret: process.env.SHOPIFY_API_SECRET as string,
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
    const checkUser = await query('SELECT * FROM users WHERE email = $1', [email]);
    if (checkUser.rows.length === 0) {
       const hashedPassword = await bcrypt.hash('password', 10);
       const newUser = await query(
           `INSERT INTO users (email, password_hash, full_name, role) VALUES ($1, $2, $3, 'owner') RETURNING id`,
           [email, hashedPassword, shop]
       );
       userId = newUser.rows[0].id;
    } else {
       userId = checkUser.rows[0].id;
    }
    
    // 3. Create/Update Shop
    await query(`
        INSERT INTO shops (shop_id, user_id, access_token, platform, onboarding_complete)
        VALUES ($1, $2, $3, 'shopify', true)
        ON CONFLICT (shop_id) DO UPDATE 
        SET access_token = $3, user_id = $2, onboarding_complete = true
    `, [shop, userId, accessToken]);
    
    // 4. Fetch user's shops
    const shopsResult = await query('SELECT shop_id FROM shops WHERE user_id = $1', [userId]);
    const shop_ids = shopsResult.rows.map(row => row.shop_id);
    
    // 5. Return JWT with shop_ids
    const token = jwt.sign({ 
        id: userId, 
        email, 
        role: 'owner',
        shop_ids,
        name: email.split('@')[0] // Use email prefix as default name
    }, JWT_SECRET, { expiresIn: '24h' });
    return { token, shop };
};

export const register = async (email: string, password: string, fullName: string) => {

    console.log("Register called");

    // ... (Previous implementation)
    const hashedPassword = await bcrypt.hash(password, 10);
    const check = await query('SELECT * FROM users WHERE email = $1', [email]);

    console.log("User found: ", check.rows.length);

    if (check.rows.length > 0) throw new Error('User already exists');

    console.log("User not found, creating new user");

    const result = await query(
        `INSERT INTO users (email, password_hash, full_name) VALUES ($1, $2, $3) RETURNING id, email, full_name`,
        [email, hashedPassword, fullName]
    );

    console.log("User registered: ", result.rows[0]);
    return result.rows[0];
};

export const login = async (email: string, password: string) => {

    console.log("Login called asdadsad");
    
    // ... (Previous implementation)
    const result = await query('SELECT * FROM users WHERE email = $1', [email]);
    const user = result.rows[0];


    console.log("User found: ", user);

    if (!user) throw new Error('Invalid credentials');
    
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) throw new Error('Invalid credentials');
    
    // Fetch user's shops
    const shopsResult = await query('SELECT shop_id FROM shops WHERE user_id = $1', [user.id]);
    const shop_ids = shopsResult.rows.map((row: any) => row.shop_id);
    
    const token = jwt.sign({ 
        id: user.id, 
        email: user.email, 
        role: user.role,
        shop_ids,
        name: user.full_name || user.email.split('@')[0]
    }, JWT_SECRET, { expiresIn: '24h' });
    return { user: { id: user.id, email: user.email, role: user.role, shop_ids }, token };
};

export const adminLogin = async (email: string, password: string) => {
    const result = await query('SELECT * FROM users WHERE email = $1', [email]);
    const user = result.rows[0];
    if (!user) throw new Error('Invalid credentials');
    
    // Check if role is admin (or owner for now if we haven't strictly migrated)
    // For "Platform Owner", we expect role "admin"
    if (user.role !== 'admin') throw new Error('Access denied: Not an administrator');

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) throw new Error('Invalid credentials');
    
    const token = jwt.sign({ id: user.id, email: user.email, role: 'admin' }, JWT_SECRET, { expiresIn: '24h' });
    return { user: { id: user.id, email: user.email, role: 'admin' }, token };
};

export const generateToken = (payload: any) => {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' });
};
