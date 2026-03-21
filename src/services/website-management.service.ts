import { query } from '../db';
import { KnowledgeIngestionService, KnowledgeChunk } from './kb-ingestion.service';

export interface WebsiteType {
  id: string;
  name: string;
  description: string;
  category: 'shopify' | 'generic' | 'blog' | 'saas' | 'other';
  icon: string;
  features: string[];
}

export interface DashboardWidget {
  id: string;
  name: string;
  type: 'analytics' | 'knowledge_base' | 'chat_logs' | 'settings' | 'ingestion';
  enabled: boolean;
  config: any;
}

export interface IngestionOptions {
  maxDepth?: number;
  maxPages?: number;
  prioritizePolicies?: boolean;
  customSelectors?: {
    content?: string;
    navigation?: string;
    exclude?: string[];
  };
}

export interface IngestionRequest {
  shopId: string;
  websiteUrl: string;
  websiteType: string;
  ingestionOptions?: IngestionOptions;
}

export class WebsiteManagementService {

  private static readonly WEBSITE_TYPES: WebsiteType[] = [
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

  private static readonly DASHBOARD_WIDGETS: DashboardWidget[] = [
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

  static getWebsiteTypes(): WebsiteType[] {
    return this.WEBSITE_TYPES;
  }

  static getWebsiteTypeById(id: string): WebsiteType | undefined {
    return this.WEBSITE_TYPES.find(type => type.id === id);
  }

  static getDashboardWidgets(): DashboardWidget[] {
    return this.DASHBOARD_WIDGETS;
  }

  static getDashboardWidgetById(id: string): DashboardWidget | undefined {
    return this.DASHBOARD_WIDGETS.find(widget => widget.id === id);
  }

  static async registerWebsite(shopId: string, websiteData: {
    websiteUrl: string;
    websiteType: string;
    businessName?: string;
    description?: string;
  }): Promise<void> {
    const { websiteUrl, websiteType, businessName, description } = websiteData;
    
    if (!this.isValidUrl(websiteUrl)) {
      throw new Error('Invalid website URL');
    }

    const websiteId = `website_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    await query(`
      INSERT INTO websites (id, shop_id, website_url, website_type, business_name, description, status, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `, [websiteId, shopId, websiteUrl, websiteType, businessName, description]);

    console.log(`[WebsiteManagement] Registered website ${websiteId} for shop ${shopId}`);
  }

  static async updateWebsite(websiteId: string, shopId: string, updates: {
    websiteUrl?: string;
    websiteType?: string;
    businessName?: string;
    description?: string;
    status?: string;
  }): Promise<void> {
    const setClause = Object.keys(updates).map((key, index) => 
      `${key} = $${index + 2}`
    ).join(', ');

    await query(`
      UPDATE websites 
      SET ${setClause}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `, [...Object.values(updates), websiteId]);

    console.log(`[WebsiteManagement] Updated website ${websiteId}`);
  }

  static async getShopWebsites(shopId: string): Promise<any[]> {
    const result = await query(`
      SELECT id, website_url, website_type, business_name, description, status, created_at, updated_at
      FROM websites 
      WHERE shop_id = $1 
      ORDER BY created_at DESC
    `, [shopId]);

    return result.rows;
  }

  static async deleteWebsite(websiteId: string, shopId: string): Promise<void> {
    await query(`
      DELETE FROM websites 
      WHERE id = $1 AND shop_id = $2
    `, [websiteId, shopId]);

    console.log(`[WebsiteManagement] Deleted website ${websiteId}`);
  }

  static async ingestWebsiteContent(request: IngestionRequest): Promise<{ count: number, jobId: number | null }> {
    const { shopId, websiteUrl, websiteType, ingestionOptions } = request;
    
    console.log(`[WebsiteManagement] Starting ingestion for ${websiteType} website: ${websiteUrl}`);

    try {
      let chunks: KnowledgeChunk[] = [];
      let finalCount = 0;
      let finalJobId: number | null = null;

      switch (websiteType) {
        case 'shopify':
          const shopifyRes = await KnowledgeIngestionService.ingestWebsite(shopId, websiteUrl, {
            ...ingestionOptions,
            prioritizePolicies: true,
            customSelectors: {
              content: '.product-description, .shopify-section, .policy-content',
              navigation: '.main-navigation, .footer-links',
              exclude: '.admin-panel, .checkout-form'
            }
          });
          finalCount = shopifyRes.count;
          finalJobId = shopifyRes.jobId;
          chunks = Array(finalCount).fill({} as KnowledgeChunk);
          break;
          
        case 'generic':
        case 'blog':
        case 'saas':
        case 'other':
        default:
          // For generic websites, get the chunks count that were stored
          const res = await KnowledgeIngestionService.ingestWebsite(shopId, websiteUrl, ingestionOptions as any);
          finalCount = res.count;
          finalJobId = res.jobId;
          
          console.log(`[WebsiteManagement] Retrieved ${finalCount} stored chunks for ${websiteUrl}`);
          
          // Set chunks count based on what was actually stored
          chunks = Array(finalCount).fill({} as KnowledgeChunk);
          break;
      }

      await this.storeIngestionResults(shopId, websiteUrl, websiteType, chunks);
      
      console.log(`[WebsiteManagement] Successfully ingested ${chunks.length} chunks from ${websiteType} website`);
      
      return { count: finalCount, jobId: finalJobId };
      
    } catch (error: any) {
      console.error(`[WebsiteManagement] Ingestion failed for ${websiteType}: ${error.message}`);
      throw error;
    }
  }

  private static async storeIngestionResults(
    shopId: string, 
    websiteUrl: string, 
    websiteType: string, 
    chunks: KnowledgeChunk[]
  ): Promise<void> {
    const ingestionId = `ingestion_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    await query(`
      INSERT INTO ingestion_logs (id, shop_id, website_url, website_type, chunks_count, status, created_at)
      VALUES ($1, $2, $3, $4, $5, 'completed', CURRENT_TIMESTAMP)
    `, [ingestionId, shopId, websiteUrl, websiteType, chunks.length]);

    console.log(`[WebsiteManagement] Stored ingestion results: ${ingestionId}`);
  }

  static async getIngestionHistory(shopId: string, limit: number = 10): Promise<any[]> {
    const result = await query(`
      SELECT id, website_url, website_type, chunks_count, status, created_at
      FROM ingestion_logs 
      WHERE shop_id = $1 
      ORDER BY created_at DESC 
      LIMIT $2
    `, [shopId, limit]);

    return result.rows;
  }

  static async getWebsiteStats(shopId: string): Promise<any> {
    const result = await query(`
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

  private static isValidUrl(url: string): boolean {
    try {
      const urlObj = new URL(url);
      return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
    } catch {
      return false;
    }
  }
}
