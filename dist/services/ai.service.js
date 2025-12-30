"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateResponse = exports.classifyIntent = void 0;
const sdk_1 = __importDefault(require("@anthropic-ai/sdk"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const anthropic = new sdk_1.default({
    apiKey: process.env.ANTHROPIC_API_KEY,
});
const classifyIntent = async (message, context) => {
    const prompt = `
    Message: ${message}
    Context: ${JSON.stringify(context)}
    
    Classify this message into ONE of these categories:
    - order_status
    - product_question
    - return_request
    - refund_question
    - general_inquiry
    - escalation
    
    Respond with JSON: {"intent": "...", "confidence": number}
  `;
    const response = await anthropic.messages.create({
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 300,
        messages: [{ role: "user", content: prompt }]
    });
    // Simple parsing for MVP. Robust parsing needed for prod.
    const text = response.content[0].text;
    try {
        return JSON.parse(text);
    }
    catch (e) {
        // Fallback if not valid JSON (better prompt engineering needed)
        return { intent: 'general_inquiry', confidence: 0 };
    }
};
exports.classifyIntent = classifyIntent;
const generateResponse = async (systemPrompt, userMessage, history) => {
    const messages = history.map(h => ({
        role: h.role, // 'user' | 'assistant'
        content: h.content
    }));
    messages.push({ role: 'user', content: userMessage });
    const response = await anthropic.messages.create({
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 500,
        system: systemPrompt,
        messages: messages
    });
    return response.content[0].text;
};
exports.generateResponse = generateResponse;
