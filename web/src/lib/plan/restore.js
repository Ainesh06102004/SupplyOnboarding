// ============================================================================
// Reopening the plan on screen after a reload. Pure.
//
// The latest plan comes back as it was shown, from its stored report (00070).
// The changes that led to it come back as requests, from the chain each
// changed plan records (constraints.follows, and KOI's own words for the
// change in constraints.change; the shopper's words are never stored), so
// undo still steps back through them. The plan before the chain is what the
// pantry compares against.
// ============================================================================

/** How many changes back a reload reaches. */
export const MAX_RESTORED_CHANGES = 10;

/** A stored row → the plan object the page draws (the planner's own shape). */
export function planFromRow(row, stored) {
  if (!row || !stored?.report) return null;
  return {
    planId: row.id,
    createdAt: row.created_at,
    status: row.status ?? "solved",
    days: row.days,
    budget: row.budget_rupees === null || row.budget_rupees === undefined ? null : Number(row.budget_rupees),
    report: stored.report,
    explanation: stored.explanation ?? {},
    restored: true,
  };
}

/** The plans a reload could reopen: the latest, and each one it changed, newest first. */
export function chainOf(rows) {
  const byId = new Map((rows ?? []).map((r) => [String(r.id), r]));
  const chain = [];
  let cur = rows?.[0] ?? null;
  while (cur && chain.length <= MAX_RESTORED_CHANGES && !chain.includes(cur)) {
    chain.push(cur);
    cur = cur.follows ? byId.get(String(cur.follows)) ?? null : null;
  }
  return chain;
}

/**
 * @param {object[]} rows the household's latest plans, newest first:
 *   { id, days, budget_rupees, status, created_at, follows, change, cost, basket }
 * @param {Map<string, {report, explanation}>} stored reports by plan id (for the chain)
 * @returns {{ plan, requests, compareTo, weekRootId } | null} null when the latest plan has no report
 */
export function restoreFrom(rows, stored) {
  const all = chainOf(rows);
  // Only as far back as plans that can be drawn.
  const chain = [];
  for (const row of all) {
    const plan = planFromRow(row, stored.get(String(row.id)));
    if (!plan) break;
    chain.push({ row, plan });
  }
  if (!chain.length) return null;

  const requests = [];
  for (let i = chain.length - 2; i >= 0; i -= 1) {
    const { row, plan } = chain[i];
    const prev = chain[i + 1];
    const applied = Array.isArray(row.change) ? row.change.map(String) : [];
    requests.push({
      id: row.id,
      text: applied.join("; ") || "A change",
      applied,
      notApplied: [],
      basketChange: { costBefore: prev.row.cost ?? prev.plan.report?.cost ?? null },
      costAfter: row.cost ?? plan.report?.cost ?? null,
      householdChanges: [],
      kind: "words",
      before: prev.plan,
      undone: false,
    });
  }

  const root = chain.at(-1).row;
  const inChain = new Set(chain.map((c) => String(c.row.id)));
  const earlier = (rows ?? []).find((r) => !inChain.has(String(r.id)) && String(r.created_at) < String(root.created_at));
  const compareTo = earlier ? { basket: earlier.basket ?? [], cost: earlier.cost ?? null, label: "Your last plan" } : null;

  // The week's first plan: its dish picks are the week's (00078).
  return { plan: chain[0].plan, requests, compareTo, weekRootId: root.id };
}
