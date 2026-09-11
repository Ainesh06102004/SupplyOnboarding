// ============================================================================
// KOI ENGINE — From a checked reading to the questions a person answers
//
// A reading becomes one review item per field group: identity, ingredients,
// allergens, nutrition. Each carries what the engine proposes and why it was
// routed where it was.
//
// ROUTING, as the plan sets it:
//   - Allergens always go to a person. No accuracy figure changes that.
//   - Ingredients and identity go to a person.
//   - Nutrition could be auto-accepted when every arithmetic check passes AND
//     the evaluation set has shown field accuracy of 99% or better. That second
//     condition is not met yet, so AUTO_ACCEPT is off and everything is human;
//     the route_reason still records whether the checks were clean, which is
//     the data the evaluation needs.
//
// Pure.
// ============================================================================

import { normalizedColumns } from "@/lib/nutrition/basis";
import { NUTRIENT_FIELDS } from "./labelSchema";
import { flagsInIngredients, flagsInStatement } from "./checks";

export const AUTO_ACCEPT = Object.freeze({ nutrition: false });

/**
 * A reading's nutrition as a `sku_nutrition` row: the declared figures on their
 * declared basis, plus the normalized per-100 and per-serving columns from the
 * same converter every other writer uses.
 *
 * @param {object} nutrition reading.nutrition
 * @param {string|null} netWeight the SKU's net weight, for servings_per_pack
 */
export function toNutritionRow(nutrition, netWeight = null) {
  const row = {
    measurement_basis: nutrition.basis,
    serving_size: nutrition.serving_size,
  };
  for (const f of NUTRIENT_FIELDS) row[f] = nutrition.values?.[f] ?? null;
  const normalized = normalizedColumns(row, netWeight);
  // A servings-per-pack the label prints beats one computed from net weight.
  return { ...row, ...normalized, servings_per_pack: nutrition.servings_per_pack ?? normalized.servings_per_pack };
}

/**
 * The allergen flags a reading supports. `contains` is everything the list or
 * the statement names — over-proposing costs a reviewer one click, while
 * under-proposing is how an allergen goes unremarked. `may_contain` comes from
 * the precautionary statement only.
 */
export function proposeAllergens(reading) {
  const fromText = flagsInIngredients(reading.ingredients_text);
  const fromStatement = flagsInStatement(reading.allergen_statement);
  return {
    contains: [...new Set([...fromText, ...fromStatement])],
    may_contain: flagsInStatement(reading.may_contain_statement),
    from_text: fromText,
    from_statement: fromStatement,
  };
}

/**
 * @param {object} reading a parsed LabelReading
 * @param {object} result runChecks(reading)
 * @param {{ netWeight?: string|null }} [ctx]
 * @returns {Array<{ field_group, proposed, route, route_reason }>}
 */
export function toReviewItems(reading, result, ctx = {}) {
  const failed = (group) => result.checks.filter((c) => c.group === group && c.ok === false).map((c) => c.id);
  const items = [];

  items.push({
    field_group: "identity",
    proposed: {
      product_name: reading.product_name, brand: reading.brand, net_quantity: reading.net_quantity,
      veg_mark: reading.veg_mark, fssai_licence: reading.fssai_licence,
    },
    route: "human",
    route_reason: "A person confirms the photo belongs to this product.",
  });

  if (reading.visible.ingredients) {
    items.push({
      field_group: "ingredients",
      proposed: { raw_ingredient_text: reading.ingredients_text, parsed_ingredients: reading.ingredients },
      route: "human",
      route_reason: failed("ingredients").length
        ? `A person checks every ingredient list; this one failed ${failed("ingredients").join(", ")}.`
        : "A person checks every ingredient list until the evaluation set shows 99% field accuracy.",
    });
  }

  if (reading.visible.ingredients || reading.visible.allergen_statement) {
    items.push({
      field_group: "allergens",
      proposed: {
        ...proposeAllergens(reading),
        statement: reading.allergen_statement,
        may_contain_statement: reading.may_contain_statement,
      },
      route: "human",
      route_reason: failed("allergens").length
        ? `Allergens always go to a person. Failed: ${failed("allergens").join(", ")}.`
        : "Allergens always go to a person.",
    });
  }

  if (reading.visible.nutrition_table) {
    const bad = failed("nutrition");
    const clean = bad.length === 0;
    items.push({
      field_group: "nutrition",
      proposed: toNutritionRow(reading.nutrition, ctx.netWeight ?? null),
      route: clean && AUTO_ACCEPT.nutrition ? "auto_eligible" : "human",
      route_reason: clean
        ? "Every nutrition check passed. Auto-accept stays off until the evaluation set proves accuracy."
        : `Failed: ${bad.join(", ")}.`,
    });
  }

  return items;
}
