-- ============================================================================
-- KOI — Identity: the Firebase UID becomes the customer key
--
-- The app authenticates with Firebase; migrations 00006/00007 assumed Supabase
-- Auth (`uuid REFERENCES auth.users(id)`, RLS via `auth.uid()`). Nothing in the
-- app ever creates a Supabase Auth session, so auth.uid() is always NULL and a
-- 28-character Firebase UID cannot live in a uuid column. Those migrations were
-- never applied to the live project, so this creates the customer tier fresh
-- with text keys rather than retyping anything.
--
-- Every policy routes through koi_uid(), which returns the Firebase `sub` ONLY
-- when the token's issuer and audience match KOI's own Firebase project. That
-- check is the whole point: without it, a token minted by ANY Firebase project
-- would satisfy these policies.
--
-- Policies are written TO public, not TO authenticated: a Firebase ID token
-- carries no `role` claim, so Supabase runs the query as `anon`. Gating on the
-- verified claim rather than the Postgres role makes them correct either way,
-- and still correct once a role custom-claim is added.
--
-- PREREQUISITE: Supabase Dashboard → Authentication → Sign In / Providers →
-- Third Party Auth → Firebase must be enabled, and koi_settings must carry the
-- real project id (see below). Until both are done koi_uid() returns NULL and
-- these tables deny everything — which is the safe direction to fail.
-- ============================================================================

-- ── Where the Firebase project id lives ─────────────────────────────────────
-- One row, so swapping projects is an UPDATE rather than a function rewrite.
-- Service-role only: RLS on with no policies denies anon and authenticated.
CREATE TABLE IF NOT EXISTS koi_settings (
  key        text PRIMARY KEY,
  value      text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE koi_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON koi_settings FROM anon, authenticated;

-- !! REPLACE BEFORE THIS DOES ANYTHING !!
--    UPDATE koi_settings SET value = '<your-firebase-project-id>', updated_at = now()
--     WHERE key = 'firebase_project_id';
-- The sentinel below can never match a real issuer, so every policy denies
-- until it is replaced.
INSERT INTO koi_settings (key, value) VALUES
  ('firebase_project_id', 'REPLACE_ME_FIREBASE_PROJECT_ID')
ON CONFLICT (key) DO NOTHING;

-- ── The verified caller ─────────────────────────────────────────────────────
-- SECURITY DEFINER so it can read koi_settings while callers cannot.
-- STABLE so Postgres evaluates it once per statement rather than per row.
CREATE OR REPLACE FUNCTION public.koi_uid()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN auth.jwt() ->> 'iss' = 'https://securetoken.google.com/' || s.value
     AND auth.jwt() ->> 'aud' = s.value
    THEN auth.jwt() ->> 'sub'
  END
  FROM koi_settings s
  WHERE s.key = 'firebase_project_id';
$$;

COMMENT ON FUNCTION public.koi_uid() IS
  'The authenticated Firebase UID, or NULL when the token is absent or was not issued by KOI''s Firebase project. Every customer-tier RLS policy gates on this.';

-- Shared updated_at trigger (00006 defined this but was never applied).
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ── Customer profile ────────────────────────────────────────────────────────
-- `id` is the Firebase UID: text, not uuid, and not a foreign key into
-- auth.users, which holds no KOI customers.
CREATE TABLE IF NOT EXISTS customer_profiles (
  id           text PRIMARY KEY,
  display_name text,
  email        text,
  phone        text,
  city         text,
  state        text,
  country      text DEFAULT 'India',
  -- The delivery area availability is actually decided in. LocationContext
  -- resolves both and previously had nowhere to put them.
  area         text,
  pincode      text,
  lat          double precision,
  lng          double precision,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_customer_profiles_phone
  ON customer_profiles (phone) WHERE phone IS NOT NULL;

-- ── Delivery addresses ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS delivery_addresses (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id   text NOT NULL REFERENCES customer_profiles(id) ON DELETE CASCADE,
  label        text,
  full_name    text,
  phone        text,
  house_number text,
  street       text NOT NULL,
  landmark     text,
  city         text NOT NULL,
  state        text NOT NULL,
  pincode      text NOT NULL,
  lat          double precision,
  lng          double precision,
  is_default   boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_delivery_addresses_profile
  ON delivery_addresses (profile_id);

-- ── Reference catalogs ──────────────────────────────────────────────────────
-- Keys MUST match web/src/lib/recommendation/config.js. Seeded from that file,
-- not from 00007, which had drifted: it carried 'bread' and 'pasta' that the UI
-- never offers, and lacked 'honey' that it does — so a shopper selecting honey
-- would have failed the foreign key below.
CREATE TABLE IF NOT EXISTS food_item (
  key        text PRIMARY KEY,
  label      text NOT NULL,
  food_group text
);

CREATE TABLE IF NOT EXISTS avoided_item (
  key   text PRIMARY KEY,
  label text NOT NULL,
  kind  text NOT NULL CHECK (kind IN ('allergen', 'ingredient', 'attribute')),
  -- 'hard' eliminates in the engine's eligibility filter; 'soft' only
  -- penalises during scoring. The distinction is a safety boundary.
  mode  text NOT NULL DEFAULT 'hard' CHECK (mode IN ('hard', 'soft'))
);

CREATE TABLE IF NOT EXISTS meal_slot (
  key        text PRIMARY KEY,
  label      text NOT NULL,
  sort_order int NOT NULL DEFAULT 0
);

INSERT INTO food_item (key, label, food_group) VALUES
  ('chicken','Chicken','protein'), ('eggs','Eggs','protein'), ('fish','Fish','protein'),
  ('paneer','Paneer','protein'), ('tofu','Tofu','protein'), ('greek_yogurt','Greek Yogurt','protein'),
  ('protein_powder','Protein Powder','protein'),
  ('oats','Oats','grain'), ('rice','Rice','grain'), ('millets','Millets','grain'),
  ('granola','Granola','grain'), ('muesli','Muesli','grain'),
  ('nuts','Nuts','snack'), ('seeds','Seeds','snack'), ('peanut_butter','Peanut Butter','snack'),
  ('fruits','Fruits','snack'), ('dark_chocolate','Dark Chocolate','snack'),
  ('protein_bars','Protein Bars','snack'), ('cookies','Cookies','snack'),
  ('healthy_desserts','Healthy Desserts','snack'), ('honey','Honey','snack'),
  ('coffee','Coffee','beverage'), ('tea','Tea','beverage'), ('smoothies','Smoothies','beverage')
ON CONFLICT (key) DO NOTHING;

INSERT INTO avoided_item (key, label, kind, mode) VALUES
  ('peanuts','Peanuts','allergen','hard'), ('soy','Soy','allergen','hard'),
  ('gluten','Gluten','allergen','hard'), ('milk','Milk','allergen','hard'),
  ('lactose','Lactose','allergen','hard'), ('eggs','Eggs','allergen','hard'),
  ('fish','Fish','allergen','hard'), ('shellfish','Shellfish','allergen','hard'),
  ('red_meat','Red Meat','ingredient','hard'), ('caffeine','Caffeine','ingredient','hard'),
  ('artificial_sweeteners','Artificial Sweeteners','attribute','soft'),
  ('palm_oil','Palm Oil','ingredient','soft'), ('refined_sugar','Refined Sugar','attribute','soft'),
  ('high_sodium','High Sodium','attribute','soft'), ('preservatives','Preservatives','attribute','soft'),
  ('artificial_colours','Artificial Colours','attribute','soft'),
  ('artificial_flavours','Artificial Flavours','attribute','soft'), ('spicy','Spicy Food','attribute','soft')
ON CONFLICT (key) DO NOTHING;

INSERT INTO meal_slot (key, label, sort_order) VALUES
  ('breakfast','Breakfast',1), ('lunch','Lunch',2), ('dinner','Dinner',3), ('snacks','Snacks',4),
  ('pre_workout','Pre Workout',5), ('post_workout','Post Workout',6),
  ('late_night','Late Night',7), ('office_snacks','Office Snacks',8)
ON CONFLICT (key) DO NOTHING;

-- ── Single-value preferences ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_health_profile (
  profile_id       text PRIMARY KEY REFERENCES customer_profiles(id) ON DELETE CASCADE,
  gender           text CHECK (gender IN ('male', 'female', 'other')),
  age              int  CHECK (age BETWEEN 10 AND 100),
  height_cm        numeric(5,1) CHECK (height_cm BETWEEN 100 AND 260),
  weight_kg        numeric(5,1) CHECK (weight_kg BETWEEN 25 AND 300),
  goal_weight_kg   numeric(5,1),
  activity_level   text CHECK (activity_level IN ('sedentary','light','moderate','active')),
  goal             text CHECK (goal IN ('fatloss','muscle','maintenance','wellness','weight_gain','heart_health','gut_health','high_protein','low_sugar')),
  -- Derived daily targets, stored so the engine reads them directly.
  target_kcal      int,
  target_protein_g int,
  target_carbs_g   int,
  target_fat_g     int,
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_diet_type (
  profile_id text PRIMARY KEY REFERENCES customer_profiles(id) ON DELETE CASCADE,
  diet_type  text NOT NULL CHECK (diet_type IN ('vegetarian','eggetarian','vegan','jain','non_vegetarian','pescatarian')),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_budget_preference (
  profile_id text PRIMARY KEY REFERENCES customer_profiles(id) ON DELETE CASCADE,
  budget     text NOT NULL CHECK (budget IN ('low','medium','high','any')),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_cooking_preference (
  profile_id text PRIMARY KEY REFERENCES customer_profiles(id) ON DELETE CASCADE,
  cooking    text NOT NULL CHECK (cooking IN ('ready_to_eat','instant','needs_cooking','any')),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ── Multi-value preferences ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_food_preference (
  profile_id text NOT NULL REFERENCES customer_profiles(id) ON DELETE CASCADE,
  food_key   text NOT NULL REFERENCES food_item(key) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (profile_id, food_key)
);

CREATE TABLE IF NOT EXISTS user_avoided_food (
  profile_id text NOT NULL REFERENCES customer_profiles(id) ON DELETE CASCADE,
  avoid_key  text NOT NULL REFERENCES avoided_item(key) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (profile_id, avoid_key)
);

CREATE TABLE IF NOT EXISTS user_meal_preference (
  profile_id text NOT NULL REFERENCES customer_profiles(id) ON DELETE CASCADE,
  meal_key   text NOT NULL REFERENCES meal_slot(key) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (profile_id, meal_key)
);

CREATE INDEX IF NOT EXISTS idx_user_food_pref_profile ON user_food_preference (profile_id);
CREATE INDEX IF NOT EXISTS idx_user_avoided_profile   ON user_avoided_food (profile_id);
CREATE INDEX IF NOT EXISTS idx_user_meal_pref_profile ON user_meal_preference (profile_id);

-- ── Triggers ────────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_customer_profiles_updated_at ON customer_profiles;
CREATE TRIGGER trg_customer_profiles_updated_at
  BEFORE UPDATE ON customer_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_delivery_addresses_updated_at ON delivery_addresses;
CREATE TRIGGER trg_delivery_addresses_updated_at
  BEFORE UPDATE ON delivery_addresses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── RLS: a shopper reaches only their own rows ──────────────────────────────
ALTER TABLE customer_profiles  ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_addresses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS customer_profiles_self ON customer_profiles;
CREATE POLICY customer_profiles_self ON customer_profiles
  FOR ALL TO public
  USING (id = public.koi_uid())
  WITH CHECK (id = public.koi_uid());

DROP POLICY IF EXISTS delivery_addresses_self ON delivery_addresses;
CREATE POLICY delivery_addresses_self ON delivery_addresses
  FOR ALL TO public
  USING (profile_id = public.koi_uid())
  WITH CHECK (profile_id = public.koi_uid());

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'user_health_profile','user_diet_type','user_budget_preference',
    'user_cooking_preference','user_food_preference','user_avoided_food','user_meal_preference'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I;', t || '_self', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL TO public USING (profile_id = public.koi_uid()) WITH CHECK (profile_id = public.koi_uid());',
      t || '_self', t
    );
  END LOOP;
END $$;

-- Reference catalogs are public read-only: they describe the options the UI
-- offers, not anyone's data.
ALTER TABLE food_item    ENABLE ROW LEVEL SECURITY;
ALTER TABLE avoided_item ENABLE ROW LEVEL SECURITY;
ALTER TABLE meal_slot    ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS food_item_read    ON food_item;
DROP POLICY IF EXISTS avoided_item_read ON avoided_item;
DROP POLICY IF EXISTS meal_slot_read    ON meal_slot;
CREATE POLICY food_item_read    ON food_item    FOR SELECT TO public USING (true);
CREATE POLICY avoided_item_read ON avoided_item FOR SELECT TO public USING (true);
CREATE POLICY meal_slot_read    ON meal_slot    FOR SELECT TO public USING (true);

REVOKE INSERT, UPDATE, DELETE ON food_item, avoided_item, meal_slot FROM anon, authenticated;

-- ── Lock down tables the browser never touches ──────────────────────────────
-- Verified: no code path in web/src reads or writes any of these. RLS on with
-- zero policies denies anon and authenticated outright; service_role bypasses
-- RLS, so server-side work is unaffected. The REVOKE is belt and braces so a
-- later blanket grant cannot quietly reopen them.
--
-- Deliberately NOT included: products, skus, sku_nutrition, screening_reports,
-- brands, uploads and onboarding_submissions. The storefront reads the first
-- five (brands, sku_nutrition and screening_reports as embedded selects) and
-- the brand dashboard writes the rest from the browser. Those need the Firebase
-- third-party provider live first, or the brand module loses its write path.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'brand_contacts','brand_payout_accounts','audit_logs','ai_extraction_jobs',
    'inventory','ingredients_master','sku_ingredients',
    'onboarding_drafts','onboarding_sessions'
  ] LOOP
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = t) THEN
      EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
      EXECUTE format('REVOKE ALL ON %I FROM anon, authenticated;', t);
    END IF;
  END LOOP;
END $$;
