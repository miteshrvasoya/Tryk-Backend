"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleIncomingMessage = void 0;
const chat_engine_service_1 = require("./chat-engine.service");
const handleIncomingMessage = async (ctx) => {
    // Delegate to the robust ChatEngineService which handles Intent, Search, AI, and History
    const result = await chat_engine_service_1.ChatEngineService.processMessage(ctx.shopId, ctx.messageReceived, { customerId: ctx.customerId });
    return result.response;
};
exports.handleIncomingMessage = handleIncomingMessage;
