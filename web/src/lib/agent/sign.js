// ============================================================================
// Agent Mode: the memory the browser holds, sealed.
//
// The server keeps no conversation (the shopper's words are never stored), so
// the browser carries it: the model's items (the shopper's messages, KOI's
// tool calls and their results), the draft being built, and what KOI is
// waiting on. The browser could alter any of it — invent a tool result, or an
// approval the shopper never gave — so it goes out sealed: an HMAC over the
// whole memory, bound to the shopper's user id and an expiry. Anything that
// comes back unsealed, altered, someone else's or stale is refused, and the
// run starts from what the database says instead.
// ============================================================================

import { createHmac, timingSafeEqual } from "node:crypto";

/** A conversation left for a day is a new conversation. */
export const MEMORY_TTL_MS = 24 * 60 * 60 * 1000;

/** JSON with sorted keys, so the same memory always signs the same. */
export function stableStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  return `{${Object.keys(value).filter((k) => value[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(",")}}`;
}

const secretOf = (secret) => {
  const s = secret ?? process.env.KOI_AGENT_SIGNING_SECRET;
  if (!s || String(s).length < 16) throw new Error("KOI_AGENT_SIGNING_SECRET is not set");
  return String(s);
};

const mac = (secret, uid, body) => createHmac("sha256", secretOf(secret)).update(`${uid}|${body}`).digest("base64url");

/** A short, stable fingerprint of anything (the args an approval was given for). */
export const fingerprint = (value) => createHmac("sha256", "koi-agent-args").update(stableStringify(value)).digest("base64url").slice(0, 22);

/**
 * @param {object} memory
 * @param {string} uid
 * @param {{ secret?: string, now?: number }} [opts]
 * @returns {{ memory: object, exp: number, sig: string }}
 */
export function sealMemory(memory, uid, { secret, now = Date.now() } = {}) {
  if (!uid) throw new Error("A user id is required to seal a memory.");
  const exp = now + MEMORY_TTL_MS;
  const body = stableStringify({ memory, exp });
  return { memory, exp, sig: mac(secret, uid, body) };
}

/**
 * @param {unknown} sealed what the browser sent back
 * @param {string} uid
 * @param {{ secret?: string, now?: number }} [opts]
 * @returns {object|null} the memory, or null when it is missing, altered, someone else's or expired
 */
export function openMemory(sealed, uid, { secret, now = Date.now() } = {}) {
  if (!sealed || typeof sealed !== "object" || !uid) return null;
  const { memory, exp, sig } = sealed;
  if (!memory || typeof memory !== "object" || typeof sig !== "string" || !Number.isFinite(exp)) return null;
  if (exp < now) return null;
  const expected = mac(secret, uid, stableStringify({ memory, exp }));
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return memory;
}
