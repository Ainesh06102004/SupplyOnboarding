// ============================================================================
// KOI — Provider credentials
//
// SERVER ONLY, and above the RLS ceiling on purpose.
//
// `marketplace_credentials` has RLS enabled with ZERO policies, so anon and
// authenticated cannot read it under any auth provider — the service role is
// the only way in. RLS is the right floor for user-owned data; it is the wrong
// mechanism for secrets, because a policy that can be got right can also be
// got wrong. A table nobody but the server can address has no policy to
// misread.
//
// Tokens are additionally encrypted at rest with AES-256-GCM, so a database
// dump is not a set of live Swiggy sessions.
//
// SWIGGY'S TOKEN MODEL, which shapes everything here:
//   · access tokens last 5 DAYS
//   · there are NO refresh tokens in v1.0 — /auth/token only supports the
//     authorization_code grant
// So a token cannot be renewed silently. When it expires the shopper must
// re-authorise, and the honest thing is to say so rather than retry.
// ============================================================================

import "server-only";

import crypto from "node:crypto";
import { getServiceClient } from "@/lib/supabase/admin";

const TABLE = "marketplace_credentials";
const ALGO = "aes-256-gcm";
const IV_BYTES = 12; // GCM standard
const TAG_BYTES = 16;

let warned = false;

/**
 * The at-rest encryption key, from KOI_CREDENTIAL_KEY.
 *
 * Accepts 64 hex characters or 32+ raw bytes; anything shorter is refused
 * rather than stretched, because silently accepting a weak key is how a
 * credential store ends up encrypted with the word "changeme".
 */
function getKey() {
  const raw = process.env.KOI_CREDENTIAL_KEY;
  if (!raw) {
    if (!warned) {
      warned = true;
      console.warn(
        "KOI_CREDENTIAL_KEY is not set — provider credentials cannot be stored or read, " +
          "so any per-user marketplace connection is unavailable. Generate one with: " +
          "node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
      );
    }
    return null;
  }
  if (/^[0-9a-f]{64}$/i.test(raw)) return Buffer.from(raw, "hex");
  const buf = Buffer.from(raw, "utf8");
  if (buf.length < 32) {
    console.error("KOI_CREDENTIAL_KEY is too short: 32 bytes (64 hex chars) required.");
    return null;
  }
  return buf.subarray(0, 32);
}

/** @returns {Buffer|null} iv || tag || ciphertext */
function encrypt(plaintext) {
  const key = getKey();
  if (!key || !plaintext) return null;
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(String(plaintext), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), enc]);
}

/** @returns {string|null} */
function decrypt(buf) {
  const key = getKey();
  if (!key || !buf) return null;
  try {
    const data = Buffer.isBuffer(buf) ? buf : Buffer.from(buf, "hex");
    const iv = data.subarray(0, IV_BYTES);
    const tag = data.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
    const enc = data.subarray(IV_BYTES + TAG_BYTES);
    const decipher = crypto.createDecipheriv(ALGO, key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
  } catch {
    // A tag mismatch means tampering or a rotated key. Either way there is no
    // usable token, and guessing is not an option GCM offers.
    return null;
  }
}

/**
 * Store a token for one shopper and one marketplace.
 *
 * @param {object} p
 * @param {string} p.profileId
 * @param {string} p.marketplace
 * @param {string} p.accessToken
 * @param {string|null} [p.refreshToken] null under Swiggy v1.0
 * @param {string[]} [p.scopes]
 * @param {Date|string|null} [p.expiresAt]
 * @param {string|null} [p.externalAccountRef]
 * @returns {Promise<boolean>}
 */
export async function saveCredential({
  profileId, marketplace, accessToken,
  refreshToken = null, scopes = [], expiresAt = null, externalAccountRef = null,
}) {
  const supabase = getServiceClient();
  const enc = encrypt(accessToken);
  if (!supabase || !enc) return false;

  const { error } = await supabase.from(TABLE).upsert(
    {
      profile_id: profileId,
      marketplace,
      external_account_ref: externalAccountRef,
      // Postgres bytea over PostgREST takes hex with a \x prefix.
      access_token_enc: `\\x${enc.toString("hex")}`,
      refresh_token_enc: refreshToken ? `\\x${encrypt(refreshToken).toString("hex")}` : null,
      scopes,
      expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "profile_id,marketplace" }
  );

  if (error) {
    // Never log the token, and never log the error object wholesale in case a
    // driver decides to echo the row back.
    console.error("saveCredential failed:", error.message);
    return false;
  }
  return true;
}

/**
 * Read a shopper's token.
 *
 * Returns null when it is missing, undecryptable, or EXPIRED. Expiry is
 * checked here rather than left to the caller because Swiggy cannot refresh:
 * handing back a dead token would turn one honest "please reconnect" into a
 * 401 somewhere further down, dressed as an outage.
 *
 * @returns {Promise<{accessToken: string, expiresAt: string|null, externalAccountRef: string|null}|null>}
 */
export async function getCredential(profileId, marketplace) {
  const supabase = getServiceClient();
  if (!supabase || !profileId || !marketplace) return null;

  const { data, error } = await supabase
    .from(TABLE)
    .select("access_token_enc, expires_at, external_account_ref")
    .eq("profile_id", profileId)
    .eq("marketplace", marketplace)
    .maybeSingle();

  if (error || !data) return null;

  if (data.expires_at && new Date(data.expires_at).getTime() <= Date.now()) return null;

  const hex = typeof data.access_token_enc === "string"
    ? data.access_token_enc.replace(/^\\x/, "")
    : null;
  const accessToken = hex ? decrypt(Buffer.from(hex, "hex")) : null;
  if (!accessToken) return null;

  return {
    accessToken,
    expiresAt: data.expires_at ?? null,
    externalAccountRef: data.external_account_ref ?? null,
  };
}

/** Forget a connection. Used on sign-out and on an unrecoverable 401. */
export async function deleteCredential(profileId, marketplace) {
  const supabase = getServiceClient();
  if (!supabase) return false;
  const { error } = await supabase
    .from(TABLE).delete()
    .eq("profile_id", profileId).eq("marketplace", marketplace);
  return !error;
}

/**
 * The house credential, if KOI has one.
 *
 * Logged-out browse needs an authenticated Swiggy session, because
 * search_products requires an addressId and addresses are per-user — there is
 * no anonymous catalogue read. So a house account is not an optimisation, it
 * is the only mechanism by which a signed-out shopper could ever see live
 * availability.
 *
 * WHETHER KOI MAY OPERATE ONE IS AN OPEN QUESTION WITH SWIGGY. Until it is
 * answered, this returns null and every logged-out product reads `unknown`,
 * which is true and which the UI states plainly.
 */
export async function getHouseCredential(marketplace = "swiggy") {
  const token = process.env.SWIGGY_HOUSE_ACCESS_TOKEN;
  const addressRef = process.env.SWIGGY_HOUSE_ADDRESS_ID;
  if (!token) return null;
  return { accessToken: token, expiresAt: null, externalAccountRef: addressRef ?? null };
}

/** For the credential-store health check; never returns key material. */
export const credentialStoreReady = () => getKey() !== null;
