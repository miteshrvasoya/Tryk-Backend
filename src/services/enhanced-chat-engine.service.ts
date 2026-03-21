import { query } from '../db';
import { AnalyticsService } from './analytics.service';
import { IntentClassifierService, IntentType, IntentResult } from './intent-classifier.service';
import { RequestRouterService, RequestContext, RoutingDecision, ToolResult } from './request-router.service';
import { ContextBuilderService, BuiltContext } from './context-builder.service';
import { SafetyValidatorService, ValidationResult } from './safety-validator.service';
import { NotificationService } from './notification.service';

export interface EnhancedChatResponse {
  response: string;
  confidence: number;
  intent: string;
  escalated: boolean;
  sources: any[];
  conversationId: string;
  processingTime: number;
  toolResults: ToolResult[];
  contextSummary?: any;
  safetyValidation?: ValidationResult;
}

export class EnhancedChatEngineService {

  /**
   * Main entry point for processing customer message with full pipeline
   */
  static async processMessage(
    shopId: string,
    customerMessage: string,
    metadata: any = {}
  ): Promise<EnhancedChatResponse> {
    
    const startTime = Date.now();
    console.log(`[EnhancedChatEngine] Processing message for ${shopId}: "${customerMessage}"`);

    try {
      // Step 1: Find or Create Conversation
      const { conversationId, conversationHistory, conversationState } = 
        await this.getOrCreateConversation(shopId, metadata.customerId || 'anonymous');

      // Step 2: Save User Message
      await this.saveUserMessage(conversationId, customerMessage, metadata.customerId);

      // Step 3: Build request context
      const requestContext: RequestContext = {
        shopId,
        message: customerMessage,
        conversationId,
        conversationHistory,
        metadata
      };

      // Step 4: Route request and execute tools
      const routingResult = await RequestRouterService.routeRequest(requestContext);

      // Step 5: Build context from tool results
      const builtContext = await ContextBuilderService.buildContext(
        customerMessage,
        routingResult.decision.intent,
        routingResult.toolResults,
        conversationHistory
      );

      // Step 6: Safety validation
      let finalResponse = routingResult.response;
      let safetyValidation: ValidationResult | undefined;

      if (finalResponse && finalResponse.answer) {
        safetyValidation = await SafetyValidatorService.validateResponse(
          finalResponse.answer,
          builtContext,
          customerMessage
        );

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
        contextSummary: ContextBuilderService.getContextSummary(builtContext),
        safetyValidation
      };

    } catch (error: any) {
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
  private static async getOrCreateConversation(
    shopId: string,
    customerId: string
  ): Promise<{
    conversationId: string;
    conversationHistory: any[];
    conversationState: any;
  }> {
    
    // Find active conversation
    const convResult = await query(`
      SELECT id, metadata FROM conversations 
      WHERE shop_id = $1 AND customer_id = $2 AND status = 'active' 
      ORDER BY updated_at DESC LIMIT 1
    `, [shopId, customerId]);

    let conversationId: string;
    let conversationState: any = {};

    if (convResult.rows.length > 0) {
      conversationId = convResult.rows[0].id;
      conversationState = convResult.rows[0].metadata || {};
    } else {
      // Create new conversation
      const newConv = await query(`
        INSERT INTO conversations (shop_id, customer_id, status, metadata) 
        VALUES ($1, $2, 'active', '{}') RETURNING id
      `, [shopId, customerId]);
      
      conversationId = newConv.rows[0].id;
    }

    // Get conversation history (last 5 messages)
    const historyResult = await query(`
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
  private static async saveUserMessage(
    conversationId: string,
    message: string,
    customerId: string
  ): Promise<void> {
    await query(`
      INSERT INTO messages (conversation_id, sender, role, content) 
      VALUES ($1, $2, 'user', $3)
    `, [conversationId, customerId, message]);
  }

  /**
   * Save bot response
   */
  private static async saveBotResponse(
    conversationId: string,
    response: string,
    intent: string,
    confidence: number,
    responseTime: number,
    sources: any[] = [],
    escalated: boolean = false
  ): Promise<void> {
    await query(`
      INSERT INTO messages (conversation_id, sender, role, content, intent, response_time_ms) 
      VALUES ($1, 'bot', 'assistant', $2, $3, $4, $5)
    `, [conversationId, response, intent, responseTime]);
  }

  /**
   * Update conversation state
   */
  private static async updateConversationState(
    conversationId: string,
    routingDecision: RoutingDecision,
    currentState: any
  ): Promise<void> {
    
    let newState = { ...currentState };
    
    // Update state based on routing decision
    if (routingDecision.requiresEntities.length > 0) {
      newState.state = 'WAITING_FOR_ENTITY';
      newState.waitingFor = routingDecision.requiresEntities[0];
    } else {
      newState.state = 'IDLE';
      delete newState.waitingFor;
    }

    // Update message counts and metadata
    await query(`
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
  private static async logAnalytics(
    shopId: string,
    conversationId: string,
    routingResult: any,
    processingTime: number,
    safetyValidation: ValidationResult | undefined
  ): Promise<void> {
    
    // Log pipeline performance
    await AnalyticsService.logEvent({
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
      await AnalyticsService.logEvent({
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
  private static async logSafetyValidation(
    shopId: string,
    conversationId: string,
    validation: ValidationResult,
    originalQuery: string,
    originalResponse: string
  ): Promise<void> {
    try {
      await query(`
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
    } catch (error: any) {
      console.error(`[EnhancedChatEngine] Failed to log safety validation:`, error.message);
    }
  }

  /**
   * Get conversation analytics
   */
  static async getConversationAnalytics(
    shopId: string,
    days: number = 7
  ): Promise<any> {
    
    const result = await query(`
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
  static async getIntentAnalytics(
    shopId: string,
    days: number = 7
  ): Promise<any> {
    
    const result = await query(`
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
  static async healthCheck(): Promise<any> {
    try {
      // Check tool health
      const toolHealth = await RequestRouterService.getToolHealth();
      
      // Check database connectivity
      const dbCheck = await query('SELECT 1');
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
    } catch (error: any) {
      return {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error.message
      };
    }
  }
}
