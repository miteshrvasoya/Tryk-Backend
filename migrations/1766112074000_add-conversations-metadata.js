exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE conversations
    ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE conversations
    DROP COLUMN IF EXISTS metadata;
  `);
};
