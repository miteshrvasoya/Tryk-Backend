import * as aiService from './ai.service';
import * as shopifyService from './shopify.service';
import * as vectorService from './vector.service';
import * as returnService from './return.service';

interface MessageContext {
    shopId: string;
    customerId: string; // or number depending on DB
    messageReceived: string;
    accessToken: string; // Should be retrieved from DB based on shopId
}

export const handleIncomingMessage = async (ctx: MessageContext) => {
    // 1. Get Conversation History (Mock for now)
    const history: any[] = []; 
    
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
