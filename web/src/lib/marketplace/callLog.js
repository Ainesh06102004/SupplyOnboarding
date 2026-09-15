// ============================================================================
// KOI — Marketplace call log
//
// SERVER ONLY. One row per provider call KOI makes to link a SKU, so quota use
// can be audited against the documented limits (lib/marketplace/config.js).
//
// Swiggy's rule for logs is to keep only what debugging needs — never request
// or response bodies, never a user's identity. marketplace_call_log has no
// column for either, so neither can be written here.
//
// Best-effort: a failed log line never fails the shopper's request.
// ============================================================================

import "server-only";

import { getServiceClient } from "@/lib/supabase/admin";

const OUTCOMES = new Set(["ok", "error", "rate_limited", "stale"]);

/**
 * @param {{ marketplace: string, route: string, zoneId?: string|null, credentialScope?: "house"|"user", latencyMs?: number|null, outcome: "ok"|"error"|"rate_limited"|"stale" }} call
 */
export async function logMarketplaceCall({ marketplace, route, zoneId = null, credentialScope = "house", latencyMs = null, outcome }) {
  const db = getServiceClient();
  if (!db || !marketplace || !route || !OUTCOMES.has(outcome)) return;
  const { error } = await db.from("marketplace_call_log").insert({
    marketplace,
    route,
    zone_id: zoneId,
    credential_scope: credentialScope === "user" ? "user" : "house",
    latency_ms: Number.isFinite(latencyMs) ? Math.round(latencyMs) : null,
    outcome,
  });
  if (error) console.error("[marketplace] call log:", error.code ?? "unknown");
}
