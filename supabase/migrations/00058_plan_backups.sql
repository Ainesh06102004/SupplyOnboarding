-- ============================================================================
-- 00058_plan_backups
--
-- Plan §9.10.4 (C5): a backup for a planned item.
--
-- WHAT C5 ASKED FOR was a backup precomputed for every line, plus a re-check at
-- checkout that re-solves only what changed. Measured on the live catalogue,
-- the first half is the wrong design: a plan takes 1.8 s and working out a
-- backup for each of its six lines takes 7.0 s more, so precomputing would make
-- every shopper wait 8.8 s for answers most of them never ask for. The second
-- half needs real availability, which needs the marketplace.
--
-- WHAT IS BUILT is the part that helps: the answer to "can't get this?" is
-- worked out when it is asked, and then kept. Asking again is instant, the
-- answer survives a reload, and nobody waits for six solves to see a basket.
--
-- This is a cache of a question, not a plan. It holds no new facts: everything
-- in it was derived from the plan it belongs to and can be thrown away and
-- re-derived at any time. It goes when the plan goes.
-- ============================================================================

create table if not exists public.plan_backup (
  plan_id uuid not null references public.plan(id) on delete cascade,
  -- The SKU the shopper could not get. Text, not a foreign key: a plan can hold
  -- a line from the local test catalogue, which is not in `skus`.
  sku_id text not null,
  -- planWithout()'s answer, as the page renders it.
  answer jsonb not null,
  computed_at timestamptz not null default now(),
  primary key (plan_id, sku_id)
);

comment on table public.plan_backup is
  'Cached answers to "can''t get this?" for a plan''s lines (00058). Derived, disposable, and deleted with the plan.';

alter table public.plan_backup enable row level security;

drop policy if exists plan_backup_self on public.plan_backup;
create policy plan_backup_self on public.plan_backup
  for all
  using (exists (
    select 1 from public.plan p join public.household h on h.id = p.household_id
    where p.id = plan_backup.plan_id and h.owner_id = koi_uid()
  ))
  with check (exists (
    select 1 from public.plan p join public.household h on h.id = p.household_id
    where p.id = plan_backup.plan_id and h.owner_id = koi_uid()
  ));

revoke truncate on public.plan_backup from anon, authenticated;
