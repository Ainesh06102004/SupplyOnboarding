-- ============================================================================
-- Supersedes the original 00004_dashboard_operations.sql, which was removed.
-- Both created order_status, orders and order_items, so running the pair failed
-- on the second CREATE TYPE. This version is a strict superset: it adds
-- order_items.brand_id, brand_settlements and settlement_status.
--
-- NOT YET APPLIED to the live project. Note KOI is not merchant of record for
-- storefront orders, so orders.payment_status is a fact it cannot observe -
-- storefront checkout needs its own fulfilment_intents rather than this table.
-- ============================================================================

-- ============================================================================
-- KOI PLATFORM — Dashboard Operations Schema Migration V2 (00004_dashboard_operations_v2.sql)
-- ============================================================================

-- ============================================================================
-- TASK 1 — CREATE ORDERS TABLE
-- ============================================================================

CREATE TYPE order_status AS ENUM (
  'pending',
  'confirmed',
  'packed',
  'shipped',
  'delivered',
  'cancelled',
  'returned'
);

CREATE TYPE payment_status AS ENUM (
  'pending',
  'paid',
  'failed',
  'refunded'
);

CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number VARCHAR(50) UNIQUE NOT NULL,
  customer_reference VARCHAR(255),
  order_status order_status NOT NULL DEFAULT 'pending',
  payment_status payment_status NOT NULL DEFAULT 'pending',
  subtotal NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  discount NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  total NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER set_orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE INDEX idx_orders_status ON orders (order_status);
CREATE INDEX idx_orders_created_at ON orders (created_at DESC);
CREATE INDEX idx_orders_customer ON orders (customer_reference);

-- ============================================================================
-- TASK 2 — CREATE ORDER_ITEMS TABLE (PATCH 1: BRAND OWNERSHIP)
-- ============================================================================

CREATE TABLE order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  sku_id UUID NOT NULL REFERENCES skus(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price NUMERIC(10, 2) NOT NULL,
  total_price NUMERIC(10, 2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  CONSTRAINT order_items_quantity_positive CHECK (quantity > 0)
);

CREATE INDEX idx_order_items_order_id ON order_items (order_id);
CREATE INDEX idx_order_items_brand_id ON order_items (brand_id);
CREATE INDEX idx_order_items_sku_id ON order_items (sku_id);

-- ============================================================================
-- TASK 3 — CREATE INVENTORY_BATCHES TABLE (PATCH 2: UNIQUE BATCH)
-- ============================================================================

CREATE TYPE batch_status AS ENUM (
  'active',
  'expired',
  'depleted',
  'quarantined'
);

CREATE TABLE inventory_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku_id UUID NOT NULL REFERENCES skus(id) ON DELETE CASCADE,
  batch_number VARCHAR(100) NOT NULL,
  mfg_date DATE,
  expiry_date DATE,
  quantity INTEGER NOT NULL DEFAULT 0,
  status batch_status NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  CONSTRAINT inventory_batches_quantity_non_negative CHECK (quantity >= 0),
  UNIQUE (sku_id, batch_number)
);

CREATE TRIGGER set_inventory_batches_updated_at
  BEFORE UPDATE ON inventory_batches
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE INDEX idx_inventory_batches_sku_id ON inventory_batches (sku_id);
CREATE INDEX idx_inventory_batches_expiry_date ON inventory_batches (expiry_date);
CREATE INDEX idx_inventory_batches_status ON inventory_batches (status);

-- ============================================================================
-- TASK 4 — ALTER SKUS TABLE
-- ============================================================================

ALTER TABLE skus
  ADD COLUMN selling_price NUMERIC(10, 2),
  ADD COLUMN discount_pct NUMERIC(5, 2),
  ADD COLUMN commission_pct NUMERIC(5, 2);

ALTER TABLE skus
  ADD CONSTRAINT skus_selling_price_non_negative CHECK (selling_price >= 0),
  ADD CONSTRAINT skus_discount_pct_range CHECK (discount_pct >= 0 AND discount_pct <= 100),
  ADD CONSTRAINT skus_commission_pct_range CHECK (commission_pct >= 0 AND commission_pct <= 100);

-- ============================================================================
-- TASK 5 — OPTIONAL ANALYTICS TABLE
-- ============================================================================

CREATE TABLE daily_product_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  sku_id UUID NOT NULL REFERENCES skus(id) ON DELETE CASCADE,
  views INTEGER NOT NULL DEFAULT 0,
  add_to_cart INTEGER NOT NULL DEFAULT 0,
  orders INTEGER NOT NULL DEFAULT 0,
  revenue NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  
  CONSTRAINT daily_product_metrics_views_non_negative CHECK (views >= 0),
  CONSTRAINT daily_product_metrics_add_to_cart_non_negative CHECK (add_to_cart >= 0),
  CONSTRAINT daily_product_metrics_orders_non_negative CHECK (orders >= 0)
);

CREATE UNIQUE INDEX uq_daily_product_metrics_date_sku ON daily_product_metrics (date, sku_id);
CREATE INDEX idx_daily_product_metrics_date ON daily_product_metrics (date);
CREATE INDEX idx_daily_product_metrics_sku_id ON daily_product_metrics (sku_id);

-- ============================================================================
-- TASK 6 — BRAND SETTLEMENTS TABLE (PATCH 3: SETTLEMENTS)
-- ============================================================================

CREATE TYPE settlement_status AS ENUM (
  'pending',
  'processing',
  'paid',
  'failed'
);

CREATE TABLE brand_settlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  gross_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  commission_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  payout_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  status settlement_status NOT NULL DEFAULT 'pending',
  payout_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER set_brand_settlements_updated_at
  BEFORE UPDATE ON brand_settlements
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE INDEX idx_brand_settlements_brand_id ON brand_settlements (brand_id);
CREATE INDEX idx_brand_settlements_order_id ON brand_settlements (order_id);
CREATE INDEX idx_brand_settlements_status ON brand_settlements (status);
