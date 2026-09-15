// ============================================================================
// KOI — The secret Vercel Cron sends to the engine's scheduled routes
//
// SERVER ONLY. Every scheduled route spends model credit, so each is closed
// unless CRON_SECRET is set, and the header is compared in constant time.
// ============================================================================

import "server-only";

import { timingSafeEqual } from "node:crypto";

/**
 * @param {Request} request
 * @returns {{ status: number, body: { error: string } }|null} null when the call may proceed
 */
export function cronRefusal(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return { status: 503, body: { error: "CRON_SECRET is not set, so the engine's scheduled routes are off." } };
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(request.headers.get("authorization") || "");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return { status: 401, body: { error: "Not authorised." } };
  }
  return null;
}
