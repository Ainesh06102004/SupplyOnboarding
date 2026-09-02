// ============================================================================
// KOI — Who is calling this route?
//
// SERVER ONLY. Verifies a Firebase ID token from the session cookie against
// Google's published signing keys, checking signature, issuer, audience and
// expiry.
//
// This exists because middleware.js is a REDIRECT HINT, not a boundary: it
// gates /store/{checkout,orders,profile} on the cookie merely EXISTING, and it
// does not run for API routes at all. Any route that acts on a specific
// shopper — spending their provider quota, replacing their cart — has to
// establish who they are for itself.
//
// The extraction is the point. This logic previously lived only inside
// /api/auth/session, so a second privileged route either duplicated it or, far
// more likely, skipped it.
//
// Two independent checks guard shopper data, and neither trusts the other:
// this one (KOI's own routes) and public.koi_uid() inside Postgres (RLS).
// ============================================================================

import "server-only";

import { createRemoteJWKSet, jwtVerify } from "jose";

const COOKIE_NAME = "koi-auth-token";

// Google's public keys for Firebase ID tokens. jose caches and refreshes them,
// so the module-level instance is deliberate — a per-request one would refetch
// on every call.
const JWKS = createRemoteJWKSet(
  new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com")
);

/**
 * @param {string} token
 * @returns {Promise<{ uid: string }>} resolves only for a valid token
 */
export async function verifyFirebaseIdToken(token) {
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  // Fail closed. An unconfigured project must never mean "accept anything".
  if (!projectId) throw new Error("NEXT_PUBLIC_FIREBASE_PROJECT_ID is not set");

  const { payload } = await jwtVerify(token, JWKS, {
    issuer: `https://securetoken.google.com/${projectId}`,
    audience: projectId,
    algorithms: ["RS256"],
  });

  if (!payload.sub) throw new Error("Token has no subject");
  if (typeof payload.auth_time === "number" && payload.auth_time > Date.now() / 1000 + 60) {
    throw new Error("Token auth_time is in the future");
  }
  return { uid: payload.sub };
}

/**
 * The verified shopper behind a request, or null.
 *
 * Reads the httpOnly session cookie — never a uid from the request body, which
 * would let any caller name whoever they liked.
 *
 * @param {Request} request
 * @returns {Promise<{ uid: string }|null>}
 */
export async function getVerifiedUser(request) {
  const cookie = request.cookies?.get?.(COOKIE_NAME);
  const token = cookie?.value;
  if (!token) return null;

  try {
    return await verifyFirebaseIdToken(token);
  } catch (error) {
    // The reason stays in the log: telling a caller which check failed tells
    // an attacker which check to work on.
    console.error("Rejected request token:", error?.message);
    return null;
  }
}

export const SESSION_COOKIE = COOKIE_NAME;
