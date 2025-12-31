"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AIService = void 0;
const sdk_1 = __importDefault(require("@anthropic-ai/sdk"));
const groq_sdk_1 = __importDefault(require("groq-sdk"));
const openai_1 = __importDefault(require("openai"));
const ai_constants_1 = require("../config/ai.constants");
const sdk_2 = require("@openrouter/sdk");
class AIService {
    /**
     * Generates a helpful, natural response using LLM.
     */
    static async generateCustomerResponse(shopName, question, context, template) {
        // Choose active provider from config
        const provider = ai_constants_1.AI_CONFIG.activeProvider;
        this.PROVIDER = provider; // Sync state
        const providerConfig = ai_constants_1.AI_CONFIG.providers[provider];
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
                        model: ai_constants_1.AI_CONFIG.providers.groq.model,
                        temperature: 0.7,
                    });
                    responseText = groqCompletion.choices[0]?.message?.content || "";
                    break;
                case 'openrouter':
                    // OpenRouter SDK usage
                    const stream = this.openrouter.callModel({
                        model: ai_constants_1.AI_CONFIG.providers.openrouter.model,
                        input: `${systemPrompt}\n\nUSER QUESTION: ${question}`, // OpenRouter SDK simple interface
                    });
                    responseText = await stream.getText();
                    break;
                case 'anthropic':
                default:
                    const anthropicMsg = await this.anthropic.messages.create({
                        model: ai_constants_1.AI_CONFIG.providers.anthropic.model,
                        max_tokens: 300,
                        temperature: 0.7,
                        system: systemPrompt,
                        messages: [
                            { role: "user", content: question }
                        ],
                    });
                    responseText = anthropicMsg.content[0].text;
                    break;
            }
            console.log("-------------------------------------------------------------");
            console.log(`[AIService] ${provider} Response:`, responseText);
            console.log("-------------------------------------------------------------");
            return responseText;
        }
        catch (error) {
            console.error(`AIService (${provider}) Error:`, error.message);
            // Fallback
            return context || "I'm having trouble thinking right now. Please try again.";
        }
    }
    /**
     * JUDGE: Checks if the context actually contains the answer.
     * Returns true/false.
     */
    static async checkRelevance(question, context) {
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
            const provider = ai_constants_1.AI_CONFIG.activeProvider;
            let response = "";
            if (provider === 'groq') {
                const completion = await this.groq.chat.completions.create({
                    messages: [{ role: "user", content: prompt }],
                    model: ai_constants_1.AI_CONFIG.providers.groq.model,
                });
                response = completion.choices[0]?.message?.content || "NO";
            }
            else if (provider === 'openrouter') {
                const stream = this.openrouter.callModel({
                    model: ai_constants_1.AI_CONFIG.providers.openrouter.model,
                    input: prompt,
                });
                response = await stream.getText();
            }
            else {
                // Anthropic
                const msg = await this.anthropic.messages.create({
                    model: ai_constants_1.AI_CONFIG.providers.anthropic.model,
                    max_tokens: 10,
                    messages: [{ role: "user", content: prompt }]
                });
                response = msg.content[0].text;
            }
            const isRelevant = response.toUpperCase().includes("YES");
            console.log(`[AIService] Relevance Check: ${isRelevant} (Response: ${response})`);
            return isRelevant;
        }
        catch (e) {
            console.error("Relevance check failed", e);
            return true; // Fail open
        }
    }
}
exports.AIService = AIService;
// Initialize Clients
AIService.anthropic = new sdk_1.default({
    apiKey: ai_constants_1.AI_CONFIG.providers.anthropic.apiKey || 'dummy_key',
});
AIService.groq = new groq_sdk_1.default({
    apiKey: ai_constants_1.AI_CONFIG.providers.groq.apiKey || 'dummy_key',
});
AIService.openai = new openai_1.default({
    baseURL: ai_constants_1.AI_CONFIG.providers.openrouter.baseURL,
    apiKey: ai_constants_1.AI_CONFIG.providers.openrouter.apiKey || 'dummy_key',
});
AIService.openrouter = new sdk_2.OpenRouter({
    apiKey: ai_constants_1.AI_CONFIG.providers.openrouter.apiKey
});
AIService.PROVIDER = ai_constants_1.AI_CONFIG.activeProvider;
