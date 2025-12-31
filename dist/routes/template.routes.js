"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const template_service_1 = require("../services/template.service");
const auth_middleware_1 = require("../middleware/auth.middleware");
const router = (0, express_1.Router)();
// Get all templates for a shop
router.get('/:shopId', auth_middleware_1.authenticateToken, async (req, res) => {
    try {
        const { shopId } = req.params;
        // Verify user has access to this shop (TODO: Add strict ownership check)
        const templates = await template_service_1.TemplateService.getTemplatesByShop(shopId);
        res.json(templates);
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    }
});
// Create
router.post('/create', auth_middleware_1.authenticateToken, async (req, res) => {
    try {
        const { shopId, name, trigger_intent, content, is_default } = req.body;
        if (!shopId || !content || !name) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        const template = await template_service_1.TemplateService.createTemplate(shopId, { name, trigger_intent, content, is_default });
        res.status(201).json(template);
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    }
});
// Update
router.put('/:id', auth_middleware_1.authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { shopId, ...data } = req.body;
        const updated = await template_service_1.TemplateService.updateTemplate(id, shopId, data);
        res.json(updated);
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    }
});
// Delete
router.delete('/:id', auth_middleware_1.authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { shopId } = req.query; // Pass shopId in query for safety check in service
        await template_service_1.TemplateService.deleteTemplate(id, shopId);
        res.json({ success: true });
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    }
});
exports.default = router;
