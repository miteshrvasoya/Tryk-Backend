import { Request, Response } from 'express';
import crypto from 'crypto';
import { handleIncomingMessage } from '../services/support.service';

export const handleShopifyWebhook = async (req: Request, res: Response) => {
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
        handleIncomingMessage({
            shopId: shop as string,
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
    
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).send('Internal Server Error');
  }
};

export const handleEmailWebhook = async (req: Request, res: Response) => {
    console.log('Received Email Webhook', req.body);
    res.status(200).send('Email received');
};
