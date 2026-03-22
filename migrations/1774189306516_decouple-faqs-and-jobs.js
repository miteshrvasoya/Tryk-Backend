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
  // Add user_id to faq_scan_jobs
  pgm.sql(`ALTER TABLE faq_scan_jobs ADD COLUMN IF NOT EXISTS user_id BIGINT REFERENCES users(id) ON DELETE CASCADE;`);
  pgm.sql(`ALTER TABLE faq_scan_jobs ALTER COLUMN shop_id DROP NOT NULL;`);

  // Add user_id to faq_drafts
  pgm.sql(`ALTER TABLE faq_drafts ADD COLUMN IF NOT EXISTS user_id BIGINT REFERENCES users(id) ON DELETE CASCADE;`);
  pgm.sql(`ALTER TABLE faq_drafts ALTER COLUMN shop_id DROP NOT NULL;`);

  // Add user_id to faqs
  pgm.sql(`ALTER TABLE faqs ADD COLUMN IF NOT EXISTS user_id BIGINT REFERENCES users(id) ON DELETE CASCADE;`);
  pgm.sql(`ALTER TABLE faqs ALTER COLUMN shop_id DROP NOT NULL;`);
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {
  pgm.sql(`ALTER TABLE faqs ALTER COLUMN shop_id SET NOT NULL;`);
  pgm.sql(`ALTER TABLE faqs DROP COLUMN IF EXISTS user_id;`);

  pgm.sql(`ALTER TABLE faq_drafts ALTER COLUMN shop_id SET NOT NULL;`);
  pgm.sql(`ALTER TABLE faq_drafts DROP COLUMN IF EXISTS user_id;`);

  pgm.sql(`ALTER TABLE faq_scan_jobs ALTER COLUMN shop_id SET NOT NULL;`);
  pgm.sql(`ALTER TABLE faq_scan_jobs DROP COLUMN IF EXISTS user_id;`);
};
