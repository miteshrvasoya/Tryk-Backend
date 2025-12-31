"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const widget_service_1 = require("../services/widget.service");
const auth_middleware_1 = require("../middleware/auth.middleware");
const router = (0, express_1.Router)();
// Create widget
router.post('/generate', auth_middleware_1.authenticateToken, async (req, res) => {
    try {
        const { shopId, config } = req.body;
        if (!shopId)
            return res.status(400).json({ error: 'shopId is required' });
        // Check if already exists
        const existing = await widget_service_1.WidgetService.getWidgetByShopId(shopId);
        if (existing) {
            return res.status(200).json(existing);
        }
        const result = await widget_service_1.WidgetService.createWidget(shopId, config);
        res.status(201).json(result);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// Public: Get widget config (called by the widget script)
router.get('/config/:key', async (req, res) => {
    try {
        const { key } = req.params;
        const widget = await widget_service_1.WidgetService.getWidget(key);
        if (!widget)
            return res.status(404).json({ error: 'Widget not found' });
        res.json(widget.config);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// Get widget by shopId (for dashboard)
router.get('/shop/:shopId', auth_middleware_1.authenticateToken, async (req, res) => {
    try {
        const { shopId } = req.params;
        const widget = await widget_service_1.WidgetService.getWidgetByShopId(shopId);
        if (!widget) {
            // Not found is fine, means user hasn't generated one yet
            return res.status(200).json({ exists: false });
        }
        res.json({ exists: true, ...widget });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// Update config
router.put('/:key/config', auth_middleware_1.authenticateToken, async (req, res) => {
    try {
        const { key } = req.params;
        const { config } = req.body;
        const result = await widget_service_1.WidgetService.updateConfig(key, config);
        res.json(result);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
exports.default = router;
