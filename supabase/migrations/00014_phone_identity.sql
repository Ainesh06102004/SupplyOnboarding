-- ============================================================================
-- KOI — Identity: phone becomes the front door
--
-- 00013 moved identity to Supabase Auth and created customer_profiles rows from
-- a trigger, writing (id, display_name, email) because the only provider was
-- Google and Google supplies all three. Phone OTP supplies none of them: a
-- phone signup has NULL email, NULL name, and a number that 00013 threw away.
--
-- Nothing about the schema changes. customer_profiles.phone has existed since
-- 00008 and is nullable, as are display_name and email, so a phone-only shopper
-- already fits the table — the trigger simply was not told to fill the column.
-- This migration is that one INSERT, plus a backfill and one guard.
--
-- WHY THE '+' IS ADDED BACK:
-- GoTrue stores auth.users.phone in E.164 WITHOUT the leading plus
-- ('919876543210'). Every other phone in this database carries it —
-- delivery_addresses.phone, and what the old Firebase flow wrote — and the UI
-- renders the column raw. Normalising here keeps one representation in the
-- database instead of two that differ by a character nobody will remember.
-- ============================================================================

-- ── The profile a new shopper gets ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  normalised_phone text;
BEGIN
  -- Empty string rather than NULL is what GoTrue writes for a user with no
  -- phone, and '' would occupy the unique index that NULL is exempt from — so
  -- the first email signup would take the slot and the second would fail.
  normalised_phone := nullif(NEW.phone, '');
  IF normalised_phone IS NOT NULL AND left(normalised_phone, 1) <> '+' THEN
    normalised_phone := '+' || normalised_phone;
  END IF;

  BEGIN
    INSERT INTO public.customer_profiles (id, display_name, email, phone)
    VALUES (
      NEW.id::text,
      -- Google supplies the display name as `full_name`, other providers as
      -- `name`. A phone signup supplies neither; the column is nullable and the
      -- profile page already renders "Your account" rather than a placeholder
      -- name it was not given.
      coalesce(
        NEW.raw_user_meta_data ->> 'full_name',
        NEW.raw_user_meta_data ->> 'name'
      ),
      NEW.email,
      normalised_phone
    )
    ON CONFLICT (id) DO NOTHING;

  EXCEPTION WHEN unique_violation THEN
    -- Reachable, and worth catching. uq_customer_profiles_phone is unique, and
    -- profileService.upsertProfile lets any signed-in shopper write any string
    -- into their OWN phone column — including a number that is not theirs. If
    -- the real owner of that number then signs up, this trigger raises inside
    -- the auth.users INSERT, which aborts the whole signup and shows them
    -- "Database error saving new user". They would be permanently unable to
    -- sign in, through no action of their own.
    --
    -- A profile without a phone is a far smaller problem than a shopper who
    -- cannot create an account, so drop the phone and let them in. The number
    -- is still on auth.users, which is the record that actually authenticates.
    INSERT INTO public.customer_profiles (id, display_name, email)
    VALUES (
      NEW.id::text,
      coalesce(
        NEW.raw_user_meta_data ->> 'full_name',
        NEW.raw_user_meta_data ->> 'name'
      ),
      NEW.email
    )
    ON CONFLICT (id) DO NOTHING;
  END;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.handle_new_auth_user() IS
  'Creates the customer_profiles row for a new auth user. Fills whatever the provider gave us — Google brings a name and email, phone OTP brings a number — and never fails the signup: a duplicate phone is dropped rather than raised, because raising here makes the account uncreatable.';

-- The trigger itself is unchanged from 00013 and still points at this function,
-- but recreating it is free and makes this migration standalone if 00013 is
-- ever squashed or reordered.
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

-- ── Backfill the number for anyone who signed up before this ────────────────
-- Only fills a NULL; never overwrites a phone a shopper set themselves, and
-- never steals a number already spoken for by another row.
UPDATE public.customer_profiles p
SET    phone = '+' || u.phone,
       updated_at = now()
FROM   auth.users u
WHERE  p.id = u.id::text
  AND  p.phone IS NULL
  AND  nullif(u.phone, '') IS NOT NULL
  AND  NOT EXISTS (
         SELECT 1 FROM public.customer_profiles other
         WHERE  other.phone = '+' || u.phone
           AND  other.id <> p.id
       );

-- ── And the rows that predate the trigger entirely ──────────────────────────
INSERT INTO public.customer_profiles (id, display_name, email, phone)
SELECT
  u.id::text,
  coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name'),
  u.email,
  CASE WHEN nullif(u.phone, '') IS NULL THEN NULL ELSE '+' || u.phone END
FROM auth.users u
ON CONFLICT (id) DO NOTHING;
