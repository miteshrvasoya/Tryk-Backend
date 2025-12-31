"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TemplateService = void 0;
const db_1 = require("../db");
class TemplateService {
    static async createTemplate(shopId, data) {
        const { name, trigger_intent, content, is_default } = data;
        // If is_default, unset others for this intent
        if (is_default && trigger_intent) {
            await (0, db_1.query)(`
                UPDATE response_templates 
                SET is_default = false 
                WHERE shop_id = $1 AND trigger_intent = $2
            `, [shopId, trigger_intent]);
        }
        const res = await (0, db_1.query)(`
            INSERT INTO response_templates (shop_id, name, trigger_intent, content, is_default)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING *
        `, [shopId, name, trigger_intent, content, is_default || false]);
        return res.rows[0];
    }
    static async updateTemplate(id, shopId, data) {
        const { name, trigger_intent, content, is_active, is_default } = data;
        // Handle default toggle
        if (is_default && trigger_intent) {
            await (0, db_1.query)(`
                UPDATE response_templates 
                SET is_default = false 
                WHERE shop_id = $1 AND trigger_intent = $2 AND id != $3
            `, [shopId, trigger_intent, id]);
        }
        const res = await (0, db_1.query)(`
            UPDATE response_templates
            SET name = COALESCE($1, name),
                trigger_intent = COALESCE($2, trigger_intent),
                content = COALESCE($3, content),
                is_active = COALESCE($4, is_active),
                is_default = COALESCE($5, is_default),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $6 AND shop_id = $7
            RETURNING *
        `, [name, trigger_intent, content, is_active, is_default, id, shopId]);
        return res.rows[0];
    }
    static async deleteTemplate(id, shopId) {
        await (0, db_1.query)('DELETE FROM response_templates WHERE id = $1 AND shop_id = $2', [id, shopId]);
        return { success: true };
    }
    static async getTemplatesByShop(shopId) {
        const res = await (0, db_1.query)('SELECT * FROM response_templates WHERE shop_id = $1 ORDER BY created_at DESC', [shopId]);
        return res.rows;
    }
    static async findBestTemplate(shopId, intent) {
        // 1. Try exact intent match (Active & Default or just any active?)
        // Let's prioritize default if multiple exist, or just the most recently updated active one.
        const res = await (0, db_1.query)(`
            SELECT content FROM response_templates
            WHERE shop_id = $1 
            AND is_active = true 
            AND trigger_intent = $2
            ORDER BY is_default DESC, updated_at DESC
            LIMIT 1
        `, [shopId, intent]);
        if (res.rows.length > 0)
            return res.rows[0].content;
        return null;
    }
}
exports.TemplateService = TemplateService;
