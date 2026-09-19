-- ============================================================================
-- 00057_processing_and_cold_chain
--
-- Plan §9.10.3 (B), Tier 1: the last two parameters, and the product facts they
-- were waiting on.
--
-- A PROCESSING CEILING (NOVA). food.sku_facts already derives nova_group, and
-- only from a complete, current ingredient list — a partial list cannot tell
-- ultra-processed from processed, and guessing would be the whole problem.
-- This exposes it through `public` the way sku_label_facts is exposed, so the
-- storefront and the planner read the same figure.
--
--   HOW MUCH IT CAN DO TODAY: 5 of 63 products on the shelf have a complete
--   enough list to carry a NOVA group. So a ceiling refuses those it knows
--   about and passes 58 as unknown. That is the honest behaviour and it is
--   nearly inert, which is why the plan records the count beside it: a rule
--   that quietly applies to a twelfth of the shop must say so, or a shopper
--   will read a basket as "nothing ultra-processed" when KOI simply never
--   looked. It becomes real as the label engine verifies lists.
--
-- SHELF-STABLE ONLY. The blocker named in the plan was a "keep refrigerated"
-- field, and it is added here: null means nobody has recorded it, and null is
-- never read as "ambient".
--
--   HOW MUCH IT CAN DO TODAY: nothing, and deliberately so. Every aisle KOI
--   sells is ambient — drinks, oils, nuts, snacks, spices, staples,
--   supplements, sweeteners, sweets. There is no chilled, fresh or frozen
--   aisle for the rule to exclude. The column exists so the fact can be
--   recorded the day one arrives, and the shopper is told the switch changes
--   nothing yet rather than being sold a setting that does not bind.
-- ============================================================================

alter table public.skus
  add column if not exists keep_refrigerated boolean;

comment on column public.skus.keep_refrigerated is
  'True when the pack says to keep it chilled or frozen. Null means nobody has recorded it, and is never read as ambient.';

alter table public.household
  add column if not exists processing_ceiling smallint,
  add column if not exists shelf_stable_only boolean not null default false;

alter table public.household
  drop constraint if exists household_processing_ceiling_is_a_nova_group;
alter table public.household
  add constraint household_processing_ceiling_is_a_nova_group
  check (processing_ceiling is null or processing_ceiling between 1 and 4);

comment on column public.household.processing_ceiling is
  'The highest NOVA group this household will buy (1-4). Null means no rule. Only products whose group KOI knows can be refused by it.';
comment on column public.household.shelf_stable_only is
  'Plan nothing that must be kept chilled. Inert while every aisle KOI sells is ambient.';

-- The storefront reads through `public`, so the processing group is exposed the
-- same way a label's facts are (00019): a view, security_invoker, readable by
-- anyone, carrying only what a shopper is allowed to see.
create or replace view public.sku_processing with (security_invoker = true) as
  select sku_id, nova_group, nova_basis, computed_at
  from food.sku_facts
  where nova_group is not null;

comment on view public.sku_processing is
  'A SKU''s NOVA processing group where KOI has derived one from a complete ingredient list (00057).';

grant select on public.sku_processing to anon, authenticated;
