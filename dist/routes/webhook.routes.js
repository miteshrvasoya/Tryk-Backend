"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const webhook_controller_1 = require("../controllers/webhook.controller");
const router = (0, express_1.Router)();
router.post('/shopify', webhook_controller_1.handleShopifyWebhook);
router.post('/email', webhook_controller_1.handleEmailWebhook);
exports.default = router;
