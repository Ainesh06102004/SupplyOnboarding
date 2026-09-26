// ============================================================================
// A plan's days, budget, people and stated targets, read from the shopper's
// words over this week's defaults. Pure; shared by the Phase 3 agent
// (run.js) and Agent Mode's make_plan tool (tools/plan.js).
// ============================================================================

import { readFollowUp } from "@/lib/planner/followup";
import { profilesNamedIn, profilesNamed } from "@/lib/household/profile";

/** "All of us", "everyone", "the whole family": everyone ticked — not the "us" or "me" inside it. */
export const EVERYONE = /\b(?:all of us|everyone|everybody|every one|whole (?:family|household)|all of them|the family|the household)\b/i;

/**
 * @param {string} text the shopper's words
 * @param {Array<{id, label, relation?}>} members the household's members
 * @param {{ days, budget, memberIds, thisWeek }} defaults
 * @returns {{ days: number, budget: number|null, memberIds: string[]|null, thisWeek: object }}
 */
export function planArgs(text, members, defaults) {
  const asked = readFollowUp(text);
  const profiles = members.map((m) => ({ memberId: String(m.id), label: m.label, relation: m.relation ?? "" }));
  const everyone = EVERYONE.test(text);
  const named = everyone ? [] : profilesNamedIn(text, profiles);
  const memberIds = named.length ? named.map((p) => p.memberId) : defaults.memberIds;
  const thisWeek = { ...(defaults.thisWeek ?? {}) };
  for (const t of asked.targets ?? []) {
    for (const p of profilesNamed(t.who, profiles).filter((x) => !memberIds || memberIds.includes(x.memberId))) {
      const was = thisWeek[p.memberId] ?? { dietType: null, prefer: [], skip: [], targets: {} };
      thisWeek[p.memberId] = { ...was, targets: { ...(was.targets ?? {}), [t.nutrient]: t.perDay } };
    }
  }
  return {
    days: asked.days ?? defaults.days,
    budget: asked.budget?.change === "set" ? asked.budget.rupees : asked.budget?.change === "remove" ? null : defaults.budget,
    memberIds,
    thisWeek,
  };
}
