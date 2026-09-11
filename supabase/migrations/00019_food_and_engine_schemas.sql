-- ============================================================================
-- KOI — The food knowledge base and its pipeline get their own schemas
--
-- KOI is building a food database (ingredients, allergens, taxonomy, derived
-- facts, substitutes) and an engine that fills it (label extraction, review,
-- demand, re-checks). Neither belongs in `public`, and the reason is access,
-- not tidiness.
--
-- WHY NOT PUBLIC:
-- `public` hands every new table to anon and authenticated by default — its
-- default ACL grants them arwdDxtm on anything postgres creates there — so a
-- table is open the moment it lands unless someone remembers otherwise. And
-- 00012 records that the catalogue in `public` still takes anon INSERT and
-- UPDATE, because brands have no identity yet and the anon key is unrotated.
-- Allergen facts are the one thing a leaked anon key must never be able to
-- write. A new schema starts with no grants at all: it is shut until a
-- migration opens something on purpose.
--
--   food    The knowledge base. Written by service_role only. A table becomes
--           readable only through a grant plus an RLS policy stated here.
--   engine  The pipeline's workings: raw model output, review state, queues.
--           service_role only. anon and authenticated cannot even resolve
--           names in it.
--
-- WHY THE SAME PROJECT:
-- food.sku_ingredients needs a real foreign key to public.skus, and publishing
-- a verified label has to update public.sku_nutrition in the same transaction.
-- Neither survives a second project.
--
-- The two schemas were created by hand in the dashboard on 11 Sep 2026.
-- `IF NOT EXISTS` makes this file the complete record either way.
--
-- MANUAL STEP — a migration cannot do this:
--   Dashboard -> Project Settings -> Data API -> Exposed schemas
--   -> add `food` and `engine` -> Save.
-- Only server-side writes over PostgREST need it (scripts/applyIngredientsSeed.mjs
-- now, the engine later). The storefront reads through the view in `public`
-- below, which works without it. Exposure is not access: the grants in this
-- file decide who can touch what, exposed or not.
--
-- FUNCTIONS: Postgres grants EXECUTE on every new function to PUBLIC, and a
-- per-schema default cannot revoke a global one. `engine` is safe regardless,
-- because nobody but service_role has USAGE on it. `food` is not: anon has
-- USAGE there. So every function created in `food` must carry its own
--   REVOKE EXECUTE ON FUNCTION food.<fn> FROM PUBLIC;
-- in the migration that creates it.
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS food;
CREATE SCHEMA IF NOT EXISTS engine;

COMMENT ON SCHEMA food IS
  'KOI food knowledge base. Written by service_role only; a table is readable only where a grant and an RLS policy say so. Storefront reads go through security_invoker views in public. Every function created here must REVOKE EXECUTE FROM PUBLIC.';
COMMENT ON SCHEMA engine IS
  'KOI pipeline internals: extraction, review, demand, re-checks. service_role only; never granted to anon or authenticated.';

-- ── Schema access ───────────────────────────────────────────────────────────
-- USAGE on food lets anon resolve names in it. It grants no table access.
GRANT USAGE ON SCHEMA food   TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA engine TO service_role;

-- ── Defaults for whatever is created here later ─────────────────────────────
-- The inverse of public: a new table is service_role-only until a migration
-- grants a read deliberately.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA food
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA food
  GRANT USAGE, SELECT ON SEQUENCES TO service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA food
  GRANT EXECUTE ON FUNCTIONS TO service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA engine
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA engine
  GRANT USAGE, SELECT ON SEQUENCES TO service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA engine
  GRANT EXECUTE ON FUNCTIONS TO service_role;

-- ── The move ────────────────────────────────────────────────────────────────
-- SET SCHEMA keeps rows, indexes, constraints, foreign keys, triggers, grants
-- and RLS. All three were already service_role-only, RLS on, no policies.
-- No view or function referenced them, and no app code did either — only
-- scripts/applyIngredientsSeed.mjs, which moves with this change.
ALTER TABLE public.ingredients_master SET SCHEMA food;
ALTER TABLE public.sku_ingredients    SET SCHEMA food;
ALTER TABLE public.ai_extraction_jobs SET SCHEMA engine;

-- ── Storefront read model: verified labels only ─────────────────────────────
-- The storefront needs one thing from food today: whether a SKU has an
-- ingredient list a person has checked. That is what lets it say "No
-- ingredients you avoid" truthfully, and withhold it otherwise.
--
-- An unverified row is unreviewed model output or a brand's draft. It is not
-- public, and the policy below is what keeps it that way — the view's WHERE
-- is a convenience, not the control.
GRANT SELECT ON food.sku_ingredients TO anon, authenticated;

CREATE POLICY "Verified labels are public"
  ON food.sku_ingredients
  FOR SELECT
  TO anon, authenticated
  USING (manually_verified);

-- security_invoker: the view runs with the caller's rights, so the policy
-- above applies. A default view runs as its owner and would skip RLS entirely.
-- It lives in public so PostgREST serves it without `food` being exposed, and
-- embeds from skus through sku_ingredients' foreign key.
CREATE VIEW public.sku_label_facts
  WITH (security_invoker = true)
AS
  SELECT sku_id, raw_ingredient_text, allergens, manually_verified, updated_at
    FROM food.sku_ingredients
   WHERE manually_verified;

-- public's defaults just granted anon every privilege on the new view. Read is
-- the only one it should have.
REVOKE ALL ON public.sku_label_facts FROM anon, authenticated;
GRANT SELECT ON public.sku_label_facts TO anon, authenticated;

COMMENT ON VIEW public.sku_label_facts IS
  'Verified ingredient labels, one per SKU. The storefront reads this to decide whether an allergen claim is sayable. No row = KOI has not verified the list, which is not the same as the list being clean.';
