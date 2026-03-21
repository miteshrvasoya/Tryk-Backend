"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EnhancedChatEngineService = void 0;
const db_1 = require("../db");
const analytics_service_1 = require("./analytics.service");
const request_router_service_1 = require("./request-router.service");
const context_builder_service_1 = require("./context-builder.service");
const safety_validator_service_1 = require("./safety-validator.service");
class EnhancedChatEngineService {
    /**
     * Main entry point for processing customer message with full pipeline
     */
    static async processMessage(shopId, customerMessage, metadata = {}) {
        const startTime = Date.now();
        console.log(`[EnhancedChatEngine] Processing message for ${shopId}: "${customerMessage}"`);
        try {
            // Step 1: Find or Create Conversation
            const { conversationId, conversationHistory, conversationState } = await this.getOrCreateConversation(shopId, metadata.customerId || 'anonymous');
            // Step 2: Save User Message
            await this.saveUserMessage(conversationId, customerMessage, metadata.customerId);
            // Step 3: Build request context
            const requestContext = {
                shopId,
                message: customerMessage,
                conversationId,
                conversationHistory,
                metadata
            };
            // Step 4: Route request and execute tools
            const routingResult = await request_router_service_1.RequestRouterService.routeRequest(requestContext);
            // Step 5: Build context from tool results
            const builtContext = await context_builder_service_1.ContextBuilderService.buildContext(customerMessage, routingResult.decision.intent, routingResult.toolResults, conversationHistory);
            // Step 6: Safety validation
            let finalResponse = routingResult.response;
            let safetyValidation;
            if (finalResponse && finalResponse.answer) {
                safetyValidation = await safety_validator_service_1.SafetyValidatorService.validateResponse(finalResponse.answer, builtContext, customerMessage);
                // Use sanitized response if safety validation failed
                if (!safetyValidation.isValid) {
                    finalResponse.answer = safetyValidation.sanitizedResponse || finalResponse.answer;
                    finalResponse.confidence = safetyValidation.confidence;
                    finalResponse.escalated = safetyValidation.shouldEscalate;
                }
                // Log safety validation
                await this.logSafetyValidation(shopId, conversationId, safetyValidation, customerMessage, finalResponse.answer);
            }
            // Step 7: Log analytics
            const processingTime = Date.now() - startTime;
            await this.logAnalytics(shopId, conversationId, routingResult, processingTime, safetyValidation);
            // Step 8: Update conversation state
            await this.updateConversationState(conversationId, routingResult.decision, conversationState);
            console.log(`[EnhancedChatEngine] Processing completed in ${processingTime}ms`);
            return {
                response: finalResponse?.answer || "I'm having trouble processing your request. Please try again.",
                confidence: finalResponse?.confidence || 20,
                intent: routingResult.decision.intent,
                escalated: finalResponse?.escalated || false,
                sources: finalResponse?.sources || [],
                conversationId,
                processingTime,
                toolResults: routingResult.toolResults,
                contextSummary: context_builder_service_1.ContextBuilderService.getContextSummary(builtContext),
                safetyValidation
            };
        }
        catch (error) {
            console.error(`[EnhancedChatEngine] Processing failed:`, error);
            return {
                response: "I'm experiencing technical difficulties. Please try again later.",
                confidence: 10,
                intent: 'unknown',
                escalated: true,
                sources: [],
                conversationId: metadata.conversationId || 'unknown',
                processingTime: Date.now() - startTime,
                toolResults: [],
                contextSummary: null,
                safetyValidation: undefined
            };
        }
    }
    /**
     * Get or create conversation
     */
    static async getOrCreateConversation(shopId, customerId) {
        // Find active conversation
        const convResult = await (0, db_1.query)(`
      SELECT id, metadata FROM conversations 
      WHERE shop_id = $1 AND customer_id = $2 AND status = 'active' 
      ORDER BY updated_at DESC LIMIT 1
    `, [shopId, customerId]);
        let conversationId;
        let conversationState = {};
        if (convResult.rows.length > 0) {
            conversationId = convResult.rows[0].id;
            conversationState = convResult.rows[0].metadata || {};
        }
        else {
            // Create new conversation
            const newConv = await (0, db_1.query)(`
        INSERT INTO conversations (shop_id, customer_id, status, metadata) 
        VALUES ($1, $2, 'active', '{}') RETURNING id
      `, [shopId, customerId]);
            conversationId = newConv.rows[0].id;
        }
        // Get conversation history (last 5 messages)
        const historyResult = await (0, db_1.query)(`
      SELECT role, content FROM messages 
      WHERE conversation_id = $1 
      ORDER BY created_at DESC LIMIT 5
    `, [conversationId]);
        const conversationHistory = historyResult.rows.reverse(); // Chronological order
        return {
            conversationId,
            conversationHistory,
            conversationState
        };
    }
    /**
     * Save user message
     */
    static async saveUserMessage(conversationId, message, customerId) {
        await (0, db_1.query)(`
      INSERT INTO messages (conversation_id, sender, role, content) 
      VALUES ($1, $2, 'user', $3)
    `, [conversationId, customerId, message]);
    }
    /**
     * Save bot response
     */
    static async saveBotResponse(conversationId, response, intent, confidence, responseTime, sources = [], escalated = false) {
        await (0, db_1.query)(`
      INSERT INTO messages (conversation_id, sender, role, content, intent, response_time_ms) 
      VALUES ($1, 'bot', 'assistant', $2, $3, $4, $5)
    `, [conversationId, response, intent, responseTime]);
    }
    /**
     * Update conversation state
     */
    static async updateConversationState(conversationId, routingDecision, currentState) {
        let newState = { ...currentState };
        // Update state based on routing decision
        if (routingDecision.requiresEntities.length > 0) {
            newState.state = 'WAITING_FOR_ENTITY';
            newState.waitingFor = routingDecision.requiresEntities[0];
        }
        else {
            newState.state = 'IDLE';
            delete newState.waitingFor;
        }
        // Update message counts and metadata
        await (0, db_1.query)(`
      UPDATE conversations 
        SET message_count = message_count + 2,
            bot_message_count = bot_message_count + 1,
            human_message_count = human_message_count + 1,
            updated_at = NOW(),
            metadata = $2
        WHERE id = $1
    `, [conversationId, JSON.stringify(newState)]);
    }
    /**
     * Log analytics for the enhanced pipeline
     */
    static async logAnalytics(shopId, conversationId, routingResult, processingTime, safetyValidation) {
        // Log pipeline performance
        await analytics_service_1.AnalyticsService.logEvent({
            shopId,
            eventType: 'enhanced_chat.processed',
            intent: routingResult.decision.intent,
            responseTime: processingTime,
            confidence: routingResult.decision.confidence,
            handled: !routingResult.decision.shouldEscalate,
            escalated: routingResult.decision.shouldEscalate
        });
        // Log escalation if needed
        if (routingResult.decision.shouldEscalate) {
            await analytics_service_1.AnalyticsService.logEvent({
                shopId,
                eventType: 'enhanced_chat.escalated',
                intent: routingResult.decision.intent,
                confidence: routingResult.decision.confidence,
                escalated: true
            });
        }
    }
    /**
     * Log safety validation results
     */
    static async logSafetyValidation(shopId, conversationId, validation, originalQuery, originalResponse) {
        try {
            await (0, db_1.query)(`
        INSERT INTO safety_validation_logs (
          shop_id, conversation_id, original_query, response, 
          is_valid, confidence, issues, warnings, should_escalate, 
          validation_time_ms, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
      `, [
                shopId,
                conversationId,
                originalQuery,
                originalResponse,
                validation.isValid,
                validation.confidence,
                JSON.stringify(validation.issues),
                JSON.stringify(validation.warnings),
                validation.shouldEscalate,
                0 // validation_time_ms would need to be calculated
            ]);
        }
        catch (error) {
            console.error(`[EnhancedChatEngine] Failed to log safety validation:`, error.message);
        }
    }
    /**
     * Get conversation analytics
     */
    static async getConversationAnalytics(shopId, days = 7) {
        const result = await (0, db_1.query)(`
      SELECT 
        COUNT(*) as total_conversations,
        AVG(CASE WHEN resolved_in_seconds IS NOT NULL THEN resolved_in_seconds END) as avg_resolution_time,
        COUNT(CASE WHEN resolution_type = 'automated' THEN 1 END) as automated_resolutions,
        COUNT(CASE WHEN resolution_type = 'human' THEN 1 END) as human_resolutions,
        AVG(bot_message_count) as avg_bot_messages,
        AVG(human_message_count) as avg_human_messages
      FROM conversations 
      WHERE shop_id = $1 
        AND created_at >= NOW() - INTERVAL '${days} days'
    `, [shopId]);
        return result.rows[0];
    }
    /**
     * Get intent distribution analytics
     */
    static async getIntentAnalytics(shopId, days = 7) {
        const result = await (0, db_1.query)(`
      SELECT 
        intent,
        COUNT(*) as count,
        AVG(confidence) as avg_confidence
      FROM enhanced_chat_analytics 
      WHERE shop_id = $1 
        AND created_at >= NOW() - INTERVAL '${days} days'
      GROUP BY intent
      ORDER BY count DESC
    `, [shopId]);
        return result.rows;
    }
    /**
     * Health check for enhanced chat engine
     */
    static async healthCheck() {
        try {
            // Check tool health
            const toolHealth = await request_router_service_1.RequestRouterService.getToolHealth();
            // Check database connectivity
            const dbCheck = await (0, db_1.query)('SELECT 1');
            const dbHealthy = dbCheck.rows.length > 0;
            // Check recent performance
            const recentPerformance = await this.getConversationAnalytics('default', 1);
            return {
                status: 'healthy',
                timestamp: new Date().toISOString(),
                components: {
                    tools: toolHealth,
                    database: dbHealthy ? 'healthy' : 'unhealthy',
                    performance: recentPerformance
                }
            };
        }
        catch (error) {
            return {
                status: 'unhealthy',
                timestamp: new Date().toISOString(),
                error: error.message
            };
        }
    }
}
exports.EnhancedChatEngineService = EnhancedChatEngineService;
