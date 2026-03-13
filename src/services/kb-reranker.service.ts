import { KBDocument, KBQueryService, IntentCategory } from './kb-query.service';

export interface RerankingOptions {
  maxResults?: number;
  boostRecent?: boolean;
  boostTitleMatches?: boolean;
  boostExactMatches?: boolean;
  minSimilarity?: number;
}

export interface RerankingScore {
  document: KBDocument;
  finalScore: number;
  breakdown: {
    semanticSimilarity: number;
    keywordOverlap: number;
    intentRelevance: number;
    freshnessBonus: number;
    titleMatchBonus: number;
  };
}

export class KBRerankerService {

  /**
   * Advanced reranking with multiple scoring factors
   */
  static async rerankByRelevance(
    query: string, 
    documents: KBDocument[], 
    intent?: IntentCategory,
    options: RerankingOptions = {}
  ): Promise<KBDocument[]> {
    const {
      maxResults = 10,
      boostRecent = true,
      boostTitleMatches = true,
      boostExactMatches = true,
      minSimilarity = 0.1
    } = options;

    console.log(`[KBReranker] Reranking ${documents.length} documents for query: "${query}"`);

    const scoredDocuments: RerankingScore[] = [];

    for (const doc of documents) {
      const score = await this.calculateDocumentScore(doc, query, intent, {
        boostRecent,
        boostTitleMatches,
        boostExactMatches
      });

      if (score.finalScore >= minSimilarity) {
        scoredDocuments.push(score);
      }
    }

    // Sort by final score (descending)
    scoredDocuments.sort((a, b) => b.finalScore - a.finalScore);

    const topResults = scoredDocuments
      .slice(0, maxResults)
      .map(scored => ({
        ...scored.document,
        rank: scored.finalScore,
        similarity: scored.finalScore
      }));

    console.log(`[KBReranker] Selected top ${topResults.length} documents`);
    
    return topResults;
  }

  /**
   * Calculate comprehensive score for a document
   */
  private static async calculateDocumentScore(
    document: KBDocument,
    query: string,
    intent: IntentCategory | undefined,
    options: {
      boostRecent: boolean;
      boostTitleMatches: boolean;
      boostExactMatches: boolean;
    }
  ): Promise<RerankingScore> {
    
    const queryLower = query.toLowerCase();
    const contentLower = document.content.toLowerCase();
    const titleLower = (document.title || '').toLowerCase();

    // 1. Semantic Similarity (base score)
    const semanticSimilarity = document.similarity || 0;

    // 2. Keyword Overlap Score
    const keywordOverlap = this.calculateKeywordOverlap(queryLower, contentLower);

    // 3. Intent Relevance Score
    const intentRelevance = this.calculateIntentRelevance(document.source_type, intent);

    // 4. Freshness Bonus
    const freshnessBonus = options.boostRecent ? this.calculateFreshnessBonus(document.created_at) : 0;

    // 5. Title Match Bonus
    const titleMatchBonus = options.boostTitleMatches ? this.calculateTitleMatchBonus(queryLower, titleLower) : 0;

    // 6. Exact Match Bonus
    const exactMatchBonus = options.boostExactMatches ? this.calculateExactMatchBonus(queryLower, contentLower) : 0;

    // Calculate final weighted score
    const finalScore = 
      (semanticSimilarity * 0.4) +           // 40% semantic similarity
      (keywordOverlap * 0.25) +               // 25% keyword overlap
      (intentRelevance * 0.2) +               // 20% intent relevance
      (freshnessBonus * 0.05) +               // 5% freshness
      (titleMatchBonus * 0.05) +               // 5% title match
      (exactMatchBonus * 0.05);                // 5% exact match

    return {
      document,
      finalScore: Math.min(finalScore, 1.0), // Cap at 1.0
      breakdown: {
        semanticSimilarity,
        keywordOverlap,
        intentRelevance,
        freshnessBonus,
        titleMatchBonus
      }
    };
  }

  /**
   * Calculate keyword overlap between query and document
   */
  static calculateKeywordOverlap(query: string, content: string): number {
    const queryWords = this.tokenize(query);
    const contentWords = this.tokenize(content);

    if (queryWords.length === 0) return 0;

    // Count matching words
    let matches = 0;
    for (const queryWord of queryWords) {
      if (contentWords.some(contentWord => 
        contentWord.includes(queryWord) || queryWord.includes(contentWord)
      )) {
        matches++;
      }
    }

    return matches / queryWords.length;
  }

  /**
   * Calculate intent relevance score based on source type
   */
  static calculateIntentRelevance(sourceType: string, intent?: IntentCategory): number {
    if (!intent) return 0.5; // Neutral if no intent

    const relevanceMatrix: Record<IntentCategory, Record<string, number>> = {
      'shipping_policy': {
        'shipping_policy': 1.0,
        'general_faq': 0.3,
        'help': 0.2,
        'default': 0.1
      },
      'return_policy': {
        'return_policy': 1.0,
        'general_faq': 0.3,
        'help': 0.2,
        'default': 0.1
      },
      'product_availability': {
        'general': 0.8,
        'product_docs': 1.0,
        'general_faq': 0.4,
        'default': 0.2
      },
      'general_faq': {
        'faq': 1.0,
        'help': 0.8,
        'contact': 0.6,
        'general': 0.4,
        'default': 0.2
      },
      'order_status': {
        'general': 0.2,
        'help': 0.3,
        'default': 0.1
      },
      'unknown': {
        'default': 0.3
      }
    };

    const intentScores = relevanceMatrix[intent] || relevanceMatrix['unknown'];
    return intentScores[sourceType] || intentScores['default'];
  }

  /**
   * Calculate freshness bonus for recent documents
   */
  static calculateFreshnessBonus(createdAt?: string): number {
    if (!createdAt) return 0;

    const daysSinceCreation = (Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24);
    
    if (daysSinceCreation < 7) return 0.2;      // Very recent
    if (daysSinceCreation < 30) return 0.1;     // Recent
    if (daysSinceCreation < 90) return 0.05;     // Somewhat recent
    
    return 0; // No bonus for older content
  }

  /**
   * Calculate title match bonus
   */
  static calculateTitleMatchBonus(query: string, title: string): number {
    if (!title) return 0;

    const queryWords = this.tokenize(query);
    const titleWords = this.tokenize(title);

    let matches = 0;
    for (const queryWord of queryWords) {
      if (titleWords.some(titleWord => 
        titleWord.includes(queryWord) || queryWord.includes(titleWord)
      )) {
        matches++;
      }
    }

    const matchRatio = matches / queryWords.length;
    
    // Higher bonus for complete title matches
    if (title.includes(query)) return 0.3;
    if (matchRatio >= 0.8) return 0.2;
    if (matchRatio >= 0.5) return 0.1;
    
    return 0;
  }

  /**
   * Calculate exact match bonus for phrase matches
   */
  static calculateExactMatchBonus(query: string, content: string): number {
    // Exact phrase match
    if (content.includes(query)) return 0.2;
    
    // Partial phrase matches
    const queryWords = this.tokenize(query);
    if (queryWords.length >= 2) {
      const bigrams = this.createBigrams(queryWords);
      let bigramMatches = 0;
      
      for (const bigram of bigrams) {
        if (content.includes(bigram)) {
          bigramMatches++;
        }
      }
      
      if (bigramMatches > 0) {
        return Math.min(bigramMatches / bigrams.length * 0.1, 0.15);
      }
    }
    
    return 0;
  }

  /**
   * Tokenize text into words
   */
  static tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2) // Filter out very short words
      .filter(word => !this.isStopWord(word));
  }

  /**
   * Check if word is a stop word
   */
  static isStopWord(word: string): boolean {
    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
      'of', 'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been',
      'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
      'can', 'could', 'should', 'may', 'might', 'must', 'i', 'you',
      'he', 'she', 'it', 'we', 'they', 'what', 'when', 'where', 'why', 'how'
    ]);
    
    return stopWords.has(word);
  }

  /**
   * Create bigrams from array of words
   */
  static createBigrams(words: string[]): string[] {
    const bigrams: string[] = [];
    for (let i = 0; i < words.length - 1; i++) {
      bigrams.push(`${words[i]} ${words[i + 1]}`);
    }
    return bigrams;
  }

  /**
   * Diversify results to avoid redundancy
   */
  static diversifyResults(documents: KBDocument[], maxSimilarity: number = 0.8): KBDocument[] {
    const diversified: KBDocument[] = [];
    
    for (const doc of documents) {
      // Check if document is too similar to already selected documents
      const isTooSimilar = diversified.some(selected => 
        this.calculateDocumentSimilarity(doc, selected) > maxSimilarity
      );
      
      if (!isTooSimilar) {
        diversified.push(doc);
      }
    }
    
    return diversified;
  }

  /**
   * Calculate similarity between two documents (for diversification)
   */
  static calculateDocumentSimilarity(doc1: KBDocument, doc2: KBDocument): number {
    // Simple similarity based on content overlap and source type
    const content1Words = new Set(this.tokenize(doc1.content));
    const content2Words = new Set(this.tokenize(doc2.content));
    
    const intersection = new Set([...content1Words].filter(x => content2Words.has(x)));
    const union = new Set([...content1Words, ...content2Words]);
    
    const jaccardSimilarity = intersection.size / union.size;
    
    // Boost similarity if same source type
    const typeBonus = doc1.source_type === doc2.source_type ? 0.2 : 0;
    
    return Math.min(jaccardSimilarity + typeBonus, 1.0);
  }

  /**
   * Explain reranking decision (for debugging)
   */
  static explainReranking(scoredDocuments: RerankingScore[]): any {
    return scoredDocuments.map(scored => ({
      id: scored.document.id,
      title: scored.document.title,
      source_type: scored.document.source_type,
      final_score: scored.finalScore,
      breakdown: scored.breakdown
    }));
  }
}
