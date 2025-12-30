import { Router } from 'express';
import { query } from '../db';
import { authenticateToken } from '../middleware/auth.middleware';

const router = Router();

// Get Plan
router.get('/plan', authenticateToken, async (req, res) => {
    // Return mock plan or user's stored plan
    // For now assuming 1 shop per user or just returning the first shop's plan
    // In multi-tenant, billing usually is per Org or User.
    const user = (req as any).user;
    // Mock
    const plan = {
        tier: 'free',
        cycle: 'monthly',
        nextBillingDate: '2026-01-01',
        features: ['basic_support', '100_conversations']
    };
    res.json(plan);
});

// Upgrade Plan
router.post('/upgrade', authenticateToken, async (req, res) => {
    const { tier } = req.body;
    // Mock Stripe checkout session creation
    res.json({ url: `https://checkout.stripe.com/mock_session_${tier}` });
});

export default router;
