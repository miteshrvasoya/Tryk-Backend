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
exports.handleIncomingMessage = void 0;
const aiService = __importStar(require("./ai.service"));
const shopifyService = __importStar(require("./shopify.service"));
const vectorService = __importStar(require("./vector.service"));
const handleIncomingMessage = async (ctx) => {
    // 1. Get Conversation History (Mock for now)
    const history = [];
    // 2. Classify Intent
    const intentResult = await aiService.classifyIntent(ctx.messageReceived, history);
    const intent = intentResult.intent;
    let info = {};
    // 3. Handle Intent
    switch (intent) {
        case 'order_status':
            // Assume we can extract order ID from context or message (simplification)
            // In real app, AI extracts entities.
            // For MVP, fetch last order
            const lastOrder = await shopifyService.getOrder(ctx.shopId, ctx.accessToken, 123456); // Mock Order ID
            info = { lastOrder };
            break;
        case 'product_question':
            // Generate embedding for query
            // Mock embedding
            // const embedding = await aiService.generateEmbedding(ctx.messageReceived);
            const embedding = new Array(1536).fill(0);
            const products = await vectorService.findProductMatch(embedding, ctx.shopId);
            info = { relevantProducts: products };
            break;
        case 'return_request':
            // In real flow, we'd check eligibility etc.
            info = { returnPolicy: '30 days return window' };
            break;
        default:
            break;
    }
    // 4. Generate Response
    const systemPrompt = `You are a helpful assistant for ${ctx.shopId}.
    Intent detected: ${intent}.
    Context Info: ${JSON.stringify(info)}.
    `;
    const response = await aiService.generateResponse(systemPrompt, ctx.messageReceived, history);
    return response;
};
exports.handleIncomingMessage = handleIncomingMessage;
