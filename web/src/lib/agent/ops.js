// ============================================================================
// Agent Mode, watched: what the last days of runs did and cost. SERVER ONLY.
// Reads plan_run across households with the service client, for the
// reviewer-gated /staff/agent page. Counts only; plan_run holds no words.
// ============================================================================

import "server-only";

import { getServiceClient } from "@/lib/supabase/admin";

/** gpt-5.4-mini list prices, USD per million tokens (developers.openai.com, Sep 2026). Cached input is billed lower; this is the ceiling. */
export const PRICE = Object.freeze({ model: "gpt-5.4-mini", inPerM: 0.75, outPerM: 4.5 });

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : null;
};

/** @param {number} days */
export async function agentSummary(days = 7) {
  const db = getServiceClient();
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const { data, error } = await db
    .from("plan_run")
    .select("household_id, source, steps, outcome, approvals, asks, turns, tokens_in, tokens_out, ms, route, run_key, created_at")
    .in("source", ["agent", "agent_rules"])
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(5000);
  if (error) throw error;
  const rows = data ?? [];

  const outcomes = {};
  const tools = {};
  const approvals = {};
  const routes = {};
  for (const r of rows) {
    outcomes[r.outcome ?? "unknown"] = (outcomes[r.outcome ?? "unknown"] ?? 0) + 1;
    routes[r.route ?? "other"] = (routes[r.route ?? "other"] ?? 0) + 1;
    for (const s of r.steps ?? []) {
      const t = (tools[s.tool] ??= { runs: 0, failed: 0, ms: [] });
      t.runs += 1;
      if (!s.ok) t.failed += 1;
      if (Number.isFinite(s.ms)) t.ms.push(s.ms);
    }
    for (const a of r.approvals ?? []) {
      const t = (approvals[a.tool] ??= { allow: 0, decline: 0 });
      t[a.decision === "allow" ? "allow" : "decline"] += 1;
    }
  }
  const tokensIn = rows.reduce((s, r) => s + (r.tokens_in ?? 0), 0);
  const tokensOut = rows.reduce((s, r) => s + (r.tokens_out ?? 0), 0);
  const costUsd = (tokensIn / 1e6) * PRICE.inPerM + (tokensOut / 1e6) * PRICE.outPerM;
  const runs = new Set(rows.map((r) => r.run_key).filter(Boolean)).size;

  return {
    days,
    segments: rows.length,
    runs,
    households: new Set(rows.map((r) => r.household_id)).size,
    rulesShare: rows.length ? rows.filter((r) => r.source === "agent_rules").length / rows.length : 0,
    errorShare: rows.length ? (outcomes.error ?? 0) / rows.length : 0,
    outcomes,
    routes,
    medianMs: median(rows.map((r) => r.ms).filter(Number.isFinite)),
    tokensIn,
    tokensOut,
    costUsd,
    costPerRunUsd: runs ? costUsd / runs : null,
    tools: Object.entries(tools).map(([tool, t]) => ({ tool, runs: t.runs, failed: t.failed, medianMs: median(t.ms) })).sort((a, b) => b.runs - a.runs),
    approvals: Object.entries(approvals).map(([tool, a]) => ({ tool, ...a })),
  };
}
