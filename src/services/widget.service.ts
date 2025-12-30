import { query } from '../db';

export class WidgetService {
  /**
   * Generates a new widget for a shop.
   */
  static async createWidget(shopId: string, initialConfig: any = {}) {
    const widgetKey = 'wgt_' + Math.random().toString(36).substring(2, 15);
    
    const defaultConfig = {
      position: 'bottom-right',
      color: '#005B7F',
      title: 'Ask Tryk',
      initialMessage: 'How can we help?',
      ...initialConfig
    };

    await query(
      `INSERT INTO widgets (widget_key, shop_id, config, is_active) VALUES ($1, $2, $3, true)`,
      [widgetKey, shopId, JSON.stringify(defaultConfig)]
    );

    return { widgetKey, config: defaultConfig };
  }

  /**
   * Gets a widget by its key.
   */
  static async getWidget(widgetKey: string) {
    const result = await query('SELECT * FROM widgets WHERE widget_key = $1', [widgetKey]);
    if (result.rows.length === 0) return null;
    return result.rows[0];
  }

  /**
   * Gets a widget by shopId.
   */
  static async getWidgetByShopId(shopId: string) {
    const result = await query('SELECT * FROM widgets WHERE shop_id = $1', [shopId]);
    if (result.rows.length === 0) return null;
    return result.rows[0];
  }

  /**
   * Updates widget configuration.
   */
  static async updateConfig(widgetKey: string, config: any) {
    await query(
      'UPDATE widgets SET config = config || $1, updated_at = NOW() WHERE widget_key = $2',
      [JSON.stringify(config), widgetKey]
    );
    return this.getWidget(widgetKey);
  }
}
