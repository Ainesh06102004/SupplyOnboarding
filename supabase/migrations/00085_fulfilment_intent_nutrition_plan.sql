-- ============================================================================
-- 00085 — an order remembers the week's plan it came from
--
-- The Plan's Cart step is now the store's one cart, and checkout hands it to
-- Swiggy like any other basket. Orders can then say "Week plan · Track →" only
-- if the intent records WHICH plan filled it. `plan_id` on this table is
-- already taken — it is the marketplace hand-off plan (00011) — so the
-- household's plan gets its own column.
--
-- ON DELETE SET NULL: a plan row is deleted when the shopper undoes a change
-- (usePlanSession), and an order must outlive that.
--
-- Ownership: a foreign key check ignores RLS, so a shopper could otherwise
-- point their intent at someone else's plan by guessing a uuid. The trigger
-- runs as the INVOKER and keeps the link only if the shopper can read that
-- plan through plan's own RLS; anything else is quietly dropped to NULL rather
-- than failing a checkout over an annotation. The existing koi_uid() policies
-- on fulfilment_intents cover the new column; no policy changes.
-- ============================================================================

ALTER TABLE public.fulfilment_intents
  ADD COLUMN IF NOT EXISTS nutrition_plan_id uuid REFERENCES public.plan(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.fulfilment_intents.nutrition_plan_id IS
  'The household plan (public.plan) whose packs filled this basket, if any. Not the hand-off plan (plan_id).';

CREATE INDEX IF NOT EXISTS fulfilment_intents_nutrition_plan_idx
  ON public.fulfilment_intents (nutrition_plan_id)
  WHERE nutrition_plan_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.fulfilment_intent_own_plan_only()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NEW.nutrition_plan_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.plan p WHERE p.id = NEW.nutrition_plan_id) THEN
    NEW.nutrition_plan_id := NULL;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fulfilment_intent_own_plan_only() FROM PUBLIC;

DROP TRIGGER IF EXISTS fulfilment_intent_own_plan_only ON public.fulfilment_intents;
CREATE TRIGGER fulfilment_intent_own_plan_only
  BEFORE INSERT OR UPDATE OF nutrition_plan_id ON public.fulfilment_intents
  FOR EACH ROW EXECUTE FUNCTION public.fulfilment_intent_own_plan_only();
