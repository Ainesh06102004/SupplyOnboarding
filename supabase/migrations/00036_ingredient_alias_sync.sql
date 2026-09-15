-- ============================================================================
-- KOI — Keep the ingredient seed and the allergen graph from drifting apart
--
-- Since 00035 every name a label may print lives twice: in
-- food.ingredients_master.aliases (what supabase/seed/ingredients_master.sql
-- writes) and in food.ingredient_alias (what the allergen graph matches on).
-- Re-running the seed updated the first and never the second, so a name added
-- to the seed would silently never reach the graph.
--
--   food.ingredient_names        every name the master lists, normalised, with
--                                the ownership order 00035 used: the specific
--                                ingredient before the allergen group, a
--                                canonical name before an alias.
--   food.sync_ingredient_aliases adds names the graph does not have yet, under
--                                that order. It never deletes: removing a name
--                                from the graph changes what KOI detects and is
--                                done deliberately, in a migration.
--   food.ingredient_alias_drift  names the master lists that the graph lacks,
--                                and graph names no ingredient lists any more.
--
-- web/scripts/applyIngredientsSeed.mjs calls the sync after every upsert and the
-- drift report in --check. service_role only.
-- ============================================================================

CREATE VIEW food.ingredient_names WITH (security_invoker = true) AS
  SELECT m.id AS ingredient_id,
         a AS alias,
         btrim(regexp_replace(lower(extensions.unaccent('extensions.unaccent'::regdictionary, a)), '[^a-z0-9]+', ' ', 'g')) AS normalised,
         (m.ingredient_category = 'allergen') AS is_allergen_group,
         1 AS name_rank
  FROM food.ingredients_master m, jsonb_array_elements_text(m.aliases) AS a
  UNION ALL
  SELECT m.id,
         m.canonical_name,
         btrim(regexp_replace(lower(extensions.unaccent('extensions.unaccent'::regdictionary, m.canonical_name)), '[^a-z0-9]+', ' ', 'g')),
         (m.ingredient_category = 'allergen'),
         0
  FROM food.ingredients_master m;

REVOKE ALL ON food.ingredient_names FROM PUBLIC, anon, authenticated;
GRANT SELECT ON food.ingredient_names TO service_role;

CREATE FUNCTION food.sync_ingredient_aliases()
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_added integer;
BEGIN
  WITH owners AS (
    SELECT DISTINCT ON (n.normalised) n.ingredient_id, n.alias, n.normalised
    FROM food.ingredient_names n
    WHERE n.normalised <> ''
    ORDER BY n.normalised, n.is_allergen_group, n.name_rank
  ), added AS (
    INSERT INTO food.ingredient_alias (ingredient_id, alias)
    SELECT o.ingredient_id, o.alias
    FROM owners o
    WHERE NOT EXISTS (SELECT 1 FROM food.ingredient_alias ia WHERE ia.normalised = o.normalised)
    ON CONFLICT (normalised) DO NOTHING
    RETURNING 1
  )
  SELECT count(*)::integer INTO v_added FROM added;

  UPDATE food.ingredient_alias SET language = 'en' WHERE language IS NULL;
  RETURN v_added;
END;
$$;

CREATE FUNCTION food.ingredient_alias_drift()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'missing', COALESCE((
      SELECT jsonb_agg(DISTINCT n.alias ORDER BY n.alias)
      FROM food.ingredient_names n
      WHERE n.normalised <> ''
        AND NOT EXISTS (SELECT 1 FROM food.ingredient_alias ia WHERE ia.normalised = n.normalised)
    ), '[]'::jsonb),
    'orphaned', COALESCE((
      SELECT jsonb_agg(ia.alias ORDER BY ia.alias)
      FROM food.ingredient_alias ia
      WHERE NOT EXISTS (SELECT 1 FROM food.ingredient_names n WHERE n.normalised = ia.normalised)
    ), '[]'::jsonb)
  );
$$;

REVOKE EXECUTE ON FUNCTION food.sync_ingredient_aliases() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION food.ingredient_alias_drift() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION food.sync_ingredient_aliases() TO service_role;
GRANT EXECUTE ON FUNCTION food.ingredient_alias_drift() TO service_role;
