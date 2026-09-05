// ============================================================================
// KOI — Email and password, for the supplier dashboard
//
// This is the supplier-side sign-in behind /login. Shoppers do not use it:
// the storefront signs in with Google through AuthContext, and browses signed
// out until checkout.
//
// It replaces lib/firebase/auth.js one call at a time — same function names,
// same thrown-error contract — so LoginForm changes its import and little else.
//
// WHY EMAIL/PASSWORD SURVIVED THE MOVE OFF FIREBASE:
// Suppliers already have accounts with passwords and no reason to own a Google
// account; removing it would have locked them out to serve a shopper-side
// decision. Supabase has email/password enabled on this project, so keeping it
// costs nothing.
// ============================================================================

import { getSupabaseClient } from "@/lib/supabase/client";

/**
 * A message safe to show the person typing.
 *
 * Supabase reports a wrong password and an unknown address with the same
 * "Invalid login credentials", and that is deliberate — distinguishing them
 * turns the form into an account-existence oracle. This does not undo that.
 */
export function getAuthErrorMessage(error) {
  const message = error?.message ?? "";

  if (/invalid login credentials/i.test(message)) {
    return "Incorrect email or password.";
  }
  if (/email not confirmed/i.test(message)) {
    return "Please confirm your email address first — check your inbox.";
  }
  if (/user already registered|already been registered/i.test(message)) {
    return "An account with this email already exists.";
  }
  if (/password should be at least/i.test(message)) {
    return "Password must be at least 6 characters.";
  }
  if (/rate limit|too many requests/i.test(message)) {
    return "Too many attempts. Please wait a moment and try again.";
  }
  if (/not configured|missing/i.test(message)) {
    return "Sign-in is not configured. Check the Supabase environment variables.";
  }
  return message || "Something went wrong. Please try again.";
}

/** @throws when the credentials are rejected */
export async function signInWithEmail(email, password) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

/**
 * @throws when the address is taken or the password is too weak
 * @returns {Promise<{ needsConfirmation: boolean }>} whether a confirmation
 *   email was sent — the project has mailer_autoconfirm off, so a new account
 *   is not signed in until the link is clicked, and the form must say so
 *   instead of silently appearing to do nothing.
 */
export async function signUpWithEmail(email, password) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;

  // A confirmed-and-signed-in signup returns a session; an unconfirmed one
  // returns a user with none.
  return { needsConfirmation: !data?.session };
}

export async function signOutUser() {
  const supabase = getSupabaseClient();
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}
