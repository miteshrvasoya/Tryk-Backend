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
exports.processReturnRequest = void 0;
const db_1 = require("../db");
const shopifyService = __importStar(require("./shopify.service"));
const processReturnRequest = async (shopId, orderId, customerId, reason, accessToken) => {
    // 1. Verify order
    const order = await shopifyService.getOrder(shopId, accessToken, orderId);
    if (!order) {
        throw new Error('Order not found');
    }
    // 2. Check eligibility (mock logic)
    const orderDate = new Date(order.created_at);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - orderDate.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    if (diffDays > 30) {
        return { approved: false, reason: 'Return period expired' };
    }
    // 3. Auto approve (Simplistic for MVP)
    // Create record
    const result = await (0, db_1.query)(`
        INSERT INTO returns (shop_id, order_id, customer_id, reason, status)
        VALUES ($1, $2, $3, $4, 'approved')
        RETURNING *
    `, [shopId, orderId, customerId, reason]);
    // 4. Generate Label (Mock)
    const labelUrl = 'https://example.com/label.pdf';
    await (0, db_1.query)(`UPDATE returns SET return_label_url = $1 WHERE id = $2`, [labelUrl, result.rows[0].id]);
    return {
        approved: true,
        labelUrl
    };
};
exports.processReturnRequest = processReturnRequest;
