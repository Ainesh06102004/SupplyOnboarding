// ============================================================================
// KOI — Phone and OTP, for shoppers
//
// The storefront's primary sign-in. Indian shoppers reach for a number before
// an email, so this is the front door; Google is optional and stays off unless
// NEXT_PUBLIC_ENABLE_GOOGLE_AUTH says otherwise.
//
// WHAT THIS REPLACES:
// The pre-Supabase flow was Firebase phone auth, which needed an invisible
// reCAPTCHA widget mounted in the DOM before a code could be sent, and a third
// form step afterwards to collect a name and write the profile by hand. Neither
// survives: Supabase does its own abuse control server-side, and the profile
// row is created by the on_auth_user_created trigger (migrations 00013/00014).
// That is why this file has no DOM dependency and the sheet has two steps
// instead of three.
//
// THE BIT THAT COSTS MONEY:
// Supabase ships no SMS. Every send here is a paid message through whichever
// provider is wired up at Authentication -> Sign In / Providers -> Phone
// (Twilio, Twilio Verify, MessageBird, Vonage, TextLocal). For Indian numbers
// that provider also needs TRAI DLT registration — an unregistered sender ID or
// an unapproved template is accepted by the API and then silently not
// delivered, which looks exactly like a shopper mistyping their number. If OTPs
// are "sent" but never arrive, check DLT before you check this file.
// ============================================================================

import { getSupabaseClient } from "@/lib/supabase/client";

/** KOI sells in India only, so a bare 10-digit number means +91. */
const DEFAULT_DIALLING_CODE = "91";

/**
 * A number in the format Supabase wants: E.164, leading `+`, no spaces.
 *
 * Accepts what people actually type — "98765 43210", "+91 98765-43210",
 * "919876543210" — because rejecting a number over a space is a bad first
 * impression and the fix is four lines.
 *
 * @param {string} raw
 * @returns {string|null} E.164, or null when it cannot be made into one
 */
export function toE164(raw) {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (!digits) return null;

  // Already carries the country code.
  if (digits.length === 12 && digits.startsWith(DEFAULT_DIALLING_CODE)) {
    return `+${digits}`;
  }
  // A bare national number.
  if (digits.length === 10) {
    return `+${DEFAULT_DIALLING_CODE}${digits}`;
  }
  // Anything else is either a landline, a typo, or a country KOI does not
  // deliver to. Sending it would spend an SMS to find that out.
  return null;
}

/**
 * Indian mobile numbers are ten digits and start 6, 7, 8 or 9. Landlines and
 * short codes do not receive OTPs, so catching them here saves a real charge
 * and gives a better error than the provider's.
 *
 * @param {string} raw
 */
export function isValidMobile(raw) {
  const digits = String(raw ?? "").replace(/\D/g, "");
  const national =
    digits.length === 12 && digits.startsWith(DEFAULT_DIALLING_CODE)
      ? digits.slice(2)
      : digits;
  return /^[6-9]\d{9}$/.test(national);
}

/** "+919876543210" -> "+91 98765 43210", for reading back to the shopper. */
export function formatForDisplay(e164) {
  const match = /^\+(\d{2})(\d{5})(\d{5})$/.exec(String(e164 ?? ""));
  if (!match) return e164 ?? "";
  return `+${match[1]} ${match[2]} ${match[3]}`;
}

/**
 * Send a one-time code.
 *
 * Creates the auth user on first sight — there is no separate signup, which is
 * the point of OTP: a shopper does not have to know whether they already have
 * an account. The profile row follows from the database trigger.
 *
 * @param {string} e164
 * @throws when the provider rejects the send
 */
export async function sendOtp(e164) {
  const supabase = getSupabaseClient();
  const { error } = await supabase.auth.signInWithOtp({ phone: e164 });
  if (error) throw error;
}

/**
 * Exchange the code for a session.
 *
 * On success @supabase/ssr writes the session to cookies, so the very next
 * server render — and proxy.js's route gate — already sees a signed-in shopper.
 * Nothing needs to be POSTed to the server to "establish" the session, which is
 * what the old /api/auth/session route existed to do.
 *
 * @param {string} e164
 * @param {string} token the six digits from the SMS
 * @returns {Promise<object>} the Supabase session payload
 * @throws when the code is wrong or expired
 */
export async function verifyOtp(e164, token) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.auth.verifyOtp({
    phone: e164,
    token,
    type: "sms",
  });
  if (error) throw error;
  return data;
}

/**
 * A message safe to show the person typing.
 *
 * Deliberately does NOT distinguish "no account with this number" from any
 * other failure. OTP sign-in creates the user on demand, so that distinction
 * should never surface — and if a future change turns signups off, leaking it
 * would make the form an account-existence oracle for any phone number.
 */
export function getOtpErrorMessage(error) {
  const message = error?.message ?? "";

  // Supabase's own per-number cooldown. It tells you how long, so pass that on
  // rather than a vague "try later" — the shopper is staring at a form
  // wondering whether it is broken.
  const wait = /after (\d+) seconds?/i.exec(message);
  if (wait) {
    return `Please wait ${wait[1]} seconds before asking for another code.`;
  }
  if (/rate limit|too many requests/i.test(message)) {
    return "Too many attempts. Please try again in a few minutes.";
  }
  if (/token has expired|invalid token|otp_expired/i.test(message)) {
    return "That code is wrong or has expired. Check the SMS, or resend.";
  }
  if (/invalid phone|phone.*invalid/i.test(message)) {
    return "That does not look like a valid mobile number.";
  }
  // The project-level misconfigurations. These are not the shopper's fault and
  // no amount of retrying fixes them, so say something that does not send them
  // round a loop.
  if (/phone.*not enabled|unsupported phone provider|provider.*disabled/i.test(message)) {
    return "Phone sign-in is not switched on yet. Please try again later.";
  }
  if (/error sending|sms.*provider|failed to send/i.test(message)) {
    return "We could not send the code right now. Please try again shortly.";
  }
  if (/signups not allowed/i.test(message)) {
    return "We could not sign you in with that number.";
  }
  return message || "Something went wrong. Please try again.";
}
