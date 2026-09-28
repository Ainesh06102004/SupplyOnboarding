-- ============================================================================
-- 00084_label_reading_costs — what each Amazon label reading cost, and who
-- gave the second opinion. Before this, readings kept no usage, so the spend
-- could only be estimated (docs: Personal-research/koi-label-reading-costs.md).
--
--   usage          both replies' token usage: { first, second }
--   cost_usd       at list prices (lib/engine/readPlan.js PRICES), halved for a batch
--   second_source  'model' (a second model read it) or 'off' (Open Food Facts
--                  checked a nutrition-only reading by barcode; never copied)
--   batch_id       the OpenAI batch it came back in, if any
-- ============================================================================

ALTER TABLE amazon_products.label_reading
  ADD COLUMN usage jsonb,
  ADD COLUMN cost_usd numeric(10, 6) CHECK (cost_usd IS NULL OR cost_usd >= 0),
  ADD COLUMN second_source text NOT NULL DEFAULT 'model' CHECK (second_source IN ('model', 'off')),
  ADD COLUMN batch_id text;
