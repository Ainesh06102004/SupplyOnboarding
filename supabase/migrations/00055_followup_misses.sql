-- ============================================================================
-- 00055_followup_misses
--
-- What KOI could not understand, kept only when the shopper says to keep it.
--
-- WHY THIS EXISTS. KOI's own words for a change are stored on the plan; the
-- message that asked for it never was. That is the right default and it has one
-- cost: when the reader misunderstands "take out the chikki and replace with
-- almonds", nobody finds out unless the shopper copies the conversation out of
-- their browser and sends it. Every phrasing fixed so far was found that way.
--
-- WHAT IT IS NOT. Not analytics, not a transcript, and not on by default. A
-- row is written only when
--   * the household has switched this on (household.log_failed_phrases), and
--   * KOI could not apply part of what was said.
-- A message KOI understood is still not stored. Neither is the plan it made.
--
-- WHOSE IT IS. The shopper's. It lives in `public` behind the same owner rule
-- as their household, so they can read every row and delete any of them from
-- their own screens — a table of someone's words that they cannot see would be
-- the thing this was supposed to avoid. Rows older than KEEP_DAYS are deleted
-- by `public.forget_old_followup_misses()`; nothing here is kept forever.
-- ============================================================================

alter table public.household
  add column if not exists log_failed_phrases boolean not null default false;

comment on column public.household.log_failed_phrases is
  'Opt-in: keep the wording of follow-ups KOI could not apply, so the reader can be fixed. Off by default.';

create table if not exists public.followup_miss (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.household(id) on delete cascade,
  -- The plan it was said about, kept only so a miss can be reproduced. Null if
  -- that plan is later deleted: the wording outlives it, the link does not.
  plan_id uuid references public.plan(id) on delete set null,
  -- What the shopper typed, exactly as typed.
  said text not null,
  -- What KOI did take from it, and what it could not — its own words, the same
  -- ones the shopper was shown, so a miss can be read without guessing.
  applied text[] not null default '{}',
  not_applied text[] not null default '{}',
  created_at timestamptz not null default now(),
  constraint followup_miss_said_is_not_empty check (length(btrim(said)) > 0),
  constraint followup_miss_said_is_bounded check (length(said) <= 600)
);

comment on table public.followup_miss is
  'Follow-up wordings KOI could not apply, kept only for households that asked it to (00055). The shopper''s own rows.';

create index if not exists followup_miss_household_idx on public.followup_miss(household_id, created_at desc);

alter table public.followup_miss enable row level security;

drop policy if exists followup_miss_self on public.followup_miss;
create policy followup_miss_self on public.followup_miss
  for all
  using (exists (select 1 from public.household h where h.id = followup_miss.household_id and h.owner_id = koi_uid()))
  with check (exists (select 1 from public.household h where h.id = followup_miss.household_id and h.owner_id = koi_uid()));

revoke truncate on public.followup_miss from anon, authenticated;

-- Nothing is kept forever. Ninety days is long enough to find a pattern in how
-- people ask for things and short enough that it is not a record of someone's
-- shopping.
create or replace function public.forget_old_followup_misses(keep_days integer default 90)
returns integer
language plpgsql
security definer
set search_path = public
as $$
DECLARE
  v_gone integer;
BEGIN
  DELETE FROM public.followup_miss WHERE created_at < now() - make_interval(days => keep_days);
  GET DIAGNOSTICS v_gone = ROW_COUNT;
  RETURN v_gone;
END;
$$;

revoke execute on function public.forget_old_followup_misses(integer) from public, anon, authenticated;

comment on function public.forget_old_followup_misses(integer) is
  'Deletes follow-up wordings older than keep_days (default 90). Service role only.';
