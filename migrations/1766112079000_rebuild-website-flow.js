/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = pgm => {
  // Drop the old websites table if it exists to replace with new schema
  pgm.sql(`DROP TABLE IF EXISTS websites CASCADE;`);
  
  // Create new websites table
  pgm.sql(`
    CREATE TABLE websites (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      shop_id VARCHAR(255) NOT NULL REFERENCES shops(shop_id) ON DELETE CASCADE,
      base_url TEXT NOT NULL,
      status TEXT DEFAULT 'pending', -- pending, processing, completed, failed
      last_crawled_at TIMESTAMP WITH TIME ZONE,
      pages_count INT DEFAULT 0,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Add indexes for efficient queries
  pgm.sql(`CREATE INDEX IF NOT EXISTS idx_websites_shop_id ON websites(shop_id);`);
  pgm.sql(`CREATE INDEX IF NOT EXISTS idx_websites_status ON websites(status);`);

  // Alter kb_documents to link the chunks to a website
  pgm.sql(`
    ALTER TABLE kb_documents
    ADD COLUMN IF NOT EXISTS website_id UUID REFERENCES websites(id) ON DELETE CASCADE;
  `);

  // Add index on website_id for kb_documents
  pgm.sql(`CREATE INDEX IF NOT EXISTS idx_kb_documents_website_id ON kb_documents(website_id);`);
  
  // Trigger to update updated_at on websites
  pgm.sql(`
    CREATE OR REPLACE FUNCTION update_websites_updated_at()
    RETURNS TRIGGER AS $$
    BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
    END;
    $$ language 'plpgsql';

    DROP TRIGGER IF EXISTS update_websites_updated_at_trigger ON websites;
    
    CREATE TRIGGER update_websites_updated_at_trigger
        BEFORE UPDATE ON websites
        FOR EACH ROW
        EXECUTE FUNCTION update_websites_updated_at();
  `);
};

exports.down = pgm => {
  pgm.sql(`
    DROP TRIGGER IF EXISTS update_websites_updated_at_trigger ON websites;
    DROP FUNCTION IF EXISTS update_websites_updated_at();
  `);

  pgm.sql(`
    ALTER TABLE kb_documents DROP COLUMN IF EXISTS website_id;
  `);

  pgm.sql(`DROP TABLE IF EXISTS websites CASCADE;`);
};
