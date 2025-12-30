/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = pgm => {
  pgm.sql(`
    -- Add unique constraint for upserts
    ALTER TABLE products 
    ADD CONSTRAINT products_shop_shopify_id_key UNIQUE (shop_id, shopify_product_id);
    
    -- Also ensure Full Text Search index exists for performance if not auto-created
    -- CREATE INDEX IF NOT EXISTS products_title_description_idx ON products USING GIN (to_tsvector('english', title || ' ' || COALESCE(description, '')));
  `);
};

exports.down = pgm => {
  pgm.sql(`
    ALTER TABLE products DROP CONSTRAINT IF EXISTS products_shop_shopify_id_key;
  `);
};
