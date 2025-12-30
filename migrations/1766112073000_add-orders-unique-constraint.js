/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = pgm => {
  pgm.sql(`
    -- Add unique constraint for upserts on orders
    ALTER TABLE orders 
    ADD CONSTRAINT orders_shop_shopify_id_key UNIQUE (shop_id, shopify_order_id);
  `);
};

exports.down = pgm => {
  pgm.sql(`
    ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_shop_shopify_id_key;
    -- Note: We still have the single column unique constraint on shopify_order_id from creation, 
    -- but this composite one allows safe upserts scoped by shop.
  `);
};
