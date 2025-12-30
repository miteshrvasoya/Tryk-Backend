"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const db_1 = require("../db");
const auth_middleware_1 = require("../middleware/auth.middleware");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const router = (0, express_1.Router)();
// Get User Profile
router.get('/profile', auth_middleware_1.authenticateToken, async (req, res) => {
    const user = req.user;
    const result = await (0, db_1.query)('SELECT id, email, full_name, role, shop_ids FROM users WHERE id = $1', [user.id]);
    if (result.rows.length === 0)
        return res.status(404).json({ error: 'User not found' });
    res.json(result.rows[0]);
});
// Update Profile
router.put('/profile', auth_middleware_1.authenticateToken, async (req, res) => {
    const user = req.user;
    const { full_name, email } = req.body;
    try {
        const result = await (0, db_1.query)('UPDATE users SET full_name = $1, email = $2 WHERE id = $3 RETURNING id, email, full_name', [full_name, email, user.id]);
        res.json(result.rows[0]);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// Change Password
router.put('/password', auth_middleware_1.authenticateToken, async (req, res) => {
    const user = req.user;
    const { current_password, new_password } = req.body;
    // Verify current
    const userResult = await (0, db_1.query)('SELECT * FROM users WHERE id = $1', [user.id]);
    const userData = userResult.rows[0];
    const valid = await bcryptjs_1.default.compare(current_password, userData.password_hash);
    if (!valid)
        return res.status(401).json({ error: 'Incorrect password' });
    // Update
    const hashedPassword = await bcryptjs_1.default.hash(new_password, 10);
    await (0, db_1.query)('UPDATE users SET password_hash = $1 WHERE id = $2', [hashedPassword, user.id]);
    res.json({ success: true });
});
exports.default = router;
