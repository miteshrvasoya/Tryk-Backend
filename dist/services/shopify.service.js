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
exports.searchProducts = exports.findOrderByNumber = exports.registerWebhooks = exports.syncOrders = exports.syncProducts = exports.getOrder = exports.getClient = exports.getSession = exports.getShopData = exports.validateAuthCallback = exports.generateAuthUrl = void 0;
require("@shopify/shopify-api/adapters/node");
const shopify_api_1 = require("@shopify/shopify-api");
const shopify = (0, shopify_api_1.shopifyApi)({
    apiKey: process.env.SHOPIFY_API_KEY,
    apiSecretKey: process.env.SHOPIFY_API_SECRET || '',
    scopes: process.env.SHOPIFY_SCOPES ? process.env.SHOPIFY_SCOPES.split(',') : ['read_orders', 'read_products', 'read_inventory'],
    hostName: process.env.HOST_NAME || 'localhost:3000',
    hostScheme: 'http', // Force HTTP for local development
    apiVersion: shopify_api_1.LATEST_API_VERSION,
    isEmbeddedApp: false,
    useOnlineTokens: false,
});
const generateAuthUrl = async (shop, req, res) => {
    return await shopify.auth.begin({
        shop: shopify.utils.sanitizeShop(shop, true),
        callbackPath: '/api/auth/shopify/callback',
        isOnline: false,
        rawRequest: req,
        rawResponse: res,
    });
};
exports.generateAuthUrl = generateAuthUrl;
const validateAuthCallback = async (req, res) => {
    try {
        const callbackResponse = await shopify.auth.callback({
            rawRequest: req,
            rawResponse: res,
        });
        return callbackResponse.session;
    }
    catch (error) {
        console.error('Error in validateAuthCallback:', error);
        throw error;
    }
};
exports.validateAuthCallback = validateAuthCallback;
const getShopData = async (session) => {
    const client = new shopify.clients.Rest({ session });
    const data = await client.get({
        path: 'shop',
    });
    return data.body.shop;
};
exports.getShopData = getShopData;
const getSession = async (shop, accessToken) => {
    const session = new shopify_api_1.Session({
        id: shop,
        shop: shop,
        state: 'state',
        isOnline: false,
        accessToken: accessToken
    });
    return session;
};
exports.getSession = getSession;
const getClient = (session) => {
    return new shopify.clients.Rest({ session });
};
exports.getClient = getClient;
const getOrder = async (shop, accessToken, orderId) => {
    const session = await (0, exports.getSession)(shop, accessToken);
    const client = (0, exports.getClient)(session);
    // In real app, we need to handle potential errors
    const response = await client.get({
        path: `orders/${orderId}`,
    });
    return response.body.order; // Type adjustment needed
};
exports.getOrder = getOrder;
const syncProducts = async (shop, accessToken) => {
    try {
        console.log(`[Shopify Sync] Starting product sync for ${shop}`);
        const session = await (0, exports.getSession)(shop, accessToken);
        const client = (0, exports.getClient)(session);
        // Fetch products from Shopify  
        const response = await client.get({
            path: 'products',
            query: { limit: '50' }, // Adjust as needed
        });
        console.log("Product Search Response: ", response);
        const products = response.body.products || [];
        console.log(`[Shopify Sync] Found ${products.length} products for ${shop}`);
        if (products.length === 0) {
            return { synced: 0, message: 'No products found' };
        }
        // Import query function
        const { query } = await Promise.resolve().then(() => __importStar(require('../db')));
        // Bulk  insert products into database
        let syncedCount = 0;
        for (const product of products) {
            try {
                await upsertProduct(shop, product);
                syncedCount++;
            }
            catch (err) {
                console.error(`[Shopify Sync] Failed to insert product ${product.id}:`, err.message);
            }
        }
        console.log(`[Shopify Sync] Successfully synced ${syncedCount}/${products.length} products for ${shop}`);
        return { synced: syncedCount, total: products.length };
    }
    catch (error) {
        console.error(`[Shopify Sync] Product sync failed for ${shop}:`, error.message);
        throw error;
    }
};
exports.syncProducts = syncProducts;
const syncOrders = async (shop, accessToken) => {
    try {
        console.log(`[Shopify Sync] Starting order sync for ${shop}`);
        const session = await (0, exports.getSession)(shop, accessToken);
        const client = (0, exports.getClient)(session);
        // Fetch orders from Shopify
        const response = await client.get({
            path: 'orders',
            query: { status: 'any', limit: '50' },
        });
        const orders = response.body.orders || [];
        console.log(`[Shopify Sync] Found ${orders.length} orders for ${shop}`);
        if (orders.length === 0) {
            return { synced: 0, message: 'No orders found' };
        }
        // Import query function
        const { query } = await Promise.resolve().then(() => __importStar(require('../db')));
        // Bulk insert orders into database
        let syncedCount = 0;
        for (const order of orders) {
            try {
                await upsertOrder(shop, order);
                syncedCount++;
            }
            catch (err) {
                console.error(`[Shopify Sync] Failed to insert order ${order.id}:`, err.message);
            }
        }
        console.log(`[Shopify Sync] Successfully synced ${syncedCount}/${orders.length} orders for ${shop}`);
        return { synced: syncedCount, total: orders.length };
    }
    catch (error) {
        console.error(`[Shopify Sync] Order sync failed for ${shop}:`, error.message);
        throw error;
    }
};
exports.syncOrders = syncOrders;
const upsertOrder = async (shop, order) => {
    const { query } = await Promise.resolve().then(() => __importStar(require('../db')));
    await query(`
        INSERT INTO orders (
            shop_id, 
            shopify_order_id, 
            order_number, 
            email, 
            phone, 
            total_price, 
            currency, 
            financial_status, 
            fulfillment_status,
            created_at, 
            updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
        ON CONFLICT (shopify_order_id) 
        DO UPDATE SET 
            financial_status = $8, 
            fulfillment_status = $9, 
            updated_at = NOW()
    `, [
        shop,
        order.id,
        order.order_number,
        order.email,
        order.phone,
        order.total_price,
        order.currency,
        order.financial_status,
        order.fulfillment_status,
        order.created_at
    ]);
};
const registerWebhooks = async (shop, accessToken) => {
    const session = await (0, exports.getSession)(shop, accessToken);
    const client = new shopify.clients.Graphql({ session });
    const topics = ['ORDERS_CREATE', 'ORDERS_UPDATED', 'SHOP_UPDATE'];
    const address = 'https://api.tryk.io/webhooks/shopify'; // In prod, this must be reachable
    for (const topic of topics) {
        try {
            await client.request(`mutation {
                    webhookSubscriptionCreate(
                        topic: ${topic},
                        webhookSubscription: {
                            callbackUrl: "${address}",
                            format: JSON
                        }
                    ) {
                        userErrors {
                            field
                            message
                        }
                        webhookSubscription {
                            id
                        }
                    }
                }`);
            console.log(`Registered ${topic} for ${shop}`);
        }
        catch (error) {
            console.error(`Failed to register ${topic} for ${shop}`, error);
        }
    }
};
exports.registerWebhooks = registerWebhooks;
const findOrderByNumber = async (shopId, orderNumber) => {
    // Import query here to avoid circular dependencies if any, or just consistent with other methods
    const { query } = await Promise.resolve().then(() => __importStar(require('../db')));
    // Cleaning the input: remove '#' if present
    const cleanNumber = orderNumber.replace('#', '').trim();
    // 1. Check Local DB
    const result = await query(`
        SELECT order_number, email, financial_status, fulfillment_status, total_price, currency, created_at, updated_at
        FROM orders
        WHERE shop_id = $1 AND CAST(order_number AS TEXT) = $2
        LIMIT 1
    `, [shopId, cleanNumber]);
    const localOrder = result.rows[0];
    // 2. Check Freshness (e.g. 5 minutes)
    const FIVE_MINUTES = 5 * 60 * 1000;
    const isStale = !localOrder || (Date.now() - new Date(localOrder.updated_at).getTime() > FIVE_MINUTES);
    if (isStale) {
        console.log(`[Smart Lookup] Order #${cleanNumber} is missing or stale. Fetching from Shopify...`);
        try {
            // Get Access Token
            const shopRes = await query(`SELECT access_token FROM shops WHERE shop_id = $1`, [shopId]);
            if (shopRes.rows.length === 0)
                return localOrder || null; // Can't fetch
            const accessToken = shopRes.rows[0].access_token;
            const session = await (0, exports.getSession)(shopId, accessToken);
            const client = (0, exports.getClient)(session);
            // Search Shopify by 'name' (order number usually matches name or close to it)
            // or 'status=any'
            const response = await client.get({
                path: 'orders',
                query: { status: 'any', name: cleanNumber, limit: 1 },
            });
            console.log("Order Response: ", response);
            const orders = response.body.orders || [];
            const fetchedOrder = orders.find((o) => String(o.order_number) === cleanNumber); // strict match
            if (fetchedOrder) {
                // Upsert and return fresh data
                await upsertOrder(shopId, fetchedOrder);
                return {
                    order_number: fetchedOrder.order_number,
                    email: fetchedOrder.email,
                    financial_status: fetchedOrder.financial_status,
                    fulfillment_status: fetchedOrder.fulfillment_status,
                    total_price: fetchedOrder.total_price,
                    currency: fetchedOrder.currency,
                    created_at: fetchedOrder.created_at,
                    updated_at: new Date() // Just updated
                };
            }
        }
        catch (e) {
            console.error(`[Smart Lookup] Failed to fetch order ${cleanNumber} from Shopify:`, e);
            // Fallback to local if error
            return localOrder || null;
        }
    }
    return localOrder || null;
};
exports.findOrderByNumber = findOrderByNumber;
const upsertProduct = async (shop, product) => {
    const { query } = await Promise.resolve().then(() => __importStar(require('../db')));
    await query(`
        INSERT INTO products (shop_id, shopify_product_id, title, description, price, image_url, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
        ON CONFLICT (shop_id, shopify_product_id) 
        DO UPDATE SET title = $3, description = $4, price = $5, image_url = $6, updated_at = NOW()
    `, [
        shop,
        product.id,
        product.title,
        product.body_html || '',
        product.variants?.[0]?.price || 0,
        product.image?.src || product.images?.[0]?.src || null
    ]);
};
const searchProducts = async (shopId, searchQuery) => {
    const { query } = await Promise.resolve().then(() => __importStar(require('../db')));
    // 1. Search Local DB (ILIKE for simplicity as fallback from tsvector setup for now)
    // Ideally use to_tsvector but ILIKE is safer if vector extension issue (saw commented out line in migration)
    const searchTerm = `%${searchQuery}%`;
    const result = await query(`
        SELECT title, price, description, image_url, currency
        FROM products
        WHERE shop_id = $1 
        AND (title ILIKE $2 OR description ILIKE $2)
        LIMIT 5
    `, [shopId, searchTerm]);
    let products = result.rows;
    // 2. Fallback to Shopify API if no results
    if (products.length === 0) {
        console.log(`[Product Search] No local products found for "${searchQuery}". Fetching from Shopify (GraphQL)...`);
        try {
            const shopRes = await query(`SELECT access_token FROM shops WHERE shop_id = $1`, [shopId]);
            if (shopRes.rows.length > 0) {
                const accessToken = shopRes.rows[0].access_token;
                const session = await (0, exports.getSession)(shopId, accessToken);
                console.log("Session: ", session);
                const client = new shopify.clients.Graphql({ session });
                console.log("Client: ", client);
                const response = await client.request(`query {
                     products(first: 5, query: "title:*${searchQuery}*") {
                       edges {
                         node {
                           id
                           title
                           bodyHtml
                           images(first: 1) {
                             edges {
                               node {
                                 src: url
                               }
                             }
                           }
                           variants(first: 1) {
                             edges {
                               node {
                                 price
                               }
                             }
                           }
                           legacyResourceId
                         }
                       }
                     }
                   }`);
                console.log("Response: ", response);
                const edges = response.data.products.edges || [];
                console.log("Edges: ", edges);
                const fetchedProducts = edges.map((edge) => {
                    const node = edge.node;
                    return {
                        id: node.legacyResourceId, // Use legacy numeric ID for compatibility with our DB schema
                        title: node.title,
                        body_html: node.bodyHtml,
                        image: { src: node.images?.edges?.[0]?.node?.src || null },
                        variants: [{ price: node.variants?.edges?.[0]?.node?.price || 0 }]
                    };
                });
                console.log("Fetched Products: ", fetchedProducts);
                // Upsert them
                for (const p of fetchedProducts) {
                    await upsertProduct(shopId, p);
                }
                // Map to return format
                products = fetchedProducts.map((p) => ({
                    title: p.title,
                    price: p.variants?.[0]?.price || 0,
                    description: p.body_html,
                    image_url: p.image?.src,
                    currency: 'USD'
                }));
            }
        }
        catch (e) {
            console.error(`[Product Search] API Fetch failed:`, e);
        }
    }
    return products;
};
exports.searchProducts = searchProducts;
