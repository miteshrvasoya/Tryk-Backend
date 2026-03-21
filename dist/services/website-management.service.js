"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebsiteManagementService = void 0;
const db_1 = require("../db");
const kb_ingestion_service_1 = require("./kb-ingestion.service");
class WebsiteManagementService {
    static getWebsiteTypes() {
        return this.WEBSITE_TYPES;
    }
    static getWebsiteTypeById(id) {
        return this.WEBSITE_TYPES.find(type => type.id === id);
    }
    static getDashboardWidgets() {
        return this.DASHBOARD_WIDGETS;
    }
    static getDashboardWidgetById(id) {
        return this.DASHBOARD_WIDGETS.find(widget => widget.id === id);
    }
    static async registerWebsite(shopId, websiteData) {
        const { websiteUrl, websiteType, businessName, description } = websiteData;
        if (!this.isValidUrl(websiteUrl)) {
            throw new Error('Invalid website URL');
        }
        const websiteId = `website_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        await (0, db_1.query)(`
      INSERT INTO websites (id, shop_id, website_url, website_type, business_name, description, status, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `, [websiteId, shopId, websiteUrl, websiteType, businessName, description]);
        console.log(`[WebsiteManagement] Registered website ${websiteId} for shop ${shopId}`);
    }
    static async updateWebsite(websiteId, shopId, updates) {
        const setClause = Object.keys(updates).map((key, index) => `${key} = $${index + 2}`).join(', ');
        await (0, db_1.query)(`
      UPDATE websites 
      SET ${setClause}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `, [...Object.values(updates), websiteId]);
        console.log(`[WebsiteManagement] Updated website ${websiteId}`);
    }
    static async getShopWebsites(shopId) {
        const result = await (0, db_1.query)(`
      SELECT id, website_url, website_type, business_name, description, status, created_at, updated_at
      FROM websites 
      WHERE shop_id = $1 
      ORDER BY created_at DESC
    `, [shopId]);
        return result.rows;
    }
    static async deleteWebsite(websiteId, shopId) {
        await (0, db_1.query)(`
      DELETE FROM websites 
      WHERE id = $1 AND shop_id = $2
    `, [websiteId, shopId]);
        console.log(`[WebsiteManagement] Deleted website ${websiteId}`);
    }
    static async ingestWebsiteContent(request) {
        const { shopId, websiteUrl, websiteType, ingestionOptions } = request;
        console.log(`[WebsiteManagement] Starting ingestion for ${websiteType} website: ${websiteUrl}`);
        try {
            let chunks = [];
            switch (websiteType) {
                case 'shopify':
                    await kb_ingestion_service_1.KnowledgeIngestionService.ingestWebsite(shopId, websiteUrl, {
                        ...ingestionOptions,
                        prioritizePolicies: true,
                        customSelectors: {
                            content: '.product-description, .shopify-section, .policy-content',
                            navigation: '.main-navigation, .footer-links',
                            exclude: '.admin-panel, .checkout-form'
                        }
                    });
                    break;
                case 'generic':
                case 'blog':
                case 'saas':
                case 'other':
                default:
                    await kb_ingestion_service_1.KnowledgeIngestionService.ingestWebsite(shopId, websiteUrl, ingestionOptions);
                    chunks = [];
                    break;
            }
            await this.storeIngestionResults(shopId, websiteUrl, websiteType, chunks);
            console.log(`[WebsiteManagement] Successfully ingested ${chunks.length} chunks from ${websiteType} website`);
        }
        catch (error) {
            console.error(`[WebsiteManagement] Ingestion failed for ${websiteType}: ${error.message}`);
            throw error;
        }
    }
    static async storeIngestionResults(shopId, websiteUrl, websiteType, chunks) {
        const ingestionId = `ingestion_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        await (0, db_1.query)(`
      INSERT INTO ingestion_logs (id, shop_id, website_url, website_type, chunks_count, status, created_at)
      VALUES ($1, $2, $3, $4, $5, 'completed', CURRENT_TIMESTAMP)
    `, [ingestionId, shopId, websiteUrl, websiteType, chunks.length]);
        console.log(`[WebsiteManagement] Stored ingestion results: ${ingestionId}`);
    }
    static async getIngestionHistory(shopId, limit = 10) {
        const result = await (0, db_1.query)(`
      SELECT id, website_url, website_type, chunks_count, status, created_at
      FROM ingestion_logs 
      WHERE shop_id = $1 
      ORDER BY created_at DESC 
      LIMIT $2
    `, [shopId, limit]);
        return result.rows;
    }
    static async getWebsiteStats(shopId) {
        const result = await (0, db_1.query)(`
      SELECT 
        COUNT(*) as total_websites,
        COUNT(CASE WHEN status = 'active' THEN 1 END) as active_websites,
        COUNT(CASE WHEN website_type = 'shopify' THEN 1 END) as shopify_sites,
        COUNT(CASE WHEN website_type = 'generic' THEN 1 END) as generic_sites
      FROM websites 
      WHERE shop_id = $1
    `, [shopId]);
        return result.rows[0];
    }
    static isValidUrl(url) {
        try {
            const urlObj = new URL(url);
            return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
        }
        catch {
            return false;
        }
    }
}
exports.WebsiteManagementService = WebsiteManagementService;
WebsiteManagementService.WEBSITE_TYPES = [
    {
        id: 'shopify',
        name: 'Shopify Store',
        description: 'Connected Shopify store with direct API access',
        category: 'shopify',
        icon: 'shopify',
        features: ['product_sync', 'order_sync', 'real_time_chat', 'shopify_tools']
    },
    {
        id: 'generic',
        name: 'Generic Website',
        description: 'Standard website without specific platform integration',
        category: 'generic',
        icon: 'globe',
        features: ['website_scraping', 'knowledge_base', 'custom_chat']
    },
    {
        id: 'blog',
        name: 'Blog Platform',
        description: 'Blog or content website',
        category: 'blog',
        icon: 'blog',
        features: ['content_scraping', 'knowledge_base', 'article_chat']
    },
    {
        id: 'saas',
        name: 'SaaS Platform',
        description: 'Software as a Service platform',
        category: 'saas',
        icon: 'cloud',
        features: ['api_integration', 'knowledge_base', 'custom_workflows']
    },
    {
        id: 'other',
        name: 'Other Website',
        description: 'Custom website type',
        category: 'other',
        icon: 'settings',
        features: ['custom_scraping', 'knowledge_base', 'flexible_config']
    }
];
WebsiteManagementService.DASHBOARD_WIDGETS = [
    {
        id: 'analytics',
        name: 'Analytics Dashboard',
        type: 'analytics',
        enabled: true,
        config: { refreshInterval: 30000 }
    },
    {
        id: 'knowledge_base',
        name: 'Knowledge Base',
        type: 'knowledge_base',
        enabled: true,
        config: { searchEnabled: true, exportEnabled: true }
    },
    {
        id: 'chat_logs',
        name: 'Chat Logs',
        type: 'chat_logs',
        enabled: true,
        config: { filterEnabled: true, exportEnabled: true }
    },
    {
        id: 'ingestion',
        name: 'Website Ingestion',
        type: 'ingestion',
        enabled: true,
        config: { autoIngest: false, maxDepth: 3, maxPages: 50 }
    },
    {
        id: 'settings',
        name: 'Settings',
        type: 'settings',
        enabled: true,
        config: { theme: 'auto', notifications: true }
    }
];
