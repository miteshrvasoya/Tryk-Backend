"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const escalation_service_1 = require("../services/escalation.service");
const auth_middleware_1 = require("../middleware/auth.middleware");
const router = (0, express_1.Router)();
// List escalations for a shop
router.get('/:storeId', auth_middleware_1.authenticateToken, async (req, res) => {
    try {
        const { storeId } = req.params;
        const { status } = req.query;
        const results = await escalation_service_1.EscalationService.listEscalations(storeId, status || 'pending');
        res.json(results);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// Respond to an escalation
router.post('/:id/respond', auth_middleware_1.authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { response } = req.body;
        if (!response)
            return res.status(400).json({ error: 'Response text is required' });
        const result = await escalation_service_1.EscalationService.respond(parseInt(id), response);
        res.json(result);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
exports.default = router;
