exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS google_id VARCHAR(255) UNIQUE,
    ADD COLUMN IF NOT EXISTS shopify_id VARCHAR(255) UNIQUE,
    ADD COLUMN IF NOT EXISTS oauth_provider VARCHAR(50),
    ADD COLUMN IF NOT EXISTS oauth_profile JSONB;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE users
    DROP COLUMN IF EXISTS google_id,
    DROP COLUMN IF EXISTS shopify_id,
    DROP COLUMN IF EXISTS oauth_provider,
    DROP COLUMN IF EXISTS oauth_profile;
  `);
};
