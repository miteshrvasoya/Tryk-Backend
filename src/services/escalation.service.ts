import { query } from '../db';

export class EscalationService {
  /**
   * Lists escalations for a shop.
   */
  static async listEscalations(shopId: string, status: string = 'pending') {
    let queryText = `
      SELECT DISTINCT ON (e.conversation_id)
        e.id, e.shop_id, e.conversation_id, e.reason, e.status, e.created_at, e.metadata,
        c.customer_id, c.created_at as conversation_started_at,
        (SELECT count(*) FROM escalations e2 WHERE e2.conversation_id = e.conversation_id) as escalation_count
      FROM escalations e
      JOIN conversations c ON e.conversation_id = c.id
      WHERE e.shop_id = $1
    `;
    
    const params: any[] = [shopId];

    if (status !== 'all') {
        queryText += ` AND e.status = $2`;
        params.push(status);
    }
    
    // We order by conversation_id to satisfy DISTINCT ON, then by created_at DESC to get the latest per conversation
    queryText += ` ORDER BY e.conversation_id, e.created_at DESC`;

    const result = await query(queryText, params);
    
    // Re-sort by created_at desc in memory or wrap in subquery (simpler to sort in memory for now)
    return result.rows.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  /**
   * Responds to an escalation.
   */
  static async respond(escalationId: number, responseText: string) {
    // 1. Update escalation status
    await query(`
      UPDATE escalations 
      SET status = 'resolved', resolved_at = NOW()
      WHERE id = $1
    `, [escalationId]);

    // 2. Add message to conversation
    const escalation = await query('SELECT conversation_id FROM escalations WHERE id = $1', [escalationId]);
    if (escalation.rows.length > 0) {
        const conversationId = escalation.rows[0].conversation_id;
        await query(`
            INSERT INTO messages (conversation_id, sender, role, content)
            VALUES ($1, 'human', 'assistant', $2)
        `, [conversationId, responseText]);

        // 3. Mark conversation as resolved or active (depending on owner choice)
        await query('UPDATE conversations SET status = $1 WHERE id = $2', ['resolved', conversationId]);
    }

    return { success: true };
  }
}
