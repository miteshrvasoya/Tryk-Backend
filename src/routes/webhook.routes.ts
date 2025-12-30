import { Router } from 'express';
import { handleShopifyWebhook, handleEmailWebhook } from '../controllers/webhook.controller';

const router = Router();

router.post('/shopify', handleShopifyWebhook);
router.post('/email', handleEmailWebhook);

export default router;
