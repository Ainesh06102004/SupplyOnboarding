-- ============================================================================
-- 00052_household_kitchen_rules
--
-- Plan §9.10.3 (B), Tier 1: the parameters a plan should take that KOI already
-- has the data for. Five of the eight land here. The other three wait on
-- product facts KOI does not hold yet, and are deliberately not stored as
-- columns nobody can honour:
--
--   fasting and religious days  needs grain and common-salt flags (vrat)
--   processing ceiling          needs a complete ingredient list per SKU, and
--                               nearly every SKU's list is still partial
--   shelf-stable only           needs a "keep refrigerated" field on the pack
--
-- WHAT A HOUSEHOLD NOW HOLDS
--   refused_brands    brands never to plan with. A refusal, like an avoid.
--   preferred_brands  brands to lean towards where the rest is equal.
--                     Both hold brand names, lower-cased, not ids: only KOI's
--                     own 23 products have a brand id, and the rest of the
--                     shelf comes from Open Food Facts with a name and no id.
--                     A rule that could not reach most of the shop would be a
--                     rule in name only.
--   waste_tolerance   none | some | any (default some)
--                     "none" plans no pack the household cannot finish in the
--                     period. "any" allows what the portion rule allows.
--   repeat_tolerance  low | usual | high (default usual)
--                     how much of last week's basket may come back. "low" is a
--                     shopper who does not want the same five packs again.
--
-- WHAT A MEMBER NOW HOLDS
--   spice_tolerance   none | mild | any
--                     "none" refuses a spicy product for that member, "mild"
--                     notes it as a preference, "any" says nothing. The avoid
--                     list already has a soft "spicy" flag (config.js); this is
--                     the same fact where the rest of a member's profile lives,
--                     and a refusal is now possible where it was not.
--
-- WHAT THE KITCHEN ALREADY HAS
--   household_pantry  what is in the house already, so KOI does not buy it
--                     again. A row is either a SKU KOI sells or a plain name
--                     ("atta", "rice"); amounts are optional, because a
--                     shopper knows they have rice without knowing it is 2.4 kg.
--                     Rows are the shopper's own: same owner rule as the rest.
--
-- Nothing here is required, and nothing changes an existing plan. Every column
-- has a default that means "no rule", so a household that says none of this
-- gets exactly the plans it got yesterday.
-- ============================================================================

alter table public.household
  add column if not exists refused_brands text[] not null default '{}',
  add column if not exists preferred_brands text[] not null default '{}',
  add column if not exists waste_tolerance text not null default 'some',
  add column if not exists repeat_tolerance text not null default 'usual';

alter table public.household
  drop constraint if exists household_waste_tolerance_check;
alter table public.household
  add constraint household_waste_tolerance_check
  check (waste_tolerance in ('none', 'some', 'any'));

alter table public.household
  drop constraint if exists household_repeat_tolerance_check;
alter table public.household
  add constraint household_repeat_tolerance_check
  check (repeat_tolerance in ('low', 'usual', 'high'));

comment on column public.household.refused_brands is 'Brands never to plan with, by lower-cased name.';
comment on column public.household.preferred_brands is 'Brands to lean towards where the rest is equal, by lower-cased name.';
comment on column public.household.waste_tolerance is 'none | some | any: how much of a pack may go unfinished in the period.';
comment on column public.household.repeat_tolerance is 'low | usual | high: how much of the last plan may come back in the next one.';

alter table public.household_member
  add column if not exists spice_tolerance text;

alter table public.household_member
  drop constraint if exists household_member_spice_tolerance_check;
alter table public.household_member
  add constraint household_member_spice_tolerance_check
  check (spice_tolerance is null or spice_tolerance in ('none', 'mild', 'any'));

comment on column public.household_member.spice_tolerance is 'none refuses spicy food for them, mild notes it as a preference, any says nothing.';

-- What the kitchen already has.
create table if not exists public.household_pantry (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.household(id) on delete cascade,
  -- One of the two says what it is. A SKU KOI sells, or the shopper's own word.
  sku_id uuid references public.skus(id) on delete set null,
  label text,
  amount numeric,
  unit text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint household_pantry_names_something check (sku_id is not null or nullif(btrim(coalesce(label, '')), '') is not null),
  constraint household_pantry_amount_is_positive check (amount is null or amount > 0)
);

comment on table public.household_pantry is 'What a household already has, so a plan does not buy it again (plan §9.10.3, Tier 1).';

create index if not exists household_pantry_household_idx on public.household_pantry(household_id);

drop trigger if exists set_updated_at on public.household_pantry;
create trigger set_updated_at
  before update on public.household_pantry
  for each row execute function public.trigger_set_updated_at();

alter table public.household_pantry enable row level security;

drop policy if exists household_pantry_self on public.household_pantry;
create policy household_pantry_self on public.household_pantry
  for all
  using (exists (select 1 from public.household h where h.id = household_pantry.household_id and h.owner_id = koi_uid()))
  with check (exists (select 1 from public.household h where h.id = household_pantry.household_id and h.owner_id = koi_uid()));

revoke truncate on public.household_pantry from anon, authenticated;
