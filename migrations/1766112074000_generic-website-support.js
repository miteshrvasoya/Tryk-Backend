exports.shorthands = undefined;

exports.up = pgm => {
  pgm.sql(`
    -- Add metadata column to conversations table for storing conversation state
    ALTER TABLE conversations 
    ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

    -- Create index for metadata queries
    CREATE INDEX IF NOT EXISTS idx_conversations_metadata 
    ON conversations USING gin(metadata);
  `);
};

exports.down = pgm => {
  pgm.sql(`
    DROP INDEX IF EXISTS idx_conversations_metadata;
    ALTER TABLE conversations 
    DROP COLUMN IF EXISTS metadata;
  `);
};
