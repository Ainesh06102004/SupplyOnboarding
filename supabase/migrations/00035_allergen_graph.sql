-- ============================================================================
-- KOI — The allergen graph
--
-- Phase 2.1. Until now two keyword lists decided what an ingredient contained:
-- CONTAINS_KEYWORDS for the storefront and STATEMENT_WORDS for the label
-- engine. Both matched SUBSTRINGS, so "butter" made peanut butter and cocoa
-- butter dairy, "egg" was found in eggless, and the graph's own Hindi names
-- ("til", "rai") would have found sesame in lentils and mustard in grain.
--
-- This replaces them with facts about ingredients, kept in `food`:
--
--   food.allergen_family      the FSSAI (Labelling and Display) Regulations
--                             2020 groups, keyed by the storefront's allergen
--                             flags (peanut and tree nut split so each maps to
--                             one avoid key), plus sesame and mustard, which
--                             FSSAI does not list but other regulators do.
--   food.ingredient_alias     every name a label may print for an ingredient,
--                             one owner per name, normalised and trigram
--                             indexed. Taken from ingredients_master.aliases,
--                             with the names the keyword lists knew added.
--   food.ingredient_allergen  which ingredient contains, derives from, or may
--                             contain which allergen, with source and
--                             confidence.
--
-- Where two ingredients printed the same name, the specific one owns it
-- ("groundnut oil" is Groundnut Oil, which links to peanut; "ghee" is Ghee,
-- which links to milk). Two ingredients are added so a longer name is found
-- before a misleading shorter one: Coconut Milk (not dairy) and Sunflower
-- Lecithin (not soy).
--
-- The code reads a compiled copy (web/src/lib/food/allergenLexicon.js, built by
-- web/scripts/buildAllergenLexicon.mjs) with a version hash, and the label
-- engine's evaluation gate now keys on that version too: change the graph and
-- label reading pauses until the evaluation passes on it.
--
-- Editorial reference data, safe to read: public SELECT by grant and policy.
-- Written by the service role only.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

-- ── Families ────────────────────────────────────────────────────────────────

CREATE TABLE food.allergen_family (
  key              text PRIMARY KEY CHECK (key ~ '^[a-z_]+$'),
  label            text NOT NULL,
  fssai_declarable boolean NOT NULL,
  statement_words  text[] NOT NULL DEFAULT '{}',
  source           text NOT NULL DEFAULT 'koi_editorial',
  source_ref       text,
  notes            text
);

COMMENT ON COLUMN food.allergen_family.statement_words IS
  'How an allergen statement names the group ("crustaceans", "cereals containing gluten"). Ingredient names are matched as well.';

INSERT INTO food.allergen_family (key, label, fssai_declarable, statement_words, source_ref, notes) VALUES
  ('gluten',    'Cereals containing gluten', true,  '{gluten,"cereals containing gluten","cereal containing gluten"}', 'FSSAI (Labelling and Display) Regulations, 2020', 'Wheat, rye, barley, oats and spelt, and their products.'),
  ('shellfish', 'Crustaceans',               true,  '{crustacean,crustaceans,shellfish}',                               'FSSAI (Labelling and Display) Regulations, 2020', NULL),
  ('dairy',     'Milk',                      true,  '{milk,dairy,lactose}',                                             'FSSAI (Labelling and Display) Regulations, 2020', 'Milk and milk products.'),
  ('egg',       'Eggs',                      true,  '{egg,eggs}',                                                       'FSSAI (Labelling and Display) Regulations, 2020', NULL),
  ('fish',      'Fish',                      true,  '{fish}',                                                           'FSSAI (Labelling and Display) Regulations, 2020', NULL),
  ('peanut',    'Peanuts',                   true,  '{peanut,peanuts,groundnut,groundnuts}',                            'FSSAI (Labelling and Display) Regulations, 2020', 'FSSAI groups peanuts with tree nuts; KOI splits them so each maps to one avoid key.'),
  ('tree_nut',  'Tree nuts',                 true,  '{"tree nut","tree nuts",nut,nuts}',                                'FSSAI (Labelling and Display) Regulations, 2020', NULL),
  ('soy',       'Soybeans',                  true,  '{soy,soya,soybean,soybeans}',                                      'FSSAI (Labelling and Display) Regulations, 2020', NULL),
  ('sulphite',  'Sulphite (10 mg/kg or more)', true, '{sulphite,sulphites,sulfite,sulfites,"sulphur dioxide"}',          'FSSAI (Labelling and Display) Regulations, 2020', NULL),
  ('sesame',    'Sesame',                    false, '{sesame}',                                                         NULL, 'Declarable in the EU, UK and US, and common in Indian food. Not an FSSAI group.'),
  ('mustard',   'Mustard',                   false, '{mustard}',                                                        NULL, 'Declarable in the EU and UK, and common in Indian food. Not an FSSAI group.');

-- ── Ingredients the matcher needs so a longer name wins ─────────────────────

INSERT INTO food.ingredients_master (canonical_name, aliases, ingredient_category, risk_level, is_blocked, notes)
SELECT v.canonical_name, v.aliases, v.ingredient_category, v.risk_level, false, v.notes
FROM (VALUES
  ('Coconut Milk', '["coconut milk","coconut milk powder","coconut milk solids","coconut cream"]'::jsonb, 'whole_food', 'safe', 'Plant milk. Not a dairy allergen, despite the word.'),
  ('Sunflower Lecithin', '["sunflower lecithin"]'::jsonb, 'emulsifier', 'safe', 'Lecithin from sunflower seed. Not a soy allergen.')
) AS v(canonical_name, aliases, ingredient_category, risk_level, notes)
WHERE NOT EXISTS (SELECT 1 FROM food.ingredients_master m WHERE m.canonical_name = v.canonical_name);

-- Names the storefront's keyword lists recognised and the master did not, plus
-- Hindi names and the longer phrases that keep shorter ones from misfiring.
UPDATE food.ingredients_master m
SET aliases = (SELECT jsonb_agg(DISTINCT x) FROM jsonb_array_elements_text(m.aliases || a.extra) AS x),
    updated_at = now()
FROM (VALUES
  ('Milk',                 '["yogurt","yoghurt","dahi","lactose","buttermilk","chaas","makhan","chhena","mawa","milk fat","milkfat"]'::jsonb),
  ('Egg',                  '["anda"]'::jsonb),
  ('Fish',                 '["salmon","machli","machhli"]'::jsonb),
  ('Crustacean Shellfish', '["jhinga"]'::jsonb),
  ('Peanut',               '["singdana","shengdana","mungfali","moongfali"]'::jsonb),
  ('Tree Nuts',            '["pine nut","chilgoza","marzipan","dry fruit","dry fruits","dryfruit","dryfruits","almond butter","cashew butter","almond milk","cashew nut"]'::jsonb),
  ('Soya',                 '["soyabean","soy milk","soya milk","soya chunks"]'::jsonb),
  ('Wheat',                '["bread","bread crumbs","breadcrumbs","pasta","wholewheat","whole wheat"]'::jsonb),
  ('Gluten',               '["malted","malted barley","cereals containing gluten"]'::jsonb),
  ('Whole Wheat Flour',    '["wholewheat flour"]'::jsonb),
  ('Oats',                 '["oat milk"]'::jsonb),
  ('Vanaspati',            '["vegetable ghee"]'::jsonb)
) AS a(canonical_name, extra)
WHERE m.canonical_name = a.canonical_name;

-- ── Aliases ─────────────────────────────────────────────────────────────────

CREATE TABLE food.ingredient_alias (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ingredient_id uuid NOT NULL REFERENCES food.ingredients_master(id) ON DELETE CASCADE,
  alias         text NOT NULL CHECK (char_length(btrim(alias)) BETWEEN 1 AND 120),
  normalised    text NOT NULL,
  language      text CHECK (language IN ('en', 'hi', 'ins')),
  source        text NOT NULL DEFAULT 'koi_editorial',
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (normalised)
);

COMMENT ON TABLE food.ingredient_alias IS
  'Every name a label may print for an ingredient. One owner per normalised name, so a name never means two ingredients.';

CREATE FUNCTION food.normalise_alias()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.normalised := btrim(regexp_replace(lower(extensions.unaccent('extensions.unaccent'::regdictionary, NEW.alias)), '[^a-z0-9]+', ' ', 'g'));
  IF NEW.language IS NULL AND NEW.normalised ~ '^(ins|e) ?[0-9]{3,4}' THEN
    NEW.language := 'ins';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION food.normalise_alias() FROM PUBLIC;

CREATE TRIGGER normalise_alias BEFORE INSERT OR UPDATE OF alias ON food.ingredient_alias
  FOR EACH ROW EXECUTE FUNCTION food.normalise_alias();

-- One owner per name: the specific ingredient before the allergen group
-- ("groundnut oil" -> Groundnut Oil, not Peanut), and a canonical name before
-- an alias.
INSERT INTO food.ingredient_alias (ingredient_id, alias)
SELECT DISTINCT ON (norm) ingredient_id, alias
FROM (
  SELECT m.id AS ingredient_id, a AS alias,
         btrim(regexp_replace(lower(extensions.unaccent('extensions.unaccent'::regdictionary, a)), '[^a-z0-9]+', ' ', 'g')) AS norm,
         (m.ingredient_category = 'allergen') AS generic, 1 AS rank
  FROM food.ingredients_master m, jsonb_array_elements_text(m.aliases) AS a
  UNION ALL
  SELECT m.id, m.canonical_name,
         btrim(regexp_replace(lower(extensions.unaccent('extensions.unaccent'::regdictionary, m.canonical_name)), '[^a-z0-9]+', ' ', 'g')),
         (m.ingredient_category = 'allergen'), 0
  FROM food.ingredients_master m
) AS names
WHERE norm <> ''
ORDER BY norm, generic, rank;

UPDATE food.ingredient_alias SET language = 'hi'
WHERE language IS NULL AND normalised IN (
  'kaju', 'badam', 'pista', 'akhrot', 'moongphali', 'mungfali', 'moongfali', 'singdana', 'shengdana',
  'til', 'rai', 'sarson', 'makhan', 'dahi', 'chhena', 'mawa', 'malai', 'khoya', 'paneer', 'anda',
  'machli', 'machhli', 'jhinga', 'atta', 'maida', 'suji', 'rava', 'jau', 'chilgoza', 'ghee', 'desi ghee',
  'chaas', 'besan', 'chana', 'haldi', 'namak', 'gur', 'gud', 'chini', 'shahad', 'khajur', 'alsi', 'jai',
  'bajra', 'jowar', 'ragi', 'nachni', 'kuttu', 'rajgira', 'sabudana', 'chawal', 'makhana', 'sendha namak'
);
UPDATE food.ingredient_alias SET language = 'en' WHERE language IS NULL;

CREATE INDEX ingredient_alias_ingredient_idx ON food.ingredient_alias (ingredient_id);
CREATE INDEX ingredient_alias_trgm_idx ON food.ingredient_alias USING gin (normalised extensions.gin_trgm_ops);

-- ── Ingredient → allergen ───────────────────────────────────────────────────

CREATE TABLE food.ingredient_allergen (
  ingredient_id uuid NOT NULL REFERENCES food.ingredients_master(id) ON DELETE CASCADE,
  allergen_key  text NOT NULL REFERENCES food.allergen_family(key),
  relation      text NOT NULL CHECK (relation IN ('contains', 'derived_from', 'may_contain')),
  confidence    numeric(3,2) NOT NULL DEFAULT 1 CHECK (confidence BETWEEN 0 AND 1),
  source        text NOT NULL DEFAULT 'koi_editorial',
  source_ref    text,
  notes         text,
  PRIMARY KEY (ingredient_id, allergen_key)
);

INSERT INTO food.ingredient_allergen (ingredient_id, allergen_key, relation, confidence, notes, source_ref)
SELECT m.id, v.allergen_key, v.relation, v.confidence, v.notes, 'FSSAI (Labelling and Display) Regulations, 2020'
FROM (VALUES
  ('Milk',                     'dairy',     'contains',     1.00, NULL),
  ('Casein',                   'dairy',     'derived_from', 1.00, 'Milk protein.'),
  ('Whey',                     'dairy',     'derived_from', 1.00, 'Milk protein.'),
  ('Ghee',                     'dairy',     'derived_from', 1.00, 'Clarified butter.'),
  ('Egg',                      'egg',       'contains',     1.00, NULL),
  ('Lysozyme',                 'egg',       'derived_from', 0.90, 'Usually made from egg white, and declared as egg.'),
  ('Fish',                     'fish',      'contains',     1.00, NULL),
  ('Crustacean Shellfish',     'shellfish', 'contains',     1.00, NULL),
  ('Peanut',                   'peanut',    'contains',     1.00, NULL),
  ('Groundnut Oil',            'peanut',    'derived_from', 1.00, 'Refined peanut oil is still declared.'),
  ('Tree Nuts',                'tree_nut',  'contains',     1.00, NULL),
  ('Soya',                     'soy',       'contains',     1.00, NULL),
  ('Soy Lecithin',             'soy',       'derived_from', 1.00, 'Declared as soy.'),
  ('Soybean Oil',              'soy',       'derived_from', 0.80, 'Highly refined soybean oil is often tolerated, but it is declared.'),
  ('Gluten',                   'gluten',    'contains',     1.00, NULL),
  ('Wheat',                    'gluten',    'contains',     1.00, NULL),
  ('Refined Wheat Flour',      'gluten',    'contains',     1.00, NULL),
  ('Whole Wheat Flour',        'gluten',    'contains',     1.00, NULL),
  ('Barley',                   'gluten',    'contains',     1.00, NULL),
  ('Oats',                     'gluten',    'contains',     1.00, 'FSSAI lists oats among the cereals containing gluten.'),
  ('Sulphites (Declarable)',   'sulphite',  'contains',     1.00, NULL),
  ('Sulphur Dioxide',          'sulphite',  'contains',     1.00, NULL),
  ('Sodium Metabisulphite',    'sulphite',  'contains',     1.00, NULL),
  ('Potassium Metabisulphite', 'sulphite',  'contains',     1.00, NULL),
  ('Sesame',                   'sesame',    'contains',     1.00, NULL),
  ('Sesame Oil',               'sesame',    'derived_from', 1.00, NULL),
  ('Mustard',                  'mustard',   'contains',     1.00, NULL),
  ('Mustard Oil',              'mustard',   'derived_from', 1.00, NULL)
) AS v(canonical_name, allergen_key, relation, confidence, notes)
JOIN food.ingredients_master m ON m.canonical_name = v.canonical_name;

DO $$
BEGIN
  IF (SELECT count(*) FROM food.ingredient_allergen) <> 28 THEN
    RAISE EXCEPTION 'expected 28 ingredient-allergen links; an ingredient name did not match';
  END IF;
END;
$$;

-- ── Access ──────────────────────────────────────────────────────────────────

ALTER TABLE food.allergen_family ENABLE ROW LEVEL SECURITY;
ALTER TABLE food.ingredient_alias ENABLE ROW LEVEL SECURITY;
ALTER TABLE food.ingredient_allergen ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON food.allergen_family, food.ingredient_alias, food.ingredient_allergen TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON food.allergen_family, food.ingredient_alias, food.ingredient_allergen TO service_role;

CREATE POLICY "The allergen graph is public" ON food.allergen_family FOR SELECT USING (true);
CREATE POLICY "The allergen graph is public" ON food.ingredient_alias FOR SELECT USING (true);
CREATE POLICY "The allergen graph is public" ON food.ingredient_allergen FOR SELECT USING (true);

-- ── The evaluation gate keys on the compiled graph too ──────────────────────

ALTER TABLE engine.eval_runs ADD COLUMN lexicon_version text;
DROP INDEX engine.eval_runs_config_idx;
CREATE INDEX eval_runs_config_idx
  ON engine.eval_runs (prompt_version, primary_model, verifier_model, set_version, lexicon_version, created_at DESC);
