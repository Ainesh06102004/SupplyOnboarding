-- ============================================================================
-- KOI — Two subtotals, because there are two prices
--
-- The first real hand-off recorded subtotal_at_handoff = 450.00 while the plan
-- it committed carried a subtotal of 120. Neither number is wrong; they are
-- answers to different questions, and one column was holding both names.
--
--   450  KOI's own catalogue MRP for the basket. Written by openDraft, before
--        a provider has been asked anything. It is a fact about KOI's
--        catalogue.
--   120  what the provider quoted for the lines it accepted. Known only after
--        prepare, and the closer of the two to what the shopper will actually
--        be charged — though KOI is NOT merchant of record and never sees the
--        final amount, so even this is not a receipt.
--
-- Keeping only the first under a name ending "at_handoff" invites someone to
-- reconcile it against a real Swiggy bill and conclude KOI overcharged. So the
-- provider's figure gets its own column and both are commented for what they
-- are.
--
-- NULLABLE ON PURPOSE. The plan withholds its subtotal entirely unless every
-- line resolved, so this is null for any partially-fulfilled basket. That is
-- the honest state and the UI must render its absence rather than a zero.
-- ============================================================================

ALTER TABLE fulfilment_intents
  ADD COLUMN IF NOT EXISTS provider_subtotal_at_handoff numeric(12,2);

COMMENT ON COLUMN fulfilment_intents.subtotal_at_handoff IS
  'KOI catalogue MRP for the basket, summed at draft time before any provider was asked. A fact about KOI''s own prices — NOT what the shopper pays.';

COMMENT ON COLUMN fulfilment_intents.provider_subtotal_at_handoff IS
  'What the provider quoted for the accepted lines, taken from the committed plan. NULL whenever the plan withheld its subtotal, which it does for any basket that was not fully fulfillable. KOI is not merchant of record, so even this is an estimate and never a receipt.';

COMMENT ON COLUMN fulfilment_intents.zone_id IS
  'The delivery zone the hand-off was resolved against. Null on a draft — the zone is not known until checkout resolves the pincode — and written at hand-off.';
