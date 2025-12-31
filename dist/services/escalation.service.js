"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EscalationService = void 0;
const db_1 = require("../db");
class EscalationService {
    /**
     * Lists escalations for a shop.
     */
    static async listEscalations(shopId, status = 'pending') {
        const result = await (0, db_1.query)(`
      SELECT e.*, c.customer_id, c.created_at as conversation_started_at
      FROM escalations e
      JOIN conversations c ON e.conversation_id = c.id
      WHERE e.shop_id = $1 AND e.status = $2
      ORDER BY e.created_at DESC
    `, [shopId, status]);
        return result.rows;
    }
    /**
     * Responds to an escalation.
     */
    static async respond(escalationId, responseText) {
        // 1. Update escalation status
        await (0, db_1.query)(`
      UPDATE escalations 
      SET status = 'resolved', resolved_at = NOW()
      WHERE id = $1
    `, [escalationId]);
        // 2. Add message to conversation
        const escalation = await (0, db_1.query)('SELECT conversation_id FROM escalations WHERE id = $1', [escalationId]);
        if (escalation.rows.length > 0) {
            const conversationId = escalation.rows[0].conversation_id;
            await (0, db_1.query)(`
            INSERT INTO messages (conversation_id, sender, role, content)
            VALUES ($1, 'human', 'assistant', $2)
        `, [conversationId, responseText]);
            // 3. Mark conversation as resolved or active (depending on owner choice)
            await (0, db_1.query)('UPDATE conversations SET status = $1 WHERE id = $2', ['resolved', conversationId]);
        }
        return { success: true };
    }
}
exports.EscalationService = EscalationService;
