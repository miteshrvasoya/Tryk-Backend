/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = pgm => {
  // Create websites table
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS websites (
      id VARCHAR(255) PRIMARY KEY,
      shop_id VARCHAR(255) NOT NULL,
      website_url VARCHAR(255) NOT NULL,
      website_type VARCHAR(50) NOT NULL DEFAULT 'generic',
      business_name VARCHAR(255),
      description TEXT,
      status VARCHAR(20) DEFAULT 'active',
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Create ingestion_logs table
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS ingestion_logs (
      id VARCHAR(255) PRIMARY KEY,
      shop_id VARCHAR(255) NOT NULL,
      website_url VARCHAR(255) NOT NULL,
      website_type VARCHAR(50) NOT NULL,
      chunks_count INTEGER NOT NULL DEFAULT 0,
      status VARCHAR(20) DEFAULT 'pending',
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Add indexes for better performance
  pgm.sql(`
    CREATE INDEX IF NOT EXISTS idx_websites_shop_id ON websites(shop_id);
    CREATE INDEX IF NOT EXISTS idx_websites_status ON websites(status);
    CREATE INDEX IF NOT EXISTS idx_ingestion_logs_shop_id ON ingestion_logs(shop_id);
    CREATE INDEX IF NOT EXISTS idx_ingestion_logs_status ON ingestion_logs(status);
  `);
};

exports.down = pgm => {
  // Drop tables in reverse order
  pgm.sql(`DROP TABLE IF EXISTS ingestion_logs;`);
  pgm.sql(`DROP TABLE IF EXISTS websites;`);
};
