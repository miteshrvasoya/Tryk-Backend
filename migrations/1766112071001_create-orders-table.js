/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = pgm => {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS orders (
      id BIGSERIAL PRIMARY KEY,
      shop_id VARCHAR(255) NOT NULL REFERENCES shops(shop_id),
      shopify_order_id BIGINT UNIQUE NOT NULL,
      order_number INT NOT NULL,
      email VARCHAR(255),
      phone VARCHAR(50),
      total_price DECIMAL(10, 2),
      currency VARCHAR(10),
      financial_status VARCHAR(50),
      fulfillment_status VARCHAR(50),
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE INDEX idx_orders_shop_number ON orders(shop_id, order_number);
  `);
};

exports.down = pgm => {
  pgm.sql(`
    DROP TABLE IF EXISTS orders;
  `);
};
