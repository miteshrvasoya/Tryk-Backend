import { query } from '../db';

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
}

export interface IngestionRequest {
  shopId: string;
  websiteUrl: string;
  websiteType?: string;
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
    }
  ];

  static getWebsiteTypes(): WebsiteType[] {
    return this.WEBSITE_TYPES;
  }

  static async registerWebsite(userId: number, websiteData: {
    websiteUrl: string;
    websiteType?: string;
  }): Promise<{ id: string }> {
    const { websiteUrl } = websiteData;
    
    if (!this.isValidUrl(websiteUrl)) {
      throw new Error('Invalid website URL');
    }

    // Upsert logic or check if exists to avoid duplicates
    const existing = await query(`SELECT id FROM websites WHERE user_id = $1 AND base_url = $2`, [userId, websiteUrl]);
    
    if (existing.rows.length > 0) {
      await query(`UPDATE websites SET status = 'pending' WHERE id = $1`, [existing.rows[0].id]);
      return { id: existing.rows[0].id };
    }

    const result = await query(`
      INSERT INTO websites (user_id, base_url, status)
      VALUES ($1, $2, 'pending')
      RETURNING id
    `, [userId, websiteUrl]);

    console.log(`[WebsiteManagement] Registered website ${result.rows[0].id} for user ${userId}`);
    
    return { id: result.rows[0].id };
  }

  static async getWebsiteStatus(userId: number): Promise<any> {
    const result = await query(`
      SELECT id, base_url as url, status, pages_count, last_crawled_at
      FROM websites 
      WHERE user_id = $1 
      ORDER BY created_at DESC
      LIMIT 1
    `, [userId]);

    if (result.rows.length === 0) {
      return {
        connected: false,
        website: null
      };
    }

    const site = result.rows[0];
    return {
      connected: site.status === 'completed',
      website: site
    };
  }

  static async getUserWebsites(userId: number): Promise<any[]> {
    const result = await query(`
      SELECT id, base_url as website_url, status, created_at, updated_at, pages_count, last_crawled_at
      FROM websites 
      WHERE user_id = $1 
      ORDER BY created_at DESC
    `, [userId]);

    return result.rows;
  }

  static async deleteWebsite(websiteId: string, userId: number): Promise<void> {
    await query(`
      DELETE FROM websites 
      WHERE id = $1 AND user_id = $2
    `, [websiteId, userId]);

    console.log(`[WebsiteManagement] Deleted website ${websiteId}`);
  }

  static async updateWebsiteStatus(websiteId: string, updates: {
    status?: string;
    pages_count?: number;
    last_crawled_at?: Date;
  }): Promise<void> {
    const sets = [];
    const values = [];
    let idx = 1;

    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) {
        sets.push(`${key} = $${idx}`);
        values.push(value);
        idx++;
      }
    }

    if (sets.length === 0) return;

    values.push(websiteId);
    await query(`
      UPDATE websites 
      SET ${sets.join(', ')}
      WHERE id = $${idx}
    `, values);
  }

  static async getWebsiteStats(userId: number): Promise<any> {
    const result = await query(`
      SELECT 
        COUNT(*) as total_websites,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as active_websites
      FROM websites 
      WHERE user_id = $1
    `, [userId]);

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
