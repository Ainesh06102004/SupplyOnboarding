-- ============================================================================
-- 00056_fasting_flags
--
-- Plan §9.10.3 (B), Tier 1: fasting and religious days. The last of the Tier 1
-- parameters that needed a product fact KOI did not hold.
--
-- WHAT A FAST ACTUALLY EXCLUDES. A vrat (phalahar) day is not "eat less" — it
-- is a different list of permitted foods, and the interesting part is what it
-- ALLOWS that looks excluded:
--
--   grain        wheat, rice, maize, oats, barley and the millets are out.
--                Buckwheat (kuttu), amaranth (rajgira) and water chestnut
--                (singhara) are NOT grains and are eaten precisely on these
--                days, so they must not carry this flag. A rule that banned
--                kuttu would ban the one flour a fasting household buys.
--   pulse        dals, gram and soya are out. Lecithin and refined oils made
--                from them are not the pulse and do not carry it.
--   common_salt  table and iodised salt are out; rock salt (sendha namak) is
--                what replaces them, so it must not carry this flag either.
--   allium       onion and garlic. Kept apart from root_veg on purpose: a Jain
--                diet excludes potato and carrot with them, and a vrat day eats
--                potato quite happily. One flag for both would have made every
--                potato product inedible on a fasting day.
--
-- These are flags on the ingredient graph like every other, so they are matched
-- by whole ingredient names (lib/food/allergens.js), not by substrings in a
-- product's title.
--
-- HOW STRICT. Fasting is a diet for one plan, not a profile: it is chosen on
-- the plan page under "Diet, this week only". Like every diet, it is only
-- provable from a complete ingredient list, so it joins the diets that refuse
-- a product whose list KOI has not read (config.js NEEDS_FULL_LIST).
-- ============================================================================

-- The flags a graph row may carry are a fixed list, on purpose: a typo in a
-- flag name would otherwise be a rule that silently never fires.
alter table food.ingredient_flag drop constraint if exists ingredient_flag_flag_check;
alter table food.ingredient_flag add constraint ingredient_flag_flag_check check (flag = any (array[
  'artificial_colour', 'preservatives', 'artificial_sweetener', 'artificial_flavour',
  'meat', 'red_meat', 'honey', 'caffeine', 'spicy', 'palm_oil', 'root_veg',
  -- Fasting days (00056).
  'grain', 'pulse', 'common_salt', 'allium'
]));

-- The graph already knows table salt, common salt and namak as Iodised Salt.
-- The one spelling missing is the one most labels use.
insert into food.ingredient_alias (ingredient_id, alias, normalised, language, source)
select m.id, 'Salt', 'salt', 'en', 'koi'
from food.ingredients_master m
where lower(m.canonical_name) = 'iodised salt'
  and not exists (select 1 from food.ingredient_alias x where x.normalised = 'salt');

-- The grains. Buckwheat, amaranth and water chestnut are deliberately absent.
insert into food.ingredient_flag (ingredient_id, flag, rule, source)
select m.id, 'grain', 'fasting', 'koi'
from food.ingredients_master m
where lower(m.canonical_name) in (
  'wheat', 'whole wheat flour', 'refined wheat flour', 'semolina', 'maida',
  'brown rice', 'polished rice', 'rice flour', 'corn starch',
  'oats', 'barley', 'bajra', 'jowar', 'ragi', 'foxtail millet', 'kodo millet'
)
on conflict do nothing;

-- The pulses. An oil or a lecithin made from one is not the pulse.
insert into food.ingredient_flag (ingredient_id, flag, rule, source)
select m.id, 'pulse', 'fasting', 'koi'
from food.ingredients_master m
where lower(m.canonical_name) in ('lentils', 'soya', 'chickpeas', 'kidney beans', 'green gram', 'black gram', 'pigeon pea', 'bengal gram')
on conflict do nothing;

-- Common salt, and never rock salt.
insert into food.ingredient_flag (ingredient_id, flag, rule, source)
select m.id, 'common_salt', 'fasting', 'koi'
from food.ingredients_master m
where lower(m.canonical_name) in ('iodised salt')
on conflict do nothing;

-- Onion and garlic, apart from the other root vegetables.
insert into food.ingredient_flag (ingredient_id, flag, rule, source)
select m.id, 'allium', 'fasting', 'koi'
from food.ingredients_master m
where lower(m.canonical_name) in ('onion', 'garlic', 'shallot', 'leek', 'asafoetida')
on conflict do nothing;
