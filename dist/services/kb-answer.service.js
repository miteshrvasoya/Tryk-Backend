"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.KBAnswerService = void 0;
const ai_service_1 = require("./ai.service");
class KBAnswerService {
    /**
     * Generate grounded answer using retrieved documents
     */
    static async generateGroundedAnswer(shopId, query, documents, intent, options = {}) {
        const startTime = Date.now();
        const { maxAnswerLength = 150, includeSources = true, minConfidence = 0.3, fallbackMessage = this.DEFAULT_FALLBACK } = options;
        console.log(`[KBAnswer] Generating answer for "${query}" with ${documents.length} documents`);
        try {
            // Step 1: Check if we have relevant documents
            if (documents.length === 0) {
                return this.createFallbackResponse(query, intent, fallbackMessage, startTime);
            }
            // Step 2: Select top documents for context
            const topDocuments = documents.slice(0, 3); // Use top 3 for context
            const context = this.buildContext(topDocuments);
            // Step 3: Check if context actually answers the query
            const contextRelevance = await this.assessContextRelevance(query, context);
            if (contextRelevance < minConfidence) {
                console.log(`[KBAnswer] Context relevance too low: ${contextRelevance}`);
                return this.createFallbackResponse(query, intent, fallbackMessage, startTime);
            }
            // Step 4: Generate grounded answer
            const answer = await this.generateAnswer(shopId, query, context, intent, maxAnswerLength);
            // Step 5: Prepare sources
            const sources = includeSources ? this.prepareSources(topDocuments) : [];
            // Step 6: Calculate overall confidence
            const confidence = this.calculateOverallConfidence(topDocuments, contextRelevance);
            const responseTime = Date.now() - startTime;
            console.log(`[KBAnswer] Generated answer in ${responseTime}ms with confidence ${confidence}`);
            return {
                answer,
                confidence,
                sources,
                intent,
                responseTime,
                fallbackUsed: false
            };
        }
        catch (error) {
            console.error(`[KBAnswer] Answer generation failed: ${error.message}`);
            return this.createFallbackResponse(query, intent, fallbackMessage, startTime);
        }
    }
    /**
     * Build context from documents for LLM
     */
    static buildContext(documents) {
        let context = "CONTEXT:\n\n";
        documents.forEach((doc, index) => {
            context += `[${index + 1}] ${doc.title || 'Untitled'}\n`;
            context += `Source: ${doc.source_url || 'Internal'}\n`;
            context += `Content: ${doc.content.substring(0, 500)}${doc.content.length > 500 ? '...' : ''}\n\n`;
        });
        context += `INSTRUCTIONS:\n`;
        context += `- Answer the user's question using ONLY the provided context above.\n`;
        context += `- If the context doesn't contain the answer, say "I couldn't find that information in the store policies."\n`;
        context += `- Do not make up information or go beyond the context.\n`;
        context += `- Keep the answer concise and helpful.\n`;
        context += `- Include specific details from the context when possible.\n`;
        return context;
    }
    /**
     * Assess if context actually answers the query
     */
    static async assessContextRelevance(query, context) {
        try {
            // Use AI service to check relevance
            const isRelevant = await ai_service_1.AIService.checkRelevance(query, context);
            // Convert boolean to confidence score
            // You could enhance this to get a more nuanced score from the AI
            return isRelevant ? 0.8 : 0.2;
        }
        catch (error) {
            console.error(`[KBAnswer] Relevance assessment failed: ${error.message}`);
            return 0.5; // Default to medium confidence
        }
    }
    /**
     * Generate answer using AI service with context
     */
    static async generateAnswer(shopId, query, context, intent, maxLength) {
        try {
            // Get shop name for personalization
            const shopName = shopId?.split('.')[0] || "Our Store";
            // Create system prompt for grounded answering
            const systemPrompt = `You are 'Tryk', a helpful AI support assistant for ${shopName}.

${context}

USER QUESTION: ${query}

Provide a concise, helpful answer using ONLY the information in the context above. Maximum ${maxLength} words.`;
            // Generate response using existing AI service
            const response = await ai_service_1.AIService.generateCustomerResponse(shopName, query, context, null, // No template for KB answers
            [] // No history for KB queries
            );
            // Clean up response
            return this.cleanResponse(response);
        }
        catch (error) {
            console.error(`[KBAnswer] AI generation failed: ${error.message}`);
            throw error;
        }
    }
    /**
     * Prepare sources for response
     */
    static prepareSources(documents) {
        return documents.map(doc => ({
            id: doc.id,
            title: doc.title || 'Untitled',
            url: doc.source_url,
            snippet: this.createSnippet(doc.content, 150),
            relevanceScore: doc.similarity || doc.rank || 0
        }));
    }
    /**
     * Create snippet from content
     */
    static createSnippet(content, maxLength) {
        const cleaned = content
            .replace(/\s+/g, ' ')
            .trim();
        if (cleaned.length <= maxLength) {
            return cleaned;
        }
        return cleaned.substring(0, maxLength) + '...';
    }
    /**
     * Calculate overall confidence score
     */
    static calculateOverallConfidence(documents, contextRelevance) {
        if (documents.length === 0)
            return 0;
        // Base confidence from top document similarity
        const topSimilarity = documents[0]?.similarity || documents[0]?.rank || 0;
        // Boost if we have multiple relevant documents
        const documentCountBonus = Math.min(documents.length * 0.1, 0.2);
        // Weight the scores
        const confidence = (topSimilarity * 0.6) + (contextRelevance * 0.3) + documentCountBonus;
        return Math.min(confidence, 1.0);
    }
    /**
     * Clean up AI response
     */
    static cleanResponse(response) {
        return response
            .replace(/^.*?CONTEXT:.*?\n/s, '') // Remove any context references
            .replace(/^.*?INSTRUCTIONS:.*?\n/s, '') // Remove instruction references
            .replace(/^(Based on|According to|From the|The context says|As per the)\s+/gi, '') // Remove attribution phrases
            .replace(/\n\s*\n/g, ' ') // Normalize whitespace
            .trim();
    }
    /**
     * Create fallback response when no good answer is found
     */
    static createFallbackResponse(query, intent, fallbackMessage, startTime) {
        const responseTime = Date.now() - startTime;
        // Customize fallback based on intent
        let customizedFallback = fallbackMessage;
        switch (intent) {
            case 'order_status':
                customizedFallback = "I can help you track your order. Please provide your order number (e.g., #1234).";
                break;
            case 'shipping_policy':
                customizedFallback = "I couldn't find specific shipping information. Let me connect you with our support team for detailed shipping policies.";
                break;
            case 'return_policy':
                customizedFallback = "I couldn't find return policy details. Let me connect you with our support team for return information.";
                break;
            case 'product_availability':
                customizedFallback = "I couldn't find product availability information. Let me connect you with our support team for stock details.";
                break;
        }
        return {
            answer: customizedFallback,
            confidence: 0.1,
            sources: [],
            intent,
            responseTime,
            fallbackUsed: true
        };
    }
    /**
     * Check if answer is safe (no hallucination)
     */
    static async validateAnswer(answer, context) {
        try {
            // Check if answer contains information not in context
            const validationPrompt = `CONTEXT:
${context}

ANSWER:
${answer}

Does the answer contain information that is NOT supported by the context? Reply with ONLY "YES" or "NO".`;
            // You could use a simpler AI call here for validation
            // For now, implement basic checks
            // Check for specific numbers, dates, or claims that might be hallucinated
            const hasSpecificClaims = /\b\d+%\b|\$\d+|\d+\s*(days|weeks|months|years)/i.test(answer);
            if (hasSpecificClaims) {
                // Verify these claims exist in context
                const contextLower = context.toLowerCase();
                const answerLower = answer.toLowerCase();
                const numbers = answerLower.match(/\b\d+%\b|\$\d+|\d+\s*(days|weeks|months|years)/gi) || [];
                for (const number of numbers) {
                    if (!contextLower.includes(number.toLowerCase())) {
                        return false; // Found a number in answer not in context
                    }
                }
            }
            return true;
        }
        catch (error) {
            console.error(`[KBAnswer] Answer validation failed: ${error.message}`);
            return true; // Fail open
        }
    }
    /**
     * Get answer statistics for analytics
     */
    static async getAnswerStats(shopId, days = 7) {
        // This would query kb_query_logs for answer statistics
        // For now, return mock data
        return {
            totalAnswers: 0,
            averageConfidence: 0,
            fallbackRate: 0,
            averageResponseTime: 0
        };
    }
    /**
     * Format answer with sources for display
     */
    static formatAnswerWithSources(answer) {
        if (answer.sources.length === 0) {
            return answer.answer;
        }
        let formatted = answer.answer;
        if (answer.confidence > 0.5) {
            formatted += "\n\n**Sources:**";
            answer.sources.forEach((source, index) => {
                formatted += `\n${index + 1}. ${source.title}`;
                if (source.url) {
                    formatted += ` → ${source.url}`;
                }
            });
        }
        return formatted;
    }
}
exports.KBAnswerService = KBAnswerService;
KBAnswerService.DEFAULT_FALLBACK = "I'm not sure about that. Let me connect you with our support team for better assistance.";
