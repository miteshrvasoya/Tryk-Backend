import { Router } from 'express';
import { EscalationService } from '../services/escalation.service';
import { authenticateToken } from '../middleware/auth.middleware';

const router = Router();

// List escalations for a shop
router.get('/:storeId', authenticateToken, async (req, res) => {
    try {
        const { storeId } = req.params;
        const { status } = req.query;
        const results = await EscalationService.listEscalations(storeId, (status as string) || 'pending');
        res.json(results);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Respond to an escalation
router.post('/:id/respond', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { response } = req.body;
        if (!response) return res.status(400).json({ error: 'Response text is required' });

        const result = await EscalationService.respond(parseInt(id), response);
        res.json(result);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

export default router;
