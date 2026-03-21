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
exports.RequestRouterService = void 0;
const intent_classifier_service_1 = require("./intent-classifier.service");
const kb_retrieval_service_1 = require("./kb-retrieval.service");
const kb_answer_service_1 = require("./kb-answer.service");
const ShopifyService = __importStar(require("./shopify.service"));
const db_1 = require("../db");
class RequestRouterService {
    /**
     * Main routing entry point
     */
    static async routeRequest(context) {
        console.log(`[RequestRouter] Routing request for ${context.shopId}: "${context.message}"`);
        const startTime = Date.now();
        // Step 1: Classify intent
        const intentResult = await intent_classifier_service_1.IntentClassifierService.classifyIntent(context.message, context.conversationHistory);
        // Step 2: Make routing decision
        const routingDecision = this.makeRoutingDecision(intentResult, context);
        console.log(`[RequestRouter] Routing decision:`, routingDecision);
        // Step 3: Execute selected tools
        const toolResults = [];
        for (const toolName of routingDecision.tools) {
            const toolResult = await this.executeTool(toolName, context, intentResult);
            toolResults.push(toolResult);
            // If primary tool succeeded and we have good data, we can stop
            if (toolResult.success && toolResults.length === 1 &&
                (toolName === 'order_lookup' || toolName === 'product_search')) {
                break;
            }
        }
        // Step 4: Generate response if we have tool results
        let response;
        if (toolResults.some(result => result.success)) {
            response = await this.generateResponse(context, intentResult, toolResults);
        }
        const totalTime = Date.now() - startTime;
        console.log(`[RequestRouter] Total routing time: ${totalTime}ms`);
        return {
            decision: routingDecision,
            toolResults,
            response
        };
    }
    /**
     * Make routing decision based on intent and entities
     */
    static makeRoutingDecision(intentResult, context) {
        const { intent, confidence, entities } = intentResult;
        // Get recommended tools for this intent
        const recommendedTools = intent_classifier_service_1.IntentClassifierService.getRecommendedTools(intent);
        // Validate intent requirements
        const requirements = intent_classifier_service_1.IntentClassifierService.validateIntentRequirements(intent, entities);
        // Check if we should escalate
        const shouldEscalate = confidence < 40 ||
            (intent === 'unknown' && confidence < 30) ||
            !requirements.valid && confidence < 60;
        let finalTools = recommendedTools;
        let reasoning = `Intent: ${intent} (${confidence}% confidence), Tools: ${recommendedTools.join(', ')}`;
        // Adjust tools based on entity requirements
        if (!requirements.valid) {
            if (intent === 'order_status' && !entities?.orderNumber) {
                finalTools = []; // Don't run order lookup without order number
                reasoning += ' - Missing order number, waiting for user input';
            }
            else if (intent === 'product_availability' && !entities?.productName) {
                finalTools = ['knowledge_base']; // Fall back to KB for general product info
                reasoning += ' - Missing product name, using KB instead';
            }
        }
        // Add escalation if needed
        if (shouldEscalate && !finalTools.includes('escalation')) {
            finalTools.push('escalation');
            reasoning += ' - Low confidence, adding escalation';
        }
        return {
            intent,
            confidence,
            tools: finalTools,
            requiresEntities: requirements.missingEntities,
            shouldEscalate,
            reasoning
        };
    }
    /**
     * Execute a specific tool
     */
    static async executeTool(toolName, context, intentResult) {
        const startTime = Date.now();
        try {
            const tool = this.TOOL_REGISTRY[toolName];
            if (!tool) {
                return {
                    success: false,
                    error: `Unknown tool: ${toolName}`,
                    executionTime: Date.now() - startTime,
                    toolName
                };
            }
            // Verify tool is appropriate for intent
            if (!tool.requiredIntents.includes(intentResult.intent)) {
                return {
                    success: false,
                    error: `Tool ${toolName} not appropriate for intent ${intentResult.intent}`,
                    executionTime: Date.now() - startTime,
                    toolName
                };
            }
            console.log(`[RequestRouter] Executing tool: ${toolName}`);
            // Execute with timeout
            const result = await Promise.race([
                tool.handler(context, intentResult),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Tool timeout')), tool.timeout))
            ]);
            return {
                success: true,
                data: result,
                executionTime: Date.now() - startTime,
                toolName
            };
        }
        catch (error) {
            console.error(`[RequestRouter] Tool ${toolName} failed:`, error.message);
            return {
                success: false,
                error: error.message,
                executionTime: Date.now() - startTime,
                toolName
            };
        }
    }
    /**
     * Order lookup tool
     */
    static async handleOrderLookup(context, intentResult) {
        const orderNumber = intentResult.entities?.orderNumber;
        if (!orderNumber) {
            throw new Error('Order number required for order lookup');
        }
        const order = await ShopifyService.findOrderByNumber(context.shopId, orderNumber);
        if (!order) {
            return {
                found: false,
                orderNumber,
                message: `Order #${orderNumber} not found in our records.`
            };
        }
        return {
            found: true,
            orderNumber,
            status: order.fulfillment_status,
            financialStatus: order.financial_status,
            totalPrice: order.total_price,
            currency: order.currency,
            createdAt: order.created_at,
            trackingUrl: order.tracking_url,
            friendlyStatus: this.mapFriendlyStatus(order.financial_status, order.fulfillment_status)
        };
    }
    /**
     * Product search tool
     */
    static async handleProductSearch(context, intentResult) {
        const productName = intentResult.entities?.productName || context.message;
        const products = await ShopifyService.searchProducts(context.shopId, productName);
        return {
            query: productName,
            found: products.length > 0,
            products: products.slice(0, 5), // Limit to 5 results
            count: products.length
        };
    }
    /**
     * Knowledge base tool
     */
    static async handleKnowledgeBase(context, intentResult) {
        // Import dynamically to avoid circular dependencies
        const { KBQueryService } = await Promise.resolve().then(() => __importStar(require('./kb-query.service')));
        const { KBRerankerService } = await Promise.resolve().then(() => __importStar(require('./kb-reranker.service')));
        // Generate embedding for search
        const normalizedQuery = await KBQueryService.processQuery(context.shopId, context.message);
        // Hybrid search
        const retrievalResult = await kb_retrieval_service_1.KBRetrievalService.hybridSearch(context.shopId, normalizedQuery.normalized, normalizedQuery.embedding, {
            limit: 10,
            includeKeywordSearch: true
        });
        // Rerank results
        const rerankedDocs = await KBRerankerService.rerankByRelevance(context.message, retrievalResult.documents, intentResult.intent, // Type conversion for compatibility
        {
            maxResults: 3,
            boostRecent: true,
            boostTitleMatches: true
        });
        return {
            query: context.message,
            intent: intentResult.intent,
            documents: rerankedDocs,
            method: retrievalResult.method,
            totalFound: retrievalResult.totalFound
        };
    }
    /**
     * Escalation tool
     */
    static async handleEscalation(context, intentResult) {
        // Create escalation record
        await (0, db_1.query)(`
      INSERT INTO escalations (shop_id, conversation_id, reason, metadata)
      VALUES ($1, $2, $3, $4)
    `, [
            context.shopId,
            context.conversationId,
            'Low confidence or unknown intent',
            JSON.stringify({
                message: context.message,
                intent: intentResult.intent,
                confidence: intentResult.confidence,
                reasoning: intentResult.reasoning
            })
        ]);
        return {
            escalated: true,
            reason: 'Low confidence or unknown intent',
            intent: intentResult.intent,
            confidence: intentResult.confidence
        };
    }
    /**
     * Generate response from tool results
     */
    static async generateResponse(context, intentResult, toolResults) {
        // Find the primary successful tool result
        const primaryResult = toolResults.find(r => r.success);
        if (!primaryResult) {
            throw new Error('No successful tool results to generate response');
        }
        switch (primaryResult.toolName) {
            case 'order_lookup':
                return this.generateOrderResponse(primaryResult.data);
            case 'product_search':
                return this.generateProductResponse(primaryResult.data);
            case 'knowledge_base':
                return this.generateKBResponse(context, intentResult, primaryResult.data);
            case 'escalation':
                return this.generateEscalationResponse();
            default:
                throw new Error(`Unknown tool result type: ${primaryResult.toolName}`);
        }
    }
    /**
     * Generate order status response
     */
    static generateOrderResponse(orderData) {
        if (!orderData.found) {
            return {
                answer: `I couldn't find order #${orderData.orderNumber} in our records. Please check the order number and try again.`,
                confidence: 90,
                sources: [],
                intent: 'order_status'
            };
        }
        return {
            answer: `Your order #${orderData.orderNumber} is ${orderData.friendlyStatus}. Total: ${orderData.totalPrice} ${orderData.currency}.`,
            confidence: 95,
            sources: [{
                    type: 'shopify_api',
                    data: { orderNumber: orderData.orderNumber }
                }],
            intent: 'order_status',
            orderDetails: orderData
        };
    }
    /**
     * Generate product availability response
     */
    static generateProductResponse(productData) {
        if (!productData.found) {
            return {
                answer: "I couldn't find any products matching your search. Would you like me to connect you with our support team?",
                confidence: 70,
                sources: [],
                intent: 'product_availability'
            };
        }
        const productList = productData.products
            .map((p) => `• ${p.title} - $${p.price}`)
            .join('\n');
        return {
            answer: `I found these products:\n${productList}`,
            confidence: 85,
            sources: [{
                    type: 'shopify_api',
                    data: { query: productData.query, count: productData.count }
                }],
            intent: 'product_availability',
            productData
        };
    }
    /**
     * Generate knowledge base response
     */
    static async generateKBResponse(context, intentResult, kbData) {
        return await kb_answer_service_1.KBAnswerService.generateGroundedAnswer(context.shopId, context.message, kbData.documents, intentResult.intent // Type conversion for compatibility
        );
    }
    /**
     * Generate escalation response
     */
    static generateEscalationResponse() {
        return {
            answer: "I'm not sure about that. Let me connect you with our support team for better assistance.",
            confidence: 20,
            sources: [],
            intent: 'unknown',
            escalated: true
        };
    }
    /**
     * Map order status to friendly text
     */
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
        return `${fin} - ${ful}`;
    }
    /**
     * Get tool health status
     */
    static async getToolHealth() {
        const health = {};
        for (const [toolName, tool] of Object.entries(this.TOOL_REGISTRY)) {
            try {
                // Simple health check - could be expanded
                health[toolName] = {
                    status: 'healthy',
                    requiredIntents: tool.requiredIntents,
                    timeout: tool.timeout
                };
            }
            catch (error) {
                health[toolName] = {
                    status: 'unhealthy',
                    error: error.message
                };
            }
        }
        return health;
    }
}
exports.RequestRouterService = RequestRouterService;
RequestRouterService.TOOL_REGISTRY = {
    order_lookup: {
        handler: RequestRouterService.handleOrderLookup,
        requiredIntents: ['order_status'],
        requiredEntities: ['orderNumber'],
        timeout: 5000
    },
    product_search: {
        handler: RequestRouterService.handleProductSearch,
        requiredIntents: ['product_availability'],
        requiredEntities: ['productName'],
        timeout: 3000
    },
    knowledge_base: {
        handler: RequestRouterService.handleKnowledgeBase,
        requiredIntents: ['shipping_policy', 'return_policy', 'store_information', 'general_faq'],
        requiredEntities: [],
        timeout: 2000
    },
    escalation: {
        handler: RequestRouterService.handleEscalation,
        requiredIntents: ['unknown'],
        requiredEntities: [],
        timeout: 1000
    }
};
