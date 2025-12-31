"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationService = void 0;
class NotificationService {
    /**
     * Sends an escalation email to the shop owner.
     * Currently mimics sending by logging to console.
     */
    static async sendEscalationEmail(shopId, conversationId, reason, customerMessage) {
        // 1. Fetch Shop Email (mocking lookup or assume it's in settings)
        // In a real app, we would query `shops` table for an email column. 
        // For MVP, we'll assume a distinct email map or just log it.
        // const shop = await query('SELECT contact_email FROM shops WHERE shop_id = $1', [shopId]);
        // const email = shop.rows[0]?.contact_email || 'admin@example.com'; 
        const email = 'admin@example.com'; // Default for MVP
        console.log(`
    [NOTIFICATION SERVICE] 
    --------------------------------------------------
    TO: ${email}
    SUBJECT: Action Required: Chat Escalation for ${shopId}
    
    Hi Admin,
    
    A customer chat has been escalated.
    Reason: ${reason}
    Conversation ID: ${conversationId}
    
    Last User Message: "${customerMessage}"
    
    Please check your dashboard to respond.
    --------------------------------------------------
    `);
        // In future:
        // await transporter.sendMail(...)
    }
}
exports.NotificationService = NotificationService;
