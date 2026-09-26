// ============================================================================
// What a save to a household member will do, worked out before it is done.
// Pure.
//
// save_household_member (00050, 00067) REPLACES a member's whole avoid list
// whenever p_avoids is given: every avoid not in the new list is deleted. So a
// save that sends only the avoid it means to add silently deletes the ones it
// did not mention — a peanut allergy included. Every save that touches avoids
// goes through mergeAvoids, which starts from what is held and says exactly
// what changes, so a removal or a weaker severity is only ever made when the
// shopper has seen it (the agent's approval card, lib/agent/tools/savePeople).
// ============================================================================

import { FOODS_AVOID, DIET_TYPES } from "@/lib/recommendation/config";
import { AGE_BANDS } from "@/lib/planner/brief";
import { defaultSeverityFor, SEVERITIES } from "./profile";

/** How strongly an avoid is held. A move down this list is a downgrade. */
export const SEVERITY_RANK = Object.freeze({ allergy: 4, intolerance: 3, rule: 2, dislike: 1 });

const AVOID_KEYS = new Set(FOODS_AVOID.map((a) => a.key));
const AVOID_BY_KEY = Object.fromEntries(FOODS_AVOID.map((a) => [a.key, a]));

/** A severity the database accepts for this avoid: only an allergen can be an allergy (00050). */
export function severityFor(avoidKey, severity) {
  const s = SEVERITIES.some((x) => x.key === severity) ? severity : defaultSeverityFor(avoidKey);
  if (s === "allergy" && AVOID_BY_KEY[avoidKey]?.kind !== "allergen") return defaultSeverityFor(avoidKey);
  return s;
}

/**
 * @param {Array<{key, severity}>} held    what the member has now
 * @param {{ add?: Array<{key, severity?}>, remove?: string[] }} change
 * @returns {{ avoids: Array<{key, severity}>, added: Array, removed: Array, stronger: Array, weaker: Array, unknown: string[] }}
 *   `avoids` is the complete list to send; the rest is the diff to show.
 *   Adding an avoid already held keeps the stronger severity unless a weaker
 *   one was asked for by name, which is reported as `weaker`.
 */
export function mergeAvoids(held = [], change = {}) {
  const next = new Map((held ?? []).filter((a) => AVOID_KEYS.has(a.key)).map((a) => [a.key, severityFor(a.key, a.severity)]));
  const before = new Map(next);
  const unknown = [];
  const removeKeys = new Set((change.remove ?? []).filter((k) => {
    if (AVOID_KEYS.has(k)) return true;
    unknown.push(k);
    return false;
  }));
  for (const key of removeKeys) next.delete(key);
  for (const a of change.add ?? []) {
    if (!AVOID_KEYS.has(a?.key)) { if (a?.key) unknown.push(a.key); continue; }
    const asked = a.severity ? severityFor(a.key, a.severity) : null;
    const was = next.get(a.key);
    if (!was) next.set(a.key, asked ?? defaultSeverityFor(a.key));
    else if (asked) next.set(a.key, asked);
    // No severity asked and already held: keep what is held.
  }

  const added = [];
  const stronger = [];
  const weaker = [];
  for (const [key, severity] of next) {
    const was = before.get(key);
    if (!was) added.push({ key, severity });
    else if (SEVERITY_RANK[severity] > SEVERITY_RANK[was]) stronger.push({ key, from: was, to: severity });
    else if (SEVERITY_RANK[severity] < SEVERITY_RANK[was]) weaker.push({ key, from: was, to: severity });
  }
  const removed = [...before].filter(([key]) => !next.has(key)).map(([key, severity]) => ({ key, severity }));
  return {
    avoids: [...next].map(([key, severity]) => ({ key, severity })),
    added,
    removed,
    stronger,
    weaker,
    unknown: [...new Set(unknown)],
  };
}

/** Does this diff take any protection away? Those need the shopper to have seen them. */
export const weakens = (diff) => diff.removed.length > 0 || diff.weaker.length > 0;

const BAND_KEYS = new Set(AGE_BANDS.map((b) => b.key));
const PROFILE_DIETS = new Set(DIET_TYPES.filter((d) => !d.forOnePlanOnly).map((d) => d.key));

/**
 * The fields a set of changes would give a profile form. Only known values are
 * taken; anything else is reported, never guessed.
 *
 * @param {object} form  the current profile form (lib/household/profile.js)
 * @param {object} set   { age_band?, diet_type?, energy_goal?, eating_pattern?, sex?, activity_level?, target_kcal?, target_protein_g? }
 * @returns {{ form: object, changed: Array<{field, from, to}>, rejected: string[] }}
 */
export function applyProfileSet(form, set = {}) {
  const allowed = {
    age_band: (v) => BAND_KEYS.has(v),
    diet_type: (v) => PROFILE_DIETS.has(v),
    energy_goal: (v) => ["maintain", "lose", "gain"].includes(v),
    eating_pattern: (v) => ["balanced", "high_protein", "low_carb", "keto"].includes(v),
    sex: (v) => ["female", "male", "unspecified"].includes(v),
    activity_level: (v) => ["sedentary", "light", "moderate", "heavy"].includes(v),
    target_kcal: (v) => Number.isFinite(Number(v)) && Number(v) > 0 && Number(v) < 10000,
    target_protein_g: (v) => Number.isFinite(Number(v)) && Number(v) >= 0 && Number(v) < 1000,
  };
  const next = { ...form };
  const changed = [];
  const rejected = [];
  for (const [field, value] of Object.entries(set ?? {})) {
    if (value === null || value === undefined || value === "") continue;
    if (!allowed[field]) { rejected.push(field); continue; }
    if (!allowed[field](value)) { rejected.push(field); continue; }
    const to = field.startsWith("target_") ? String(Math.round(Number(value))) : value;
    if (String(next[field] ?? "") === String(to)) continue;
    changed.push({ field, from: next[field] ?? null, to });
    next[field] = to;
  }
  if (changed.some((c) => c.field.startsWith("target_"))) next.target_source = "stated";
  return { form: next, changed, rejected };
}
