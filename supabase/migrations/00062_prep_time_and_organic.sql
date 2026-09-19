-- ============================================================================
-- 00062_prep_time_and_organic
--
-- Plan §9.10.3 (B), Tier 2, the last two: preparation time and organic.
--
-- PREPARATION TIME belongs to the shelf, like food_form beside it (00061). A
-- pack of rice takes about twenty minutes whoever sells it. What is recorded is
-- therefore the shelf's TYPICAL minutes and it is named that way everywhere it
-- is shown — KOI has not read a cooking instruction off a single pack, and a
-- figure presented as this product's would be a figure KOI made up. When the
-- label engine does read instructions, a per-product minute count can override
-- the shelf's; until then the shelf is the honest answer and says so.
--
-- ORGANIC is a claim, and only ever a claim. FSSAI's FSS (Organic Foods)
-- Regulations 2017 already require certification under NPOP or PGS-India before
-- a pack may say it, so the word on a label is regulated — but KOI has not seen
-- a certificate, and "regulated" is not "verified by KOI". It is recorded as
-- organic_claimed, shown as the brand's claim, and never as a KOI fact. The
-- same line KOI holds for a diet declaration or a nutrition panel.
-- ============================================================================

alter table food.taxonomy_node
  add column if not exists prep_minutes smallint;

alter table food.taxonomy_node drop constraint if exists taxonomy_node_prep_minutes_check;
alter table food.taxonomy_node add constraint taxonomy_node_prep_minutes_check
  check (prep_minutes is null or prep_minutes between 0 and 240);

comment on column food.taxonomy_node.prep_minutes is
  'Typical minutes before this shelf is food. The shelf''s figure, never read off a pack; shown as "about".';

alter table food.sku_facts
  add column if not exists organic_claimed boolean;

comment on column food.sku_facts.organic_claimed is
  'The pack claims organic. A brand claim, regulated by FSS (Organic Foods) 2017 and not verified by KOI.';

update food.taxonomy_node set prep_minutes = v.minutes
from (values
  -- Opened and eaten.
  ('nuts_seeds.nuts', 0), ('nuts_seeds.seeds', 0), ('nuts_seeds.dried_fruit', 0),
  ('nuts_seeds.mixes', 0), ('nuts_seeds.nut_butters', 0),
  ('snacks.chips_crisps', 0), ('snacks.biscuits_cookies', 0), ('snacks.bars', 0),
  ('snacks.puffs', 0), ('snacks.cakes', 0), ('snacks.assortments', 0), ('snacks.namkeen', 0),
  ('sweets.chocolate', 0), ('sweets.indian_sweets', 0), ('beverages.ready_to_drink', 0),
  -- A kettle.
  ('beverages.tea_coffee', 3), ('beverages.drink_mixes', 2), ('supplements.protein_powder', 2),
  ('staples.breakfast_cereals', 5),
  -- A pan. Dals are soaked and simmered; rice and millets are boiled.
  ('staples.rice', 20), ('staples.millets', 25), ('staples.flours', 30), ('staples.pulses', 35),
  -- Never eaten alone, so the time belongs to whatever they go into.
  ('fats_oils.oils', 0), ('fats_oils.ghee', 0), ('spices.spices', 0),
  ('spices.pickles_sauces', 0), ('sweeteners.sugar', 0), ('sweeteners.jaggery', 0), ('sweeteners.honey', 0)
) as v(key, minutes)
where food.taxonomy_node.key = v.key;
