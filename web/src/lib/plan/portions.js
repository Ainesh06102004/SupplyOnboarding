// ============================================================================
// Portions: how much of each dish a person eats, in grams, so every day lands
// on their own numbers. Pure; runs wherever the week does (the browser).
//
// The week (schedule.js) chooses WHAT is cooked. For someone with exact macros
// (lib/household/profile.js hasExactMacros) this decides HOW MUCH of it is on
// their plate. A dish is sized by COMPONENT, the way a lifter cooks it: more
// chicken, the same oil, a little less rice — never the whole pot ×1.4, which
// would carry the oil up with the protein. Each dish's lines fall into four
// roles (rolesOf): protein (meat, paneer, eggs, dal, soya), carb (rice, atta,
// potato, oats), fat (oil, ghee, nuts, coconut) and the rest (vegetables,
// aromatics, spices), and each role on each plate is one scale. A basket
// "addition" no dish uses (a scoop of whey) is one more. Dishes shared with the
// household are still cooked once; only this person's plate changes.
//
// Sizing is a box-constrained least squares, solved by coordinate descent:
//
//   minimise  Σ days Σ nutrients  w_n · ((total_dn − target_dn) / target_dn)²
//           + couple · Σ (role scale − rest scale)²   (the dish stays itself)
//           + stay · Σ (rest scale − 1)²              (near the recipe's serving)
//   subject to  each role inside its bounds (ROLE_BOUNDS)
//
// It is convex, every coordinate step is exact (the objective is quadratic in
// each scale), and a week is ~150 variables, so it converges in milliseconds
// with no solver library — the planner's HiGHS is server-only. A batch (P4)
// ties its boxes' scales into one. Then every line is rounded to what a
// kitchen measures (measures.js snapGrams) and the day is RE-CHECKED from the
// rounded grams: what a person is told to cook is what the totals describe.
//
// Honesty: a day that cannot land inside the tolerance with these dishes says
// so — "short 22 g protein" — rather than stretching a portion past its bound.
// A 190 g protein day mostly needs protein-dense food in the basket (paneer,
// whey, eggs); the week says which nutrient is short so the plan can add it.
// ============================================================================

import { recipeFor } from "@/lib/food/recipes";
import { foodOf, scaleNutrients, addNutrients, zero, MACROS } from "@/lib/food/foods";
import { snapGrams } from "@/lib/food/measures";
import { toPer100 } from "@/lib/nutrition/basis";
import { rowFromProduct } from "@/lib/nutrition/claims";
import { carbCycle } from "./projection";

export const PORTION_RULES = Object.freeze({
  additionMax: 2.0,
  // Protein first: a lifter's day is judged by it. Calories next, then the split.
  weights: Object.freeze({ kcal: 1, protein: 1.5, carbs: 1, fat: 1 }),
  // A small pull keeping each role near the rest of its dish, and the dish near
  // the recipe's own serving, so portions stay natural when several mixes
  // would land the day equally well. Both are an order below a 5% miss
  // ((0.05)² = 0.0025): they break ties inside the tolerance, never buy a miss.
  couple: 0.0008,
  stay: 0.0004,
  sweeps: 600,
  epsilon: 1e-7,
});

/** How far each role of a dish may move from the recipe (× its grams). Oil can halve, never vanish. */
export const ROLE_BOUNDS = Object.freeze({
  protein: [0.5, 2.2],
  carb: [0.3, 2.2],
  fat: [0.4, 1.6],
  rest: [0.6, 1.8],
});

const PROTEIN_FOODS = new Set([
  "chicken_breast", "chicken_curry_cut", "mutton", "mutton_keema", "fish", "prawns", "egg", "egg_white", "paneer", "tofu",
  "soya_chunks", "toor_dal", "moong_dal", "masoor_dal", "urad_dal", "chana_dal", "moong_whole", "moong_sprouts", "urad_whole",
  "kala_chana", "kabuli_chana", "rajma", "lobia", "besan", "roasted_chana", "sattu", "curd",
]);
const CARB_FOODS = new Set([
  "rice_white", "rice_brown", "poha", "puffed_rice", "atta", "maida", "semolina", "broken_wheat", "ragi_flour", "jowar_flour",
  "bajra_flour", "maize_flour", "quinoa", "amaranth_flour", "rice_flour", "oats", "buckwheat_flour", "barnyard_millet", "sago",
  "makhana", "noodles_dry", "bread_white", "bread_brown", "pav", "potato", "sweet_potato", "colocasia", "yam", "banana",
  "dates", "sugar", "jaggery", "honey", "sweet_corn",
]);
const FAT_FOODS = new Set([
  "ghee", "sunflower_oil", "groundnut_oil", "coconut_oil", "mustard_oil", "olive_oil", "sesame_oil", "butter", "cream",
  "coconut_milk", "coconut_fresh", "almonds", "cashews", "peanuts", "peanut_butter", "sesame", "chia",
]);

/** A recipe line's role in sizing. */
export function roleOf(foodKey) {
  if (PROTEIN_FOODS.has(foodKey)) return "protein";
  if (CARB_FOODS.has(foodKey)) return "carb";
  if (FAT_FOODS.has(foodKey)) return "fat";
  return "rest";
}

const MACRO_LABELS = Object.freeze({ kcal: "kcal", protein: "protein", carbs: "carbs", fat: "fat" });
const isNum = (v) => v !== null && v !== undefined && v !== "" && Number.isFinite(Number(v));

/**
 * A product's label as per-100 g figures, or null when the label can't say.
 * Millilitre labels (milk) are taken as grams: close enough for a portion.
 */
export function labelPer100(product) {
  if (!product) return null;
  const p = toPer100(rowFromProduct(product));
  if (!p?.unit || ![p.energy_kcal, p.protein_g, p.carbs_g, p.total_fat_g].every(isNum)) return null;
  return { kcal: Number(p.energy_kcal), protein: Number(p.protein_g), carbs: Number(p.carbs_g), fat: Number(p.total_fat_g), fibre: isNum(p.fibre_g) ? Number(p.fibre_g) : 0 };
}

/** The person's numbers for one day: their own, carb-cycled on training days if they asked. */
export function dayTargets(person, { training = false, trainingDays = 4 } = {}) {
  const base = {
    kcal: Number(person.target_kcal),
    protein: Number(person.target_protein_g),
    carbs: Number(person.target_carbs_g),
    fat: Number(person.target_fat_g),
  };
  if (!person.carb_cycling) return base;
  const c = carbCycle({ kcal: base.kcal, carbs: base.carbs }, trainingDays);
  if (!c) return base;
  const day = training ? c.training : c.rest;
  return { ...base, kcal: day.kcal, carbs: day.carbs };
}

/** What a person eats in a cell: the shared dishes if they are at that table, else their own. */
function dishesFor(cell, memberId) {
  if (cell.shared?.eaters?.map(String).includes(memberId)) return cell.shared.dishes;
  return cell.own?.[memberId]?.dishes ?? [];
}

/**
 * A line's grams as a plate gets them. Bulk (20 g and up: rice, dal, chicken,
 * vegetables) goes in 5 g steps — a quarter cup of raw rice is 46 g and 160
 * kcal, too coarse for exact macros, and a batch weighs its raw rice once
 * anyway; the recipe still says "about ¾ cup" beside it. Small amounts (oil,
 * spices) snap to the spoon a kitchen would use.
 */
function roundLine(foodKey, grams) {
  if (grams >= 20) return Math.round(grams / 5) * 5;
  const food = foodOf(foodKey);
  if (food?.measures && Object.keys(food.measures).length) return snapGrams(foodKey, grams);
  return Math.max(1, Math.round(grams));
}

/**
 * @param {object} input
 * @param {object} input.week from buildWeek (cells, days, additions, supplierOf?)
 * @param {object} input.person profile form with exact macros (memberId, target_*, target_tolerance_pct, carb_cycling)
 * @param {Map<string, object>} [input.labels] skuId → labelPer100 figures, from the products in the basket
 * @param {Array<{skuId, name}>} [input.basket] basket lines, for additions' names
 * @param {Set<number>} [input.trainingDays] day indexes that are training days (carb cycling)
 * @param {Object<string,string>} [input.ties] item id → group id, for portions that must match (a batch)
 * @param {Object<string,string[]>} [input.leaveOut] cell key → optional ingredients left out for this person
 * @param {Object<string,{name?: string, nutrition: object}|null>} [input.fixed] cell key → what this person
 *   eats there, already decided (a meal logged on Track, a box already cooked, a Take 2's leftovers): it
 *   counts towards the day as it is and is never resized; null means nothing is eaten there
 * @param {Object<number,object>} [input.shift] day index → nutrients added to that day's target (a Take 2)
 * @returns {object} see the bottom of this function
 */
export function sizePortions({ week, person, labels = new Map(), basket = [], trainingDays = null, ties = {}, leaveOut = {}, fixed = {}, shift = {} }) {
  const R = PORTION_RULES;
  const memberId = String(person.memberId);
  const tolerance = Math.max(2, Math.min(15, Number(person.target_tolerance_pct) || 5));
  const trainCount = trainingDays ? trainingDays.size : 4;
  const nameOfSku = new Map(basket.map((b) => [String(b.skuId), b.name]));

  // ── What each day holds, as items with a nutrient vector at scale 1 ───────
  const days = week.days.map((day) => {
    const items = [];
    for (const slot of week.slots ?? []) {
      const cell = week.cells[`${day.index}:${slot}`];
      if (!cell) continue;
      if (Object.hasOwn(fixed, cell.key)) {
        const f = fixed[cell.key];
        if (f) items.push({ id: `${cell.key}|fixed`, kind: "fixed", cellKey: cell.key, slot, name: f.name ?? null, nutrition: { ...zero(), ...f.nutrition }, components: {} });
        continue;
      }
      for (const d of dishesFor(cell, memberId)) {
        const recipe = recipeFor(d.key);
        if (!recipe) continue;
        const per100For = (line) => {
          if (line.supply !== "shelf") return null;
          const sku = week.supplierOf?.(d.key, line.index, memberId);
          return sku ? labels.get(String(sku)) ?? null : null;
        };
        const left = (leaveOut[cell.key] ?? cell.notes?.[memberId]?.leaveOut ?? []).map((x) => x.toLowerCase());
        const lines = recipe.lines.filter((l) => !(l.optional && left.includes(l.ingredient.toLowerCase())));
        // One component per role the dish has: what that role's lines carry at the recipe's grams.
        const components = {};
        for (const l of lines) {
          const role = roleOf(l.food);
          const c = (components[role] ??= { role, unit: zero() });
          c.unit = addNutrients(c.unit, scaleNutrients(per100For(l) ?? foodOf(l.food)?.per100 ?? zero(), l.grams));
        }
        const id = `${cell.key}|${d.key}`;
        items.push({ id, kind: "dish", cellKey: cell.key, slot, dishKey: d.key, name: recipe.name, recipe, lines, per100For, components });
      }
    }
    // Something decided in a slot the week has no meal in (a snack logged on a day without one).
    for (const [key, f] of Object.entries(fixed)) {
      const [d, slot] = key.split(":");
      if (Number(d) !== day.index || !f || week.cells[key]) continue;
      items.push({ id: `${key}|fixed`, kind: "fixed", cellKey: key, slot, name: f.name ?? null, nutrition: { ...zero(), ...f.nutrition }, components: {} });
    }
    for (const a of week.additions?.[memberId] ?? []) {
      const per100 = labels.get(String(a.skuId));
      if (!per100 || !isNum(a.perDay) || Number(a.perDay) <= 0) continue;
      const grams = Number(a.perDay);
      items.push({ id: `${day.index}|add|${a.skuId}`, kind: "addition", slot: a.slot ?? "snack", skuId: String(a.skuId), name: a.name ?? nameOfSku.get(String(a.skuId)) ?? "A product", grams, per100, components: { addition: { role: "addition", unit: scaleNutrients(per100, grams) } } });
    }
    const base = dayTargets(person, { training: trainingDays ? trainingDays.has(day.index) : false, trainingDays: trainCount });
    const moved = shift[day.index] ?? {};
    const target = Object.fromEntries(Object.entries(base).map(([n, v]) => [n, Number.isFinite(moved[n]) ? Math.max(0, v + moved[n]) : v]));
    return { index: day.index, date: day.date, label: day.label, items, target };
  });

  // ── Variables: one per role of each plate, one per addition; a tied group
  //    (a batch's boxes) shares its variables ─────────────────────────────
  const varOf = new Map();
  const vars = [];
  const variable = (key, [lo, hi], stay) => {
    if (!varOf.has(key)) { varOf.set(key, vars.length); vars.push({ key, value: 1, lo, hi, stay, terms: [], pairs: [] }); }
    return varOf.get(key);
  };
  for (const day of days) {
    for (const item of day.items) {
      if (item.kind === "fixed") continue;
      const group = ties[item.id] ?? item.id;
      item.vars = {};
      if (item.kind === "addition") {
        item.vars.addition = variable(`${group}|addition`, [0, R.additionMax], R.stay);
      } else {
        const hasRest = Boolean(item.components.rest);
        for (const role of Object.keys(item.components)) {
          // The rest of the dish is pulled to the recipe's serving; every other
          // role is pulled to the rest, so the dish stays itself.
          item.vars[role] = variable(`${group}|${role}`, ROLE_BOUNDS[role], role === "rest" || !hasRest ? R.stay : 0);
        }
        if (hasRest) {
          const rest = item.vars.rest;
          for (const role of Object.keys(item.vars).filter((r) => r !== "rest")) {
            const v = item.vars[role];
            if (!vars[v].pairs.some((p) => p.other === rest)) {
              vars[v].pairs.push({ other: rest, k: R.couple });
              vars[rest].pairs.push({ other: v, k: R.couple });
            }
          }
        }
      }
      for (const [role, c] of Object.entries(item.components)) vars[item.vars[role]].terms.push({ day: day.index, unit: c.unit });
    }
  }

  // Running totals per day and nutrient at the current scales, starting from what is already decided.
  const total = new Map(days.map((d) => [d.index, d.items.filter((i) => i.kind === "fixed").reduce((acc, i) => addNutrients(acc, i.nutrition), zero())]));
  const dayOf = new Map(days.map((d) => [d.index, d]));
  for (const v of vars) for (const t of v.terms) { const tot = total.get(t.day); for (const n of MACROS) tot[n] += t.unit[n] * v.value; }

  for (let sweep = 0; sweep < R.sweeps; sweep++) {
    let moved = 0;
    for (const v of vars) {
      let A = v.stay;
      let B = v.stay;
      for (const p of v.pairs) { A += p.k; B += p.k * vars[p.other].value; }
      // Coefficients of this variable per (day, nutrient): several items of one group can sit in one day.
      const coef = new Map();
      for (const t of v.terms) {
        const c = coef.get(t.day) ?? zero();
        for (const n of MACROS) c[n] += t.unit[n];
        coef.set(t.day, c);
      }
      for (const [dayIndex, c] of coef) {
        const target = dayOf.get(dayIndex).target;
        const tot = total.get(dayIndex);
        for (const n of MACROS) {
          const T = target[n];
          if (!(T > 0)) continue;
          const w = R.weights[n] / (T * T);
          const rest = tot[n] - c[n] * v.value;
          A += w * c[n] * c[n];
          B += w * c[n] * (T - rest);
        }
      }
      const next = Math.min(v.hi, Math.max(v.lo, B / A));
      const delta = next - v.value;
      if (delta !== 0) {
        for (const [dayIndex, c] of coef) { const tot = total.get(dayIndex); for (const n of MACROS) tot[n] += c[n] * delta; }
        v.value = next;
        moved = Math.max(moved, Math.abs(delta));
      }
    }
    if (moved < R.epsilon) break;
  }

  // ── Round to the kitchen, then re-check the day from the rounded grams ───
  const out = days.map((day) => {
    const items = day.items.map((item) => {
      if (item.kind === "fixed") return { kind: "fixed", id: item.id, cellKey: item.cellKey, slot: item.slot, name: item.name, nutrition: item.nutrition };
      const scaleOf = (role) => vars[item.vars[role]].value;
      if (item.kind === "addition") {
        const grams = Math.round((item.grams * scaleOf("addition")) / 5) * 5;
        return { kind: "addition", id: item.id, slot: item.slot, skuId: item.skuId, name: item.name, grams, nutrition: scaleNutrients(item.per100, grams) };
      }
      const lines = item.lines.map((l) => ({ index: l.index, food: l.food, ingredient: l.ingredient, supply: l.supply, role: roleOf(l.food), grams: roundLine(l.food, l.grams * scaleOf(roleOf(l.food))) }));
      const nutrition = lines.reduce((acc, l) => {
        const line = item.recipe.lines[l.index];
        return addNutrients(acc, scaleNutrients(item.per100For(line) ?? foodOf(l.food)?.per100 ?? zero(), l.grams));
      }, zero());
      const roles = Object.fromEntries(Object.keys(item.vars).map((r) => [r, Math.round(scaleOf(r) * 100) / 100]));
      // The plate's size against the recipe's serving, by weight of what goes in.
      const baseGrams = item.lines.reduce((a, l) => a + l.grams, 0);
      const plateGrams = lines.reduce((a, l) => a + l.grams, 0);
      const scale = baseGrams ? Math.round((plateGrams / baseGrams) * 100) / 100 : 1;
      const servedGrams = item.recipe.served ? Math.round(item.recipe.served * scale) : null;
      return { kind: "dish", id: item.id, cellKey: item.cellKey, slot: item.slot, dishKey: item.dishKey, name: item.name, scale, roles, servedGrams, lines, nutrition };
    })
      // An addition the solver brought down to nothing (0 g once rounded) is not on the plate:
      // it carries no nutrition, so the day's totals are the same without it.
      .filter((i) => i.kind !== "addition" || i.grams > 0);
    const totals = items.reduce((acc, i) => addNutrients(acc, i.nutrition), zero());
    const deviation = {};
    for (const n of MACROS) deviation[n] = day.target[n] > 0 ? Math.round(((totals[n] - day.target[n]) / day.target[n]) * 1000) / 10 : 0;
    const worstKey = MACROS.reduce((a, b) => (Math.abs(deviation[b]) > Math.abs(deviation[a]) ? b : a));
    const within = MACROS.every((n) => Math.abs(deviation[n]) <= tolerance);
    return {
      index: day.index, date: day.date, label: day.label, target: day.target, items, totals, deviation, within,
      worst: { nutrient: worstKey, pct: deviation[worstKey] },
      gap: within ? null : gapWords(worstKey, totals[worstKey] - day.target[worstKey]),
    };
  });

  return {
    memberId,
    tolerance,
    days: out,
    within: out.every((d) => d.within),
    worst: out.reduce((w, d) => (Math.abs(d.worst.pct) > Math.abs(w.pct) ? { ...d.worst, day: d.index } : w), { nutrient: "kcal", pct: 0, day: null }),
  };
}

/** "short 22 g protein", "180 kcal over" — what a day that misses misses by. */
function gapWords(nutrient, delta) {
  const amount = Math.round(Math.abs(delta));
  if (nutrient === "kcal") return `${amount.toLocaleString("en-IN")} kcal ${delta > 0 ? "over" : "under"}`;
  return delta > 0 ? `${amount} g ${MACRO_LABELS[nutrient]} over` : `short ${amount} g ${MACRO_LABELS[nutrient]}`;
}

/** What a portioned plate says, line by line, for the week grid: "rice 95 g · chicken 180 g". */
export function plateWords(item, { max = 3 } = {}) {
  if (item.kind === "addition") return `${item.name} ${item.grams} g`;
  if (item.kind === "fixed") return item.name ?? "";
  return item.lines
    .filter((l) => l.supply !== "kitchen" && !/salt|masala|powder|seeds|leaves|chilli|garlic|ginger/.test(l.food))
    .sort((a, b) => b.grams - a.grams)
    .slice(0, max)
    .map((l) => `${(foodOf(l.food)?.name ?? l.food).replace(/\s*\(.*?\)/g, "").toLowerCase()} ${l.grams} g`)
    .join(" · ");
}
