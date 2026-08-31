-- ============================================================================
-- KOI — Hardening follow-up to 00008
--
-- koi_uid() was SECURITY DEFINER so it could read koi_settings while callers
-- could not. That is unnecessary: the only value it reads is the Firebase
-- project id, which already ships in the client bundle as
-- NEXT_PUBLIC_FIREBASE_PROJECT_ID. It is not a secret, and knowing it does not
-- help anyone forge a token — those are signed by Google, and the signature is
-- what the check actually rests on.
--
-- Making the function SECURITY INVOKER removes a standing privilege-escalation
-- surface (it is reachable at /rest/v1/rpc/koi_uid) at no cost. EXECUTE stays
-- granted because every RLS policy calls it, and it returns only the caller's
-- own already-known UID.
-- ============================================================================

ALTER TABLE koi_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS koi_settings_read ON koi_settings;
CREATE POLICY koi_settings_read ON koi_settings
  FOR SELECT TO public USING (true);

GRANT SELECT ON koi_settings TO anon, authenticated;
-- Writes stay service-role only: the project id is readable, not settable.
REVOKE INSERT, UPDATE, DELETE ON koi_settings FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.koi_uid()
RETURNS text
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT CASE
    WHEN auth.jwt() ->> 'iss' = 'https://securetoken.google.com/' || s.value
     AND auth.jwt() ->> 'aud' = s.value
    THEN auth.jwt() ->> 'sub'
  END
  FROM koi_settings s
  WHERE s.key = 'firebase_project_id';
$$;

-- Pre-existing trigger functions from 00003/00005 carried a mutable
-- search_path, which is a privilege-escalation vector for a function running as
-- its definer.
ALTER FUNCTION public.trigger_set_updated_at() SET search_path = public;
ALTER FUNCTION public.trigger_set_last_saved_at() SET search_path = public;
