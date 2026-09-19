-- ============================================================================
-- 00060_tier2_food_flags
--
-- Plan §9.10.3 (B), Tier 2: the product facts the engine derives, as flags on
-- the ingredient graph rather than as word lists in a reader. The lesson of
-- 00059, applied before the mistake is made again.
--
--   sweetened_sugar    refined sugar, invert sugar, corn syrup — the sugars a
--                      label means when it says "sugar"
--   sweetened_jaggery  jaggery and gur
--   sweetened_fruit    dates and date syrup: sweet, and not a sugar
--   millet             bajra, jowar, ragi and the small millets. Amaranth,
--                      buckwheat and quinoa are pseudocereals, eaten the same
--                      way, and are marked too
--   whole_grain        the grain with its bran: whole wheat, brown rice, oats,
--                      barley, and every millet above
--
-- honey and artificial_sweetener are already flags (Phase 2.2/2.4) and are read
-- alongside these, so a sweetener question has one answer from one graph.
--
-- WHAT THE FACTS DO WITH THEM (lib/food/facts.js) turns on an asymmetry KOI
-- already lives by: a partial ingredient list PROVES what it names and proves
-- nothing about what it omits. So "sweetened with jaggery" can be read off a
-- partial list, while "no added sugar" needs a complete one. The facts record
-- which of the two they had, and never round the second up to the first.
-- ============================================================================

alter table food.ingredient_flag drop constraint if exists ingredient_flag_flag_check;
alter table food.ingredient_flag add constraint ingredient_flag_flag_check check (flag = any (array[
  'artificial_colour', 'preservatives', 'artificial_sweetener', 'artificial_flavour',
  'meat', 'red_meat', 'honey', 'caffeine', 'spicy', 'palm_oil', 'root_veg',
  -- Fasting days (00056).
  'grain', 'pulse', 'common_salt', 'allium',
  -- Tier 2 (00060).
  'sweetened_sugar', 'sweetened_jaggery', 'sweetened_fruit', 'millet', 'whole_grain'
]));

insert into food.ingredient_flag (ingredient_id, flag, rule, source)
select m.id, v.flag, 'tier2', 'koi'
from (values
  ('Refined Sugar', 'sweetened_sugar'),
  ('Invert Sugar', 'sweetened_sugar'),
  ('High Fructose Corn Syrup', 'sweetened_sugar'),
  ('Jaggery', 'sweetened_jaggery'),
  ('Dates', 'sweetened_fruit'),
  ('Date Syrup', 'sweetened_fruit'),
  ('Bajra', 'millet'),
  ('Jowar', 'millet'),
  ('Ragi', 'millet'),
  ('Foxtail Millet', 'millet'),
  ('Kodo Millet', 'millet'),
  ('Amaranth', 'millet'),
  ('Buckwheat', 'millet'),
  ('Quinoa', 'millet'),
  ('Whole Wheat Flour', 'whole_grain'),
  ('Brown Rice', 'whole_grain'),
  ('Oats', 'whole_grain'),
  ('Barley', 'whole_grain'),
  ('Bajra', 'whole_grain'),
  ('Jowar', 'whole_grain'),
  ('Ragi', 'whole_grain'),
  ('Foxtail Millet', 'whole_grain'),
  ('Kodo Millet', 'whole_grain'),
  ('Amaranth', 'whole_grain'),
  ('Buckwheat', 'whole_grain'),
  ('Quinoa', 'whole_grain')
) as v(canonical, flag)
join food.ingredients_master m on lower(m.canonical_name) = lower(v.canonical)
on conflict do nothing;

-- Where the derived answers land. Nullable throughout, because "KOI has not
-- read enough of the list to say" is a real state and the commonest one.
alter table food.sku_facts
  add column if not exists sweetened_with text[],
  add column if not exists sweetened boolean,
  add column if not exists millet boolean,
  add column if not exists whole_grain boolean,
  add column if not exists tier2_evidence text;

comment on column food.sku_facts.sweetened_with is 'Which sweeteners the list names: sugar, jaggery, honey, fruit, artificial. Proof either way.';
comment on column food.sku_facts.sweetened is 'Whether anything sweetens it. Null unless a complete list was read: a partial one cannot prove an absence.';
comment on column food.sku_facts.millet is 'Names a millet or pseudocereal. Null where only a partial list was read and none was named.';
comment on column food.sku_facts.whole_grain is 'Names a grain with its bran. Null on the same rule.';
comment on column food.sku_facts.tier2_evidence is 'full_list | partial_list | none — which list the three above were read from.';
