// ============================================================================
// What is being cooked, and how it is split. Pure.
//
// The recipe page answers one question: "what do I make now?" Three answers:
//
//   batch    one cook for several days' boxes (lib/plan/batch.js), for
//            everyone who eats that meal: every person × every box
//   cell     one meal on one day, for the people at that table
//   plain    a number of standard servings (no plan, or a person browsing)
//
// Each plate is either SIZED (someone on their own numbers: portions.js gave
// its grams line by line) or a standard serving (everyone else: the recipe's
// own grams). The pot holds the sum of the plates, line by line, so the method
// says exactly what goes in it. The split says who gets which box and roughly
// how much each weighs once cooked — the only weighing anyone does.
// ============================================================================

import { recipeFor, dishNutrition } from "./recipes";
import { foodOf, scaleNutrients, addNutrients, zero } from "./foods";

/**
 * @param {object} input
 * @param {string} input.dishKey
 * @param {"batch"|"cell"|"plain"} input.mode
 * @param {object} [input.batch] a batch from planBatches (mode batch)
 * @param {object} [input.cell] a week cell (mode cell)
 * @param {Object<string, object>} [input.portions] memberId → sizePortions result
 * @param {Array<{memberId, label}>} [input.people] who is eating, for names
 * @param {number} [input.servings] plain mode
 * @returns {{ recipe, plates: Array, gramsOf: (i) => number, servings: number, totals, perPlate, boxes: Array }|null}
 */
export function cookPlan({ dishKey, mode = "plain", batch = null, cell = null, portions = {}, people = [], servings = 1 }) {
  const recipe = recipeFor(dishKey);
  if (!recipe) return null;
  const nameOf = (id) => people.find((p) => String(p.memberId) === String(id))?.label ?? "Someone";

  /** One plate: a person's sized plate in this cell, else a standard serving. */
  const plateFor = (memberId, cellKey) => {
    const sized = portions[String(memberId)];
    if (sized && cellKey) {
      const dayIndex = Number(String(cellKey).split(":")[0]);
      const item = sized.days.find((d) => d.index === dayIndex)?.items.find((i) => i.kind === "dish" && i.cellKey === cellKey && i.dishKey === dishKey);
      if (item) {
        return { memberId: String(memberId), label: nameOf(memberId), cellKey, sized: true, scale: item.scale, servedGrams: item.servedGrams, grams: new Map(item.lines.map((l) => [l.index, l.grams])), nutrition: item.nutrition };
      }
    }
    return { memberId: memberId === null ? null : String(memberId), label: memberId === null ? null : nameOf(memberId), cellKey: cellKey ?? null, sized: false, scale: 1, servedGrams: recipe.served, grams: new Map(recipe.lines.map((l) => [l.index, l.grams])), nutrition: dishNutrition(recipe) };
  };

  let plates = [];
  if (mode === "batch" && batch) {
    for (const id of batch.eaters ?? []) for (const key of batch.cells) plates.push(plateFor(id, key));
  } else if (mode === "cell" && cell) {
    const eaters = cell.shared?.dishes?.some((d) => d.key === dishKey) ? cell.shared.eaters : [];
    plates = eaters.map((id) => plateFor(id, cell.key));
  }
  if (!plates.length) {
    const n = Math.max(1, Math.min(12, Math.round(Number(servings) || 1)));
    plates = Array.from({ length: n }, () => plateFor(null, null));
  }

  const total = new Map(recipe.lines.map((l) => [l.index, 0]));
  for (const p of plates) for (const [i, g] of p.grams) total.set(i, (total.get(i) ?? 0) + g);
  const servingsEq = plates.reduce((a, p) => a + p.scale, 0);
  const totals = recipe.lines.reduce((acc, l) => addNutrients(acc, scaleNutrients(foodOf(l.food)?.per100 ?? zero(), total.get(l.index) ?? 0)), zero());

  // The split: one row per person, with their boxes (a batch) or their plate.
  const boxes = [];
  for (const p of plates) {
    const row = boxes.find((b) => b.memberId === p.memberId && b.servedGrams === p.servedGrams);
    if (row) { row.count += 1; row.cells.push(p.cellKey); } else boxes.push({ memberId: p.memberId, label: p.label, sized: p.sized, count: 1, cells: [p.cellKey], servedGrams: p.servedGrams, nutrition: p.nutrition });
  }

  return {
    recipe,
    mode: plates[0]?.memberId === null ? "plain" : mode,
    plates,
    servings: plates.length,
    scale: servingsEq,
    gramsOf: (i) => total.get(i) ?? 0,
    totals,
    boxes,
    cookedGrams: plates.reduce((a, p) => a + (p.servedGrams ?? 0), 0) || null,
  };
}
