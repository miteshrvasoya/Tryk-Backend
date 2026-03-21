"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const website_management_service_1 = require("../services/website-management.service");
const auth_middleware_1 = require("../middleware/auth.middleware");
const router = (0, express_1.Router)();
// Get all website types
router.get('/types', (req, res) => {
    try {
        const types = website_management_service_1.WebsiteManagementService.getWebsiteTypes();
        res.json(types);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// Get dashboard widgets
router.get('/dashboard/widgets', (req, res) => {
    try {
        const widgets = website_management_service_1.WebsiteManagementService.getDashboardWidgets();
        res.json(widgets);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// Register a new website
router.post('/register', auth_middleware_1.authenticateToken, async (req, res) => {
    try {
        const { shopId } = req.user;
        const websiteData = req.body;
        await website_management_service_1.WebsiteManagementService.registerWebsite(shopId, websiteData);
        res.status(201).json({ message: 'Website registered successfully' });
    }
    catch (error) {
        res.status(400).json({ error: error.message });
    }
});
// Get all websites for a shop
router.get('/', auth_middleware_1.authenticateToken, async (req, res) => {
    try {
        const { shopId } = req.user;
        const websites = await website_management_service_1.WebsiteManagementService.getShopWebsites(shopId);
        res.json(websites);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// Update website
router.put('/:id', auth_middleware_1.authenticateToken, async (req, res) => {
    try {
        const { shopId } = req.user;
        const { id } = req.params;
        const updates = req.body;
        await website_management_service_1.WebsiteManagementService.updateWebsite(id, updates, shopId);
        res.json({ message: 'Website updated successfully' });
    }
    catch (error) {
        res.status(400).json({ error: error.message });
    }
});
// Delete website
router.delete('/:id', auth_middleware_1.authenticateToken, async (req, res) => {
    try {
        const { shopId } = req.user;
        const { id } = req.params;
        await website_management_service_1.WebsiteManagementService.deleteWebsite(id, shopId);
        res.json({ message: 'Website deleted successfully' });
    }
    catch (error) {
        res.status(400).json({ error: error.message });
    }
});
// Ingest website content
router.post('/ingest', auth_middleware_1.authenticateToken, async (req, res) => {
    try {
        const { shopId } = req.user;
        const ingestionRequest = req.body;
        await website_management_service_1.WebsiteManagementService.ingestWebsiteContent(ingestionRequest);
        res.json({ message: 'Website ingestion started' });
    }
    catch (error) {
        res.status(400).json({ error: error.message });
    }
});
// Get ingestion history
router.get('/ingestion/history', auth_middleware_1.authenticateToken, async (req, res) => {
    try {
        const { shopId } = req.user;
        const { limit = 10 } = req.query;
        const history = await website_management_service_1.WebsiteManagementService.getIngestionHistory(shopId, Number(limit));
        res.json(history);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// Get website statistics
router.get('/stats', auth_middleware_1.authenticateToken, async (req, res) => {
    try {
        const { shopId } = req.user;
        const stats = await website_management_service_1.WebsiteManagementService.getWebsiteStats(shopId);
        res.json(stats);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
exports.default = router;
