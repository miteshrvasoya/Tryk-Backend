"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleEmailWebhook = exports.handleShopifyWebhook = void 0;
const support_service_1 = require("../services/support.service");
const handleShopifyWebhook = async (req, res) => {
    try {
        const hmac = req.header('X-Shopify-Hmac-Sha256');
        const topic = req.header('X-Shopify-Topic');
        const shop = req.header('X-Shopify-Shop-Domain');
        // ... Verification logic ...
        console.log(`Received Webhook: ${topic} from ${shop}`);
        // Extract message details (Simplistic assumption of payload structure)
        // Real Shopify Chat payload needed.
        const messageText = req.body.message?.body || req.body.text;
        const customerId = req.body.customer_id;
        if (messageText) {
            // Init processing in background (don't await to respond fast)
            (0, support_service_1.handleIncomingMessage)({
                shopId: shop,
                customerId: customerId,
                messageReceived: messageText,
                accessToken: 'mock_token' // TODO: Fetch from DB
            }).then(response => {
                console.log('AI Response:', response);
                // TODO: Send response back to Shopify (using Shopify Admin API)
            }).catch(err => {
                console.error('Error processing message:', err);
            });
        }
        res.status(200).send('Webhook received');
    }
    catch (error) {
        console.error('Webhook error:', error);
        res.status(500).send('Internal Server Error');
    }
};
exports.handleShopifyWebhook = handleShopifyWebhook;
const handleEmailWebhook = async (req, res) => {
    console.log('Received Email Webhook', req.body);
    res.status(200).send('Email received');
};
exports.handleEmailWebhook = handleEmailWebhook;
