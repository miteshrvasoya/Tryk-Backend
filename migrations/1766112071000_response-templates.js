/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined;

exports.up = pgm => {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS response_templates (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      shop_id VARCHAR(255) NOT NULL REFERENCES shops(shop_id),
      name VARCHAR(255) NOT NULL,
      trigger_intent VARCHAR(100),
      content TEXT NOT NULL,
      is_active BOOLEAN DEFAULT TRUE,
      is_default BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `);
  
  // Create index separately using helper to avoid syntax ambiguity
  // pgm.createIndex('response_templates', ['shop_id', 'trigger_intent'], { name: 'idx_templates_shop_intent' });
};

exports.down = pgm => {
  pgm.dropTable('response_templates');
};
