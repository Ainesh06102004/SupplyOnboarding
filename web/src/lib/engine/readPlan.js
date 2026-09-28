// ============================================================================
// KOI ENGINE — what to read, and what it costs. Pure.
//
// Three savings on label reading (27–28 Sep 2026):
//   1. Read only what a product still needs: one photo carrying both panels
//      (kind "label"), else one nutrition photo and one ingredients photo —
//      the sharpest of each — and nothing a product already has agreed.
//   2. The Batch API for a backlog: the same requests at half price, back
//      within 24 hours (scripts/amazon/labels.mjs --batch / --collect).
//   3. Open Food Facts as the second opinion on a nutrition-only photo, when
//      the product's barcode is in Open Food Facts: one model reading that
//      agrees with it (lib/off/match.js compareWithOff) is agreed. It is used to
//      CHECK, never copied (ODbL), and never for ingredients or allergens —
//      those always take two independent model readings.
// ============================================================================

import { compareWithOff } from "@/lib/off/match";

/** USD per million tokens, list prices (developers.openai.com, Sep 2026). The Batch API bills half. */
export const PRICES = Object.freeze({
  "gpt-5.4-mini": { in: 0.75, cachedIn: 0.075, out: 4.5 },
  "gpt-4.1-mini": { in: 0.4, cachedIn: 0.1, out: 1.6 },
  "gpt-5.4-nano": { in: 0.2, cachedIn: 0.02, out: 1.25 },
});
export const BATCH_DISCOUNT = 0.5;

const family = (model) => Object.keys(PRICES).find((k) => String(model ?? "").startsWith(k)) ?? null;

/**
 * USD for one reply's usage (chat-completions `usage`).
 * @returns {number|null} null when the model's price isn't known
 */
export function costOf(usage, model, { batch = false } = {}) {
  const p = PRICES[family(model)];
  if (!p || !usage) return null;
  const cached = Number(usage.prompt_tokens_details?.cached_tokens) || 0;
  const input = (Number(usage.prompt_tokens) || 0) - cached;
  const output = Number(usage.completion_tokens) || 0;
  const usd = (input * p.in + cached * p.cachedIn + output * p.out) / 1e6;
  return batch ? usd * BATCH_DISCOUNT : usd;
}

const PANEL = new Set(["label", "nutrition", "ingredients"]);
const area = (i) => (Number(i.width) || 0) * (Number(i.height) || 0);

/**
 * The photos to read: per product, only what it still needs, sharpest first,
 * each distinct photo once.
 *
 * @param {Array<{ id, asin, sha256, kind, width, height }>} images
 * @param {{ read?: Set<string>, has?: Map<string, { nutrition: boolean, ingredients: boolean }> }} [state]
 *   read: sha256 of photos already read; has: what each asin already has agreed
 * @returns {Array<{ sha256, asin, kind, image }>}
 */
export function photosToRead(images, { read = new Set(), has = new Map() } = {}) {
  const byAsin = new Map();
  for (const img of images) {
    if (!PANEL.has(img.kind) || !img.sha256 || read.has(img.sha256)) continue;
    (byAsin.get(img.asin) ?? byAsin.set(img.asin, []).get(img.asin)).push(img);
  }
  const chosen = new Map();
  for (const [asin, list] of byAsin) {
    const have = has.get(asin) ?? { nutrition: false, ingredients: false };
    const needN = !have.nutrition;
    const needI = !have.ingredients;
    if (!needN && !needI) continue;
    const best = (kind) => list.filter((i) => i.kind === kind).sort((a, b) => area(b) - area(a))[0] ?? null;
    const both = best("label");
    const picks = both && (needN || needI)
      ? [both]
      : [needN ? best("nutrition") : null, needI ? best("ingredients") : null].filter(Boolean);
    for (const p of picks) if (!chosen.has(p.sha256)) chosen.set(p.sha256, { sha256: p.sha256, asin, kind: p.kind, image: p });
  }
  return [...chosen.values()];
}

/**
 * Open Food Facts as the second reader of a nutrition table: agreed when at
 * least `need` figures are declared on both sides, energy and protein among
 * them, and every one agrees within compareWithOff's tolerances.
 *
 * @param {{ basis: string, values: object, serving_size?: string }} nutrition one model's reading
 * @param {object|null} offNutrients engine.off_products.nutrients_per_100
 * @returns {{ agrees: boolean, why: string, fields: Array }}
 */
export function offSecondOpinion(nutrition, offNutrients, { need = 4 } = {}) {
  if (!nutrition?.values || !offNutrients) return { agrees: false, why: "nothing to compare", fields: [] };
  const row = { measurement_basis: nutrition.basis, serving_size: nutrition.serving_size ?? null, ...nutrition.values };
  const cmp = compareWithOff(row, offNutrients);
  if (!cmp.comparable) return { agrees: false, why: cmp.reason, fields: cmp.fields };
  const names = new Set(cmp.fields.map((f) => f.field));
  if (cmp.fields.length < need || !names.has("energy_kcal") || !names.has("protein_g")) {
    return { agrees: false, why: `only ${cmp.fields.length} figures on both sides`, fields: cmp.fields };
  }
  if (cmp.disagreements.length) return { agrees: false, why: `disagrees on ${cmp.disagreements.join(", ")}`, fields: cmp.fields };
  return { agrees: true, why: `${cmp.fields.length} figures agree with Open Food Facts`, fields: cmp.fields };
}
