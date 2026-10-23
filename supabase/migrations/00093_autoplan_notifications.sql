-- ============================================================================
-- 00093_autoplan_notifications — KOI drafts next week's plan on a schedule,
-- and tells the household (exact macros, P7).
--
-- Decided with the user (23 Oct 2026): notifications are in-app for now;
-- WhatsApp (the Cloud API) comes next, so every notification already carries
-- the WhatsApp template it would be sent as, a job says which channels it
-- uses, and a person's opt-in to a channel is recorded the way WhatsApp
-- requires (when, and how they opted in). The phone number is never stored
-- here: it is the person's sign-in identity (Supabase Auth).
--
-- autoplan_job  one per household, set by its owner (RLS). The hourly job
--               (/api/engine/autoplan, CRON_SECRET) finds the jobs that are due,
--               plans for the household as its owner would (the planner, with
--               the service role, scoped in code to that household), and keeps
--               the plan as a DRAFT starting on the day the rules say. A draft
--               does not replace the week on screen until the owner approves it,
--               and nothing goes into the cart unless they press it. KOI never
--               checks out.
-- notification  the in-app inbox: written by the server only, read and marked
--               read by the person it is for. ref makes a notification once-only
--               (one per job run, one per reminder per day).
-- notify_consent a person's opt-in (or out) per channel, for WhatsApp.
-- ============================================================================

CREATE TABLE public.autoplan_job (
  household_id  uuid PRIMARY KEY REFERENCES public.household(id) ON DELETE CASCADE,
  weekday       smallint NOT NULL DEFAULT 0 CHECK (weekday BETWEEN 0 AND 6),
  local_time    time NOT NULL DEFAULT '18:00',
  -- India only for now: every time is IST.
  tz            text NOT NULL DEFAULT 'Asia/Kolkata' CHECK (tz = 'Asia/Kolkata'),
  -- { days, budget, member_ids, start: "next_day" | "next_monday" }
  rules         jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(rules) = 'object'),
  channels      text[] NOT NULL DEFAULT ARRAY['in_app']::text[] CHECK (cardinality(channels) >= 1 AND channels <@ ARRAY['in_app', 'whatsapp']::text[]),
  paused        boolean NOT NULL DEFAULT false,
  next_run_at   timestamptz,
  last_run_at   timestamptz,
  last_plan_id  uuid REFERENCES public.plan(id) ON DELETE SET NULL,
  last_error    text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX autoplan_job_due ON public.autoplan_job (next_run_at) WHERE NOT paused;

COMMENT ON TABLE public.autoplan_job IS
  'Auto-plan: when KOI drafts the household''s next plan (a weekday and an IST time), with what rules, and which channels tell them. Drafts only; the owner approves; nothing is ordered.';

ALTER TABLE public.autoplan_job ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.autoplan_job FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.autoplan_job TO authenticated;

CREATE POLICY autoplan_job_owner ON public.autoplan_job FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.household h WHERE h.id = household_id AND h.owner_id = koi_uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.household h WHERE h.id = household_id AND h.owner_id = koi_uid()));

-- ── The inbox ───────────────────────────────────────────────────────────────
CREATE TABLE public.notification (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The person it is for: an auth user id, as household.owner_id is.
  recipient_id     text NOT NULL,
  household_id     uuid REFERENCES public.household(id) ON DELETE CASCADE,
  kind             text NOT NULL CHECK (kind IN ('autoplan_ready', 'autoplan_failed', 'reminder', 'plan_day', 'shop_day')),
  title            text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
  body             text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 600),
  href             text CHECK (href IS NULL OR href LIKE '/store/%'),
  -- The WhatsApp template it would be sent as, and its parameters, in order.
  template         text,
  template_params  jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(template_params) = 'array'),
  channels         text[] NOT NULL DEFAULT ARRAY['in_app']::text[],
  -- Per channel: { "in_app": { "at": … }, "whatsapp": { "at": …, "id": …, "skipped": … } }
  sent             jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(sent) = 'object'),
  -- Once only: "autoplan:<household>:<run>", "event:<id>:<date>".
  ref              text,
  read_at          timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notification_once UNIQUE (recipient_id, ref)
);

CREATE INDEX notification_recipient ON public.notification (recipient_id, created_at DESC);

COMMENT ON TABLE public.notification IS
  'The in-app inbox. Written by KOI''s server only; the recipient reads it, marks it read and deletes it. Each row carries its WhatsApp template so the channel can be added without rewriting a message.';

ALTER TABLE public.notification ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.notification FROM PUBLIC, anon;
GRANT SELECT, DELETE ON public.notification TO authenticated;
-- Marking read is the only change a person makes.
GRANT UPDATE (read_at) ON public.notification TO authenticated;

CREATE POLICY notification_mine ON public.notification FOR ALL TO authenticated
  USING (koi_uid() IS NOT NULL AND recipient_id = koi_uid())
  WITH CHECK (koi_uid() IS NOT NULL AND recipient_id = koi_uid());

-- ── Consent, per person and channel ─────────────────────────────────────────
CREATE TABLE public.notify_consent (
  account_id    text NOT NULL DEFAULT koi_uid(),
  channel       text NOT NULL CHECK (channel IN ('whatsapp')),
  opted_in_at   timestamptz,
  opted_out_at  timestamptz,
  -- How they said so: on KOI's settings, by replying on WhatsApp, or to KOI.
  source        text NOT NULL CHECK (source IN ('settings', 'whatsapp_reply', 'koi')),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, channel),
  CONSTRAINT notify_consent_said CHECK (opted_in_at IS NOT NULL OR opted_out_at IS NOT NULL)
);

COMMENT ON TABLE public.notify_consent IS
  'A person''s opt-in or opt-out for a notification channel (WhatsApp requires a recorded opt-in). The phone number is their sign-in identity, not stored here.';

ALTER TABLE public.notify_consent ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.notify_consent FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notify_consent TO authenticated;

CREATE POLICY notify_consent_mine ON public.notify_consent FOR ALL TO authenticated
  USING (koi_uid() IS NOT NULL AND account_id = koi_uid())
  WITH CHECK (koi_uid() IS NOT NULL AND account_id = koi_uid());
