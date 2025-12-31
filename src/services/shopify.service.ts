import '@shopify/shopify-api/adapters/node';
import { shopifyApi, LATEST_API_VERSION, Session } from '@shopify/shopify-api';

const backendUrl = process.env.BACKEND_URL || 'http://localhost:3000';
const urlObj = new URL(backendUrl);

const shopify = shopifyApi({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET || '',
  scopes: process.env.SHOPIFY_SCOPES ? process.env.SHOPIFY_SCOPES.split(',') : ['read_orders', 'read_products', 'read_inventory'],
  hostName: urlObj.host, // e.g. 'localhost:3000' or 'tryk-backend.onrender.com'
  hostScheme: urlObj.protocol.replace(':', '') as 'http' | 'https',
  apiVersion: LATEST_API_VERSION,
  isEmbeddedApp: false,
  useOnlineTokens: false,
});

export const generateAuthUrl = async (shop: string, req: any, res: any): Promise<void> => {
  return await shopify.auth.begin({
    shop: shopify.utils.sanitizeShop(shop, true)!,
    callbackPath: '/api/auth/shopify/callback',
    isOnline: false,
    rawRequest: req,
    rawResponse: res,
  });
};

export const validateAuthCallback = async (req: any, res: any) => {
  try {
    const callbackResponse = await shopify.auth.callback({
      rawRequest: req,
      rawResponse: res,
    });
    return callbackResponse.session;
  } catch (error) {
    console.error('Error in validateAuthCallback:', error);
    throw error;
  }
};

export const getShopData = async (session: Session) => {
  const client = new shopify.clients.Rest({ session });
  const data: any = await client.get({
    path: 'shop',
  });
  return data.body.shop;
};

export const getSession = async (shop: string, accessToken: string) => {
    const session = new Session({
        id: shop,
        shop: shop,
        state: 'state',
        isOnline: false,
        accessToken: accessToken
    });
    return session;
}

export const getClient = (session: Session) => {
    return new shopify.clients.Rest({ session });
}

export const getOrder = async (shop: string, accessToken: string, orderId: number) => {
    const session = await getSession(shop, accessToken);
    const client = getClient(session);
    
    // In real app, we need to handle potential errors
    const response = await client.get({
        path: `orders/${orderId}`,
    });
    
    return response.body.order; // Type adjustment needed
};

export const syncProducts = async (shop: string, accessToken: string) => {
    try {
        console.log(`[Shopify Sync] Starting product sync for ${shop}`);
        const session = await getSession(shop, accessToken);
        const client = getClient(session);
        
        // Fetch products from Shopify  
        const response = await client.get({
            path: 'products',
            query: { limit: '50' }, // Adjust as needed
        });

        console.log("Product Search Response: ", response)
        
        const products = (response.body as any).products || [];
        console.log(`[Shopify Sync] Found ${products.length} products for ${shop}`);
        
        if (products.length === 0) {
            return { synced: 0, message: 'No products found' };
        }
        
        // Import query function
        const { query } = await import('../db');
        
        // Bulk  insert products into database
        let syncedCount = 0;
        for (const product of products) {
            try {
                await upsertProduct(shop, product);
                syncedCount++;
            } catch (err: any) {
                console.error(`[Shopify Sync] Failed to insert product ${product.id}:`, err.message);
            }
        }
        
        console.log(`[Shopify Sync] Successfully synced ${syncedCount}/${products.length} products for ${shop}`);
        return { synced: syncedCount, total: products.length };
    } catch (error: any) {
        console.error(`[Shopify Sync] Product sync failed for ${shop}:`, error.message);
        throw error;
    }
};

export const syncOrders = async (shop: string, accessToken: string) => {
    try {
        console.log(`[Shopify Sync] Starting order sync for ${shop}`);
        const session = await getSession(shop, accessToken);
        const client = getClient(session);
        
        // Fetch orders from Shopify
        const response = await client.get({
            path: 'orders',
            query: { status: 'any', limit: '50' },
        });
        
        const orders = (response.body as any).orders || [];
        console.log(`[Shopify Sync] Found ${orders.length} orders for ${shop}`);
        
        if (orders.length === 0) {
            return { synced: 0, message: 'No orders found' };
        }
        
        // Import query function
        const { query } = await import('../db');
        
        // Bulk insert orders into database
        let syncedCount = 0;
        for (const order of orders) {
            try {
                await upsertOrder(shop, order);
                syncedCount++;
            } catch (err: any) {
                console.error(`[Shopify Sync] Failed to insert order ${order.id}:`, err.message);
            }
        }
        
        console.log(`[Shopify Sync] Successfully synced ${syncedCount}/${orders.length} orders for ${shop}`);
        return { synced: syncedCount, total: orders.length };
    } catch (error: any) {
        console.error(`[Shopify Sync] Order sync failed for ${shop}:`, error.message);
        throw error;
    }
};

const upsertOrder = async (shop: string, order: any) => {
    const { query } = await import('../db');
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

export const registerWebhooks = async (shop: string, accessToken: string) => {
    const session = await getSession(shop, accessToken);
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
        } catch (error) {
            console.error(`Failed to register ${topic} for ${shop}`, error);
        }
    }
};

export const findOrderByNumber = async (shopId: string, orderNumber: string) => {
    // Import query here to avoid circular dependencies if any, or just consistent with other methods
    const { query } = await import('../db');
    
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
            if (shopRes.rows.length === 0) return localOrder || null; // Can't fetch
            
            const accessToken = shopRes.rows[0].access_token;
            const session = await getSession(shopId, accessToken);
            const client = getClient(session);
            
            // Search Shopify by 'name' (order number usually matches name or close to it)
            // or 'status=any'
            const response = await client.get({
                path: 'orders',
                query: { status: 'any', name: cleanNumber, limit: 1 },
            });

            console.log("Order Response: ", response);
            
            const orders = (response.body as any).orders || [];
            const fetchedOrder = orders.find((o: any) => String(o.order_number) === cleanNumber); // strict match
            
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
        } catch (e) {
            console.error(`[Smart Lookup] Failed to fetch order ${cleanNumber} from Shopify:`, e);
            // Fallback to local if error
            return localOrder || null;
        }
    }
    
    return localOrder || null;
};

const upsertProduct = async (shop: string, product: any) => {
    const { query } = await import('../db');
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

export const searchProducts = async (shopId: string, searchQuery: string) => {
    const { query } = await import('../db');
    
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
                const session = await getSession(shopId, accessToken);

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
                
                const edges = (response.data as any).products.edges || [];

                console.log("Edges: ", edges);

                const fetchedProducts = edges.map((edge: any) => {
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
                products = fetchedProducts.map((p: any) => ({
                    title: p.title,
                    price: p.variants?.[0]?.price || 0,
                    description: p.body_html,
                    image_url: p.image?.src,
                    currency: 'USD'
                }));
            }
        } catch (e) {
            console.error(`[Product Search] API Fetch failed:`, e);
        }
    }
    
    return products;
};
