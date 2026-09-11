-- ============================================================================
-- KOI — anon cannot empty a table
--
-- 00012 revoked DELETE on the catalogue from anon and authenticated, so a
-- leaked anon key could no longer remove products. It left TRUNCATE, which
-- does the same thing to the whole table at once and is not subject to RLS or
-- to the DELETE grant. As of 11 Sep 2026 anon held TRUNCATE on products,
-- skus, sku_nutrition and every other table in public, because public's
-- default ACL grants it (arwdDxtm) on anything postgres creates there.
--
-- PostgREST never issues TRUNCATE, so no request path loses anything. The
-- privilege was only ever reachable through a function or a future feature
-- that trusted the grant; this removes it before either exists.
--
-- The default is changed too, so the next table in public is not born with it.
-- Tables created by supabase_admin follow that role's own defaults, which this
-- role cannot alter; the dashboard and every migration here run as postgres.
-- ============================================================================

REVOKE TRUNCATE ON ALL TABLES IN SCHEMA public FROM anon, authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE TRUNCATE ON TABLES FROM anon, authenticated;
