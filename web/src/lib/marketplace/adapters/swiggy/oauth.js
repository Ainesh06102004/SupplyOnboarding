// ============================================================================
// KOI — Connecting a shopper's own Swiggy account
//
// SERVER ONLY. OAuth 2.1 with PKCE (S256), which Swiggy's MCP documents as the
// only supported flow. Nothing here ever reaches the browser.
//
// WHY A SHOPPER CONNECTS AT ALL, RATHER THAN KOI DOING IT FOR THEM:
// `update_cart` writes to a Swiggy cart, and the cart a shopper checks out and
// pays from is the one on their OWN account. KOI is not merchant of record. A
// KOI house account could power browsing, but it could never complete an
// order — so a per-shopper credential is not a fallback for the house one, it
// is the only path that reaches a purchase.
//
// ENDPOINTS CONFIRMED against the published docs (start/authenticate.md,
// checked 7 Sep 2026): authorize is https://mcp.swiggy.com/auth/authorize and
// token is https://mcp.swiggy.com/auth/token, which is what the origin-derived
// defaults below produce. Still overridable by environment, because staging
// lives on a different host (mcp-staging.swiggy.com).
//
// DYNAMIC CLIENT REGISTRATION IS NOT A ROUTE IN FOR KOI. The docs describe
// POST /auth/register as something recognised MCP clients — Claude Desktop,
// Cursor, ChatGPT, mcp-remote — call transparently. A custom application with
// its own redirect URI is told, in as many words, to email builders@swiggy.in.
// So SWIGGY_CLIENT_ID has to be issued; it cannot be self-served.
//
// The FLOW remains unverified against a live server even though the URLs are
// not: nobody has completed a round trip yet.
//
// TOKEN LIFETIME: 5 days, and v1.0 issues NO refresh token. Reconnection is a
// normal part of the lifecycle rather than an error — see AuthExpiredError and
// the note in credentials.getCredential(), which returns null for an expired
// token so the shopper is asked to reconnect instead of meeting a 401 further
// down dressed as an outage.
// ============================================================================

import "server-only";

import { createHash, randomBytes } from "crypto";

/** base64url without padding, per RFC 7636. */
const b64url = (buf) => buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/** The origin the MCP endpoint lives on; auth paths hang off the same host. */
function origin() {
  const raw = process.env.SWIGGY_MCP_URL || "https://mcp.swiggy.com/im";
  try {
    return new URL(raw).origin;
  } catch {
    return "https://mcp.swiggy.com";
  }
}

export const authorizeEndpoint = () =>
  process.env.SWIGGY_OAUTH_AUTHORIZE_URL || `${origin()}/auth/authorize`;

export const tokenEndpoint = () =>
  process.env.SWIGGY_OAUTH_TOKEN_URL || `${origin()}/auth/token`;

/** Configured enough to attempt a connection at all. */
export const oauthReady = () => Boolean(process.env.SWIGGY_CLIENT_ID);

/**
 * The redirect URI to register with Swiggy, and to send on BOTH legs of the
 * exchange.
 *
 * Swiggy matches redirect URIs EXACTLY, so the string cannot vary. Deriving it
 * from the request origin is right in development — localhost, whatever port —
 * but wrong the moment the app is deployed anywhere that hands out a URL per
 * build: a Vercel preview is a fresh hostname on every push, so a derived URI
 * would never match the one on file and every connection attempt would be
 * rejected at the consent screen.
 *
 * KOI_PUBLIC_ORIGIN pins it. Unset, the request origin is used, which is what
 * dev wants. This is derivation, not a hardcoded fallback: there is no default
 * domain baked in anywhere.
 *
 * Both the authorize call and the token exchange MUST pass the same string, or
 * the exchange fails after the shopper has already consented — the worst place
 * to fail, because it looks like they did something wrong.
 *
 * @param {string} requestOrigin origin of the incoming request
 * @returns {string}
 */
export function callbackUri(requestOrigin) {
  const pinned = process.env.KOI_PUBLIC_ORIGIN;
  const base = pinned ? pinned.replace(/\/+$/, "") : requestOrigin;
  return `${base}/api/marketplace/connect/swiggy/callback`;
}

/**
 * A fresh PKCE pair plus CSRF state.
 *
 * The verifier is the secret: it never leaves the server, and only the
 * challenge (its SHA-256) travels to Swiggy. That is what stops an intercepted
 * authorization code being redeemed by anyone but us.
 *
 * @returns {{ verifier: string, challenge: string, state: string }}
 */
export function createPkce() {
  // 32 random bytes → 43 base64url chars, the minimum RFC 7636 allows.
  const verifier = b64url(randomBytes(32));
  const challenge = b64url(createHash("sha256").update(verifier).digest());
  return { verifier, challenge, state: b64url(randomBytes(16)) };
}

/**
 * Where to send the shopper to approve the connection.
 *
 * @param {{ challenge: string, state: string, redirectUri: string, scopes?: string[] }} p
 * @returns {string}
 */
export function buildAuthorizeUrl({ challenge, state, redirectUri, scopes = [] }) {
  const url = new URL(authorizeEndpoint());
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", process.env.SWIGGY_CLIENT_ID || "");
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("code_challenge", challenge);
  // S256 only. OAuth 2.1 removes `plain`, and sending it would be asking for
  // the one variant that offers no protection.
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("state", state);
  if (scopes.length) url.searchParams.set("scope", scopes.join(" "));
  return url.toString();
}

/**
 * Redeem the authorization code.
 *
 * @param {{ code: string, verifier: string, redirectUri: string }} p
 * @returns {Promise<{accessToken: string, refreshToken: string|null, expiresAt: string|null, scopes: string[]}>}
 * @throws when the exchange fails. The caller must not treat a failure as a
 *   connection — a half-connected account that reports itself connected is
 *   worse than no connection.
 */
export async function exchangeCode({ code, verifier, redirectUri }) {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    client_id: process.env.SWIGGY_CLIENT_ID || "",
    code_verifier: verifier,
  });

  const headers = { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" };
  // A confidential client authenticates on the token endpoint; a public one
  // relies on PKCE alone. Supporting both means the secret is optional rather
  // than invented.
  const secret = process.env.SWIGGY_CLIENT_SECRET;
  if (secret) {
    const basic = Buffer.from(`${process.env.SWIGGY_CLIENT_ID}:${secret}`).toString("base64");
    headers.Authorization = `Basic ${basic}`;
  }

  const res = await fetch(tokenEndpoint(), { method: "POST", headers, body });

  if (!res.ok) {
    // The body may echo the code or the verifier, so it is not logged and not
    // returned. The status is enough to act on.
    throw new Error(`Token exchange failed with ${res.status}`);
  }

  const data = await res.json().catch(() => null);
  const accessToken = data?.access_token;
  if (!accessToken) throw new Error("Token exchange returned no access_token");

  // Swiggy v1.0 issues no refresh token. If one ever appears, storing it costs
  // nothing; assuming one exists would have cost a broken reconnect path.
  const expiresIn = Number(data?.expires_in);
  return {
    accessToken,
    refreshToken: data?.refresh_token ?? null,
    expiresAt: Number.isFinite(expiresIn) && expiresIn > 0
      ? new Date(Date.now() + expiresIn * 1000).toISOString()
      : null,
    scopes: typeof data?.scope === "string" ? data.scope.split(/\s+/).filter(Boolean) : [],
  };
}

/**
 * The shopper's default Swiggy address id.
 *
 * Fetched at connect time because every read tool needs an `addressId` and
 * there is no way to ask for "the default" later without spending a call. A
 * failure here is NOT a failed connection — the token is good, KOI just has no
 * address for it yet, which resolves to `unknown` rather than to an error.
 *
 * @param {string} accessToken
 * @returns {Promise<string|null>}
 */
export async function fetchDefaultAddressId(accessToken) {
  try {
    const { callTool } = await import("./client");
    const { data } = await callTool({ tool: "get_addresses", args: {}, accessToken });
    const list = Array.isArray(data?.addresses) ? data.addresses : [];
    if (!list.length) return null;
    const chosen = list.find((a) => a?.isDefault || a?.is_default) ?? list[0];
    const id = chosen?.addressId ?? chosen?.id ?? null;
    return id === null || id === undefined ? null : String(id);
  } catch (err) {
    console.error("fetchDefaultAddressId:", err?.message);
    return null;
  }
}
