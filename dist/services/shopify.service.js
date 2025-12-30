"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerWebhooks = exports.getOrder = exports.getClient = exports.getSession = void 0;
require("@shopify/shopify-api/adapters/node");
const shopify_api_1 = require("@shopify/shopify-api");
const shopify = (0, shopify_api_1.shopifyApi)({
    apiKey: process.env.SHOPIFY_API_KEY,
    apiSecretKey: process.env.SHOPIFY_API_SECRET || '',
    scopes: ['read_orders', 'read_products', 'read_inventory'],
    hostName: 'localhost:3000', // Update in prod
    apiVersion: shopify_api_1.LATEST_API_VERSION,
    isEmbeddedApp: false,
});
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
const registerWebhooks = async (shop, accessToken) => {
    const session = await (0, exports.getSession)(shop, accessToken);
    const client = new shopify.clients.Graphql({ session });
    const topics = ['ORDERS_CREATE', 'ORDERS_UPDATED', 'SHOP_UPDATE'];
    const address = 'https://api.tryk.io/webhooks/shopify'; // In prod, this must be reachable
    for (const topic of topics) {
        try {
            await client.query({
                data: `mutation {
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
                }`,
            });
            console.log(`Registered ${topic} for ${shop}`);
        }
        catch (error) {
            console.error(`Failed to register ${topic} for ${shop}`, error);
        }
    }
};
exports.registerWebhooks = registerWebhooks;
