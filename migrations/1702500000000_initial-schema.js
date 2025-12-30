/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = pgm => {
  pgm.sql(`
    -- Enable pgvector extension (Disabled until available)
    -- CREATE EXTENSION IF NOT EXISTS vector;

    -- Users Table
    CREATE TABLE IF NOT EXISTS users (
      id BIGSERIAL PRIMARY KEY,
      email VARCHAR(255) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      full_name VARCHAR(255),
      role VARCHAR(50) DEFAULT 'owner',
      shop_ids JSONB,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    -- Shops Table
    CREATE TABLE IF NOT EXISTS shops (
      shop_id VARCHAR(255) PRIMARY KEY,
      user_id BIGINT REFERENCES users(id),
      name VARCHAR(255) NOT NULL,
      domain VARCHAR(255),
      platform VARCHAR(50) DEFAULT 'shopify',
      platform_store_id VARCHAR(255),
      access_token VARCHAR(255) NOT NULL,
      website_url VARCHAR(255),
      settings JSONB DEFAULT '{}',
      plan VARCHAR(50) DEFAULT 'free',
      onboarding_complete BOOLEAN DEFAULT FALSE,
      email_domain VARCHAR(255),
      email_verified BOOLEAN DEFAULT FALSE,
      install_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    -- Products Table
    CREATE TABLE IF NOT EXISTS products (
      id BIGSERIAL PRIMARY KEY,
      shop_id VARCHAR(255) NOT NULL REFERENCES shops(shop_id),
      external_id VARCHAR(255),
      shopify_product_id BIGINT,
      title VARCHAR(255) NOT NULL,
      description TEXT,
      price DECIMAL(10, 2),
      currency VARCHAR(10) DEFAULT 'USD',
      image_url VARCHAR(500),
      collection_ids JSONB,
      tags JSONB,
      embedding JSONB, -- Fallback from vector(1536)
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    -- Product Variants Table
    CREATE TABLE IF NOT EXISTS product_variants (
      id BIGSERIAL PRIMARY KEY,
      product_id BIGINT REFERENCES products(id),
      shop_id VARCHAR(255) NOT NULL,
      shopify_variant_id BIGINT,
      title VARCHAR(255),
      sku VARCHAR(100),
      price DECIMAL(10, 2),
      weight DECIMAL(10, 2),
      weight_unit VARCHAR(10),
      attributes JSONB,
      image_url VARCHAR(500),
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    -- Inventory Table
    CREATE TABLE IF NOT EXISTS inventory (
      id BIGSERIAL PRIMARY KEY,
      variant_id BIGINT REFERENCES product_variants(id),
      shop_id VARCHAR(255) NOT NULL,
      quantity_available INT,
      quantity_reserved INT,
      location_id BIGINT,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    -- Conversations Table
    CREATE TABLE IF NOT EXISTS conversations (
        id BIGSERIAL PRIMARY KEY,
        shop_id VARCHAR(255) REFERENCES shops(shop_id),
        customer_id VARCHAR(255),
        platform VARCHAR(50) DEFAULT 'web',
        channel VARCHAR(50) DEFAULT 'web',
        status VARCHAR(50) DEFAULT 'active',
        message_count INT DEFAULT 0,
        bot_message_count INT DEFAULT 0,
        human_message_count INT DEFAULT 0,
        resolution_type VARCHAR(50),
        resolved_in_seconds INT,
        csat_score INT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        resolved_at TIMESTAMP WITH TIME ZONE
    );

    -- Messages Table
    CREATE TABLE IF NOT EXISTS messages (
        id BIGSERIAL PRIMARY KEY,
        conversation_id BIGINT REFERENCES conversations(id),
        sender VARCHAR(50),
        role VARCHAR(50) NOT NULL, -- user, assistant, system
        content TEXT NOT NULL,
        intent VARCHAR(100),
        response_time_ms INT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    -- FAQs Table
    CREATE TABLE IF NOT EXISTS faqs (
        id BIGSERIAL PRIMARY KEY,
        shop_id VARCHAR(255) REFERENCES shops(shop_id),
        question TEXT NOT NULL,
        answer TEXT NOT NULL,
        category VARCHAR(100),
        source_url VARCHAR(500),
        embedding JSONB, -- Fallback from vector(1536)
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    -- Returns Table
    CREATE TABLE IF NOT EXISTS returns (
      id BIGSERIAL PRIMARY KEY,
      shop_id VARCHAR(255) NOT NULL,
      order_id BIGINT,
      customer_id BIGINT,
      return_items JSONB,
      reason VARCHAR(255),
      condition VARCHAR(100),
      status VARCHAR(50),
      return_label_url VARCHAR(500),
      tracking_number VARCHAR(100),
      refund_amount DECIMAL(10, 2),
      refund_status VARCHAR(50),
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `);
};

exports.down = pgm => {
  pgm.sql(`
    DROP TABLE IF EXISTS returns;
    DROP TABLE IF EXISTS faqs;
    DROP TABLE IF EXISTS messages;
    DROP TABLE IF EXISTS conversations;
    DROP TABLE IF EXISTS inventory;
    DROP TABLE IF EXISTS product_variants;
    DROP TABLE IF EXISTS products;
    DROP TABLE IF EXISTS shops;
    DROP TABLE IF EXISTS users;
    -- DROP EXTENSION IF EXISTS vector;
  `);
};
