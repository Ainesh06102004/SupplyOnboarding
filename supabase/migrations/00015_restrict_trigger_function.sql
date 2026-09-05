-- ============================================================================
-- KOI — Take the signup trigger off the public API
--
-- handle_new_auth_user() is SECURITY DEFINER: it has to be, because the trigger
-- fires as GoTrue's role, which holds no privileges on public.customer_profiles
-- (see 00013). But it lives in `public`, and everything in `public` is exposed
-- by PostgREST — so Supabase's linter correctly reports that `anon` can reach
-- it at /rest/v1/rpc/handle_new_auth_user with the definer's rights.
--
-- HOW BAD IS IT, HONESTLY:
-- Not very. Postgres refuses to invoke a function returning `trigger` outside
-- a trigger context, so the call fails before the body runs. This is a locked
-- door on a wall rather than an open one. It is still worth revoking: the
-- protection is incidental rather than intended, nothing needs the grant, and
-- "it happens not to be reachable" is a worse thing to rely on than "it is not
-- granted". A later refactor that changes the return type would silently turn
-- a non-issue into a real one.
--
-- WHY THIS DOES NOT BREAK SIGNUP:
-- Postgres checks EXECUTE on a trigger function against the role performing the
-- INSERT — which for a signup is supabase_auth_admin, not anon. That grant is
-- made explicit below rather than left to inheritance, because the whole point
-- of this migration is to stop depending on privileges nobody stated.
-- ============================================================================

REVOKE ALL ON FUNCTION public.handle_new_auth_user() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.handle_new_auth_user() FROM anon;
REVOKE ALL ON FUNCTION public.handle_new_auth_user() FROM authenticated;

-- The roles that genuinely fire this: GoTrue when a user signs up, and the
-- owner for migrations and backfills.
GRANT EXECUTE ON FUNCTION public.handle_new_auth_user() TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION public.handle_new_auth_user() TO postgres;

COMMENT ON FUNCTION public.handle_new_auth_user() IS
  'Creates the customer_profiles row for a new auth user. Fills whatever the provider gave us — Google brings a name and email, phone OTP brings a number — and never fails the signup: a duplicate phone is dropped rather than raised, because raising here makes the account uncreatable. EXECUTE is granted only to supabase_auth_admin and postgres; it is not callable through the REST API.';
