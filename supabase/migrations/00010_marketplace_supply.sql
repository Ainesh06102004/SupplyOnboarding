-- ============================================================================
-- KOI — Marketplace supply tier
--
-- Maps KOI's screened SKUs onto a provider's identifiers, and records what was
-- asked of that provider.
--
-- THE POINT OF (scope, scope_ref):
-- There is an open question KOI cannot answer without credentials — is Swiggy's
-- spinId stable per product, or does it vary per dark store? Both columns exist
-- from day one, defaulting to ('global', '*'), and resolution is
-- most-specific-wins: store, then zone, then global.
--
-- So if spinId turns out to be per-store, the answer is INSERT rows with
-- scope='store'. No DDL, no resolver change, no call-site change. The
-- uncertainty is absorbed by a default value rather than by a future migration.
--
-- Everything here is service-role only. These are provider-derived integration
-- keys, not catalogue content, and the browser has no business reading them.
-- ============================================================================

-- ── KOI SKU ↔ provider SKU ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS marketplace_sku_map (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  marketplace  text NOT NULL,
  koi_sku_id   uuid NOT NULL REFERENCES skus(id) ON DELETE CASCADE,

  -- The provider's opaque identifier (Swiggy's spinId). NULL means "we looked
  -- and there is no match", which is a real and useful answer — distinct from
  -- never having looked.
  external_id  text,
  variant_ref  text,

  -- See the banner. Defaults make every existing row a global mapping.
  scope        text NOT NULL DEFAULT 'global'
               CHECK (scope IN ('global', 'zone', 'store')),
  scope_ref    text NOT NULL DEFAULT '*',

  -- How to FIND it. Needed because there is no lookup-by-id endpoint:
  -- verifying one product costs a search.
  match_query  text,
  match_method text CHECK (match_method IN ('manual', 'barcode', 'name_pack', 'observed')),

  -- Below the threshold in lib/marketplace/config.js, availability resolves to
  -- `unknown` rather than to a stock state: an unconfirmed match means we do
  -- not know that the in-stock thing at the provider is the thing KOI screened,
  -- and claiming otherwise is a claim about the wrong product.
  confidence   numeric(3,2) NOT NULL DEFAULT 0 CHECK (confidence BETWEEN 0 AND 1),

  -- Set only by a human. Rows discovered automatically (match_method =
  -- 'observed') never self-promote.
  verified_at  timestamptz,
  last_seen_at timestamptz,
  is_active    boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),

  UNIQUE (marketplace, koi_sku_id, scope, scope_ref)
);

CREATE INDEX IF NOT EXISTS idx_sku_map_lookup
  ON marketplace_sku_map (marketplace, koi_sku_id, scope, scope_ref)
  WHERE is_active;

-- ── Zones ───────────────────────────────────────────────────────────────────
-- The many-to-one collapse that makes the cost model work. India has ~19,000
-- pincodes; a city's dark-store catchments number in the dozens. Caching per
-- pincode would multiply cardinality by three orders of magnitude for no extra
-- precision, so the cache is keyed on the zone and this is where pincodes are
-- folded into one.
CREATE TABLE IF NOT EXISTS marketplace_zone (
  zone_id          text PRIMARY KEY,
  marketplace      text NOT NULL,
  label            text NOT NULL,
  -- Provider-scoped handle (Swiggy's addressId). Never leaves the server.
  address_ref      text,
  credential_scope text NOT NULL DEFAULT 'house'
                   CHECK (credential_scope IN ('house', 'user')),
  serviceability   text NOT NULL DEFAULT 'unknown'
                   CHECK (serviceability IN ('serviceable', 'not_serviceable', 'unknown')),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS marketplace_zone_pincode (
  marketplace text NOT NULL,
  pincode     text NOT NULL,
  zone_id     text NOT NULL REFERENCES marketplace_zone(zone_id) ON DELETE CASCADE,
  PRIMARY KEY (marketplace, pincode)
);

-- ── Call ledger ─────────────────────────────────────────────────────────────
-- Rate accounting, a capacity dashboard, and — if a provider ever asks — the
-- evidence that KOI's traffic is shopper-caused rather than a background sweep.
-- Every row should correspond to someone looking at the result.
CREATE TABLE IF NOT EXISTS marketplace_call_log (
  id               bigserial PRIMARY KEY,
  marketplace      text NOT NULL,
  route            text NOT NULL,          -- 'zone' | 'shelf' | 'item' | 'handoff'
  zone_id          text,
  shelf_id         text,
  credential_scope text NOT NULL DEFAULT 'house',
  latency_ms       int,
  outcome          text NOT NULL           -- 'ok' | 'error' | 'rate_limited' | 'stale'
                   CHECK (outcome IN ('ok', 'error', 'rate_limited', 'stale')),
  called_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_call_log_called_at ON marketplace_call_log (called_at DESC);

-- ── Hand-off plans ──────────────────────────────────────────────────────────
-- The provider's cart is destructive: one cart per account, replaced wholesale.
-- prepare is read-only and idempotent; commit is the only destructive call in
-- the system. Persisting the plan with committed_at is what stops a double
-- submit double-replacing someone's cart.
CREATE TABLE IF NOT EXISTS marketplace_handoff_plan (
  plan_id      text PRIMARY KEY,
  profile_id   text NOT NULL REFERENCES customer_profiles(id) ON DELETE CASCADE,
  marketplace  text NOT NULL,
  zone_id      text,
  payload      jsonb NOT NULL,
  expires_at   timestamptz NOT NULL,
  committed_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_handoff_plan_profile ON marketplace_handoff_plan (profile_id);

-- ── Per-user provider credentials ───────────────────────────────────────────
-- Tokens are encrypted at rest and NEVER readable by the browser, under any
-- auth provider. RLS is the floor for user-owned data; the service role is the
-- ceiling for secrets, and credentials live above the ceiling.
CREATE TABLE IF NOT EXISTS marketplace_credentials (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id           text NOT NULL REFERENCES customer_profiles(id) ON DELETE CASCADE,
  marketplace          text NOT NULL,
  external_account_ref text,
  access_token_enc     bytea NOT NULL,
  refresh_token_enc    bytea,
  scopes               text[],
  expires_at           timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profile_id, marketplace)
);

-- ── Service-role only ───────────────────────────────────────────────────────
-- RLS on with ZERO policies denies anon and authenticated outright;
-- service_role bypasses RLS, so server-side work is unaffected. The REVOKE is
-- belt and braces against a future blanket grant.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'marketplace_sku_map','marketplace_zone','marketplace_zone_pincode',
    'marketplace_call_log','marketplace_handoff_plan','marketplace_credentials'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('REVOKE ALL ON %I FROM anon, authenticated;', t);
  END LOOP;
END $$;

REVOKE ALL ON SEQUENCE marketplace_call_log_id_seq FROM anon, authenticated;
