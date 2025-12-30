import { Router } from 'express';
import { query } from '../db';
import { authenticateToken } from '../middleware/auth.middleware';
import bcrypt from 'bcryptjs';

const router = Router();

// Get User Profile
router.get('/profile', authenticateToken, async (req, res) => {
    const user = (req as any).user;
    const result = await query('SELECT id, email, full_name, role, shop_ids FROM users WHERE id = $1', [user.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json(result.rows[0]);
});

// Update Profile
router.put('/profile', authenticateToken, async (req, res) => {
    const user = (req as any).user;
    const { full_name, email } = req.body;
    
    try {
        const result = await query(
            'UPDATE users SET full_name = $1, email = $2 WHERE id = $3 RETURNING id, email, full_name',
            [full_name, email, user.id]
        );
        res.json(result.rows[0]);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// Change Password
router.put('/password', authenticateToken, async (req, res) => {
    const user = (req as any).user;
    const { current_password, new_password } = req.body;
    
    // Verify current
    const userResult = await query('SELECT * FROM users WHERE id = $1', [user.id]);
    const userData = userResult.rows[0];
    const valid = await bcrypt.compare(current_password, userData.password_hash);
    
    if (!valid) return res.status(401).json({ error: 'Incorrect password' });
    
    // Update
    const hashedPassword = await bcrypt.hash(new_password, 10);
    await query('UPDATE users SET password_hash = $1 WHERE id = $2', [hashedPassword, user.id]);
    
    res.json({ success: true });
});

export default router;
