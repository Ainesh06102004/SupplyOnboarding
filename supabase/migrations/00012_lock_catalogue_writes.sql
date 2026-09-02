-- ============================================================================
-- KOI — Take write access to catalogue data away from the anon key
--
-- THE PROBLEM, verified against this database:
--   `anon` held SELECT, INSERT, UPDATE and DELETE on all seven tables that do
--   not enforce RLS — including `screening_reports`, which holds every KOI
--   score, and `sku_nutrition`, which holds every declared macro. Anyone with
--   a publishable key could set a score to 99, or an added-sugar figure to 0.
--
--   On a storefront whose entire proposition is that the number was checked,
--   that is the worst-shaped hole available. It was theoretical while the
--   database was empty. It is not empty any more.
--
-- WHY THE GRANT EXISTED:
--   All ten scripts in web/scripts/ seeded the catalogue using the anon key.
--   They now use SUPABASE_SERVICE_ROLE_KEY, so the grant has no purpose.
--
-- WHAT THIS MIGRATION DOES NOT DO:
--   It does not revoke everything, because the brand dashboard and the brand
--   onboarding flow genuinely write with the anon key today:
--
--     products                INSERT, UPDATE   lib/dashboard/productCreation.js
--     skus                    INSERT, UPDATE   (upsert)
--     screening_reports       INSERT           AI screening result
--     uploads                 INSERT           label images
--     onboarding_submissions  INSERT, UPDATE   lib/supabase/saveDraft.js
--
--   Those run unauthenticated because BRANDS HAVE NO IDENTITY IN THIS SYSTEM.
--   brands.owner_id, screening_reports.reviewed_by and uploads.uploaded_by all
--   reference auth.users(id), which has no rows: KOI's shoppers are Firebase
--   accounts and its brands are nothing at all. Closing those five requires
--   deciding what a brand user IS, which is a product decision, not a
--   migration. Until then this narrows the hole rather than pretending to
--   close it.
--
-- WHAT IT DOES CLOSE — the part that needs no decision:
--   · DELETE everywhere. Nothing in the application deletes catalogue rows,
--     so nobody needs the privilege that lets a key holder empty the store.
--   · UPDATE on screening_reports. The app only ever inserts a report. An
--     existing KOI score can no longer be altered through a publishable key.
--   · ALL writes on sku_nutrition. The app never writes it; only seed scripts
--     do, and they are on the service role now. Declared nutrition becomes
--     immutable to anon.
--   · ALL writes on brands. Same reasoning.
--   · UPDATE on uploads. Insert-only in the app.
--
-- SELECT is untouched everywhere: the storefront reads this catalogue with the
-- anon key, including through PostgREST nested selects (products → brands,
-- skus → sku_nutrition, screening_reports), which require SELECT on the joined
-- tables. Revoking any of it would empty the shop.
-- ============================================================================

-- ── Nobody deletes catalogue rows ───────────────────────────────────────────
REVOKE DELETE ON brands, products, skus, sku_nutrition,
                 screening_reports, uploads, onboarding_submissions
  FROM anon, authenticated;

-- ── A published KOI score is not editable by a publishable key ──────────────
-- The screening pipeline inserts a report. It never updates one. Correcting a
-- score is deliberate, auditable, operator work — service role only.
REVOKE UPDATE ON screening_reports FROM anon, authenticated;

-- ── Declared nutrition is immutable to anon ─────────────────────────────────
-- Read by the storefront through a nested select; written only by seed
-- scripts, which now hold the service role.
REVOKE INSERT, UPDATE ON sku_nutrition FROM anon, authenticated;

-- ── Brands likewise ─────────────────────────────────────────────────────────
REVOKE INSERT, UPDATE ON brands FROM anon, authenticated;

-- ── Uploads are insert-only ─────────────────────────────────────────────────
REVOKE UPDATE ON uploads FROM anon, authenticated;

-- ============================================================================
-- STILL OPEN, and deliberately recorded here rather than in a ticket:
--
--   anon may still INSERT into products, skus, screening_reports, uploads and
--   onboarding_submissions, and UPDATE products, skus and
--   onboarding_submissions.
--
--   So a key holder can still add a product with a fabricated score, or change
--   an existing product's name or status. That is strictly less bad than
--   rewriting the score on a real product — but it is not nothing, and it
--   closes only when brand identity exists and those writes move behind an
--   authenticated boundary.
--
--   Sequence when that decision lands:
--     1. Give brands an identity (Firebase, like shoppers, or Supabase Auth).
--     2. Move lib/dashboard/productCreation.js writes behind route handlers
--        that verify it.
--     3. REVOKE INSERT, UPDATE ON products, skus, screening_reports, uploads,
--        onboarding_submissions FROM anon, authenticated;
--     4. ENABLE RLS with a public read policy scoped to status='approved', so
--        draft and rejected products stop being publicly readable too.
-- ============================================================================
