-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Shops table
CREATE TABLE IF NOT EXISTS shops (
  shop_id VARCHAR(255) PRIMARY KEY,
  name VARCHAR(255),
  user_id BIGINT REFERENCES users(id),
  platform VARCHAR(50) DEFAULT 'shopify',
  platform_store_id VARCHAR(255),
  access_token VARCHAR(255) NOT NULL,
  website_url VARCHAR(255),
  settings JSONB DEFAULT '{}', -- Bot settings: name, tone, etc.
  plan VARCHAR(50) DEFAULT 'free', -- free, pro, enterprise
  onboarding_complete BOOLEAN DEFAULT FALSE,
  email_domain VARCHAR(255),
  email_verified BOOLEAN DEFAULT FALSE,
  install_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Products table
CREATE TABLE IF NOT EXISTS products (
  id BIGSERIAL PRIMARY KEY,
  shop_id VARCHAR(255) NOT NULL REFERENCES shops(shop_id),
  shopify_product_id BIGINT UNIQUE,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  price DECIMAL(10, 2),
  image_url VARCHAR(500),
  collection_ids JSONB,
  tags JSONB,
  embedding vector(1536), -- OpenAI embeddings
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Variants table
CREATE TABLE IF NOT EXISTS product_variants (
  id BIGSERIAL PRIMARY KEY,
  product_id BIGINT REFERENCES products(id),
  shop_id VARCHAR(255) NOT NULL,
  shopify_variant_id BIGINT UNIQUE,
  title VARCHAR(255),
  sku VARCHAR(100),
  price DECIMAL(10, 2),
  weight DECIMAL(10, 2),
  weight_unit VARCHAR(10),
  attributes JSONB,
  image_url VARCHAR(500),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Inventory table
CREATE TABLE IF NOT EXISTS inventory (
  id BIGSERIAL PRIMARY KEY,
  variant_id BIGINT REFERENCES product_variants(id),
  shop_id VARCHAR(255) NOT NULL,
  quantity_available INT,
  quantity_reserved INT,
  location_id BIGINT,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Orders table
CREATE TABLE IF NOT EXISTS orders (
  id BIGSERIAL PRIMARY KEY,
  shop_id VARCHAR(255) NOT NULL REFERENCES shops(shop_id),
  shopify_order_id BIGINT UNIQUE,
  order_number VARCHAR(100),
  email VARCHAR(255),
  phone VARCHAR(50),
  total_price DECIMAL(10, 2),
  currency VARCHAR(10),
  financial_status VARCHAR(50), -- paid, pending, refunded
  fulfillment_status VARCHAR(50), -- fulfilled, partial, unfulfilled
  tracking_url VARCHAR(500),
  tracking_number VARCHAR(100),
  customer_id BIGINT, -- Links to internal customer table if we had one, or store raw Shopify customer ID
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Order Items table
CREATE TABLE IF NOT EXISTS order_items (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT REFERENCES orders(id),
  shopify_line_item_id BIGINT UNIQUE,
  product_id BIGINT, -- Optional reference to products table
  variant_id BIGINT, -- Optional reference
  title VARCHAR(255),
  quantity INT,
  price DECIMAL(10, 2)
);

-- Conversations table
CREATE TABLE IF NOT EXISTS conversations (
  id BIGSERIAL PRIMARY KEY,
  shop_id VARCHAR(255) NOT NULL,
  customer_id BIGINT,
  channel VARCHAR(50), -- 'shopify_chat', 'email', 'whatsapp'
  status VARCHAR(50), -- 'active', 'resolved', 'escalated'
  message_count INT DEFAULT 0,
  bot_message_count INT DEFAULT 0,
  human_message_count INT DEFAULT 0,
  resolution_type VARCHAR(50),
  resolved_in_seconds INT,
  csat_score INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  resolved_at TIMESTAMP
);

-- Messages table
CREATE TABLE IF NOT EXISTS messages (
  id BIGSERIAL PRIMARY KEY,
  conversation_id BIGINT REFERENCES conversations(id),
  sender VARCHAR(50), -- 'customer', 'bot', 'human'
  content TEXT,
  intent VARCHAR(100),
  response_time_ms INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Returns table
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
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Users table (Dashboard Access)
CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(255),
  role VARCHAR(50) DEFAULT 'owner', -- owner, support, admin
  shop_ids JSONB, -- List of shops user has access to
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- FAQs table
CREATE TABLE IF NOT EXISTS faqs (
  id BIGSERIAL PRIMARY KEY,
  shop_id VARCHAR(255) NOT NULL REFERENCES shops(shop_id),
  title VARCHAR(255),
  question TEXT, -- Can be NULL if content is raw text
  answer TEXT,   -- Can be NULL if content is raw text
  content TEXT,  -- For raw scraped content
  category VARCHAR(100),
  source_url VARCHAR(500),
  embedding vector(1536),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
