"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChatEngineService = void 0;
const db_1 = require("../db");
const analytics_service_1 = require("./analytics.service");
const ai_service_1 = require("./ai.service");
const template_service_1 = require("./template.service");
const ShopifyService = __importStar(require("./shopify.service"));
const notification_service_1 = require("./notification.service");
class ChatEngineService {
    /**
     * Main entry point for processing a customer message.
     */
    static async processMessage(shopId, customerMessage, metadata = {}) {
        console.log(`Processing message for shop ${shopId}: ${customerMessage}`);
        const customerId = metadata.customerId || 'anonymous';
        // 0. Find or Create Conversation
        // In a real app, we'd handle session expiry. For now, get the last active conversation or create new.
        let conversationId;
        const convResult = await (0, db_1.query)(`SELECT id FROM conversations WHERE shop_id = $1 AND customer_id = $2 AND status = 'active' ORDER BY updated_at DESC LIMIT 1`, [shopId, customerId]);
        if (convResult.rows.length > 0) {
            conversationId = convResult.rows[0].id;
        }
        else {
            const newConv = await (0, db_1.query)(`INSERT INTO conversations (shop_id, customer_id, status) VALUES ($1, $2, 'active') RETURNING id`, [shopId, customerId]);
            conversationId = newConv.rows[0].id;
        }
        // Save User Message
        await (0, db_1.query)(`INSERT INTO messages (conversation_id, sender, role, content) VALUES ($1, $2, 'user', $3)`, [conversationId, customerId, customerMessage]);
        // 1. Intent Detection (Module 2.2)
        const intent = await this.detectIntent(customerMessage);
        console.log(`Detected Intent: ${intent}`);
        // Log received event
        await analytics_service_1.AnalyticsService.logEvent({
            shopId,
            eventType: 'chat.received',
            intent
        });
        // 2. Semantic Search (Module 2.4)
        const faqMatches = await this.searchFAQs(shopId, customerMessage);
        // 3. AI Relevance Check (The Judge)
        let isRelevant = false;
        let context = "";
        if (intent === 'ORDER_LOOKUP') {
            const match = customerMessage.match(/#?(\d+)/);
            if (match) {
                const orderNumber = match[1];
                const order = await ShopifyService.findOrderByNumber(shopId, orderNumber);
                if (order) {
                    const friendlyStatus = this.mapFriendlyStatus(order.financial_status, order.fulfillment_status);
                    context = `ORDER DETAILS FOR #${orderNumber}:
- Status: ${friendlyStatus}
- Internal Status: ${order.fulfillment_status || 'Unfulfilled'} / ${order.financial_status}
- Total: ${order.total_price} ${order.currency}
- Date: ${new Date(order.created_at).toLocaleDateString()}
`;
                }
                else {
                    context = `System: Order #${orderNumber} not found in our records.`;
                }
            }
            else {
                context = "System: User asked for order status but did not provide an order number (e.g. #1234).";
            }
            isRelevant = true; // Always relevant if specific intent
            isRelevant = true; // Always relevant if specific intent
        }
        else if (intent === 'PRODUCT_QUERY') {
            const products = await ShopifyService.searchProducts(shopId, customerMessage);
            if (products.length > 0) {
                const list = products.map((p, i) => `${i + 1}. ${p.title} - $${p.price} (USD)`).join('\n');
                context = `FOUND PRODUCTS:\n${list}\n\nSystem: Use this product list to answer the user's question about availability or price.`;
            }
            else {
                context = `System: No products found for "${customerMessage}".`;
            }
            isRelevant = true;
        }
        else if (faqMatches.length > 0) {
            context = faqMatches.map(f => `Q: ${f.question}\nA: ${f.answer}`).join("\n\n");
            // Ask AI: "Does this context answer 'message'?"
            isRelevant = await ai_service_1.AIService.checkRelevance(customerMessage, context);
        }
        // Override relevance for GREETING (we don't need context for hi)
        if (intent === 'GREETING')
            isRelevant = true;
        // 4. Confidence Scoring (Module 2.5) -- Updated
        const confidence = this.calculateConfidence(intent, faqMatches, isRelevant);
        console.log(`Confidence Score: ${confidence} (Relevant: ${isRelevant})`);
        let responseText = "";
        let escalated = false;
        if (confidence >= 60 && isRelevant) {
            // 5. Generate Response (only if relevant)
            // 5. Generate Response (only if relevant)
            responseText = await this.generateAIResponse(shopId, customerMessage, context, intent);
            // If AI indicates it has no answer (from context check)
            if (responseText === 'message_not_found') {
                escalated = true;
                // fall through to escalation logic below...
            }
            else {
                await analytics_service_1.AnalyticsService.logEvent({
                    shopId,
                    eventType: 'chat.processed',
                    intent,
                    confidence,
                    handled: true
                });
            }
        }
        if (escalated || confidence < 60) {
            // Escalation (Module 5)
            await this.escalate(shopId, customerMessage, faqMatches, "Low Confidence", conversationId);
            escalated = true;
            responseText = "I'm not exactly sure about that. I've notified our team, and they'll get back to you shortly!";
            await analytics_service_1.AnalyticsService.logEvent({
                shopId,
                eventType: 'chat.escalated',
                intent,
                confidence,
                escalated: true
            });
        }
        // Save Bot Response
        await (0, db_1.query)(`INSERT INTO messages (conversation_id, sender, role, content, intent, response_time_ms) VALUES ($1, 'bot', 'assistant', $2, $3, 0)`, [conversationId, responseText, intent]);
        // Update Conversation Stats
        await (0, db_1.query)(`UPDATE conversations 
         SET message_count = message_count + 2, 
             updated_at = NOW(),
             bot_message_count = bot_message_count + 1,
             human_message_count = human_message_count + 1
         WHERE id = $1`, [conversationId]);
        return {
            response: responseText,
            confidence,
            intent,
            escalated,
            conversationId
        };
    }
    static async detectIntent(message) {
        // Simple logic for now (Module 2.2 mentions prompt-based NLP)
        const lowers = message.toLowerCase();
        // Check for Order Lookup patterns: "#1234" or "order 1234"
        if (message.match(/#\d+/) || lowers.match(/order\s*#?\s*\d+/))
            return 'ORDER_LOOKUP';
        // Product Queries
        if (lowers.match(/\b(price|cost|how much|buy|sell|have|stock|looking for|search)\b/) || lowers.includes('do you have'))
            return 'PRODUCT_QUERY';
        if (lowers.includes('order') || lowers.includes('track') || lowers.includes('where is'))
            return 'ORDER_STATUS';
        if (lowers.includes('refund') || lowers.includes('return') || lowers.includes('cancel'))
            return 'POLICY';
        if (lowers.includes('stock') || lowers.includes('available') || lowers.includes('price'))
            return 'INVENTORY';
        if (lowers.match(/\b(hi|hello|hey|greetings)\b/))
            return 'GREETING';
        return 'GENERAL';
    }
    static async searchFAQs(shopId, message) {
        // Advanced Search: PG Full Text Search
        // 1. Clean message (optional but good practice)
        const cleanMessage = message.replace(/[^\w\s]/gi, '');
        // 2. Use websearch_to_tsquery for natural language support
        const result = await (0, db_1.query)(`
      SELECT id, question, answer, category,
             ts_rank(to_tsvector('english', question || ' ' || answer), websearch_to_tsquery('english', $2)) as rank
      FROM faqs
      WHERE shop_id = $1 
      AND is_active = true
      AND to_tsvector('english', question || ' ' || answer) @@ websearch_to_tsquery('english', $2)
      ORDER BY rank DESC
      LIMIT 3
    `, [shopId, cleanMessage]);
        // 3. Fallback: If TS search fails, try simple ILIKE for very short keywords
        if (result.rows.length === 0) {
            return this.fallbackSearch(shopId, message);
        }
        return result.rows.map(r => ({ ...r, similarity: r.rank * 10 })); // Normalize rank roughly
    }
    static async fallbackSearch(shopId, message) {
        const searchTerm = `%${message}%`;
        const result = await (0, db_1.query)(`
       SELECT id, question, answer, category, 0.5 as similarity
       FROM faqs
       WHERE shop_id = $1 AND is_active = true
       AND (question ILIKE $2 OR answer ILIKE $2)
       LIMIT 3
     `, [shopId, searchTerm]);
        return result.rows;
    }
    static calculateConfidence(intent, faqMatches, isRelevant) {
        // Special handling for GREETING -> Always confident
        if (intent === 'GREETING')
            return 100;
        // Order Lookup is usually high confidence if regex matched
        if (intent === 'ORDER_LOOKUP')
            return 95;
        if (!isRelevant)
            return 0; // AI Judge killed it
        const topMatch = faqMatches[0]?.similarity || 0;
        // Normalize TS rank (usually 0.1 - 1.0) to 0-100 score
        // Rank 0.1 is weak, 0.6+ is good
        let base = Math.min(topMatch * 100, 90);
        if (intent === 'ORDER_STATUS')
            base += 10;
        return base;
    }
    static async generateAIResponse(shopId, message, context, intent) {
        try {
            // 1. Fetch Shop Name for Persona
            // We use shop_id (domain) as the name since we don't store a display name yet
            const shopName = shopId?.split('.')[0] || "Our Store";
            // 2. Context passed in
            const template = await template_service_1.TemplateService.findBestTemplate(shopId, intent);
            if (!context && !template) {
                return "message_not_found"; // No data AND no template -> Escalation
            }
            // 3. Generate Response
            // Note: We pass "No specific FAQ found" as context if it's empty but template exists
            return await ai_service_1.AIService.generateCustomerResponse(shopName, message, context || "No specific FAQ found.", template);
        }
        catch (e) {
            console.error("AI Generation Failed:", e);
            // Fallback to top FAQ if AI fails
            return "I'm having trouble connecting to my brain right now.";
        }
    }
    static async escalate(shopId, message, faqMatches, reason, conversationId) {
        // Create escalation (Module 5)
        await (0, db_1.query)(`
      INSERT INTO escalations (shop_id, conversation_id, reason, metadata)
      VALUES ($1, $2, $3, $4)
    `, [shopId, conversationId, reason, JSON.stringify({ message, faqMatches })]);
        // Send Email Notification
        await notification_service_1.NotificationService.sendEscalationEmail(shopId, conversationId, reason, message);
    }
    static mapFriendlyStatus(financial, fulfillment) {
        const fin = financial?.toLowerCase() || '';
        const ful = fulfillment?.toLowerCase() || 'unfulfilled';
        if (fin === 'refunded' || fin === 'voided')
            return 'Refunded / Cancelled';
        if (fin === 'pending')
            return 'Payment Pending';
        if (fin === 'paid') {
            if (ful === 'fulfilled')
                return 'Shipped';
            if (ful === 'partial')
                return 'Partially Shipped';
            return 'Confirmed & Processing';
        }
        return `${fin} - ${ful}`; // Fallback
    }
}
exports.ChatEngineService = ChatEngineService;
