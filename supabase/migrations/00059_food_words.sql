-- ============================================================================
-- 00059_food_words
--
-- The words shoppers use for food belong in the graph, not in a JavaScript map.
--
-- `followup.js` carried a hardcoded SPELLINGS table so that "aata" could reach
-- the atta and "dry fruit" the dried-fruit shelf. It worked, and it was the
-- wrong place for it: the same knowledge already lives in food.ingredient_alias
-- for every other reader, and a table in source can only be corrected by a
-- deploy. Teaching a model to memorise a catalogue is the expensive way to own
-- a lookup table; keeping two lookup tables is the confusing way.
--
-- So SPELLINGS moves here, split the way it should always have been:
--
--   spellings of an ingredient  ("aata", "daal", "channa", "gud") join the
--                               aliases of the ingredient they name, next to
--                               the ones the label engine already reads.
--   words for a KIND of food    ("dry fruit", "biscuits", "chips") get a table
--                               of their own, because a category is not an
--                               ingredient and never was.
--
-- Both are read into lib/food/foodWords.js by scripts/buildFoodWords.mjs, the
-- same way the allergen lexicon is built, so the browser and the server ask one
-- graph the same question. A new spelling is now one row and no deploy.
-- ============================================================================

create table if not exists food.category_alias (
  id uuid primary key default gen_random_uuid(),
  category_key text not null references food.taxonomy_node(key) on delete cascade,
  alias text not null,
  normalised text not null unique,
  source text not null default 'koi',
  created_at timestamptz not null default now()
);

comment on table food.category_alias is
  'What shoppers call a kind of food: "dry fruit" for dried fruit, "chips" for chips & crisps (00059).';

create index if not exists category_alias_key_idx on food.category_alias(category_key);

alter table food.category_alias enable row level security;
grant select on food.category_alias to anon, authenticated;

drop policy if exists category_alias_readable on food.category_alias;
create policy category_alias_readable on food.category_alias for select using (true);

-- What a shopper calls each shelf. Every key is checked against the tree by the
-- foreign key, so a renamed category cannot leave a word pointing at nothing.
insert into food.category_alias (category_key, alias, normalised)
select v.key, v.alias, lower(v.alias)
from (values
  ('nuts_seeds.dried_fruit', 'dry fruit'),
  ('nuts_seeds.dried_fruit', 'dryfruit'),
  ('nuts_seeds.dried_fruit', 'dry fruits'),
  ('nuts_seeds.dried_fruit', 'dried fruits'),
  ('nuts_seeds.dried_fruit', 'sukha meva'),
  ('nuts_seeds.nuts', 'dry nuts'),
  ('nuts_seeds.nut_butters', 'nut butter'),
  ('snacks.biscuits_cookies', 'biscuit'),
  ('snacks.biscuits_cookies', 'biscuits'),
  ('snacks.biscuits_cookies', 'cookie'),
  ('snacks.biscuits_cookies', 'cookies'),
  ('snacks.chips_crisps', 'chips'),
  ('snacks.chips_crisps', 'crisps'),
  ('snacks.chips_crisps', 'wafers'),
  ('supplements.protein_powder', 'whey'),
  ('sweets.chocolate', 'chocolates'),
  ('sweets.chocolate', 'dark chocolate'),
  ('staples.breakfast_cereals', 'cereal'),
  ('staples.breakfast_cereals', 'cereals'),
  ('staples.breakfast_cereals', 'muesli'),
  ('staples.breakfast_cereals', 'granola'),
  ('snacks.namkeen', 'mixture'),
  ('snacks.namkeen', 'bhujia'),
  ('snacks.namkeen', 'sev'),
  ('snacks.namkeen', 'farsan'),
  ('staples.pulses', 'pulses'),
  ('staples.rice', 'poha'),
  ('staples.flours', 'flour')
) as v(key, alias)
where exists (select 1 from food.taxonomy_node t where t.key = v.key)
  and not exists (select 1 from food.category_alias c where c.normalised = lower(v.alias));

-- The spellings the graph did not have. Each joins an ingredient that is
-- already there, so nothing new is invented — only how people write it.
insert into food.ingredient_alias (ingredient_id, alias, normalised, language, source)
select m.id, v.alias, lower(v.alias), 'en', 'koi'
from (values
  ('Whole Wheat Flour', 'aata'),
  ('Whole Wheat Flour', 'ata'),
  ('Whole Wheat Flour', 'aatta'),
  ('Lentils', 'daal'),
  ('Lentils', 'dhal'),
  ('Lentils', 'pulse'),
  ('Polished Rice', 'chaval'),
  ('Oats', 'oatmeal'),
  ('Peanut', 'peanuts')
) as v(canonical, alias)
join food.ingredients_master m on lower(m.canonical_name) = lower(v.canonical)
where not exists (select 1 from food.ingredient_alias a where a.normalised = lower(v.alias));
