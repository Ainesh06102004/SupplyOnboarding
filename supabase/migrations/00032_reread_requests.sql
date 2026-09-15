-- ============================================================================
-- KOI — Read a label again when an independent source disagrees with it
--
-- Decided 15 Sep 2026: when KOI's figures for a product disagree with Open
-- Food Facts (engine.off_matches), the engine reads that product's label photos
-- again, by itself. The fresh pair of readings either confirms what KOI holds,
-- replaces it (the old values stay in engine.publish_log, and the product is
-- re-scored), or is blocked again — in which case nothing changes.
--
-- Open Food Facts is never the correction. It only decides that KOI should look
-- at the pack again.
--
-- Bounded so a lasting disagreement cannot become a loop of model calls: one
-- pending request per photo (the unique index), and the cross-check asks again
-- for a product at most every 30 days (lib/off/match.js#shouldReread). Figures
-- a person verified are never re-read on this signal.
--
-- service_role only; RLS on with no policies.
-- ============================================================================

CREATE TABLE engine.reread_requests (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku_id       uuid NOT NULL REFERENCES public.skus(id) ON DELETE CASCADE,
  upload_id    uuid NOT NULL REFERENCES public.uploads(id) ON DELETE CASCADE,
  reason       text NOT NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  done_at      timestamptz,
  output_id    uuid REFERENCES engine.extraction_outputs(id) ON DELETE SET NULL,
  result       jsonb
);

CREATE UNIQUE INDEX reread_requests_one_pending ON engine.reread_requests (upload_id) WHERE done_at IS NULL;
CREATE INDEX reread_requests_sku_idx ON engine.reread_requests (sku_id, requested_at DESC);

ALTER TABLE engine.reread_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON engine.reread_requests FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON engine.reread_requests TO service_role;

COMMENT ON TABLE engine.reread_requests IS
  'Label photos to read again because an independent source disagreed with the figures KOI holds. Processed first by the scheduled reader.';
