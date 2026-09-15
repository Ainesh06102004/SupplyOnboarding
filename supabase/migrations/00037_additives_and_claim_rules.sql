-- ============================================================================
-- KOI — Additives, the shopper filters they raise, and claim rules as data
--
-- Phase 2.2.
--
-- ADDITIVES. The storefront has always offered "avoid preservatives",
-- "artificial colours", "artificial sweeteners" and "artificial flavours",
-- and nothing ever set those flags on a product: a shopper choosing them
-- changed nothing. The 80 additives in ingredients_master already carried
-- their INS codes; this makes the facts explicit and turns them into flags.
--
--   food.additive         one row per INS code: functional class (FSSAI's
--                         classes), whether FSSAI permits it, and its origin
--                         (synthetic, natural, mineral) where that decides a
--                         shopper filter.
--   food.ingredient_flag  which ingredients raise which shopper filter, and
--                         the rule that says so:
--                           artificial_colour     a synthetic or mineral colour
--                           artificial_sweetener  a synthetic sweetener (not
--                                                 stevia, not sugar alcohols)
--                           preservatives         the preservative class, plus
--                                                 the synthetic antioxidants
--                                                 BHA, BHT and TBHQ
--                           artificial_flavour    FSSAI's "artificial
--                                                 flavouring substances" class
--                                                 (not "nature identical")
--   The two flavouring classes FSSAI labels are added as ingredients, and
--   their names join the allergen graph's matcher.
--
-- CLAIM RULES. FSSAI (Advertising and Claims) Regulations, 2018, Schedule I,
-- lived as constants in web/src/lib/nutrition/claims.js. They are now data:
--
--   food.claim_rule_set   named, versioned rule sets; exactly one active.
--   food.claim_rule       each condition of a claim. Conditions in the same
--                         clause_group must all hold; the claim holds if any
--                         group does. KOI's stricter high-protein rule is
--                         recorded as such (authority koi_stricter).
--
-- The code reads compiled copies (web/scripts/buildAllergenLexicon.mjs and
-- web/scripts/buildClaimRules.mjs, each with --check), so the browser and
-- server agree with the database. Editorial reference data: public SELECT by
-- grant and policy, written by the service role only.
-- ============================================================================

-- ── Flavouring classes as ingredients ───────────────────────────────────────

INSERT INTO food.ingredients_master (canonical_name, aliases, ingredient_category, risk_level, is_blocked, notes)
SELECT v.canonical_name, v.aliases, 'flavouring', v.risk_level, false, v.notes
FROM (VALUES
  ('Artificial Flavouring Substances',
   '["artificial flavouring substances","artificial flavoring substances","artificial flavouring","artificial flavoring","artificial flavour","artificial flavours","artificial flavor","artificial flavors"]'::jsonb,
   'caution',
   'FSSAI labelling class, declared as "Contains added flavour (Artificial flavouring substances)".'),
  ('Nature Identical Flavouring Substances',
   '["nature identical flavouring substances","nature identical flavoring substances","nature identical flavouring","nature identical flavour","nature identical flavours"]'::jsonb,
   'safe',
   'Made to be chemically identical to natural flavour molecules. FSSAI labels them apart from artificial flavours, and KOI does not count them as artificial.')
) AS v(canonical_name, aliases, risk_level, notes)
WHERE NOT EXISTS (SELECT 1 FROM food.ingredients_master m WHERE m.canonical_name = v.canonical_name);

SELECT food.sync_ingredient_aliases();

-- ── Additives ───────────────────────────────────────────────────────────────

CREATE TABLE food.additive (
  ins_code         text PRIMARY KEY CHECK (ins_code ~ '^[0-9]{3,4}[a-z]?$'),
  ingredient_id    uuid NOT NULL REFERENCES food.ingredients_master(id) ON DELETE CASCADE,
  functional_class text NOT NULL CHECK (functional_class IN (
    'colour', 'preservative', 'antioxidant', 'emulsifier', 'stabiliser', 'thickener', 'acidity_regulator',
    'raising_agent', 'anticaking_agent', 'flavour_enhancer', 'sweetener', 'humectant', 'glazing_agent',
    'flour_treatment_agent')),
  origin           text CHECK (origin IN ('synthetic', 'natural', 'mineral')),
  fssai_permitted  boolean NOT NULL,
  source           text NOT NULL DEFAULT 'koi_editorial',
  source_ref       text,
  notes            text
);

COMMENT ON COLUMN food.additive.origin IS
  'Set where it decides a shopper filter (colours, sweeteners, antioxidants, preservatives); NULL elsewhere rather than guessed.';

INSERT INTO food.additive (ins_code, ingredient_id, functional_class, fssai_permitted, source_ref)
SELECT DISTINCT ON (c.code)
  c.code,
  m.id,
  CASE m.ingredient_category
    WHEN 'anticaking' THEN 'anticaking_agent'
    WHEN 'flour_treatment' THEN 'flour_treatment_agent'
    WHEN 'refined_carb' THEN 'thickener'
    ELSE m.ingredient_category
  END,
  -- FSSAI withdrew potassium bromate (INS 924) in 2016. Stated here rather than
  -- read from is_blocked, which is KOI's own decision and can differ.
  c.code <> '924',
  'FSSAI (Food Products Standards and Food Additives) Regulations, 2011; Codex International Numbering System'
FROM (
  SELECT ia.ingredient_id, substring(ia.normalised FROM '^ins ([0-9]{3,4}[a-z]?)$') AS code
  FROM food.ingredient_alias ia
  WHERE ia.normalised ~ '^ins [0-9]{3,4}[a-z]?$'
) AS c
JOIN food.ingredients_master m ON m.id = c.ingredient_id
ORDER BY c.code;

UPDATE food.additive SET origin = 'synthetic' WHERE ins_code IN (
  '102', '104', '110', '122', '124', '127', '129', '132', '133', '143',   -- synthetic colours
  '950', '951', '954', '955', '961',                                        -- synthetic sweeteners
  '319', '320', '321',                                                      -- TBHQ, BHA, BHT
  '200', '202', '210', '211', '220', '223', '224', '250', '251', '282'      -- synthetic preservatives
);
UPDATE food.additive SET origin = 'mineral' WHERE ins_code = '171';
UPDATE food.additive SET origin = 'natural' WHERE ins_code IN (
  '100', '120', '150a', '150b', '150c', '150d', '160a', '160b', '160c', '162', '163',
  '960', '300', '306', '307', '234', '235', '1105'
);

-- ── Which ingredients raise which shopper filter ────────────────────────────

CREATE TABLE food.ingredient_flag (
  ingredient_id uuid NOT NULL REFERENCES food.ingredients_master(id) ON DELETE CASCADE,
  flag          text NOT NULL CHECK (flag IN ('artificial_colour', 'preservatives', 'artificial_sweetener', 'artificial_flavour')),
  rule          text NOT NULL,
  source        text NOT NULL DEFAULT 'koi_editorial',
  PRIMARY KEY (ingredient_id, flag)
);

INSERT INTO food.ingredient_flag (ingredient_id, flag, rule)
SELECT DISTINCT ingredient_id, 'artificial_colour', 'A synthetic or mineral colour.'
FROM food.additive WHERE functional_class = 'colour' AND origin IN ('synthetic', 'mineral')
UNION
SELECT DISTINCT ingredient_id, 'artificial_sweetener', 'A synthetic high-intensity sweetener.'
FROM food.additive WHERE functional_class = 'sweetener' AND origin = 'synthetic'
UNION
SELECT DISTINCT ingredient_id, 'preservatives', 'Its functional class is preservative.'
FROM food.additive WHERE functional_class = 'preservative'
UNION
SELECT DISTINCT ingredient_id, 'preservatives', 'A synthetic antioxidant that keeps fats from going rancid.'
FROM food.additive WHERE functional_class = 'antioxidant' AND origin = 'synthetic'
UNION
SELECT id, 'artificial_flavour', 'FSSAI''s artificial flavouring substances class.'
FROM food.ingredients_master WHERE canonical_name = 'Artificial Flavouring Substances';

DO $$
DECLARE
  v_colour integer := (SELECT count(*) FROM food.ingredient_flag WHERE flag = 'artificial_colour');
  v_preservative integer := (SELECT count(*) FROM food.ingredient_flag WHERE flag = 'preservatives');
  v_sweetener integer := (SELECT count(*) FROM food.ingredient_flag WHERE flag = 'artificial_sweetener');
  v_flavour integer := (SELECT count(*) FROM food.ingredient_flag WHERE flag = 'artificial_flavour');
BEGIN
  IF v_colour <> 11 OR v_preservative <> 16 OR v_sweetener <> 5 OR v_flavour <> 1 THEN
    RAISE EXCEPTION 'unexpected shopper-filter counts: colour %, preservatives %, sweetener %, flavour %',
      v_colour, v_preservative, v_sweetener, v_flavour;
  END IF;
END;
$$;

-- ── Claim rules ─────────────────────────────────────────────────────────────

CREATE TABLE food.claim_rule_set (
  rule_version text PRIMARY KEY CHECK (rule_version ~ '^claims-v[0-9]+$'),
  active       boolean NOT NULL DEFAULT false,
  notes        text,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX claim_rule_set_one_active ON food.claim_rule_set (active) WHERE active;

CREATE TABLE food.claim_rule (
  rule_version text NOT NULL REFERENCES food.claim_rule_set(rule_version) ON DELETE CASCADE,
  claim_key    text NOT NULL CHECK (claim_key IN ('high_protein', 'high_fibre', 'low_sugar', 'sugar_free')),
  clause_group smallint NOT NULL CHECK (clause_group > 0),
  nutrient     text NOT NULL CHECK (nutrient IN ('protein_g', 'fibre_g', 'sugars_g')),
  basis        text NOT NULL CHECK (basis IN ('per_100', 'per_100kcal', 'per_serving')),
  form         text NOT NULL CHECK (form IN ('any', 'solid', 'liquid')),
  comparator   text NOT NULL CHECK (comparator IN ('gte', 'lte')),
  threshold    numeric NOT NULL CHECK (threshold >= 0),
  authority    text NOT NULL CHECK (authority IN ('fssai_schedule_i', 'koi_stricter')),
  source_ref   text NOT NULL,
  notes        text,
  PRIMARY KEY (rule_version, claim_key, clause_group, nutrient, basis, form)
);

COMMENT ON COLUMN food.claim_rule.basis IS
  'per_100 is per 100 g for a solid and per 100 ml for a drink; per_100kcal is unit-free; per_serving uses the declared serving.';

INSERT INTO food.claim_rule_set (rule_version, active, notes) VALUES
  ('claims-v1', true, 'FSSAI (Advertising and Claims) Regulations, 2018, Schedule I, with KOI''s stricter high-protein rule.');

INSERT INTO food.claim_rule (rule_version, claim_key, clause_group, nutrient, basis, form, comparator, threshold, authority, source_ref, notes) VALUES
  ('claims-v1', 'high_fibre',   1, 'fibre_g',   'per_100',     'solid',  'gte', 6,   'fssai_schedule_i', 'FSSAI (Advertising and Claims) Regulations, 2018, Schedule I', NULL),
  ('claims-v1', 'high_fibre',   2, 'fibre_g',   'per_100kcal', 'any',    'gte', 3,   'fssai_schedule_i', 'FSSAI (Advertising and Claims) Regulations, 2018, Schedule I', 'The energy route is unit-free, so it serves drinks too.'),
  ('claims-v1', 'low_sugar',    1, 'sugars_g',  'per_100',     'solid',  'lte', 5,   'fssai_schedule_i', 'FSSAI (Advertising and Claims) Regulations, 2018, Schedule I', NULL),
  ('claims-v1', 'low_sugar',    2, 'sugars_g',  'per_100',     'liquid', 'lte', 2.5, 'fssai_schedule_i', 'FSSAI (Advertising and Claims) Regulations, 2018, Schedule I', NULL),
  ('claims-v1', 'sugar_free',   1, 'sugars_g',  'per_100',     'any',    'lte', 0.5, 'fssai_schedule_i', 'FSSAI (Advertising and Claims) Regulations, 2018, Schedule I', NULL),
  ('claims-v1', 'high_protein', 1, 'protein_g', 'per_100',     'any',    'gte', 12,  'koi_stricter',     'KOI; Schedule I asks for 20% of the ICMR RDA per 100 g (10% per 100 ml or 100 kcal)', 'Dense enough for the claim to mean something.'),
  ('claims-v1', 'high_protein', 1, 'protein_g', 'per_serving', 'any',    'gte', 5,   'koi_stricter',     'KOI', 'And enough in a real serving: density alone put the badge on a 0.1 g pinch of saffron.');

-- ── Access ──────────────────────────────────────────────────────────────────

ALTER TABLE food.additive ENABLE ROW LEVEL SECURITY;
ALTER TABLE food.ingredient_flag ENABLE ROW LEVEL SECURITY;
ALTER TABLE food.claim_rule_set ENABLE ROW LEVEL SECURITY;
ALTER TABLE food.claim_rule ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON food.additive, food.ingredient_flag, food.claim_rule_set, food.claim_rule TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON food.additive, food.ingredient_flag, food.claim_rule_set, food.claim_rule TO service_role;

CREATE POLICY "Additive facts are public" ON food.additive FOR SELECT USING (true);
CREATE POLICY "Additive facts are public" ON food.ingredient_flag FOR SELECT USING (true);
CREATE POLICY "Claim rules are public" ON food.claim_rule_set FOR SELECT USING (true);
CREATE POLICY "Claim rules are public" ON food.claim_rule FOR SELECT USING (true);
