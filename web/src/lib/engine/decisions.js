// ============================================================================
// KOI ENGINE — A reviewer's decision, and what it lets KOI publish
//
// A reviewer accepts a proposal, corrects it, or rejects it. A correction is
// validated here to the same shape the proposal had, so a typo in the review
// screen cannot write a malformed row, and an allergen flag KOI does not know
// cannot be invented.
//
// buildPublishPayload() turns a SKU's decided items into the two arguments of
// engine.publish_label(). Ingredients publish only together with a decided
// allergen group — the database re-checks this too — and nutrition is rebuilt
// through toNutritionRow() so corrected figures get freshly computed per-100
// columns rather than the stale ones from the proposal.
//
// Pure.
// ============================================================================

import { z } from "zod";
import { NUTRIENT_FIELDS } from "./labelSchema";
import { ALLERGEN_FLAGS } from "./checks";
import { toNutritionRow } from "./proposals";

const flags = z.array(z.enum(ALLERGEN_FLAGS)).max(ALLERGEN_FLAGS.length);
const figure = z.number().nonnegative().nullable();

const CORRECTIONS = {
  identity: z.object({
    product_name: z.string().trim().max(200).nullable(),
    brand: z.string().trim().max(120).nullable(),
    net_quantity: z.string().trim().max(40).nullable(),
    veg_mark: z.enum(["veg", "non_veg", "not_visible"]),
    fssai_licence: z.string().trim().max(40).nullable(),
  }),
  ingredients: z.object({
    raw_ingredient_text: z.string().trim().min(1).max(4000),
    parsed_ingredients: z.array(z.object({
      name: z.string().trim().min(1).max(200),
      percent: z.number().min(0).max(100).nullable(),
    })).min(1).max(80),
  }),
  allergens: z.object({ contains: flags, may_contain: flags }),
  nutrition: z.object({
    measurement_basis: z.enum(["per_100g", "per_100ml", "per_serving"]),
    serving_size: z.string().trim().max(40).nullable(),
    servings_per_pack: z.number().positive().nullable(),
    ...Object.fromEntries(NUTRIENT_FIELDS.map((f) => [f, figure])),
  }),
};

export const ACTIONS = Object.freeze(["accept", "correct", "reject"]);

/**
 * Validate one decision.
 * @param {string} group field_group of the item
 * @param {"accept"|"correct"|"reject"} action
 * @param {object} [value] the corrected value, for "correct"
 * @returns {{ ok: true, status: string, decision: object|null } | { ok: false, error: string }}
 */
export function validateDecision(group, action, value) {
  if (!ACTIONS.includes(action)) return { ok: false, error: `Unknown action "${action}".` };
  if (!CORRECTIONS[group]) return { ok: false, error: `Unknown field group "${group}".` };
  if (action === "reject") return { ok: true, status: "rejected", decision: null };
  if (action === "accept") return { ok: true, status: "accepted", decision: null };

  const parsed = CORRECTIONS[group].safeParse(value);
  if (!parsed.success) return { ok: false, error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
  return { ok: true, status: "corrected", decision: parsed.data };
}

/** What a decided item settled on: the correction if there is one, else the proposal. */
const settled = (item) => (item?.status === "corrected" ? item.decision : item?.status === "accepted" ? item.proposed : null);

/**
 * The arguments for engine.publish_label(), from one extraction output's items.
 * @param {Array<object>} items review_queue rows for ONE output
 * @param {{ netWeight?: string|null }} [ctx]
 * @returns {{ ingredients: object|null, nutrition: object|null, blockers: string[] }}
 */
export function buildPublishPayload(items, ctx = {}) {
  const by = Object.fromEntries(items.map((i) => [i.field_group, i]));
  const blockers = [];

  // Nothing publishes until a person has said the photo is this product: a
  // correct reading of the wrong pack is a wrong fact about this one.
  if (!settled(by.identity)) {
    blockers.push(by.identity?.status === "rejected"
      ? "The photo was rejected as not this product."
      : "Confirm the photo is this product first.");
    return { ingredients: null, nutrition: null, blockers };
  }

  let ingredients = null;
  const list = settled(by.ingredients);
  const allergens = settled(by.allergens);
  if (list && allergens) {
    ingredients = {
      raw_ingredient_text: list.raw_ingredient_text,
      parsed_ingredients: list.parsed_ingredients,
      allergens: allergens.contains,
      may_contain: allergens.may_contain,
    };
  } else if (list || allergens) {
    blockers.push("Ingredients and allergens publish together — decide both.");
  } else if (!by.ingredients) {
    blockers.push("No ingredient list in this photo — ask the brand for a back-of-pack photo.");
  }

  let nutrition = null;
  const panel = settled(by.nutrition);
  if (panel) {
    const values = Object.fromEntries(NUTRIENT_FIELDS.map((f) => [f, panel[f] ?? null]));
    nutrition = toNutritionRow(
      { basis: panel.measurement_basis, serving_size: panel.serving_size, servings_per_pack: panel.servings_per_pack ?? null, values },
      ctx.netWeight ?? null,
    );
  }

  const pending = items.filter((i) => i.status === "pending").map((i) => i.field_group);
  if (pending.length) blockers.push(`Still to decide: ${pending.join(", ")}.`);

  return { ingredients, nutrition, blockers };
}
