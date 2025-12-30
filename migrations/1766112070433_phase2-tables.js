/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined;

exports.up = pgm => {
  pgm.sql(`
    -- FAQ Scan Jobs
    CREATE TABLE IF NOT EXISTS faq_scan_jobs (
      id BIGSERIAL PRIMARY KEY,
      shop_id VARCHAR(255) NOT NULL REFERENCES shops(shop_id),
      status VARCHAR(50) DEFAULT 'pending', -- pending, processing, completed, error
      website_url VARCHAR(500),
      error_message TEXT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    -- FAQ Drafts
    CREATE TABLE IF NOT EXISTS faq_drafts (
      id BIGSERIAL PRIMARY KEY,
      job_id BIGINT REFERENCES faq_scan_jobs(id),
      shop_id VARCHAR(255) NOT NULL REFERENCES shops(shop_id),
      question TEXT,
      answer TEXT,
      category VARCHAR(100),
      source_url VARCHAR(500),
      confidence_score INT,
      status VARCHAR(50) DEFAULT 'pending_review', -- pending_review, approved, rejected
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    -- Analytics Daily
    CREATE TABLE IF NOT EXISTS analytics_daily (
      id BIGSERIAL PRIMARY KEY,
      shop_id VARCHAR(255) NOT NULL REFERENCES shops(shop_id),
      date DATE NOT NULL,
      total_conversations INT DEFAULT 0,
      total_messages INT DEFAULT 0,
      bot_handled_count INT DEFAULT 0,
      escalation_count INT DEFAULT 0,
      deflection_rate DECIMAL(5, 2) DEFAULT 0,
      avg_response_time_ms INT DEFAULT 0,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(shop_id, date)
    );

    -- Widgets
    CREATE TABLE IF NOT EXISTS widgets (
      widget_key VARCHAR(50) PRIMARY KEY,
      shop_id VARCHAR(255) NOT NULL REFERENCES shops(shop_id),
      config JSONB DEFAULT '{}',
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    -- Escalations
    CREATE TABLE IF NOT EXISTS escalations (
      id BIGSERIAL PRIMARY KEY,
      conversation_id BIGINT REFERENCES conversations(id),
      shop_id VARCHAR(255) NOT NULL REFERENCES shops(shop_id),
      reason VARCHAR(100),
      status VARCHAR(50) DEFAULT 'pending', -- pending, resolved
      metadata JSONB,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      resolved_at TIMESTAMP WITH TIME ZONE
    );
  `);
};

exports.down = pgm => {
  pgm.sql(`
    DROP TABLE IF EXISTS escalations;
    DROP TABLE IF EXISTS widgets;
    DROP TABLE IF EXISTS analytics_daily;
    DROP TABLE IF EXISTS faq_drafts;
    DROP TABLE IF EXISTS faq_scan_jobs;
  `);
};
