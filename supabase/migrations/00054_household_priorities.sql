-- ============================================================================
-- 00054_household_priorities
--
-- Plan §9.10.4 (C2): what a household wants KOI to protect first.
--
-- Every plan trades one thing against another. Today the trade is fixed: the
-- budget is a ceiling, the targets are goals, and the tiebreaks decide the
-- rest. But the same basket is right or wrong depending on who is shopping —
-- a household on a tight month wants the budget held even if protein slips,
-- and one feeding an athlete wants the protein even if the budget gives. How
-- the goals are combined changes the diet that comes out (Gerdessen & de
-- Vries, EJCN 2015), so it has to be the household's answer, not KOI's.
--
--   priorities   an ordered list, most important first, from:
--                  budget          spend no more than was said
--                  targets         meet everyone's kcal and protein
--                  familiar        keep to food this household already buys
--                  less_processed  the better-screened food on the shelf
--                  variety         more products, fewer repeats of each
--
-- Empty means KOI's own order, which is exactly what every plan does today,
-- so nothing changes for a household that never answers this.
--
-- A list is checked for junk, for duplicates, and for length. It does not have
-- to name all five: what is named is ranked, and the rest follow in KOI's
-- order underneath.
--
-- The raw weights are never shown to a shopper, and never stored here: the
-- household says what matters most, and the model decides what that is worth
-- (model.js PRIORITY). A number a shopper cannot reason about is not a
-- setting, it is a dial.
-- ============================================================================

alter table public.household
  add column if not exists priorities text[] not null default '{}';

alter table public.household
  drop constraint if exists household_priorities_are_known;
alter table public.household
  add constraint household_priorities_are_known check (
    priorities <@ array['budget', 'targets', 'familiar', 'less_processed', 'variety']::text[]
  );

-- A CHECK cannot hold a subquery, and counting distinct elements needs one,
-- so the counting lives in a function the constraint calls. IMMUTABLE because
-- the answer depends on nothing but the array.
create or replace function public.has_no_duplicates(a text[])
returns boolean
language sql
immutable
set search_path = pg_catalog
as $$
  select a is null
    or array_length(a, 1) is null
    or array_length(a, 1) = (select count(distinct x) from unnest(a) x);
$$;

comment on function public.has_no_duplicates(text[]) is 'True when the array names nothing twice. For CHECK constraints, which cannot hold a subquery.';

alter table public.household
  drop constraint if exists household_priorities_are_distinct;
alter table public.household
  add constraint household_priorities_are_distinct check (public.has_no_duplicates(priorities));

comment on column public.household.priorities is
  'What to protect first, most important first: budget, targets, familiar, less_processed, variety. Empty means KOI''s own order.';
