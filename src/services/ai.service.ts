import Anthropic from '@anthropic-ai/sdk';
import Groq from 'groq-sdk';
import OpenAI from 'openai';
import { AI_CONFIG } from '../config/ai.constants';
import { OpenRouter } from '@openrouter/sdk';

export class AIService {
  // Initialize Clients
  private static anthropic = new Anthropic({
    apiKey: AI_CONFIG.providers.anthropic.apiKey || 'dummy_key',
  });

  private static groq = new Groq({
      apiKey: AI_CONFIG.providers.groq.apiKey || 'dummy_key',
  });

  private static openai = new OpenAI({
      baseURL: AI_CONFIG.providers.openrouter.baseURL,
      apiKey: AI_CONFIG.providers.openrouter.apiKey || 'dummy_key',
  });

  private static openrouter = new OpenRouter({
    apiKey: AI_CONFIG.providers.openrouter.apiKey
  });

  private static PROVIDER = AI_CONFIG.activeProvider;

  /**
   * Generates a helpful, natural response using LLM.
   */
  static async generateCustomerResponse(
    shopName: string,
    question: string,
    context: string,
    template?: string | null
  ): Promise<string> {
    
    // Choose active provider from config
    const provider = AI_CONFIG.activeProvider; 
    this.PROVIDER = provider; // Sync state

    const providerConfig = (AI_CONFIG.providers as any)[provider];

    if (!providerConfig?.apiKey) {
      console.warn(`[AIService] Missing API Key for ${provider}. Returning raw context.`);
      return context || "I'm sorry, I couldn't find an answer to that.";
    }

    try {
      const instructions = `
INSTRUCTIONS:
- Use a friendly, professional tone.
- Keep the answer concise (under 50 words).
- If the CONTEXT doesn't contain the answer, say "I'm not sure about that" and nothing else.
- Do NOT make up information.
${template ? `\nIMPORTANT - USE THIS TEMPLATE STRUCTURE:\n${template}\n(Replace {variables} with actual values if known, or adapt naturally)` : ''}
`;

      const systemPrompt = `You are 'Tryk', a helpful AI support agent for ${shopName}.
Your goal is to answer the customer's question naturally using the provided FAQ information.

CONTEXT:
${context}

${instructions}`;

      console.log(`[AIService] Using Provider: ${provider}`);
      
      let responseText = "";

      switch (provider) {
          case 'groq':
              const groqCompletion = await this.groq.chat.completions.create({
                  messages: [
                      { role: "system", content: systemPrompt },
                      { role: "user", content: question }
                  ],
                  model: AI_CONFIG.providers.groq.model,
                  temperature: 0.7,
              });
              responseText = groqCompletion.choices[0]?.message?.content || "";
              break;

          case 'openrouter':
              // OpenRouter SDK usage
              const stream = this.openrouter.callModel({
                  model: AI_CONFIG.providers.openrouter.model,
                  input: `${systemPrompt}\n\nUSER QUESTION: ${question}`, // OpenRouter SDK simple interface
              });
              responseText = await stream.getText();
              break;

          case 'anthropic':
          default:
              const anthropicMsg = await this.anthropic.messages.create({
                model: AI_CONFIG.providers.anthropic.model,
                max_tokens: 300,
                temperature: 0.7,
                system: systemPrompt,
                messages: [
                  { role: "user", content: question }
                ],
              });
              responseText = (anthropicMsg.content[0] as any).text;
              break;
      }

      console.log("-------------------------------------------------------------");
      console.log(`[AIService] ${provider} Response:`, responseText);
      console.log("-------------------------------------------------------------");

      return responseText;

    } catch (error: any) {
        console.error(`AIService (${provider}) Error:`, error.message);
        // Fallback
        return context || "I'm having trouble thinking right now. Please try again.";
    }
  }

  /**
   * JUDGE: Checks if the context actually contains the answer.
   * Returns true/false.
   */
  static async checkRelevance(question: string, context: string): Promise<boolean> {
      try {
          const prompt = `
CONTEXT:
${context}

USER QUESTION:
${question}

TASK:
Does the Context contain the answer to the User Question?
Reply ONLY with "YES" or "NO".
`;
          
         // Use active provider
         const provider = AI_CONFIG.activeProvider;
         let response = "";

         if (provider === 'groq') {
             const completion = await this.groq.chat.completions.create({
                messages: [{ role: "user", content: prompt }],
                model: AI_CONFIG.providers.groq.model,
             });
             response = completion.choices[0]?.message?.content || "NO";
         } 
         else if (provider === 'openrouter') {
             const stream = this.openrouter.callModel({
                 model: AI_CONFIG.providers.openrouter.model,
                 input: prompt,
             });
             response = await stream.getText();
         }
         else {
             // Anthropic
             const msg = await this.anthropic.messages.create({
                 model: AI_CONFIG.providers.anthropic.model,
                 max_tokens: 10,
                 messages: [{ role: "user", content: prompt }]
             });
             response = (msg.content[0] as any).text;
         }

         const isRelevant = response.toUpperCase().includes("YES");
         console.log(`[AIService] Relevance Check: ${isRelevant} (Response: ${response})`);
         return isRelevant;

      } catch (e) {
          console.error("Relevance check failed", e);
          return true; // Fail open
      }
  }
}
