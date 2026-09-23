// ============================================================================
// Dishes, read through the ingredient graph. Pure.
//
// A dish (dishData.js, from food.dish + food.recipe_line) is a typical home
// recipe. What it contains is never stored: it is the union of what its lines'
// ingredients carry in the allergen graph (allergenLexicon.js), so a change to
// the graph changes every dish at once. Three things keep this honest:
//
//   * optional lines (the peanuts in poha) are left out for someone who
//     cannot have them, rather than refusing the dish, and the page says so;
//   * a blend (garam masala, compounded hing) can hide anything, so a dish
//     with one is never "verified free" of an allergen — it is "not verified";
//   * a dish is a typical recipe, not the shopper's own. The page says that.
// ============================================================================

import { INGREDIENTS, FAMILIES } from "./allergenLexicon";
import { FOODS_AVOID, DIET_EXCLUSIONS } from "@/lib/recommendation/config";
import { ageRefusal, ageReason } from "@/lib/planner/ageSafety";

const GRAPH = new Map(INGREDIENTS.map(([name, links, flags]) => [name, { links, flags }]));
const AVOID = Object.fromEntries(FOODS_AVOID.map((a) => [a.key, a]));
/** An avoid flag, as the flag an ingredient carries. "Refined sugar" is sugar a recipe adds. */
const AS_INGREDIENT_FLAG = Object.freeze({ refined_sugar: "sweetened_sugar", spicy_food: "spicy" });

const FLAG_WORDS = Object.freeze({
  meat: "meat", red_meat: "red meat", fish: "fish", shellfish: "shellfish", egg: "egg", honey: "honey",
  root_veg: "root vegetables", allium: "onion or garlic", grain: "grain", pulse: "pulses",
  common_salt: "common salt", caffeine: "caffeine", spicy: "chilli", sweetened_sugar: "sugar",
  palm_oil: "palm oil", dairy: "milk",
});
const wordFor = (key) => FAMILIES[key]?.label?.toLowerCase() ?? FLAG_WORDS[key] ?? key.replace(/_/g, " ");

/** What one recipe line carries: allergen families (contains / may contain) and flags. */
export function lineFacts(line) {
  const g = GRAPH.get(line.ingredient);
  if (!g) return { contains: [], mayContain: [], flags: [], known: false };
  return {
    contains: g.links.filter(([, relation]) => relation !== "may_contain").map(([family]) => family),
    mayContain: g.links.filter(([, relation]) => relation === "may_contain").map(([family]) => family),
    flags: g.flags,
    known: true,
  };
}

const union = (lists) => [...new Set(lists.flat())].sort();

/**
 * What a dish contains, from its required lines.
 * @param {object} dish from dishData.js
 * @returns {{ contains: string[], mayContain: string[], flags: string[], optional: {ingredient, contains, flags}[], blends: string[], unknown: string[] }}
 */
export function dishFacts(dish) {
  const required = dish.lines.filter((l) => !l.optional);
  const facts = required.map(lineFacts);
  return {
    contains: union(facts.map((f) => f.contains)),
    mayContain: union(facts.map((f) => f.mayContain)),
    flags: union(facts.map((f) => f.flags)),
    optional: dish.lines.filter((l) => l.optional).map((l) => ({ ingredient: l.ingredient, ...lineFacts(l) })),
    blends: required.filter((l) => l.blend).map((l) => l.ingredient),
    unknown: required.filter((l, i) => !facts[i].known).map((l) => l.ingredient),
  };
}

/**
 * What this person refuses, from their profile: hard (never), soft (rather not) and diet.
 * @param {{ avoids?: {key, severity}[], diet_type?: string, spice_tolerance?: string }} person
 */
export function refusalsOf(person = {}) {
  const hard = new Set();
  const soft = new Set();
  const allergy = new Set();
  for (const a of person.avoids ?? []) {
    const entry = AVOID[a.key];
    if (!entry) continue;
    const flag = AS_INGREDIENT_FLAG[entry.flag] ?? entry.flag;
    if (entry.mode === "hard" && a.severity !== "dislike") hard.add(flag);
    else soft.add(flag);
    if (a.severity === "allergy") allergy.add(flag);
  }
  if (person.spice_tolerance === "none") soft.add("spicy");
  const diet = new Set(DIET_EXCLUSIONS[person.diet_type] ?? []);
  return { hard, soft, allergy, diet };
}

/**
 * Can this person have this dish, and with what said about it?
 * @param {object} dish
 * @param {object} person a profile (age_band, diet_type, avoids, spice_tolerance)
 * @returns {{ ok: boolean, because: string|null, leaveOut: string[], dislikes: string[], notVerifiedFor: string[] }}
 */
export function dishFor(dish, person = {}) {
  const facts = dishFacts(dish);
  const { hard, soft, allergy, diet } = refusalsOf(person);
  const carried = [...facts.contains, ...facts.flags];

  const dietHit = carried.find((k) => diet.has(k));
  if (dietHit) return { ok: false, because: `has ${wordFor(dietHit)}, not in their diet`, leaveOut: [], dislikes: [], notVerifiedFor: [] };
  const hardHit = carried.find((k) => hard.has(k));
  if (hardHit) return { ok: false, because: `has ${wordFor(hardHit)}`, leaveOut: [], dislikes: [], notVerifiedFor: [] };
  // "May contain" refuses only for an allergy; for anyone else it is said.
  const traceHit = facts.mayContain.find((k) => allergy.has(k));
  if (traceHit) return { ok: false, because: `may contain ${wordFor(traceHit)}`, leaveOut: [], dislikes: [], notVerifiedFor: [] };

  for (const line of dish.lines.filter((l) => !l.optional && l.supply === "shelf")) {
    const f = lineFacts(line);
    const refused = ageRefusal({ categoryKey: line.category, contains: [...f.contains, ...f.flags] }, person.age_band);
    if (refused) return { ok: false, because: ageReason(refused.flag), leaveOut: [], dislikes: [], notVerifiedFor: [] };
  }

  const leaveOut = facts.optional
    .filter((o) => [...o.contains, ...o.flags].some((k) => hard.has(k) || diet.has(k)))
    .map((o) => o.ingredient);
  const dislikes = [...new Set(carried.filter((k) => soft.has(k)).map(wordFor))];
  // A blend can hide any allergen; someone who must avoid one is told it is not verified.
  const notVerifiedFor = facts.blends.length
    ? [...hard].filter((k) => FAMILIES[k] && !carried.includes(k)).map(wordFor)
    : [];
  return { ok: true, because: null, leaveOut, dislikes, notVerifiedFor };
}

/** A dish's allergens in words, for "a typical recipe contains …". */
export function containsWords(dish) {
  const facts = dishFacts(dish);
  return facts.contains.filter((k) => FAMILIES[k]).map(wordFor);
}
