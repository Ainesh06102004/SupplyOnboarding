-- ============================================================================
-- KOI — The demand queue: what shoppers look for that KOI cannot answer
--
-- Phase 1.3. The interpreter already knows two kinds of miss:
--   not_stocked    a product word that matched nothing in the catalogue
--                  ("kombucha", "keto bread")
--   cannot_filter  a restriction KOI recognised but has no key to enforce
--                  ("mushroom free")
-- Counted, they become the "what to onboard next" list (/staff/demand).
--
-- PRIVACY. A shopper's free text can carry health data, so this stores the
-- least that answers the question:
--   - a term and a running count. Never the sentence, a user id, a session id,
--     an IP address, or a time finer than the day.
--   - terms are cleaned twice before they get here (lib/demand/terms.js, on
--     the device and again in /api/demand): letters only, 3–40 characters, at
--     most three words, medical and other health-state words dropped.
--   - the CHECK below repeats the no-digits rule, so a phone number or a
--     figure cannot be stored even by a caller that skipped that code.
--   - a term is shown to anyone only once it has 5 occurrences (PUBLISH_AT).
--
-- service_role only: RLS on with no policies, EXECUTE revoked from PUBLIC.
-- ============================================================================

CREATE TABLE engine.demand_queue (
  term        text    NOT NULL CHECK (char_length(term) BETWEEN 3 AND 40 AND term !~ '[0-9@]'),
  kind        text    NOT NULL CHECK (kind IN ('not_stocked', 'cannot_filter')),
  occurrences integer NOT NULL DEFAULT 1 CHECK (occurrences > 0),
  first_seen  date    NOT NULL DEFAULT current_date,
  last_seen   date    NOT NULL DEFAULT current_date,
  PRIMARY KEY (term, kind)
);

ALTER TABLE engine.demand_queue ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON engine.demand_queue FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON engine.demand_queue TO service_role;

CREATE INDEX demand_queue_occurrences_idx ON engine.demand_queue (occurrences DESC);

COMMENT ON TABLE engine.demand_queue IS
  'Aggregate counts of search terms KOI could not answer. No sentence, identity or time finer than a day is ever stored.';

-- One call per search: up to four distinct terms, each counted once.
CREATE FUNCTION engine.record_demand(p_terms jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_count integer;
BEGIN
  IF jsonb_typeof(p_terms) IS DISTINCT FROM 'array' THEN
    RETURN 0;
  END IF;

  WITH incoming AS (
    SELECT DISTINCT lower(btrim(t->>'term')) AS term, t->>'kind' AS kind
    FROM jsonb_array_elements(p_terms) AS t
    WHERE jsonb_typeof(t) = 'object' AND t->>'term' IS NOT NULL
    LIMIT 4
  ), upserted AS (
    INSERT INTO engine.demand_queue AS d (term, kind)
    SELECT term, kind FROM incoming
    ON CONFLICT (term, kind) DO UPDATE
      SET occurrences = d.occurrences + 1, last_seen = current_date
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM upserted;

  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION engine.record_demand(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION engine.record_demand(jsonb) TO service_role;

COMMENT ON FUNCTION engine.record_demand(jsonb) IS
  'Counts up to four cleaned search terms, once each, into engine.demand_queue.';
