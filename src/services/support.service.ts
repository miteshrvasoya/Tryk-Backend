import { ChatEngineService } from './chat-engine.service';

interface MessageContext {
    shopId: string;
    customerId: string; // or number depending on DB
    messageReceived: string;
    accessToken: string; // Should be retrieved from DB based on shopId
}

export const handleIncomingMessage = async (ctx: MessageContext) => {
    // Delegate to the robust ChatEngineService which handles Intent, Search, AI, and History
    const result = await ChatEngineService.processMessage(
        ctx.shopId, 
        ctx.messageReceived, 
        { customerId: ctx.customerId }
    );
    
    return result.response;
};
