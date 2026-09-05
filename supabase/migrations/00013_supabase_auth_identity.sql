-- ============================================================================
-- KOI — Identity: Supabase Auth replaces Firebase
--
-- 00008 made the Firebase UID the customer key and routed every customer-tier
-- RLS policy through public.koi_uid(). That indirection is why this migration
-- is twelve lines of real change instead of a schema rewrite: koi_uid() is the
-- ONLY place any policy learns who is calling, so swapping the identity
-- provider means swapping one function body.
--
-- WHY THE COLUMNS DO NOT MOVE:
-- Every profile key is `text` — chosen in 00008 because a 28-character Firebase
-- UID will not fit a uuid column. A Supabase Auth id IS a uuid, and a uuid
-- casts to text losslessly, so `text` stays correct. Widening was never the
-- constraint; narrowing would be. Nothing about customer_profiles(id),
-- delivery_addresses(profile_id), the seven user_* tables, connected_accounts
-- or fulfilment_intents changes.
--
-- WHY NO BACKFILL:
-- customer_profiles and delivery_addresses are both empty on the live project
-- (checked 5 Sep 2026). No Firebase UID was ever persisted, so there is nothing
-- to translate and no dual-key window to keep open. If that ever stops being
-- true, this migration is the wrong shape and a uid-mapping table is needed.
--
-- WHAT auth.uid() GIVES US THAT THE FIREBASE CHECK HAD TO HAND-ROLL:
-- The old body compared `iss` and `aud` against koi_settings by hand, because a
-- Firebase token reaching Supabase as a third-party credential is only
-- trustworthy if it came from KOI's own Firebase project. auth.uid() has no
-- such hole: GoTrue signs the token with this project's secret and Postgres
-- rejects any other signature before a policy is ever consulted. The manual
-- issuer check disappears because the thing it was defending against does.
--
-- ROLE NOTE:
-- Policies are written TO public, which covers `anon` and `authenticated`
-- alike. That was a workaround in 00008 — a Firebase token carries no `role`
-- claim, so every query ran as `anon`. Under Supabase Auth a signed-in caller
-- genuinely is `authenticated`, so the policies would now be correct written
-- either way. They stay TO public because rewriting ten working policies to
-- change nothing observable is risk without benefit.
-- ============================================================================

-- ── The verified caller ─────────────────────────────────────────────────────
-- Returns the signed-in Supabase Auth user id as text, or NULL when the request
-- carries no valid session. NULL makes every customer-tier policy deny, which
-- is what a signed-out guest should get: the catalogue is public, their data is
-- not.
CREATE OR REPLACE FUNCTION public.koi_uid()
RETURNS text
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT auth.uid()::text;
$$;

COMMENT ON FUNCTION public.koi_uid() IS
  'The authenticated Supabase Auth user id as text, or NULL when signed out. Every customer-tier RLS policy gates on this. Kept as text because the customer key columns are text (see 00008); kept as a function so the identity provider can change again without touching a policy.';

-- ── Retire the Firebase project id ──────────────────────────────────────────
-- koi_uid() no longer reads it, so leaving it would be a live-looking setting
-- that controls nothing — the kind of thing someone later "fixes" by pointing
-- it at a new project and wonders why nothing happens. The table itself stays;
-- it is a general settings store, not a Firebase artefact.
DELETE FROM koi_settings WHERE key = 'firebase_project_id';

-- ── Customer-tier grants, made explicit ─────────────────────────────────────
-- These tables have always relied on Supabase's default privileges, which grant
-- to anon and authenticated alike. That is still true, so this changes nothing
-- today — but the identity switch moves every signed-in caller from `anon` to
-- `authenticated`, and a migration that depends on an invisible default for its
-- correctness is one dashboard change away from a silent 401. State it.
--
-- DELETE is included deliberately: a shopper removing a saved address is an
-- ordinary action. RLS still bounds every one of these to the caller's own rows.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'customer_profiles','delivery_addresses',
    'user_health_profile','user_diet_type','user_budget_preference',
    'user_cooking_preference','user_food_preference','user_avoided_food',
    'user_meal_preference'
  ] LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO authenticated;', t);
    -- anon keeps its grant so an unauthenticated request reaches RLS and is
    -- denied by policy, rather than failing earlier with a privilege error that
    -- reads like an outage. Guests are refused rows, not the table.
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO anon;', t);
  END LOOP;
END $$;

-- ── Every auth user gets a customer profile ─────────────────────────────────
-- delivery_addresses.profile_id and all seven user_* tables carry a foreign key
-- to customer_profiles(id), so a shopper with no profile row cannot save an
-- address or a diet preference — the insert fails on the FK, not on RLS, which
-- makes it read like a bug rather than a missing step.
--
-- Under phone OTP the app asked for a name in a third modal step and wrote the
-- profile by hand. Google returns the name and email with the identity, so
-- there is nothing left to ask and no reason to leave it to the client: a
-- profile is now a consequence of signing up, created in the same transaction.
--
-- SECURITY DEFINER because the trigger runs as GoTrue's role, which has no
-- privileges on public.customer_profiles.
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Google supplies the display name as `full_name`, other providers as `name`.
  -- Both may be absent; the column is nullable and the UI renders no
  -- placeholder for a name it was not given.
  INSERT INTO public.customer_profiles (id, display_name, email)
  VALUES (
    NEW.id::text,
    coalesce(
      NEW.raw_user_meta_data ->> 'full_name',
      NEW.raw_user_meta_data ->> 'name'
    ),
    NEW.email
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

-- Backfill anyone who signed up before the trigger existed. Idempotent.
INSERT INTO public.customer_profiles (id, display_name, email)
SELECT
  u.id::text,
  coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name'),
  u.email
FROM auth.users u
ON CONFLICT (id) DO NOTHING;
