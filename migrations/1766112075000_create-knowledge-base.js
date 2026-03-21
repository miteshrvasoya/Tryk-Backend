/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = pgm => {
  // Try to enable pgvector extension, but don't fail if it's not available
  pgm.sql(`
    DO $$
    BEGIN
        CREATE EXTENSION IF NOT EXISTS vector;
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'pgvector extension not available, using TEXT for embeddings';
    END $$;
  `);

  // Check if vector extension is available
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS kb_documents (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      shop_id VARCHAR(255) NOT NULL REFERENCES shops(shop_id),
      source_type TEXT NOT NULL, -- 'faq', 'shipping_policy', 'return_policy', 'contact', 'help', 'product_docs'
      source_url TEXT,
      title TEXT,
      content TEXT NOT NULL,
      embedding TEXT, -- Store as TEXT if vector extension not available
      token_count INT,
      metadata JSONB DEFAULT '{}',
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    -- Indexes for performance
    CREATE INDEX idx_kb_shop ON kb_documents(shop_id);
    CREATE INDEX idx_kb_shop_source ON kb_documents(shop_id, source_type);
    CREATE INDEX idx_kb_content_fts ON kb_documents USING gin(to_tsvector('english', content || ' ' || COALESCE(title, '')));
    CREATE INDEX idx_kb_created_at ON kb_documents(created_at);

    -- Try to create vector index if extension is available
    DO $$
    BEGIN
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_kb_embedding ON kb_documents USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100)';
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Vector index not created (pgvector not available)';
    END $$;
  `);

  // Query Logs for Analytics
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS kb_query_logs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      shop_id VARCHAR(255) NOT NULL REFERENCES shops(shop_id),
      query TEXT NOT NULL,
      normalized_query TEXT,
      intent_category TEXT,
      response_text TEXT,
      confidence_score DECIMAL(3,2),
      response_time_ms INT,
      sources_used JSONB,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    -- Indexes for query logs
    CREATE INDEX idx_kb_query_logs_shop ON kb_query_logs(shop_id);
    CREATE INDEX idx_kb_query_logs_created_at ON kb_query_logs(created_at);
    CREATE INDEX idx_kb_query_logs_intent ON kb_query_logs(intent_category);
  `);

  // Trigger to update updated_at
  pgm.sql(`
    CREATE OR REPLACE FUNCTION update_kb_documents_updated_at()
    RETURNS TRIGGER AS $$
    BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
    END;
    $$ language 'plpgsql';

    CREATE TRIGGER update_kb_documents_updated_at
        BEFORE UPDATE ON kb_documents
        FOR EACH ROW
        EXECUTE FUNCTION update_kb_documents_updated_at();
  `);
};

exports.down = pgm => {
  pgm.sql(`
    DROP TRIGGER IF EXISTS update_kb_documents_updated_at ON kb_documents;
    DROP FUNCTION IF EXISTS update_kb_documents_updated_at();
    DROP TABLE IF EXISTS kb_query_logs;
    DROP TABLE IF EXISTS kb_documents;
    DROP EXTENSION IF EXISTS vector;
  `);
};
