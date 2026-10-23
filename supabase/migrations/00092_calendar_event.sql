-- ============================================================================
-- 00092_calendar_event — the household's Calendar (exact macros, P6).
--
-- The week is planned around life, not the other way round. A calendar event
-- is something the planner reads:
--   out       a person eats a meal out (lunch at the office every Tuesday): the
--             week leaves their plate there empty, and someone on their own
--             numbers has the rest of that day sized around a typical meal out
--   training  a person's training day: carb cycling's higher-carb days
--   travel    a person is away (a range of days): no plates, no boxes
--   prep      the household's batch-cooking day (lib/plan/batch.js)
-- and things that are only the household's own diary:
--   plan      when to plan next week      shop    a shopping day
--   remind    a reminder                  auto    an auto-plan (P7) shown on the calendar
--
-- Events are once (starts_on, and ends_on for a range) or weekly (repeat_days,
-- 0 = Sunday, until a date or for good). Times are local to India; a calendar
-- app reads them as Asia/Kolkata (the feed says so).
--
-- Who can see them: the household's owner (koi_uid(), as for the household
-- itself, 00044). A person's event must name a member of that household.
--
-- The calendar can be subscribed to from Google or Apple Calendar: a secret
-- address per household (household.calendar_token), read through
-- calendar_feed(), which returns that household's events and nothing else.
-- Turning the address off (or making a new one) is setting the token.
-- ============================================================================

CREATE TABLE public.calendar_event (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id  uuid NOT NULL REFERENCES public.household(id) ON DELETE CASCADE,
  -- The person it is about (out, training, travel); NULL for the household's own.
  member_id     uuid REFERENCES public.household_member(id) ON DELETE CASCADE,
  kind          text NOT NULL CHECK (kind IN ('plan', 'auto', 'shop', 'prep', 'remind', 'out', 'training', 'travel')),
  title         text CHECK (title IS NULL OR char_length(btrim(title)) BETWEEN 1 AND 120),
  starts_on     date NOT NULL CHECK (starts_on >= DATE '2026-01-01'),
  ends_on       date CHECK (ends_on IS NULL OR ends_on >= starts_on),
  at_time       time,
  slot          text CHECK (slot IS NULL OR slot IN ('breakfast', 'lunch', 'snack', 'dinner')),
  repeat_days   smallint[] CHECK (repeat_days IS NULL OR (cardinality(repeat_days) BETWEEN 1 AND 7 AND repeat_days <@ ARRAY[0, 1, 2, 3, 4, 5, 6]::smallint[])),
  until         date CHECK (until IS NULL OR until >= starts_on),
  -- What it does to the plan beyond its kind: { setting, kcal } for a meal out.
  plan_effect   jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(plan_effect) = 'object'),
  source        text NOT NULL DEFAULT 'user' CHECK (source IN ('user', 'koi')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT calendar_event_person_kinds CHECK (kind NOT IN ('out', 'training', 'travel') OR member_id IS NOT NULL),
  CONSTRAINT calendar_event_out_has_meal CHECK (kind <> 'out' OR slot IS NOT NULL)
);

CREATE INDEX calendar_event_household ON public.calendar_event (household_id, starts_on);

COMMENT ON TABLE public.calendar_event IS
  'The household''s Calendar: meals out, training and travel the week is planned around, prep and shopping days, reminders. Once or weekly (repeat_days, 0 = Sunday). Local times, Asia/Kolkata.';

ALTER TABLE public.calendar_event ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.calendar_event FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.calendar_event TO authenticated;

CREATE POLICY calendar_event_owner ON public.calendar_event FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.household h WHERE h.id = household_id AND h.owner_id = koi_uid()))
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.household h WHERE h.id = household_id AND h.owner_id = koi_uid())
    AND (member_id IS NULL OR EXISTS (SELECT 1 FROM public.household_member m WHERE m.id = member_id AND m.household_id = calendar_event.household_id))
  );

-- ── The subscription address ────────────────────────────────────────────────
ALTER TABLE public.household ADD COLUMN IF NOT EXISTS calendar_token uuid UNIQUE;
COMMENT ON COLUMN public.household.calendar_token IS
  'The secret in the household''s calendar feed address (/api/calendar/feed/<token>). NULL: no feed. A new value retires the old address.';

/** The events behind one secret address, for a calendar app that can't sign in. */
CREATE OR REPLACE FUNCTION public.calendar_feed(p_token uuid)
RETURNS TABLE (
  id uuid, kind text, title text, starts_on date, ends_on date, at_time time, slot text,
  repeat_days smallint[], until date, member_label text, updated_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT e.id, e.kind, e.title, e.starts_on, e.ends_on, e.at_time, e.slot, e.repeat_days, e.until, m.label, e.updated_at
  FROM public.calendar_event e
  JOIN public.household h ON h.id = e.household_id
  LEFT JOIN public.household_member m ON m.id = e.member_id
  WHERE p_token IS NOT NULL AND h.calendar_token = p_token
  ORDER BY e.starts_on
  LIMIT 500;
$$;

REVOKE ALL ON FUNCTION public.calendar_feed(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.calendar_feed(uuid) TO anon, authenticated;
