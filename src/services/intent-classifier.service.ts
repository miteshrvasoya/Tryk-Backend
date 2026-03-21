import { query } from '../db';

export type IntentType = 'order_status' | 'shipping_policy' | 'return_policy' | 'product_availability' | 'store_information' | 'general_faq' | 'unknown';

export interface IntentResult {
  intent: IntentType;
  confidence: number;
  entities?: {
    orderNumber?: string;
    productName?: string;
    email?: string;
    trackingNumber?: string;
  };
  reasoning?: string;
}

export class IntentClassifierService {

  private static readonly INTENT_PATTERNS: Record<string, {
    patterns: RegExp[];
    keywords: string[];
    confidence: number;
  }> = {
    order_status: {
      patterns: [
        /\b(where\s+is\s+my\s+order|track\s+my\s+order|order\s+status|track\s+order)\b/i,
        /\b#?\d{4,}\b/, // Order numbers
        /\b(order\s+|#)\s*#?\s*\d{4,}/i
      ],
      keywords: ['order', 'track', 'tracking', 'where is', 'status', 'delivery', 'shipped'],
      confidence: 90
    },
    shipping_policy: {
      patterns: [
        /\b(shipping|delivery|ship|deliver|transit|package)\s+(policy|information|info|details|how)\b/i,
        /\b(how\s+long\s+(does\s+)?shipping|when\s+will\s+(i\s+)?(receive|get))\b/i,
        /\b(shipping\s+cost|delivery\s+fee|shipping\s+time)\b/i
      ],
      keywords: ['shipping', 'delivery', 'ship', 'deliver', 'transit', 'package'],
      confidence: 85
    },
    return_policy: {
      patterns: [
        /\b(return|refund|exchange|cancel)\s+(policy|information|info|details|how)\b/i,
        /\b(how\s+to\s+return|can\s+i\s+return|return\s+process)\b/i,
        /\b(money\s+back|refund\s+policy|return\s+policy)\b/i
      ],
      keywords: ['return', 'refund', 'exchange', 'cancel', 'money back'],
      confidence: 85
    },
    product_availability: {
      patterns: [
        /\b(in\s+stock|available|have|sell|stock)\b.*\b(product|item|size|color)\b/i,
        /\b(do\s+you\s+have|is\s+(it|this)\s+(available|in\s+stock))\b/i,
        /\b(price|cost|how\s+much)\b.*\b(product|item|this)\b/i
      ],
      keywords: ['stock', 'available', 'have', 'sell', 'price', 'cost', 'inventory'],
      confidence: 80
    },
    store_information: {
      patterns: [
        /\b(hours|location|address|contact|phone|email)\b/i,
        /\b(about\s+(your|the)\s+store|who\s+are\s+you)\b/i,
        /\b(store\s+info|store\s+information)\b/i
      ],
      keywords: ['hours', 'location', 'address', 'contact', 'phone', 'email', 'about'],
      confidence: 75
    },
    general_faq: {
      patterns: [
        /\b(help|support|faq|question|how\s+to|what\s+is|when\s+do)\b/i,
        /\b(can\s+i|could\s+i|would\s+i)\b/i
      ],
      keywords: ['help', 'support', 'faq', 'question', 'how to', 'what is'],
      confidence: 60
    }
  };

  /**
   * Classify user intent with confidence scoring and entity extraction
   */
  static async classifyIntent(message: string, conversationHistory: any[] = []): Promise<IntentResult> {
    const trimmedMessage = message.trim().toLowerCase();
    
    console.log(`[IntentClassifier] Classifying: "${message}"`);

    // Step 1: Pattern matching with confidence scoring
    const patternResults = this.matchPatterns(trimmedMessage);
    
    // Step 2: Entity extraction
    const entities = this.extractEntities(trimmedMessage, patternResults.intent);
    
    // Step 3: Context-aware adjustment based on conversation history
    const contextAdjusted = this.adjustWithContext(patternResults, conversationHistory);
    
    // Step 4: Final confidence calculation
    const finalResult = this.calculateFinalConfidence(contextAdjusted, entities);
    
    console.log(`[IntentClassifier] Result: ${finalResult.intent} (${finalResult.confidence}% confidence)`, finalResult.entities);
    
    return finalResult;
  }

  /**
   * Match message against intent patterns
   */
  private static matchPatterns(message: string): IntentResult {
    let bestMatch: IntentResult = {
      intent: 'unknown',
      confidence: 0
    };

    // Check each intent type
    for (const [intentType, config] of Object.entries(this.INTENT_PATTERNS)) {
      let intentScore = 0;
      let matchedPatterns = 0;
      
      // Pattern matching
      for (const pattern of config.patterns) {
        if (pattern.test(message)) {
          matchedPatterns++;
          intentScore += config.confidence;
        }
      }
      
      // Keyword matching
      const keywordMatches = config.keywords.filter(keyword => 
        message.includes(keyword.toLowerCase())
      ).length;
      
      if (keywordMatches > 0) {
        intentScore += (keywordMatches / config.keywords.length) * config.confidence * 0.7;
      }
      
      // Normalize score
      const totalMatches = matchedPatterns + keywordMatches;
      if (totalMatches > 0) {
        const avgScore = intentScore / Math.max(totalMatches, 1);
        
        if (avgScore > bestMatch.confidence) {
          bestMatch = {
            intent: intentType as IntentType,
            confidence: Math.min(avgScore, 100),
            reasoning: `Pattern matches: ${matchedPatterns}, Keyword matches: ${keywordMatches}`
          };
        }
      }
    }

    return bestMatch;
  }

  /**
   * Extract entities from message
   */
  private static extractEntities(message: string, intent: IntentType): any {
    const entities: any = {};

    // Order number extraction
    const orderMatch = message.match(/#?(\d{4,})/);
    if (orderMatch) {
      entities.orderNumber = orderMatch[1];
    }

    // Email extraction
    const emailMatch = message.match(/\b([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\b/);
    if (emailMatch) {
      entities.email = emailMatch[1];
    }

    // Tracking number extraction
    const trackingMatch = message.match(/\b(1Z[A-Z0-9]{16,}|[A-Z]{2}\d{9,}|[A-Z\d]{10,})\b/);
    if (trackingMatch) {
      entities.trackingNumber = trackingMatch[1];
    }

    // Product name extraction (simple heuristic)
    if (intent === 'product_availability') {
      const words = message.split(/\s+/).filter(word => word.length > 2);
      const productWords = words.filter(word => 
        !['do', 'you', 'have', 'is', 'in', 'stock', 'available', 'price', 'cost', 'how', 'much', 'the', 'this', 'that'].includes(word.toLowerCase())
      );
      if (productWords.length > 0) {
        entities.productName = productWords.join(' ');
      }
    }

    return Object.keys(entities).length > 0 ? entities : undefined;
  }

  /**
   * Adjust intent based on conversation context
   */
  private static adjustWithContext(result: IntentResult, history: any[]): IntentResult {
    if (history.length === 0) return result;

    const lastMessage = history[history.length - 1];
    const lastUserMessage = history.find(m => m.role === 'user')?.content?.toLowerCase() || '';
    
    // If we were waiting for order number and user provided it
    if (lastMessage?.metadata?.state === 'WAITING_FOR_ORDER_NUMBER') {
      const orderMatch = result.entities?.orderNumber;
      if (orderMatch) {
        return {
          intent: 'order_status',
          confidence: 95,
          entities: result.entities,
          reasoning: 'Context: User provided order number after being asked'
        };
      }
    }
    
    // Boost confidence for follow-up questions
    if (lastUserMessage && result.intent === 'general_faq') {
      const isFollowUp = lastUserMessage.includes('it') || lastUserMessage.includes('that') || lastUserMessage.includes('what about');
      if (isFollowUp) {
        result.confidence = Math.min(result.confidence + 15, 90);
        result.reasoning = (result.reasoning || '') + ' + Context: Follow-up question';
      }
    }
    
    return result;
  }

  /**
   * Calculate final confidence with multiple factors
   */
  private static calculateFinalConfidence(result: IntentResult, entities: any): IntentResult {
    let confidence = result.confidence;
    
    // Boost confidence if we extracted relevant entities
    if (entities) {
      if (result.intent === 'order_status' && entities.orderNumber) {
        confidence = Math.min(confidence + 20, 95);
      }
      if (result.intent === 'product_availability' && entities.productName) {
        confidence = Math.min(confidence + 10, 90);
      }
      if (entities.email) {
        confidence = Math.min(confidence + 5, 85);
      }
    }
    
    // Apply minimum thresholds
    if (confidence < 30) {
      result.intent = 'unknown';
      confidence = 20;
    }
    
    result.confidence = Math.round(confidence);
    
    return result;
  }

  /**
   * Get intent-specific tool recommendations
   */
  static getRecommendedTools(intent: IntentType): string[] {
    const toolMap: Record<IntentType, string[]> = {
      order_status: ['order_lookup', 'shopify_api'],
      shipping_policy: ['knowledge_base'],
      return_policy: ['knowledge_base'],
      product_availability: ['product_search', 'shopify_api'],
      store_information: ['knowledge_base', 'shopify_api'],
      general_faq: ['knowledge_base'],
      unknown: ['knowledge_base', 'escalation']
    };
    
    return toolMap[intent] || ['knowledge_base'];
  }

  /**
   * Validate if intent requires specific entities
   */
  static validateIntentRequirements(intent: IntentType, entities?: any): {
    valid: boolean;
    missingEntities: string[];
  } {
    const requirements: Record<IntentType, string[]> = {
      order_status: ['orderNumber'],
      product_availability: ['productName'],
      shipping_policy: [],
      return_policy: [],
      store_information: [],
      general_faq: [],
      unknown: []
    };
    
    const required = requirements[intent] || [];
    const missing = required.filter(req => !entities?.[req]);
    
    return {
      valid: missing.length === 0,
      missingEntities: missing
    };
  }
}
