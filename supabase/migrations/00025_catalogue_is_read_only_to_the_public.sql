-- ============================================================================
-- KOI — The catalogue stops being writable by strangers
--
-- Seven tables carried RLS disabled AND write grants to `anon`, so the anon
-- key — which ships in every browser bundle by design, and is in this repo's
-- git history — was enough to:
--
--   INSERT into screening_reports   → invent a KOI score for any SKU
--   UPDATE products / skus          → rewrite any product's name or status
--   INSERT into uploads             → attach arbitrary label files
--   INSERT/UPDATE onboarding_submissions
--   SELECT onboarding_submissions   → read every brand's submission
--
-- The first is the one that matters most. `screening_reports` carries
-- `ingredient_score`, `nutrition_score` and `processing_score`, so an
-- anonymous INSERT is a published health verdict on a storefront whose whole
-- proposition is that the number can be trusted. Nothing in the application
-- writes that table — the engine uses `service_role` — so the grant existed
-- for no one.
--
-- WHAT THIS DOES NOT BREAK. The storefront only ever reads: productFetcher
-- selects products → brands, skus → sku_nutrition, screening_reports,
-- sku_label_facts. Those reads are preserved by the SELECT policies below.
-- The engine and every server route use `service_role`, which bypasses RLS
-- entirely and keeps all its grants.
--
-- WHAT THIS DOES BREAK, deliberately: the brand dashboard's create/upload
-- path and the onboarding draft, both of which write from the BROWSER on the
-- anon key. `/dashboard` is behind no session at all — proxy.js matches only
-- /store/{profile,checkout,orders} — and `createDraftProduct(brandId, …)`
-- takes the brand id from its caller, so today any visitor can write a product
-- under any brand. That is the hole, not a feature to preserve. Both flows
-- have been untouched since 24 June 2026.
--
-- Restoring them needs a server route on `service_role` that authorises the
-- writer, which in turn needs brand identity to exist — `brands.owner_id`
-- references `auth.users(id)` and no brand has ever had an account. Until
-- then the catalogue is written by KOI's own tooling only.
-- ============================================================================

-- ── Nobody writes the catalogue with the public key ─────────────────────────
REVOKE INSERT, UPDATE, DELETE ON public.products              FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.skus                  FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.screening_reports     FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.sku_nutrition         FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.brands                FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.uploads               FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.onboarding_submissions FROM anon, authenticated;

-- ── RLS on, with policies in the same migration ─────────────────────────────
-- Enabling RLS without a policy denies everything, so each table that must
-- stay readable gets its SELECT policy here rather than in a later file.
ALTER TABLE public.products              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.skus                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sku_nutrition         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.screening_reports     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brands                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.uploads               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_submissions ENABLE ROW LEVEL SECURITY;

-- The catalogue is public by intention: it is what the storefront shows, and
-- what KOI publishes about the food it has screened. Reading it was never the
-- problem; writing it was.
CREATE POLICY "Catalogue is public" ON public.products
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Catalogue is public" ON public.skus
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Catalogue is public" ON public.sku_nutrition
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Catalogue is public" ON public.screening_reports
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Catalogue is public" ON public.brands
  FOR SELECT TO anon, authenticated USING (true);

-- `uploads` and `onboarding_submissions` get NO policy, so they are now
-- reachable only by `service_role`.
--
-- These are not catalogue. `uploads` is label photography and the file paths
-- behind it; `onboarding_submissions` holds what a brand typed about itself
-- before it had an account — contacts, commercial detail — and anon could
-- previously SELECT every row of it, not merely its own. There is no key by
-- which an anonymous reader could be limited to their own submission, so the
-- honest position is none of it. The onboarding draft-resume path reads it by
-- an id kept in localStorage and stops working here; it needs a server route
-- when brand onboarding comes back.
