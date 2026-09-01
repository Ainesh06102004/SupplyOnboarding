-- ============================================================================
-- KOI — Fulfilment intents
--
-- WHY THIS IS NOT THE `orders` TABLE:
--
-- 00004_dashboard_operations_v2.sql designs `orders` with `payment_status`.
-- That column is correct for what it was built for — KOI's brand-side
-- operations, where KOI is a party to the transaction. It is wrong for
-- storefront checkout, because in the storefront KOI is NOT merchant of
-- record. The shopper pays Swiggy. KOI never sees a payment event, holds no
-- settlement record, and gets no webhook.
--
-- So writing 'paid' into that column would be recording something KOI cannot
-- observe. That is the same failure as a hardcoded "In stock" or an invented
-- nutrition figure, wearing accounting clothes. `orders` and `order_items`
-- stay the brand-side operational tables they were designed as. (Neither is
-- deployed today — this migration does not touch them either way.)
--
-- WHAT KOI CAN ACTUALLY OBSERVE:
--
--   draft               a basket was assembled here
--   handed_off          KOI pushed a cart to a provider. KOI's LAST observable
--                       act. Everything after this happens on Swiggy.
--   abandoned           the intent expired or was dropped before hand-off
--   reported_delivered  the SHOPPER said it arrived
--
-- The state vocabulary is the honest boundary of KOI's knowledge. There is
-- deliberately no 'confirmed', no 'out_for_delivery' and no 'delivered' —
-- those are Swiggy's to know, and the storefront must not imply it knows them.
-- `reported_delivered` is named for its source: it is shopper testimony, not
-- an observation, and the name keeps that distinction in the schema rather
-- than in a comment somewhere in the UI.
--
-- Columns absent ON PURPOSE: payment_status, amount_paid, delivery_eta,
-- courier, tracking_url. If one of those is ever needed, it must arrive with
-- a real source attached.
-- ============================================================================

-- ── State vocabulary ────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'fulfilment_state') THEN
    CREATE TYPE fulfilment_state AS ENUM (
      'draft',
      'handed_off',
      'abandoned',
      'reported_delivered'
    );
  END IF;
END $$;

-- ── The intent ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fulfilment_intents (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id   text NOT NULL REFERENCES customer_profiles(id) ON DELETE CASCADE,
  state        fulfilment_state NOT NULL DEFAULT 'draft',

  -- Null until a provider is actually chosen. A draft intent is provider-
  -- agnostic, which is what lets the basket exist before Swiggy auth.
  marketplace  text,
  zone_id      text REFERENCES marketplace_zone(zone_id) ON DELETE SET NULL,

  -- The prepare/commit plan this intent was handed off through. prepare is
  -- read-only and idempotent; commit is the only destructive call in the
  -- system, because the provider's update_cart REPLACES the cart wholesale.
  plan_id      text REFERENCES marketplace_handoff_plan(plan_id) ON DELETE SET NULL,

  address_id   uuid REFERENCES delivery_addresses(id) ON DELETE SET NULL,
  -- Snapshotted because a shopper can edit or delete an address afterwards,
  -- and an intent must still be able to say where it was sent. The FK above
  -- is for joining live records; this is the historical fact.
  address_snapshot jsonb,

  item_count   integer NOT NULL DEFAULT 0 CHECK (item_count >= 0),

  -- The sum of KOI's own MRPs at hand-off, in paise-free rupees. This is NOT
  -- an amount paid and NOT an order total: the shopper pays Swiggy, at
  -- Swiggy's prices, which may differ. It exists so KOI can say what basket it
  -- handed over, and is named to make misreading it hard.
  subtotal_at_handoff numeric(10,2) CHECK (subtotal_at_handoff >= 0),
  currency     text NOT NULL DEFAULT 'INR',

  -- If the provider hands back an identifier, keep it: it is the only thread
  -- between a KOI intent and a real order, and support needs it.
  external_order_ref text,

  handed_off_at        timestamptz,
  abandoned_at         timestamptz,
  delivery_reported_at timestamptz,

  -- Shopper testimony, never inference. Null means they never told us, which
  -- is different from "it did not arrive".
  delivery_report text CHECK (delivery_report IN ('arrived', 'did_not_arrive', 'partial')),

  notes        text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),

  -- Timestamps must agree with the state rather than drift from it.
  CONSTRAINT handed_off_has_timestamp
    CHECK (state <> 'handed_off' OR handed_off_at IS NOT NULL),
  CONSTRAINT abandoned_has_timestamp
    CHECK (state <> 'abandoned' OR abandoned_at IS NOT NULL),
  -- A delivery report requires BOTH a time and a claim. Recording "delivered"
  -- with no statement behind it is the exact fabrication this table exists to
  -- prevent, and reaching reported_delivered requires having been handed off.
  CONSTRAINT delivery_report_is_sourced
    CHECK (state <> 'reported_delivered'
           OR (delivery_reported_at IS NOT NULL
               AND delivery_report IS NOT NULL
               AND handed_off_at IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_fulfilment_intents_profile
  ON fulfilment_intents (profile_id, created_at DESC);

-- One live draft per shopper. Without this, every checkout render risks
-- opening another basket and /store/orders fills with phantom drafts.
CREATE UNIQUE INDEX IF NOT EXISTS idx_fulfilment_intents_one_draft
  ON fulfilment_intents (profile_id)
  WHERE state = 'draft';

-- ── The lines ───────────────────────────────────────────────────────────────
-- Everything a shopper needs to read their own history back is snapshotted
-- here. A SKU can be deprecated, renamed, re-scored or delisted, and none of
-- that may retroactively rewrite what was handed off on the day.
CREATE TABLE IF NOT EXISTS fulfilment_intent_items (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  intent_id    uuid NOT NULL REFERENCES fulfilment_intents(id) ON DELETE CASCADE,

  koi_sku_id   uuid REFERENCES skus(id) ON DELETE SET NULL,
  product_name text NOT NULL,
  brand_name   text,

  quantity     integer NOT NULL CHECK (quantity > 0),

  -- KOI's listed MRP at hand-off. Explicitly not "price paid" — see the note
  -- on subtotal_at_handoff.
  unit_mrp_at_handoff numeric(10,2) CHECK (unit_mrp_at_handoff >= 0),

  -- The score as it stood that day. Null is a real answer: plenty of listed
  -- products are not yet scored, and 0 is not the same thing. See
  -- web/src/lib/score.js for what happens when that distinction is lost.
  koi_score_at_handoff numeric(5,2) CHECK (koi_score_at_handoff BETWEEN 0 AND 100),

  -- What became of this line at the provider. 'unknown' is the default and is
  -- correct: until a hand-off actually returns per-line results, KOI does not
  -- know, and must not claim the line was added.
  handoff_outcome text NOT NULL DEFAULT 'unknown'
    CHECK (handoff_outcome IN ('unknown', 'added', 'unavailable', 'substituted', 'not_matched')),
  substituted_external_id text,

  created_at   timestamptz NOT NULL DEFAULT now(),

  -- A substitution must name what it substituted to.
  CONSTRAINT substitution_names_its_replacement
    CHECK (handoff_outcome <> 'substituted' OR substituted_external_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_fulfilment_intent_items_intent
  ON fulfilment_intent_items (intent_id);

-- ── updated_at ──────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS set_updated_at ON fulfilment_intents;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON fulfilment_intents
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- Owner-gated on koi_uid(), which returns the Firebase subject ONLY when the
-- token's issuer and audience match KOI's project (see 00008). Policies are
-- TO public deliberately: the gate is the verified claim, not a Postgres role.
ALTER TABLE fulfilment_intents      ENABLE ROW LEVEL SECURITY;
ALTER TABLE fulfilment_intent_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fulfilment_intents_select_own ON fulfilment_intents;
CREATE POLICY fulfilment_intents_select_own ON fulfilment_intents
  FOR SELECT TO public
  USING (koi_uid() IS NOT NULL AND profile_id = koi_uid());

DROP POLICY IF EXISTS fulfilment_intents_insert_own ON fulfilment_intents;
CREATE POLICY fulfilment_intents_insert_own ON fulfilment_intents
  FOR INSERT TO public
  WITH CHECK (koi_uid() IS NOT NULL AND profile_id = koi_uid());

DROP POLICY IF EXISTS fulfilment_intents_update_own ON fulfilment_intents;
CREATE POLICY fulfilment_intents_update_own ON fulfilment_intents
  FOR UPDATE TO public
  USING (koi_uid() IS NOT NULL AND profile_id = koi_uid())
  WITH CHECK (profile_id = koi_uid());

-- No DELETE policy. A shopper's fulfilment history is a record of what KOI
-- did on their behalf; it is not editable away from the client. Erasure
-- requests are a service-role operation, so they run through code that can
-- also honour the DPDP obligations that come with them.

DROP POLICY IF EXISTS fulfilment_items_select_own ON fulfilment_intent_items;
CREATE POLICY fulfilment_items_select_own ON fulfilment_intent_items
  FOR SELECT TO public
  USING (EXISTS (
    SELECT 1 FROM fulfilment_intents i
    WHERE i.id = intent_id AND koi_uid() IS NOT NULL AND i.profile_id = koi_uid()
  ));

DROP POLICY IF EXISTS fulfilment_items_insert_own ON fulfilment_intent_items;
CREATE POLICY fulfilment_items_insert_own ON fulfilment_intent_items
  FOR INSERT TO public
  WITH CHECK (EXISTS (
    SELECT 1 FROM fulfilment_intents i
    WHERE i.id = intent_id AND koi_uid() IS NOT NULL AND i.profile_id = koi_uid()
  ));

DROP POLICY IF EXISTS fulfilment_items_update_own ON fulfilment_intent_items;
CREATE POLICY fulfilment_items_update_own ON fulfilment_intent_items
  FOR UPDATE TO public
  USING (EXISTS (
    SELECT 1 FROM fulfilment_intents i
    WHERE i.id = intent_id AND koi_uid() IS NOT NULL AND i.profile_id = koi_uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM fulfilment_intents i
    WHERE i.id = intent_id AND i.profile_id = koi_uid()
  ));
