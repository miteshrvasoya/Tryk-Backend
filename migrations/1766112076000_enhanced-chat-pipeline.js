/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = pgm => {
  pgm.sql(`
    -- Query logs for analytics and performance tracking
    CREATE TABLE IF NOT EXISTS query_logs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      shop_id VARCHAR(255) NOT NULL,
      conversation_id BIGINT,
      user_message TEXT NOT NULL,
      intent VARCHAR(50),
      confidence_score INT,
      tool_used VARCHAR(50),
      response_time_ms INT,
      resolved BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    -- Tool execution logs
    CREATE TABLE IF NOT EXISTS tool_executions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      shop_id VARCHAR(255) NOT NULL,
      query_id UUID REFERENCES query_logs(id),
      tool_name VARCHAR(50) NOT NULL,
      input_data JSONB,
      output_data JSONB,
      execution_time_ms INT,
      success BOOLEAN DEFAULT FALSE,
      error_message TEXT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    -- Safety validation logs
    CREATE TABLE IF NOT EXISTS safety_validation_logs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      shop_id VARCHAR(255) NOT NULL,
      conversation_id BIGINT,
      original_query TEXT,
      response TEXT,
      is_valid BOOLEAN DEFAULT FALSE,
      confidence INT,
      issues JSONB,
      warnings JSONB,
      should_escalate BOOLEAN DEFAULT FALSE,
      validation_time_ms INT DEFAULT 0,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    -- Enhanced chat analytics
    CREATE TABLE IF NOT EXISTS enhanced_chat_analytics (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      shop_id VARCHAR(255) NOT NULL,
      intent VARCHAR(50),
      confidence INT,
      tools_used JSONB,
      processing_time_ms INT,
      tool_execution_times JSONB,
      safety_validation JSONB,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    -- Indexes for performance
    CREATE INDEX IF NOT EXISTS idx_query_logs_shop_created ON query_logs(shop_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_query_logs_intent ON query_logs(intent);
    CREATE INDEX IF NOT EXISTS idx_tool_executions_shop_created ON tool_executions(shop_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_safety_logs_shop_created ON safety_validation_logs(shop_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_enhanced_chat_shop_created ON enhanced_chat_analytics(shop_id, created_at);
  `);
};

exports.down = pgm => {
  pgm.sql(`
    DROP TABLE IF EXISTS enhanced_chat_analytics;
    DROP TABLE IF EXISTS safety_validation_logs;
    DROP TABLE IF EXISTS tool_executions;
    DROP TABLE IF EXISTS query_logs;
  `);
};
