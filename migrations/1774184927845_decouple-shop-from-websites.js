/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const up = (pgm) => {
  // Add user_id to websites
  pgm.sql(`ALTER TABLE websites ADD COLUMN IF NOT EXISTS user_id BIGINT REFERENCES users(id) ON DELETE CASCADE;`);
  
  // Make shop_id nullable in websites
  pgm.sql(`ALTER TABLE websites ALTER COLUMN shop_id DROP NOT NULL;`);

  // Add user_id to kb_documents
  pgm.sql(`ALTER TABLE kb_documents ADD COLUMN IF NOT EXISTS user_id BIGINT REFERENCES users(id) ON DELETE CASCADE;`);

  // Make shop_id nullable in kb_documents
  pgm.sql(`ALTER TABLE kb_documents ALTER COLUMN shop_id DROP NOT NULL;`);
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {
  pgm.sql(`ALTER TABLE kb_documents ALTER COLUMN shop_id SET NOT NULL;`);
  pgm.sql(`ALTER TABLE kb_documents DROP COLUMN IF EXISTS user_id;`);
  pgm.sql(`ALTER TABLE websites ALTER COLUMN shop_id SET NOT NULL;`);
  pgm.sql(`ALTER TABLE websites DROP COLUMN IF EXISTS user_id;`);
};
