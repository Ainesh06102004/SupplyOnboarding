-- ============================================================================
-- 00061_category_form_and_cuisine
--
-- Plan §9.10.3 (B), Tier 2: food form, lunchbox-friendly, and the cuisine tag.
--
-- All three are facts about a SHELF, not about a pack, so they live on the tree
-- beside meal_role — which is already how KOI records what a category is in a
-- meal. Rice needs cooking whoever sells it; chips do not. Recording them per
-- product would be recording the same answer sixty times and getting it wrong
-- in a few places.
--
--   food_form     ready_to_eat  opened and eaten
--                 instant       hot water, a kettle, three minutes
--                 needs_cooking a pan and a hob
--                 ingredient    not eaten alone at all: oil, spices, salt
--
--   lunchbox_ok   travels in a box and is eaten cold, with no fridge and no
--                 reheating. Deliberately not "is it healthy": a chocolate bar
--                 travels perfectly well.
--
--   cuisine       indian | global | null, and null is the honest answer for
--                 most of a staples aisle. Rice, atta and dal are not "Indian
--                 food" — they are food, cooked into any cuisine you like. The
--                 tag is only set where a shelf really does belong to one
--                 kitchen: namkeen and Indian sweets on one side, pasta and
--                 breakfast cereals on the other. It is a SOFT preference and
--                 can never refuse a product (plan §9.10.3).
--
-- A pack that disagrees with its shelf is a product fact for the label engine
-- to raise later; nothing here pretends to know better than the shelf.
-- ============================================================================

alter table food.taxonomy_node
  add column if not exists food_form text,
  add column if not exists lunchbox_ok boolean,
  add column if not exists cuisine text;

alter table food.taxonomy_node drop constraint if exists taxonomy_node_food_form_check;
alter table food.taxonomy_node add constraint taxonomy_node_food_form_check
  check (food_form is null or food_form in ('ready_to_eat', 'instant', 'needs_cooking', 'ingredient'));

alter table food.taxonomy_node drop constraint if exists taxonomy_node_cuisine_check;
alter table food.taxonomy_node add constraint taxonomy_node_cuisine_check
  check (cuisine is null or cuisine in ('indian', 'global'));

comment on column food.taxonomy_node.food_form is 'ready_to_eat | instant | needs_cooking | ingredient — how much work before it is food.';
comment on column food.taxonomy_node.lunchbox_ok is 'Travels in a box, eaten cold, no fridge. Not a judgement about the food.';
comment on column food.taxonomy_node.cuisine is 'indian | global, only where a shelf truly belongs to one kitchen. A soft preference; never a refusal.';

update food.taxonomy_node set food_form = v.form, lunchbox_ok = v.box, cuisine = v.cuisine
from (values
  -- Opened and eaten.
  ('nuts_seeds.nuts',            'ready_to_eat',  true,  null),
  ('nuts_seeds.seeds',           'ready_to_eat',  true,  null),
  ('nuts_seeds.dried_fruit',     'ready_to_eat',  true,  null),
  ('nuts_seeds.mixes',           'ready_to_eat',  true,  null),
  ('nuts_seeds.nut_butters',     'ready_to_eat',  false, null),
  ('snacks.chips_crisps',        'ready_to_eat',  true,  null),
  ('snacks.biscuits_cookies',    'ready_to_eat',  true,  null),
  ('snacks.bars',                'ready_to_eat',  true,  null),
  ('snacks.puffs',               'ready_to_eat',  true,  null),
  ('snacks.cakes',               'ready_to_eat',  true,  null),
  ('snacks.assortments',         'ready_to_eat',  true,  null),
  ('snacks.namkeen',             'ready_to_eat',  true,  'indian'),
  ('sweets.chocolate',           'ready_to_eat',  true,  'global'),
  ('sweets.indian_sweets',       'ready_to_eat',  true,  'indian'),
  ('beverages.ready_to_drink',   'ready_to_eat',  false, null),
  -- Hot water and three minutes.
  ('staples.breakfast_cereals',  'instant',       false, 'global'),
  ('beverages.drink_mixes',      'instant',       false, null),
  ('beverages.tea_coffee',       'instant',       false, null),
  ('supplements.protein_powder', 'instant',       false, null),
  -- A pan and a hob.
  ('staples.rice',               'needs_cooking', false, null),
  ('staples.pulses',             'needs_cooking', false, null),
  ('staples.flours',             'needs_cooking', false, null),
  ('staples.millets',            'needs_cooking', false, null),
  -- Never eaten alone.
  ('fats_oils.oils',             'ingredient',    false, null),
  ('fats_oils.ghee',             'ingredient',    false, null),
  ('spices.spices',              'ingredient',    false, 'indian'),
  ('spices.pickles_sauces',      'ingredient',    false, null),
  ('sweeteners.sugar',           'ingredient',    false, null),
  ('sweeteners.jaggery',         'ingredient',    false, 'indian'),
  ('sweeteners.honey',           'ingredient',    false, null)
) as v(key, form, box, cuisine)
where food.taxonomy_node.key = v.key;
