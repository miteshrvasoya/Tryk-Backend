import { ToolResult } from './request-router.service';
import { KBDocument } from './kb-query.service';

export interface ContextSource {
  type: 'shopify_api' | 'knowledge_base' | 'conversation_history' | 'template';
  data: any;
  relevanceScore?: number;
  timestamp?: string;
}

export interface BuiltContext {
  query: string;
  intent: string;
  sources: ContextSource[];
  combinedText: string;
  metadata: {
    totalSources: number;
    hasShopifyData: boolean;
    hasKBData: boolean;
    hasHistory: boolean;
    confidence: number;
  };
}

export class ContextBuilderService {

  /**
   * Build unified context from multiple sources
   */
  static async buildContext(
    query: string,
    intent: string,
    toolResults: ToolResult[],
    conversationHistory: any[] = [],
    shopName?: string
  ): Promise<BuiltContext> {
    
    console.log(`[ContextBuilder] Building context for intent: ${intent}`);

    const sources: ContextSource[] = [];
    let hasShopifyData = false;
    let hasKBData = false;

    // Step 1: Process tool results into context sources
    for (const toolResult of toolResults) {
      if (!toolResult.success) continue;

      const contextSource = await this.convertToolResultToSource(toolResult, intent);
      if (contextSource) {
        sources.push(contextSource);
        
        if (contextSource.type === 'shopify_api') hasShopifyData = true;
        if (contextSource.type === 'knowledge_base') hasKBData = true;
      }
    }

    // Step 2: Add conversation history if relevant
    const historySource = this.buildHistorySource(conversationHistory, intent);
    if (historySource) {
      sources.push(historySource);
    }

    // Step 3: Sort sources by relevance
    sources.sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0));

    // Step 4: Build combined text context
    const combinedText = this.buildCombinedText(sources, intent, shopName);

    // Step 5: Calculate overall confidence
    const overallConfidence = this.calculateOverallConfidence(sources, toolResults);

    const context: BuiltContext = {
      query,
      intent,
      sources,
      combinedText,
      metadata: {
        totalSources: sources.length,
        hasShopifyData,
        hasKBData,
        hasHistory: conversationHistory.length > 0,
        confidence: overallConfidence
      }
    };

    console.log(`[ContextBuilder] Built context with ${sources.length} sources, confidence: ${overallConfidence}%`);

    return context;
  }

  /**
   * Convert tool result to context source
   */
  private static async convertToolResultToSource(
    toolResult: ToolResult,
    intent: string
  ): Promise<ContextSource | null> {
    
    switch (toolResult.toolName) {
      case 'order_lookup':
        return this.buildOrderSource(toolResult.data);
      
      case 'product_search':
        return this.buildProductSource(toolResult.data);
      
      case 'knowledge_base':
        return this.buildKBSource(toolResult.data);
      
      default:
        return null;
    }
  }

  /**
   * Build order lookup source
   */
  private static buildOrderSource(orderData: any): ContextSource {
    if (!orderData.found) {
      return {
        type: 'shopify_api',
        data: { 
          found: false,
          orderNumber: orderData.orderNumber,
          message: orderData.message
        },
        relevanceScore: 90
      };
    }

    const orderText = `Order #${orderData.orderNumber} Status:
- Status: ${orderData.friendlyStatus}
- Financial Status: ${orderData.financialStatus}
- Total: ${orderData.totalPrice} ${orderData.currency}
- Created: ${new Date(orderData.createdAt).toLocaleDateString()}
${orderData.trackingUrl ? `- Tracking: ${orderData.trackingUrl}` : ''}`;

    return {
      type: 'shopify_api',
      data: {
        found: true,
        orderNumber: orderData.orderNumber,
        status: orderData.status,
        friendlyStatus: orderData.friendlyStatus,
        financialStatus: orderData.financialStatus,
        totalPrice: orderData.totalPrice,
        currency: orderData.currency,
        trackingUrl: orderData.trackingUrl,
        createdAt: orderData.createdAt
      },
      relevanceScore: 95,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Build product search source
   */
  private static buildProductSource(productData: any): ContextSource {
    if (!productData.found) {
      return {
        type: 'shopify_api',
        data: {
          found: false,
          query: productData.query,
          message: 'No products found'
        },
        relevanceScore: 70
      };
    }

    const productText = productData.products
      .map((p: any, i: number) => `${i + 1}. ${p.title} - $${p.price} (Available: ${p.inventory_quantity || 'Unknown'})`)
      .join('\n');

    return {
      type: 'shopify_api',
      data: {
        found: true,
        query: productData.query,
        count: productData.count,
        products: productData.products
      },
      relevanceScore: 85,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Build knowledge base source
   */
  private static buildKBSource(kbData: any): ContextSource {
    if (!kbData.documents || kbData.documents.length === 0) {
      return {
        type: 'knowledge_base',
        data: {
          found: false,
          query: kbData.query,
          message: 'No knowledge base matches found'
        },
        relevanceScore: 30
      };
    }

    const kbText = kbData.documents
      .map((doc: KBDocument, i: number) => {
        const source = `[KB${i + 1}] ${doc.title || 'Untitled'}\n`;
        source += `Source: ${doc.source_url || 'Internal'}\n`;
        source += `Content: ${doc.content.substring(0, 300)}${doc.content.length > 300 ? '...' : ''}\n`;
        return source;
      })
      .join('\n');

    return {
      type: 'knowledge_base',
      data: {
        found: true,
        query: kbData.query,
        intent: kbData.intent,
        documents: kbData.documents,
        method: kbData.method,
        totalFound: kbData.totalFound
      },
      relevanceScore: Math.max(...kbData.documents.map((doc: KBDocument) => doc.similarity || doc.rank || 0)) * 100,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Build conversation history source
   */
  private static buildHistorySource(
    conversationHistory: any[],
    intent: string
  ): ContextSource | null {
    
    if (conversationHistory.length === 0) return null;

    // Only include history for follow-up questions
    const lastMessages = conversationHistory.slice(-3); // Last 3 messages
    const historyText = lastMessages
      .filter(msg => msg.role === 'user' || msg.role === 'assistant')
      .map(msg => `${msg.role.toUpperCase()}: ${msg.content}`)
      .join('\n');

    if (!historyText.trim()) return null;

    return {
      type: 'conversation_history',
      data: {
        messages: lastMessages,
        count: lastMessages.length
      },
      relevanceScore: 60, // Lower relevance for history
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Build combined text context for LLM
   */
  private static buildCombinedText(
    sources: ContextSource[],
    intent: string,
    shopName?: string
  ): string {
    
    let contextText = `CONTEXT FOR ${shopName || 'Our Store'} SUPPORT:\n\n`;
    
    // Add intent-specific instructions
    contextText += this.getIntentInstructions(intent);
    
    // Add sources in order of relevance
    for (const sourceItem of sources) {
      contextText += this.formatSourceForLLM(sourceItem);
    }

    // Add general instructions
    contextText += `\nINSTRUCTIONS:\n`;
    contextText += `- Answer the user's question using ONLY the context provided above\n`;
    contextText += `- If the context doesn't contain the answer, say "I don't have enough information to answer that question."\n`;
    contextText += `- Be concise and helpful\n`;
    contextText += `- Include specific details from the context when possible\n`;
    contextText += `- Never invent information not present in the context\n`;

    return contextText;
  }

  /**
   * Get intent-specific instructions
   */
  private static getIntentInstructions(intent: string): string {
    const instructions: Record<string, string> = {
      order_status: 'ORDER STATUS INSTRUCTIONS:\n- Provide order status, tracking, and delivery information\n- Include order number, current status, and tracking details\n',
      shipping_policy: 'SHIPPING POLICY INSTRUCTIONS:\n- Provide shipping times, costs, methods, and delivery information\n- Include specific timeframes and any restrictions\n',
      return_policy: 'RETURN POLICY INSTRUCTIONS:\n- Provide return window, conditions, process, and refund information\n- Include specific timeframes and any restocking fees\n',
      product_availability: 'PRODUCT AVAILABILITY INSTRUCTIONS:\n- Provide current stock status, pricing, and availability information\n- Include specific quantities and restock information if available\n',
      store_information: 'STORE INFORMATION INSTRUCTIONS:\n- Provide store hours, location, contact information, and policies\n- Include specific details like hours of operation\n',
      general_faq: 'GENERAL FAQ INSTRUCTIONS:\n- Provide helpful information about store policies and common questions\n- Focus on being accurate and helpful\n'
    };

    return instructions[intent] || 'GENERAL INSTRUCTIONS:\n- Provide helpful and accurate information based on the context\n';
  }

  /**
   * Format source for LLM consumption
   */
  private static formatSourceForLLM(source: ContextSource): string {
    let formatted = '';

    switch (source.type) {
      case 'shopify_api':
        formatted = this.formatShopifySource(source.data);
        break;
      
      case 'knowledge_base':
        formatted = this.formatKBSource(source.data);
        break;
      
      case 'conversation_history':
        formatted = this.formatHistorySource(source.data);
        break;
      
      default:
        formatted = `Source: ${JSON.stringify(source.data)}`;
    }

    return formatted + '\n\n';
  }

  /**
   * Format Shopify API source for LLM
   */
  private static formatShopifySource(data: any): string {
    if (data.found && data.orderNumber) {
      return `ORDER INFORMATION:\n${data.friendlyStatus ? `- Status: ${data.friendlyStatus}\n` : ''}${data.financialStatus ? `- Financial Status: ${data.financialStatus}\n` : ''}${data.totalPrice ? `- Total: ${data.totalPrice} ${data.currency}\n` : ''}${data.trackingUrl ? `- Tracking: ${data.trackingUrl}\n` : ''}`;
    }
    
    if (data.found && data.products) {
      return `PRODUCT INFORMATION:\n${data.products.map((p: any) => `- ${p.title}: $${p.price} (Stock: ${p.inventory_quantity || 'Unknown'})`).join('\n')}`;
    }
    
    return `SHOPIFY DATA: ${JSON.stringify(data)}`;
  }

  /**
   * Format knowledge base source for LLM
   */
  private static formatKBSource(data: any): string {
    if (!data.found) {
      return 'KNOWLEDGE BASE: No relevant information found';
    }

    return `KNOWLEDGE BASE INFORMATION:\n${data.documents.map((doc: KBDocument, i: number) => 
      `[Source ${i + 1}] ${doc.title || 'Untitled'}\n${doc.content}`
    ).join('\n\n')}`;
  }

  /**
   * Format conversation history for LLM
   */
  private static formatHistorySource(data: any): string {
    return `CONVERSATION HISTORY:\n${data.messages.map((msg: any) => 
      `${msg.role.toUpperCase()}: ${msg.content}`
    ).join('\n')}`;
  }

  /**
   * Calculate overall confidence from all sources
   */
  private static calculateOverallConfidence(
    sources: ContextSource[],
    toolResults: ToolResult[]
  ): number {
    
    if (sources.length === 0) return 20;

    // Weight by source type and relevance
    const confidenceScores = sources.map(source => {
      let score = source.relevanceScore || 50;
      
      // Boost confidence based on source type
      switch (source.type) {
        case 'shopify_api':
          score *= 1.2; // High confidence in real-time data
          break;
        case 'knowledge_base':
          score *= 1.0; // Base confidence for KB
          break;
        case 'conversation_history':
          score *= 0.7; // Lower confidence for history
          break;
      }
      
      return score;
    });

    // Use the highest confidence score, but don't exceed 95
    const maxConfidence = Math.max(...confidenceScores);
    return Math.min(maxConfidence, 95);
  }

  /**
   * Validate context completeness
   */
  static validateContext(context: BuiltContext): {
    isValid: boolean;
    issues: string[];
    recommendations: string[];
  } {
    const issues: string[] = [];
    const recommendations: string[] = [];

    // Check if we have any sources
    if (context.sources.length === 0) {
      issues.push('No data sources available');
      recommendations.push('Add fallback knowledge base or escalation');
    }

    // Check if sources have low relevance
    const avgRelevance = context.sources.reduce((sum, source) => 
      sum + (source.relevanceScore || 0), 0) / context.sources.length;

    if (avgRelevance < 40) {
      issues.push('Low relevance scores across all sources');
      recommendations.push('Consider expanding knowledge base or improving search');
    }

    // Check for specific intents requiring certain data
    if (context.intent === 'order_status' && !context.metadata.hasShopifyData) {
      issues.push('Order status intent without Shopify data');
      recommendations.push('Ensure order lookup tool is working');
    }

    if (context.intent === 'product_availability' && !context.metadata.hasShopifyData && !context.metadata.hasKBData) {
      issues.push('Product availability intent without product data');
      recommendations.push('Improve product search or KB product information');
    }

    return {
      isValid: issues.length === 0,
      issues,
      recommendations
    };
  }

  /**
   * Get context summary for analytics
   */
  static getContextSummary(context: BuiltContext): any {
    return {
      intent: context.intent,
      sourceTypes: context.sources.map(s => s.type),
      sourceCount: context.sources.length,
      hasShopifyData: context.metadata.hasShopifyData,
      hasKBData: context.metadata.hasKBData,
      confidence: context.metadata.confidence,
      contextLength: context.combinedText.length
    };
  }
}
