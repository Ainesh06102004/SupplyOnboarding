-- ============================================================================
-- KOI — Tell product names from flavours in the category tree
--
-- Phase 2.3, after measuring 00038. web/scripts/checkTaxonomy.mjs classified
-- the names of 21,465 staged Indian Open Food Facts products and compared the
-- answers with those products' own category tags. Of the 3,188 it placed,
-- 14.7% landed in another aisle, mostly because a flavour came last in the
-- name: "Whey ... Milk Chocolate Flavour" read as chocolate, "Muesli cranberry
-- & blueberry" as dried fruit, "Green tea honey lemon" as honey.
--
-- So each name now says what kind of name it is:
--   form        the product itself (biscuit, muesli, tea, whey). Wins.
--   ingredient  a food that is often only a flavour or an ingredient
--               (chocolate, honey, almond, masala, ragi). Places a product
--               only when its name has no form, and not when a flavour word
--               follows it ("Elaichi Flavour").
--   marker      a flavour word ("flavour", "flavoured", "flv").
--   ignore      words that look like a category and are not one: claims
--               ("sugar free") and non-food ("hair oil").
--
-- Also: names the misses showed were missing (digestive, marie, shake, chaas,
-- cumin seed, dal moth, fish oil, cakes), "sweet" removed ("Sweet Chilli
-- Doritos" is not a sweet), and the Snacks aisle's Open Food Facts crosswalk
-- narrowed from en:snacks, which includes the sweet snacks KOI files under
-- Sweets, to en:salty-snacks.
-- ============================================================================

ALTER TABLE food.taxonomy_term
  ADD COLUMN kind text NOT NULL DEFAULT 'form' CHECK (kind IN ('form', 'ingredient', 'marker', 'ignore')),
  ALTER COLUMN node_key DROP NOT NULL,
  ADD CONSTRAINT taxonomy_term_kind_node CHECK ((node_key IS NULL) = (kind IN ('marker', 'ignore')));

UPDATE food.taxonomy_term SET kind = 'ingredient' WHERE term IN (
  'chocolate', 'dark chocolate',
  'honey', 'sugar', 'khand', 'mishri', 'jaggery', 'gur', 'stevia', 'sweetener',
  'spice', 'masala', 'saffron', 'kesar', 'turmeric', 'haldi', 'cumin', 'jeera', 'cardamom', 'elaichi',
  'cinnamon', 'clove', 'black pepper', 'hing', 'asafoetida',
  'nut', 'almond', 'badam', 'cashew', 'kaju', 'walnut', 'akhrot', 'pistachio', 'pista', 'hazelnut',
  'peanut', 'groundnut', 'macadamia', 'pecan', 'brazil nut',
  'date', 'khajur', 'raisin', 'kishmish', 'fig', 'anjeer', 'prune', 'apricot', 'cranberry', 'dried fruit',
  'seed', 'chia seed', 'flax seed', 'flaxseed', 'pumpkin seed', 'sunflower seed', 'sesame seed', 'melon seed', 'sabja',
  'dry fruit', 'dryfruit',
  'millet', 'ragi', 'jowar', 'bajra', 'kodo', 'foxtail', 'quinoa', 'amaranth', 'rajgira',
  'flour', 'atta', 'maida', 'besan', 'sooji', 'suji', 'rava', 'rice flour',
  'ghee', 'oil'
);

DELETE FROM food.taxonomy_term WHERE term = 'sweet';

INSERT INTO food.taxonomy_node (key, parent_key, label, off_categories, notes) VALUES
  ('snacks.cakes', 'snacks', 'Cakes & muffins', '{en:cakes}', 'No reference portion: 21 CFR 101.12 splits cakes by density, which a name does not give.');

UPDATE food.taxonomy_node SET off_categories = '{en:salty-snacks}' WHERE key = 'snacks';

INSERT INTO food.taxonomy_term (term, node_key, kind)
SELECT unnest(v.terms), v.node_key, v.kind
FROM (VALUES
  ('snacks.biscuits_cookies', 'form', ARRAY['digestive', 'marie']),
  ('snacks.cakes', 'form', ARRAY['cake', 'muffin', 'swiss roll', 'brownie']),
  ('snacks.namkeen', 'form', ARRAY['dal moth', 'dalmoth']),
  ('beverages.ready_to_drink', 'form', ARRAY['shake', 'milk shake', 'milkshake', 'chaas', 'chach', 'chhaas']),
  ('supplements', 'form', ARRAY['fish oil', 'omega 3']),
  ('spices.spices', 'ingredient', ARRAY['cumin seed', 'mustard seed', 'fennel seed', 'coriander seed', 'cardamom seed']),
  (NULL, 'marker', ARRAY['flavour', 'flavor', 'flavoured', 'flavored', 'flavouring', 'flavoring', 'flv']),
  (NULL, 'ignore', ARRAY['sugar free', 'sugarfree', 'no added sugar', 'zero sugar', 'hair oil'])
) AS v(node_key, kind, terms);
