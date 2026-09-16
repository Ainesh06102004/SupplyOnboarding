-- ============================================================================
-- KOI — Households, and the plans solved for them
--
-- Phase 3.1. The founder's example is "four of us, these macros, plan it", so
-- a plan is made for a household rather than for an account.
--
-- WHAT A MEMBER IS, AND IS NOT. A member is described by the household's
-- owner, and that is all they are: a label the owner chose ("Me", "Partner",
-- "Kid 1"), an age band, optionally sex and activity level, a diet type, the
-- allergens they avoid, and their targets. There is no name, no date of
-- birth, no account, no login, and nothing behavioural is ever recorded
-- against a member. A child in a household is an age band and a set of
-- targets, because DPDP s.9(3) bars tracking anyone under 18 — including with
-- a parent's consent — and the way to keep that promise is to hold nothing
-- that could track them. Legal review before launch (plan doc §15).
--
-- TARGETS ARE STATED, NOT DERIVED. The plan intended targets to come either
-- from the owner or from ICMR-NIN's recommended intakes. The ICMR-NIN 2020
-- tables could not be read from any source available to this build (the
-- 2024 guidelines PDF exceeds the fetch limit, the 2011 edition and the RDA
-- brief note are scanned or encoded), so nothing is derived: `target_source`
-- records that every figure was stated by the owner. A derived option can be
-- added when the tables can be read and cited, and not before — KOI does not
-- author nutrition numbers.
--
--   public.household                one row per household, owned by koi_uid()
--   public.household_member         who it is for, and what they are aiming at
--   public.household_member_avoid   the allergens and foods each member avoids
--   public.plan                     a solved (or unsolvable) plan, with the
--                                   constraint snapshot it was solved against
--   public.plan_item                the SKUs in it, and each member's share
--
-- All of it is personal data, so all of it is behind row-level security on
-- koi_uid(), granted to authenticated only. anon gets nothing: a signed-out
-- visitor has no household.
-- ============================================================================

CREATE TABLE public.household (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Taken from the verified session, never from a request body.
  owner_id   text NOT NULL DEFAULT koi_uid(),
  label      text CHECK (label IS NULL OR btrim(label) <> ''),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX household_owner ON public.household (owner_id);

CREATE TABLE public.household_member (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id   uuid NOT NULL REFERENCES public.household(id) ON DELETE CASCADE,
  -- A label the owner chose. Never a real name: see the note above.
  label          text NOT NULL CHECK (btrim(label) <> ''),
  age_band       text NOT NULL CHECK (age_band IN (
                   'child_1_3', 'child_4_6', 'child_7_9', 'child_10_12',
                   'teen_13_15', 'teen_16_18', 'adult_19_59', 'senior_60_plus')),
  sex            text CHECK (sex IN ('female', 'male', 'unspecified')),
  activity_level text CHECK (activity_level IN ('sedentary', 'moderate', 'heavy')),
  diet_type      text CHECK (diet_type IN ('vegetarian', 'eggetarian', 'vegan', 'jain', 'non_vegetarian', 'pescatarian')),
  target_kcal      integer CHECK (target_kcal IS NULL OR target_kcal > 0),
  target_protein_g integer CHECK (target_protein_g IS NULL OR target_protein_g >= 0),
  target_carbs_g   integer CHECK (target_carbs_g IS NULL OR target_carbs_g >= 0),
  target_fat_g     integer CHECK (target_fat_g IS NULL OR target_fat_g >= 0),
  target_source  text NOT NULL DEFAULT 'stated' CHECK (target_source IN ('stated')),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX household_member_household ON public.household_member (household_id);

COMMENT ON COLUMN public.household_member.target_source IS
  'How the targets got here. Only ''stated'' exists: KOI derives no nutrient target until ICMR-NIN''s tables can be read and cited.';

CREATE TABLE public.household_member_avoid (
  member_id uuid NOT NULL REFERENCES public.household_member(id) ON DELETE CASCADE,
  avoid_key text NOT NULL REFERENCES public.avoided_item(key),
  PRIMARY KEY (member_id, avoid_key)
);

CREATE TABLE public.plan (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id   uuid NOT NULL REFERENCES public.household(id) ON DELETE CASCADE,
  days           smallint NOT NULL CHECK (days BETWEEN 1 AND 14),
  budget_rupees  numeric CHECK (budget_rupees IS NULL OR budget_rupees > 0),
  -- Availability is zone-scoped, so a plan is only true for one zone.
  zone_id        text,
  status         text NOT NULL CHECK (status IN ('draft', 'solved', 'infeasible')),
  -- Exactly what was solved: members, targets, avoids, budget, the catalogue
  -- and availability as they stood. A plan is a claim about a moment.
  constraints    jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Achieved against asked, per member and per nutrient (Phase 3.4).
  achieved       jsonb,
  -- What blocked it, and what was relaxed, when nothing fits (Phase 3.4).
  explanation    jsonb,
  solver         text,
  solver_version text,
  rule_version   text,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX plan_household ON public.plan (household_id, created_at DESC);

CREATE TABLE public.plan_item (
  plan_id uuid NOT NULL REFERENCES public.plan(id) ON DELETE CASCADE,
  sku_id  uuid NOT NULL REFERENCES public.skus(id),
  packs   smallint NOT NULL CHECK (packs > 0),
  -- member id -> the share of this item that member eats, as a fraction.
  shares  jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (plan_id, sku_id)
);

CREATE TRIGGER household_updated_at BEFORE UPDATE ON public.household
  FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();
CREATE TRIGGER household_member_updated_at BEFORE UPDATE ON public.household_member
  FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();

-- ── Access: the owner's own rows, and nothing else ──────────────────────────

ALTER TABLE public.household ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.household_member ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.household_member_avoid ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_item ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.household, public.household_member, public.household_member_avoid, public.plan, public.plan_item
  TO authenticated, service_role;

CREATE POLICY household_self ON public.household FOR ALL
  USING (koi_uid() IS NOT NULL AND owner_id = koi_uid())
  WITH CHECK (koi_uid() IS NOT NULL AND owner_id = koi_uid());

CREATE POLICY household_member_self ON public.household_member FOR ALL
  USING (EXISTS (SELECT 1 FROM public.household h WHERE h.id = household_id AND h.owner_id = koi_uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.household h WHERE h.id = household_id AND h.owner_id = koi_uid()));

CREATE POLICY household_member_avoid_self ON public.household_member_avoid FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.household_member m
    JOIN public.household h ON h.id = m.household_id
    WHERE m.id = member_id AND h.owner_id = koi_uid()))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.household_member m
    JOIN public.household h ON h.id = m.household_id
    WHERE m.id = member_id AND h.owner_id = koi_uid()));

CREATE POLICY plan_self ON public.plan FOR ALL
  USING (EXISTS (SELECT 1 FROM public.household h WHERE h.id = household_id AND h.owner_id = koi_uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.household h WHERE h.id = household_id AND h.owner_id = koi_uid()));

CREATE POLICY plan_item_self ON public.plan_item FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.plan p
    JOIN public.household h ON h.id = p.household_id
    WHERE p.id = plan_id AND h.owner_id = koi_uid()))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.plan p
    JOIN public.household h ON h.id = p.household_id
    WHERE p.id = plan_id AND h.owner_id = koi_uid()));
