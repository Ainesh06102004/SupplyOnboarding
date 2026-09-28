// ============================================================================
// A message to whoever is on call, when something breaks. SERVER ONLY.
//
// Posts `{ text }` to KOI_ALERT_WEBHOOK (a Slack or Discord-compatible
// incoming webhook) when it is set; otherwise nothing but the log line. At
// most one alert per kind every 10 minutes per server instance, so a failing
// model doesn't page anyone forty times. Never carries a shopper's words.
// ============================================================================

import "server-only";

const QUIET_MS = 10 * 60 * 1000;
const lastSent = new Map();

/**
 * @param {string} kind a short stable key, e.g. "agent_error"
 * @param {string} text what happened, in KOI's words (no shopper text, no ids)
 */
export async function alert(kind, text) {
  const now = Date.now();
  if (now - (lastSent.get(kind) ?? 0) < QUIET_MS) return;
  lastSent.set(kind, now);
  const url = process.env.KOI_ALERT_WEBHOOK;
  if (!url) return;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // Slack reads `text`, Discord reads `content`.
      body: JSON.stringify({ text: `[KOI] ${text}`, content: `[KOI] ${text}` }),
      signal: AbortSignal.timeout(4000),
    });
  } catch (err) {
    console.error("[alert]", kind, err?.message ?? "failed");
  }
}
