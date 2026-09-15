-- ============================================================================
-- KOI — Screening scores are computed, versioned, and recorded in one place
--
-- Phase 1.2. The seven screening reports that existed were typed by hand —
-- final scores with no sub-scores and no stated basis — and the other eleven
-- live products had none, which kept them out of search and shelves entirely
-- (the recommendation engine requires a score). Scores are now computed from
-- the data by lib/screening/score.js and written here.
--
-- WHY A FUNCTION: a new report is two writes — retire the latest, insert the
-- next version — and the unique index uq_sku_latest_screening allows only one
-- latest row per SKU, so doing them as separate API calls either fails the
-- index or leaves a SKU with no latest report between the two. It also:
--   - skips the write when nothing changed (same scores, verdict and rubric),
--     so re-scoring after every publish does not pile up identical versions;
--   - carries the previous report's flags (brand claims, partial ingredients,
--     dietary) and reviewer notes forward, replacing only `flags.scoring`.
--
-- service_role only; EXECUTE revoked from PUBLIC.
-- ============================================================================

CREATE FUNCTION engine.record_screening(p_sku_id uuid, p_report jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_prev    public.screening_reports%ROWTYPE;
  v_found   boolean;
  v_flags   jsonb;
  v_version integer;
BEGIN
  IF p_report->'scoring'->>'rubric_version' IS NULL THEN
    RAISE EXCEPTION 'a screening report needs the rubric version that produced it';
  END IF;

  SELECT * INTO v_prev FROM public.screening_reports WHERE sku_id = p_sku_id AND is_latest;
  v_found := FOUND;

  IF v_found
     AND v_prev.final_score      IS NOT DISTINCT FROM (p_report->>'final_score')::numeric
     AND v_prev.ingredient_score IS NOT DISTINCT FROM (p_report->>'ingredient_score')::numeric
     AND v_prev.nutrition_score  IS NOT DISTINCT FROM (p_report->>'nutrition_score')::numeric
     AND v_prev.processing_score IS NOT DISTINCT FROM (p_report->>'processing_score')::numeric
     AND v_prev.verdict::text = p_report->>'verdict'
     AND (v_prev.flags->'scoring'->>'rubric_version') IS NOT DISTINCT FROM (p_report->'scoring'->>'rubric_version') THEN
    RETURN jsonb_build_object('sku_id', p_sku_id, 'changed', false, 'version', v_prev.version);
  END IF;

  v_flags := CASE WHEN v_found AND jsonb_typeof(v_prev.flags) = 'object' THEN v_prev.flags - 'scoring' ELSE '{}'::jsonb END
             || jsonb_build_object('scoring', p_report->'scoring');
  v_version := CASE WHEN v_found THEN v_prev.version + 1 ELSE 1 END;

  UPDATE public.screening_reports SET is_latest = false WHERE sku_id = p_sku_id AND is_latest;

  INSERT INTO public.screening_reports
    (sku_id, ingredient_score, nutrition_score, processing_score, final_score, verdict, flags, review_notes, version, is_latest)
  VALUES
    (p_sku_id,
     (p_report->>'ingredient_score')::numeric,
     (p_report->>'nutrition_score')::numeric,
     (p_report->>'processing_score')::numeric,
     (p_report->>'final_score')::numeric,
     (p_report->>'verdict')::public.screening_verdict,
     v_flags,
     CASE WHEN v_found THEN v_prev.review_notes END,
     v_version,
     true);

  RETURN jsonb_build_object(
    'sku_id', p_sku_id, 'changed', true, 'version', v_version,
    'previous_final', CASE WHEN v_found THEN v_prev.final_score END
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION engine.record_screening(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION engine.record_screening(uuid, jsonb) TO service_role;

COMMENT ON FUNCTION engine.record_screening(uuid, jsonb) IS
  'Records a computed screening report as the next version for a SKU: retires the latest, inserts the new one, carries claims/notes forward, and skips the write when nothing changed.';
