-- ============================================================================
-- SUPERSEDED by 00008_identity_firebase.sql. Do not run.
--
-- This migration was never applied. It keys customer data on
-- `uuid REFERENCES auth.users(id)` with RLS via auth.uid(), which assumes
-- Supabase Auth. KOI authenticates with Firebase: UIDs are 28-character
-- strings that cannot go in a uuid column, and auth.uid() is always NULL
-- because no Supabase Auth session is ever created.
--
-- 00008 creates the same tables with text keys and policies routed through
-- public.koi_uid(). Kept for history only.
-- ============================================================================

-- ============================================================================
-- KOI — User health + food preferences (normalised)
-- Backs the KOI Recommendation Engine (KRE). No JSON blobs: every preference is
-- a first-class row so it can be queried, indexed and joined deterministically.
-- Tied to customer_profiles(id) = auth.users(id).
-- ============================================================================

-- ── Reference catalogs (integrity + stable keys shared with the frontend) ──
CREATE TABLE IF NOT EXISTS food_item (
  key         text PRIMARY KEY,
  label       text NOT NULL,
  food_group  text                       -- 'protein' | 'grain' | 'snack' | 'beverage' | ...
);

CREATE TABLE IF NOT EXISTS avoided_item (
  key         text PRIMARY KEY,
  label       text NOT NULL,
  kind        text NOT NULL CHECK (kind IN ('allergen', 'ingredient', 'attribute')),
  mode        text NOT NULL DEFAULT 'hard' CHECK (mode IN ('hard', 'soft'))
);

CREATE TABLE IF NOT EXISTS meal_slot (
  key         text PRIMARY KEY,
  label       text NOT NULL,
  sort_order  int NOT NULL DEFAULT 0
);

-- ── Single-value preferences (one row per user) ──
CREATE TABLE IF NOT EXISTS user_health_profile (
  profile_id     uuid PRIMARY KEY REFERENCES customer_profiles(id) ON DELETE CASCADE,
  gender         text CHECK (gender IN ('male', 'female', 'other')),
  age            int  CHECK (age BETWEEN 10 AND 100),
  height_cm      numeric(5,1) CHECK (height_cm BETWEEN 100 AND 260),
  weight_kg      numeric(5,1) CHECK (weight_kg BETWEEN 25 AND 300),
  goal_weight_kg numeric(5,1),
  activity_level text CHECK (activity_level IN ('sedentary','light','moderate','active')),
  goal           text CHECK (goal IN ('fatloss','muscle','maintenance','wellness','weight_gain','heart_health','gut_health','high_protein','low_sugar')),
  -- Derived daily targets (kept here so the engine reads them directly)
  target_kcal    int,
  target_protein_g int,
  target_carbs_g int,
  target_fat_g   int,
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_diet_type (
  profile_id uuid PRIMARY KEY REFERENCES customer_profiles(id) ON DELETE CASCADE,
  diet_type  text NOT NULL CHECK (diet_type IN ('vegetarian','eggetarian','vegan','jain','non_vegetarian','pescatarian')),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_budget_preference (
  profile_id uuid PRIMARY KEY REFERENCES customer_profiles(id) ON DELETE CASCADE,
  budget     text NOT NULL CHECK (budget IN ('low','medium','high','any')),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_cooking_preference (
  profile_id uuid PRIMARY KEY REFERENCES customer_profiles(id) ON DELETE CASCADE,
  cooking    text NOT NULL CHECK (cooking IN ('ready_to_eat','instant','needs_cooking','any')),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ── Multi-value preferences (join tables) ──
CREATE TABLE IF NOT EXISTS user_food_preference (   -- foods I love
  profile_id uuid NOT NULL REFERENCES customer_profiles(id) ON DELETE CASCADE,
  food_key   text NOT NULL REFERENCES food_item(key) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (profile_id, food_key)
);

CREATE TABLE IF NOT EXISTS user_avoided_food (       -- foods / ingredients I avoid
  profile_id uuid NOT NULL REFERENCES customer_profiles(id) ON DELETE CASCADE,
  avoid_key  text NOT NULL REFERENCES avoided_item(key) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (profile_id, avoid_key)
);

CREATE TABLE IF NOT EXISTS user_meal_preference (
  profile_id uuid NOT NULL REFERENCES customer_profiles(id) ON DELETE CASCADE,
  meal_key   text NOT NULL REFERENCES meal_slot(key) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (profile_id, meal_key)
);

CREATE INDEX IF NOT EXISTS idx_user_food_pref_profile  ON user_food_preference (profile_id);
CREATE INDEX IF NOT EXISTS idx_user_avoided_profile     ON user_avoided_food (profile_id);
CREATE INDEX IF NOT EXISTS idx_user_meal_pref_profile   ON user_meal_preference (profile_id);

-- ── RLS: users manage only their own rows (mirrors customer_profiles) ──
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'user_health_profile','user_diet_type','user_budget_preference',
    'user_cooking_preference','user_food_preference','user_avoided_food','user_meal_preference'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format($p$CREATE POLICY "own rows" ON %I FOR ALL USING (auth.uid() = profile_id) WITH CHECK (auth.uid() = profile_id);$p$, t);
  END LOOP;
END $$;

-- Catalogs are world-readable reference data.
ALTER TABLE food_item ENABLE ROW LEVEL SECURITY;
ALTER TABLE avoided_item ENABLE ROW LEVEL SECURITY;
ALTER TABLE meal_slot ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read catalog food"    ON food_item    FOR SELECT USING (true);
CREATE POLICY "read catalog avoided" ON avoided_item FOR SELECT USING (true);
CREATE POLICY "read catalog meal"    ON meal_slot    FOR SELECT USING (true);

-- ── Seed catalogs (keys MUST match web/src/lib/recommendation/config.js) ──
INSERT INTO food_item (key, label, food_group) VALUES
  ('chicken','Chicken','protein'), ('eggs','Eggs','protein'), ('fish','Fish','protein'),
  ('paneer','Paneer','protein'), ('tofu','Tofu','protein'), ('greek_yogurt','Greek Yogurt','protein'),
  ('oats','Oats','grain'), ('rice','Rice','grain'), ('millets','Millets','grain'),
  ('nuts','Nuts','snack'), ('seeds','Seeds','snack'), ('peanut_butter','Peanut Butter','snack'),
  ('fruits','Fruits','snack'), ('dark_chocolate','Dark Chocolate','snack'),
  ('protein_bars','Protein Bars','snack'), ('protein_powder','Protein Powder','protein'),
  ('coffee','Coffee','beverage'), ('tea','Tea','beverage'),
  ('cookies','Cookies','snack'), ('granola','Granola','grain'), ('muesli','Muesli','grain'),
  ('bread','Bread','grain'), ('pasta','Pasta','grain'), ('smoothies','Smoothies','beverage'),
  ('healthy_desserts','Healthy Desserts','snack')
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
  ('late_night','Late Night Snack',7), ('office_snacks','Office Snacks',8)
ON CONFLICT (key) DO NOTHING;
