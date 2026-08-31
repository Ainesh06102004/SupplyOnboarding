// ============================================================================
// KOI — Session cookie
//
// Verifies the Firebase ID token before trusting it.
//
// This route previously wrote whatever string the client POSTed straight into
// an httpOnly cookie, and middleware.js gates /store/{checkout,orders,profile}
// on that cookie merely existing. Anyone could POST {"token":"x"} and walk in.
//
// Tokens are verified against Google's published signing keys, checking the
// signature, the issuer, the audience and expiry. That needs only the Firebase
// project id — already required for the client SDK — and no service-account
// secret.
//
// Note this is authentication for KOI's own routes. Database authorisation is
// separate and enforced by RLS through public.koi_uid(), which re-verifies the
// same claims inside Postgres. Neither trusts the other.
// ============================================================================

import { NextResponse } from "next/server";
import { createRemoteJWKSet, jwtVerify } from "jose";

const COOKIE_NAME = "koi-auth-token";
const EXPIRES_IN_DAYS = 7;

// Google's public keys for Firebase ID tokens. jose caches and refreshes these,
// so the module-level instance is deliberate — a per-request one would refetch.
const JWKS = createRemoteJWKSet(
  new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com")
);

/**
 * @param {string} token a Firebase ID token
 * @returns {Promise<{ uid: string }>} resolves only for a valid token
 * @throws when the project is unconfigured, or the token fails any check
 */
async function verifyFirebaseIdToken(token) {
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  if (!projectId) {
    // Fail closed. An unconfigured project must not mean "accept anything",
    // which is exactly what this route used to do.
    throw new Error("NEXT_PUBLIC_FIREBASE_PROJECT_ID is not set");
  }

  const { payload } = await jwtVerify(token, JWKS, {
    issuer: `https://securetoken.google.com/${projectId}`,
    audience: projectId,
    algorithms: ["RS256"],
  });

  // jose checks exp and nbf. Firebase additionally guarantees a non-empty sub
  // and an auth_time in the past; a token failing either is malformed.
  if (!payload.sub) throw new Error("Token has no subject");
  if (typeof payload.auth_time === "number" && payload.auth_time > Date.now() / 1000 + 60) {
    throw new Error("Token auth_time is in the future");
  }

  return { uid: payload.sub };
}

export async function POST(request) {
  let token;
  try {
    ({ token } = await request.json());
  } catch {
    return NextResponse.json({ error: "Malformed request body" }, { status: 400 });
  }

  if (!token || typeof token !== "string") {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  try {
    await verifyFirebaseIdToken(token);
  } catch (error) {
    // Don't echo the reason to the caller — it tells an attacker which check
    // failed. The server log keeps the detail.
    console.error("Rejected session token:", error?.message);
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  const response = NextResponse.json({ success: true }, { status: 200 });

  response.cookies.set({
    name: COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: EXPIRES_IN_DAYS * 24 * 60 * 60,
    path: "/",
  });

  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ success: true }, { status: 200 });

  response.cookies.delete({
    name: COOKIE_NAME,
    path: "/",
  });

  return response;
}
