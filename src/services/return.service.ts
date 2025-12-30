import { query } from '../db';
import * as shopifyService from './shopify.service';

export const processReturnRequest = async (
    shopId: string, 
    orderId: number, 
    customerId: number, 
    reason: string, 
    accessToken: string
) => {
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
    const result = await query(`
        INSERT INTO returns (shop_id, order_id, customer_id, reason, status)
        VALUES ($1, $2, $3, $4, 'approved')
        RETURNING *
    `, [shopId, orderId, customerId, reason]);
    
    // 4. Generate Label (Mock)
    const labelUrl = 'https://example.com/label.pdf';
    
    await query(`UPDATE returns SET return_label_url = $1 WHERE id = $2`, [labelUrl, result.rows[0].id]);
    
    return {
        approved: true,
        labelUrl
    };
};
