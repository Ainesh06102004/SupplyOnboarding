// ============================================================================
// KOI ENGINE — Checking a reading without trusting it
//
// Confidence in a label reading comes from here, never from the model. A model
// asked "how sure are you?" answers in the same voice it transcribed in, so its
// self-report cannot catch its own misreading. Arithmetic can: a label's energy
// has to agree with its protein, carbohydrate and fat; its sugars cannot exceed
// its carbohydrate; an allergen named in the ingredients has to appear in the
// allergen statement. A reading that fails one of these is wrong somewhere, and
// the reviewer is told exactly where.
//
// `ok: null` means a check could not run (the figures it needs are absent). It
// is excluded from confidence rather than counted either way — a missing figure
// is not a pass, and it is already visible as a missing figure.
//
// Pure.
// ============================================================================

import { FOODS_AVOID } from "@/lib/recommendation/config";
import { allergensIn, allergensInStatement } from "@/lib/food/allergens";
import { parseAmount } from "@/lib/nutrition/basis";

const isNum = (v) => v !== null && v !== undefined && Number.isFinite(Number(v));

// The allergen flags KOI acts on, taken from the avoid catalogue so the engine
// proposes exactly the flags the storefront enforces.
export const ALLERGEN_FLAGS = Object.freeze(
  [...new Set(FOODS_AVOID.filter((a) => a.kind === "allergen").map((a) => a.flag))],
);

// Both answers come from the allergen graph (lib/food/allergens.js): whole
// words, longest ingredient name first, so "peanut butter" is not milk and
// "Contains peanuts" does not declare tree nuts. Only the flags the storefront
// acts on are returned.
const storefrontFlags = (flags) => flags.filter((flag) => ALLERGEN_FLAGS.includes(flag));

/** Allergen flags an ingredient list names. */
export const flagsInIngredients = (text) => storefrontFlags(allergensIn(text).contains);

/** Allergen flags the ingredients may contain (a graph `may_contain` link), not counting what they contain. */
export const mayContainInIngredients = (text) => storefrontFlags(allergensIn(text).mayContain);

/**
 * Allergen flags an allergen or may-contain statement declares, by group
 * ("tree nuts", "crustaceans", "cereals containing gluten") or by ingredient.
 */
export const flagsInStatement = (text) => storefrontFlags(allergensInStatement(text));

/**
 * @param {object} reading a parsed LabelReading
 * @returns {{ checks: Array<{id, group, ok: boolean|null, detail}>, confidence: number,
 *   groups: Record<string, { passed: number, failed: number }> }}
 */
export function runChecks(reading) {
  const checks = [];
  const add = (id, group, ok, detail) => checks.push({ id, group, ok, detail });

  // ── Nutrition ──
  const n = reading.nutrition;
  const v = n.values;
  if (!reading.visible.nutrition_table) {
    add("nutrition.visible", "nutrition", false, "No nutrition table in this photo.");
  } else {
    add("nutrition.basis", "nutrition", n.basis !== null,
      n.basis ? `Read as ${n.basis.replace("_", " ")}.` : "No basis (per 100 g, per 100 ml or per serving) could be read.");

    if (n.basis === "per_serving") {
      add("nutrition.serving", "nutrition", parseAmount(n.serving_size) !== null,
        parseAmount(n.serving_size) ? `Serving ${n.serving_size}.` : `Serving size "${n.serving_size ?? ""}" is not a measurable amount, so nothing can be converted per 100.`);
    }

    const core = ["energy_kcal", "protein_g", "carbs_g", "sugars_g", "total_fat_g"];
    const missing = core.filter((f) => !isNum(v[f]));
    add("nutrition.coverage", "nutrition", missing.length === 0,
      missing.length ? `Not read: ${missing.join(", ")}.` : "Energy, protein, carbohydrate, sugars and fat all read.");

    if (["energy_kcal", "protein_g", "carbs_g", "total_fat_g"].every((f) => isNum(v[f]))) {
      // Atwater factors. Labels round each figure and some count fibre at
      // 2 kcal/g, so the tolerance is generous; a misread digit is not subtle.
      const computed = 4 * v.protein_g + 4 * v.carbs_g + 9 * v.total_fat_g;
      const tolerance = Math.max(0.15 * v.energy_kcal, n.basis === "per_serving" ? 10 : 25);
      const ok = Math.abs(computed - v.energy_kcal) <= tolerance;
      add("nutrition.energy", "nutrition", ok,
        `Declared ${v.energy_kcal} kcal; protein, carbohydrate and fat give ${Math.round(computed)} kcal${ok ? "." : " — one of these was likely misread."}`);
    } else {
      add("nutrition.energy", "nutrition", null, "Not enough figures to cross-check energy.");
    }

    const within = (id, part, whole, label) => {
      if (!isNum(v[part]) || !isNum(v[whole])) return add(id, "nutrition", null, `${label}: not both read.`);
      const ok = v[part] <= v[whole] + 0.05;
      add(id, "nutrition", ok, ok ? `${label}: consistent.` : `${label}: ${v[part]} g is more than ${v[whole]} g.`);
    };
    within("nutrition.sugars_in_carbs", "sugars_g", "carbs_g", "Sugars within carbohydrate");
    within("nutrition.added_in_sugars", "added_sugar_g", "sugars_g", "Added sugar within total sugars");
    within("nutrition.saturated_in_fat", "saturated_fat_g", "total_fat_g", "Saturated fat within total fat");
    within("nutrition.trans_in_fat", "trans_fat_g", "total_fat_g", "Trans fat within total fat");

    if (n.basis === "per_100g" && ["protein_g", "carbs_g", "total_fat_g"].every((f) => isNum(v[f]))) {
      const sum = v.protein_g + v.carbs_g + v.total_fat_g;
      add("nutrition.mass", "nutrition", sum <= 105,
        sum <= 105 ? `Protein, carbohydrate and fat total ${Math.round(sum)} g per 100 g.` : `Protein, carbohydrate and fat total ${Math.round(sum)} g in 100 g, which is impossible.`);
    }
  }

  // ── Ingredients ──
  if (!reading.visible.ingredients) {
    add("ingredients.visible", "ingredients", false, "No ingredient list in this photo — a back-of-pack photo is needed.");
  } else {
    const hasList = Boolean(reading.ingredients_text) && reading.ingredients.length > 0;
    add("ingredients.read", "ingredients", hasList,
      hasList ? `${reading.ingredients.length} ingredients read.` : "The list is in the photo but was not read.");
    const printed = reading.ingredients.filter((i) => isNum(i.percent));
    if (printed.length) {
      const total = printed.reduce((s, i) => s + i.percent, 0);
      // Informational above 100: labels print percentages at more than one level
      // ("Chocolate (20%) [cocoa (50%) …]"), and a transcription that picks up a
      // nested one sums past 100 without anything being misread.
      add("ingredients.percent", "ingredients", total <= 100.5 ? true : null,
        total <= 100.5 ? `Printed percentages total ${Math.round(total)}%.` : `Printed percentages total ${Math.round(total)}% — nested percentages, so not compared.`);
    }
  }

  // ── Allergens ──
  if (reading.visible.ingredients || reading.visible.allergen_statement) {
    const fromText = flagsInIngredients(reading.ingredients_text);
    if (reading.allergen_statement) {
      const declared = flagsInStatement(reading.allergen_statement);
      const undeclared = fromText.filter((f) => !declared.includes(f));
      add("allergens.consistent", "allergens", undeclared.length === 0,
        undeclared.length
          ? `The ingredients mention ${undeclared.join(", ")}, which the allergen statement does not declare.`
          : "The allergen statement covers every allergen the ingredients mention.");
    } else {
      // Not a failure: FSSAI requires an allergen declaration only when one of
      // the listed allergens is present, so many packs have none. Allergens then
      // rest on the ingredient list, which is what the storefront says.
      add("allergens.statement", "allergens", null,
        "No allergen statement on the pack; allergens are read from the ingredient list.");
    }
  }

  // ── Identity ──
  add("identity.veg_mark", "identity", reading.veg_mark !== "not_visible",
    reading.veg_mark === "not_visible" ? "The veg / non-veg mark is not in this photo." : `Marked ${reading.veg_mark.replace("_", "-")}.`);

  const groups = {};
  for (const c of checks) {
    const g = (groups[c.group] ||= { passed: 0, failed: 0 });
    if (c.ok === true) g.passed += 1;
    if (c.ok === false) g.failed += 1;
  }
  const ran = checks.filter((c) => c.ok !== null);
  const confidence = ran.length ? ran.filter((c) => c.ok).length / ran.length : 0;

  return { checks, confidence: Number(confidence.toFixed(3)), groups };
}
