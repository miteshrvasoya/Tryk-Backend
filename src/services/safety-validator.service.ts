import { BuiltContext } from './context-builder.service';
import { AIService } from './ai.service';
import { query } from '../db';

export interface ValidationResult {
  isValid: boolean;
  confidence: number;
  issues: string[];
  warnings: string[];
  shouldEscalate: boolean;
  sanitizedResponse?: string;
  reasoning: string;
}

export interface SafetyRule {
  name: string;
  description: string;
  validator: (response: string, context: BuiltContext) => boolean;
  severity: 'low' | 'medium' | 'high';
  action: 'warn' | 'sanitize' | 'escalate';
}

export class SafetyValidatorService {

  private static readonly SAFETY_RULES: SafetyRule[] = [
    {
      name: 'hallucination_check',
      description: 'Detect if response contains information not in context',
      validator: SafetyValidatorService.checkHallucination,
      severity: 'high',
      action: 'escalate'
    },
    {
      name: 'policy_mismatch',
      description: 'Ensure policy responses match actual policies',
      validator: SafetyValidatorService.checkPolicyMismatch,
      severity: 'medium',
      action: 'sanitize'
    },
    {
      name: 'confidence_threshold',
      description: 'Check if confidence is too low for safe response',
      validator: SafetyValidatorService.checkConfidenceThreshold,
      severity: 'medium',
      action: 'escalate'
    },
    {
      name: 'context_completeness',
      description: 'Ensure response has adequate context support',
      validator: SafetyValidatorService.checkContextCompleteness,
      severity: 'low',
      action: 'warn'
    },
    {
      name: 'toxicity_check',
      description: 'Detect toxic or harmful content in response',
      validator: SafetyValidatorService.checkToxicity,
      severity: 'high',
      action: 'sanitize'
    },
    {
      name: 'length_check',
      description: 'Ensure response is appropriately concise',
      validator: SafetyValidatorService.checkResponseLength,
      severity: 'low',
      action: 'sanitize'
    }
  ];

  /**
   * Main validation entry point
   */
  static async validateResponse(
    response: string,
    context: BuiltContext,
    originalQuery: string
  ): Promise<ValidationResult> {
    
    console.log(`[SafetyValidator] Validating response for intent: ${context.intent}`);

    const startTime = Date.now();
    
    const issues: string[] = [];
    const warnings: string[] = [];
    let shouldEscalate = false;
    let sanitizedResponse = response;
    let overallConfidence = context.metadata.confidence;

    // Run all safety rules
    for (const rule of this.SAFETY_RULES) {
      try {
        const isValid = rule.validator(response, context);
        
        if (!isValid) {
          issues.push(`${rule.name}: ${rule.description}`);
          
          if (rule.action === 'escalate') {
            shouldEscalate = true;
          } else if (rule.action === 'sanitize') {
            sanitizedResponse = await this.sanitizeResponse(response, rule.name, context);
          }
        }

        // Adjust confidence based on rule severity
        if (rule.severity === 'high') {
          overallConfidence = Math.max(overallConfidence - 30, 10);
        } else if (rule.severity === 'medium') {
          overallConfidence = Math.max(overallConfidence - 15, 20);
        }

      } catch (error: any) {
        console.error(`[SafetyValidator] Rule ${rule.name} failed:`, error.message);
        warnings.push(`Validation error in ${rule.name}: ${error.message}`);
      }
    }

    const validationTime = Date.now() - startTime;
    
    const result: ValidationResult = {
      isValid: issues.length === 0,
      confidence: overallConfidence,
      issues,
      warnings,
      shouldEscalate,
      sanitizedResponse,
      reasoning: this.buildReasoning(issues, warnings, shouldEscalate)
    };

    console.log(`[SafetyValidator] Validation completed in ${validationTime}ms:`, result);

    return result;
  }

  /**
   * Check for hallucination - response contains info not in context
   */
  private static checkHallucination(response: string, context: BuiltContext): boolean {
    const responseLower = response.toLowerCase();
    const contextText = context.combinedText.toLowerCase();

    // Check for specific numbers, dates, or amounts that might be hallucinated
    const responseNumbers = responseLower.match(/\b\d+%\b|\$\d+|\d+\s*(days|weeks|months|years)|\b\d{4,}\b/gi) || [];
    
    for (const number of responseNumbers) {
      if (!contextText.includes(number.toLowerCase())) {
        console.log(`[SafetyValidator] Potential hallucination: ${number} not found in context`);
        return false;
      }
    }

    // Check for definitive statements about policies without context support
    const definitivePatterns = [
      /\b(we always|never|only)\s+(offer|allow|charge|ship)\b/i,
      /\b(our policy is|the policy states)\b/i
    ];

    for (const pattern of definitivePatterns) {
      if (pattern.test(responseLower) && !contextText.includes(responseLower.substring(0, 50))) {
        console.log(`[SafetyValidator] Potential policy hallucination detected`);
        return false;
      }
    }

    // Use AI service for deeper hallucination detection
    return this.performAIHallucinationCheck(response, context);
  }

  /**
   * AI-powered hallucination detection
   */
  private static async performAIHallucinationCheck(response: string, context: BuiltContext): Promise<boolean> {
    try {
      const isRelevant = await AIService.checkRelevance(response, context.combinedText);
      return !!isRelevant;
    } catch (error: any) {
      console.error(`[SafetyValidator] AI hallucination check failed:`, error.message);
      return true; // Fail open to avoid false positives
    }
  }

  /**
   * Check for policy mismatches
   */
  private static checkPolicyMismatch(response: string, context: BuiltContext): boolean {
    if (!['shipping_policy', 'return_policy'].includes(context.intent)) {
      return true; // Only check for policy intents
    }

    // Check for contradictory policy statements
    const contradictoryPatterns = [
      { pattern: /\b30\s+day\s+return\b/i, context: 'return_policy', shouldHave: /\b(30|60|90)\s+day\b/i },
      { pattern: /\bfree\s+shipping\b/i, context: 'shipping_policy', shouldHave: /\b(free|complimentary)\s+shipping\b/i },
      { pattern: /\bno\s+restocking\s+fee\b/i, context: 'return_policy', shouldHave: /\b(restock|restock)\s+fee/i }
    ];

    for (const check of contradictoryPatterns) {
      if (check.context === context.intent) {
        const hasPattern = check.pattern.test(response);
        const hasContext = check.shouldHave.test(context.combinedText);
        
        if (hasPattern && !hasContext) {
          console.log(`[SafetyValidator] Policy contradiction detected: ${check.pattern}`);
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Check confidence threshold
   */
  private static checkConfidenceThreshold(response: string, context: BuiltContext): boolean {
    const minConfidence = this.getMinConfidenceForIntent(context.intent);
    return context.metadata.confidence >= minConfidence;
  }

  /**
   * Get minimum confidence for different intents
   */
  private static getMinConfidenceForIntent(intent: string): number {
    const thresholds: Record<string, number> = {
      order_status: 70,
      shipping_policy: 60,
      return_policy: 60,
      product_availability: 65,
      store_information: 50,
      general_faq: 40,
      unknown: 30
    };

    return thresholds[intent] || 50;
  }

  /**
   * Check context completeness
   */
  private static checkContextCompleteness(response: string, context: BuiltContext): boolean {
    // For critical intents, ensure we have adequate context
    const criticalIntents = ['order_status', 'product_availability'];
    
    if (criticalIntents.includes(context.intent)) {
      const hasShopifyData = context.metadata.hasShopifyData;
      const hasKBData = context.metadata.hasKBData;
      
      if (!hasShopifyData && !hasKBData) {
        console.log(`[SafetyValidator] Insufficient context for critical intent: ${context.intent}`);
        return false;
      }
    }

    return true;
  }

  /**
   * Check for toxic or harmful content
   */
  private static checkToxicity(response: string, context: BuiltContext): boolean {
    const toxicPatterns = [
      /\b(stupid|idiot|useless|worthless)\b/i,
      /\b(hate|kill|die|harm)\b/i,
      /\b(inappropriate|offensive|vulgar)\b/i
    ];

    for (const pattern of toxicPatterns) {
      if (pattern.test(response)) {
        console.log(`[SafetyValidator] Toxic content detected: ${pattern}`);
        return false;
      }
    }

    return true;
  }

  /**
   * Check response length
   */
  private static checkResponseLength(response: string, context: BuiltContext): boolean {
    const wordCount = response.split(/\s+/).length;
    
    // Responses should be concise but complete
    if (wordCount < 3) {
      console.log(`[SafetyValidator] Response too short: ${wordCount} words`);
      return false;
    }
    
    if (wordCount > 100) {
      console.log(`[SafetyValidator] Response too long: ${wordCount} words`);
      return false;
    }

    return true;
  }

  /**
   * Sanitize response based on safety rule
   */
  private static async sanitizeResponse(
    response: string,
    ruleName: string,
    context: BuiltContext
  ): Promise<string> {
    
    switch (ruleName) {
      case 'hallucination_check':
        return this.addHallucinationDisclaimer(response);
      
      case 'policy_mismatch':
        return this.addPolicyDisclaimer(response, context.intent);
      
      case 'length_check':
        return this.truncateResponse(response);
      
      case 'toxicity_check':
        return this.filterToxicContent(response);
      
      default:
        return response;
    }
  }

  /**
   * Add hallucination disclaimer
   */
  private static addHallucinationDisclaimer(response: string): string {
    return `${response}\n\n*Note: I'm not completely certain about this information. Please verify with our support team if needed.*`;
  }

  /**
   * Add policy disclaimer
   */
  private static addPolicyDisclaimer(response: string, intent: string): string {
    const disclaimers: Record<string, string> = {
      shipping_policy: '\n\n*Note: Policies may vary. Please check our latest shipping policy for complete details.*',
      return_policy: '\n\n*Note: Return policies have specific conditions. Please review our full return policy for complete information.*'
    };

    return `${response}${disclaimers[intent] || ''}`;
  }

  /**
   * Truncate overly long responses
   */
  private static truncateResponse(response: string): string {
    const sentences = response.split(/[.!?]+/);
    if (sentences.length <= 3) return response;

    return sentences.slice(0, 3).join('. ') + '.';
  }

  /**
   * Filter toxic content
   */
  private static filterToxicContent(response: string): string {
    // Simple toxic word filter
    const toxicWords = ['stupid', 'idiot', 'useless', 'hate', 'kill'];
    let filtered = response;

    for (const word of toxicWords) {
      const regex = new RegExp(`\\b${word}\\b`, 'gi');
      filtered = filtered.replace(regex, '[filtered]');
    }

    return filtered;
  }

  /**
   * Build reasoning for validation result
   */
  private static buildReasoning(
    issues: string[],
    warnings: string[],
    shouldEscalate: boolean
  ): string {
    let reasoning = '';

    if (issues.length > 0) {
      reasoning += `Issues found: ${issues.join(', ')}. `;
    }

    if (warnings.length > 0) {
      reasoning += `Warnings: ${warnings.join(', ')}. `;
    }

    if (shouldEscalate) {
      reasoning += 'Recommending escalation due to safety concerns.';
    } else if (issues.length === 0) {
      reasoning += 'Response passed all safety checks.';
    }

    return reasoning.trim();
  }

  /**
   * Log validation results for analytics
   */
  static async logValidation(
    shopId: string,
    conversationId: string,
    validation: ValidationResult,
    originalQuery: string,
    response: string
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
        response,
        validation.isValid,
        validation.confidence,
        JSON.stringify(validation.issues),
        JSON.stringify(validation.warnings),
        validation.shouldEscalate,
        0 // validation_time_ms would need to be calculated
      ]);
    } catch (error: any) {
      console.error(`[SafetyValidator] Failed to log validation:`, error.message);
    }
  }

  /**
   * Get validation statistics
   */
  static async getValidationStats(shopId: string, days: number = 7): Promise<any> {
    try {
      const result = await query(`
        SELECT 
          COUNT(*) as total_validations,
          AVG(confidence) as avg_confidence,
          COUNT(CASE WHEN is_valid = true THEN 1 END) as passed_validations,
          COUNT(CASE WHEN should_escalate = true THEN 1 END) as escalations,
          AVG(validation_time_ms) as avg_validation_time
        FROM safety_validation_logs 
        WHERE shop_id = $1 
          AND created_at >= NOW() - INTERVAL '${days} days'
      `, [shopId]);

      return result.rows[0];
    } catch (error: any) {
      console.error(`[SafetyValidator] Failed to get validation stats:`, error.message);
      return null;
    }
  }

  /**
   * Create fallback response for failed validation
   */
  static createFallbackResponse(
    originalQuery: string,
    validation: ValidationResult,
    shopName?: string
  ): string {
    const fallbacks: Record<string, string> = {
      hallucination_check: "I'm not completely certain about that information. Let me connect you with our support team for accurate assistance.",
      policy_mismatch: "I want to make sure I give you accurate information. Let me connect you with our support team who can provide complete policy details.",
      confidence_threshold: "I'm not confident enough to provide a complete answer. Let me connect you with our support team for better assistance.",
      context_completeness: "I don't have enough information to answer your question properly. Let me connect you with our support team.",
      toxicity_check: "I apologize if my response wasn't helpful. Let me connect you with our support team.",
      length_check: "Let me connect you with our support team for more detailed assistance."
    };

    // Find the primary issue and use appropriate fallback
    const primaryIssue = validation.issues[0]?.split(':')[0] || 'general';
    
    return fallbacks[primaryIssue] || fallbacks.general;
  }
}
