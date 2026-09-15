// ============================================================================
// KOI — Which Open Food Facts product is this SKU, and do the figures agree?
//
// Phase 1.5. A cross-check is only worth anything if it compares the same
// product, so a match is either:
//   barcode  the SKU's barcode is the Open Food Facts code, or
//   name     exactly one product of the same brand whose name shares at least
//            two words with KOI's (brand and sizes aside), and whose only other
//            words are the SKU's own variant — so no other flavour or format.
// Several fits are `ambiguous`; none is `no_match`. Either way nothing is
// compared.
//
// A comparison is a signal. It is recorded (engine.off_matches), never used to
// change what KOI publishes: KOI's figures came from the pack; the community's
// may be older, or a different recipe.
//
// Pure.
// ============================================================================

import { words } from "@/lib/engine/storeMatch";
import { toPer100 } from "@/lib/nutrition/basis";

export const COMPARED_NUTRIENTS = Object.freeze([
  "energy_kcal", "protein_g", "carbs_g", "sugars_g", "fibre_g", "total_fat_g", "saturated_fat_g", "sodium_mg",
]);

const STOP = new Set(["the", "and", "with", "of", "for", "by", "a", "an", "in", "default"]);

/** "The Healthy Binge" -> "the-healthy-binge", the form of Open Food Facts brand tags. */
export function brandSlug(name) {
  return String(name ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const nameWords = (text, brandWords) =>
  [...new Set(words(text).filter((w) => !STOP.has(w) && !brandWords.has(w) && !/^\d/.test(w)))];

/**
 * @param {{ barcode?: string|null, product: string, brand?: string, variant?: string }} sku
 * @param {Array<{ code: string, product_name: string|null, brand_tags: string[] }>} candidates
 * @returns {{ status: "matched"|"no_match"|"ambiguous", method?: "barcode"|"name", row?: object, reason: string }}
 */
export function findOffMatch(sku, candidates = []) {
  const barcode = String(sku.barcode ?? "").replace(/\D/g, "");
  if (barcode) {
    const bare = barcode.replace(/^0+/, "");
    const exact = candidates.find((c) => String(c.code).replace(/^0+/, "") === bare);
    if (exact) return { status: "matched", method: "barcode", row: exact, reason: `Barcode ${barcode}.` };
  }

  const slug = brandSlug(sku.brand);
  if (!slug) return { status: "no_match", reason: "The SKU has no brand to match on." };
  const brandWords = new Set(words(sku.brand));
  const koi = nameWords(sku.product, brandWords);
  const variant = nameWords(sku.variant, brandWords).filter((w) => !koi.includes(w));
  if (koi.length < 2) return { status: "no_match", reason: "The product name is too short to match on without a barcode." };

  const fits = candidates.filter((c) => {
    if (!(c.brand_tags || []).some((t) => String(t).replace(/^[a-z]{2}:/, "") === slug)) return false;
    const off = nameWords(c.product_name, brandWords);
    if (off.filter((w) => koi.includes(w)).length < 2) return false;
    // KOI's name may carry words the community's does not ("The Healthy ...").
    // A word only Open Food Facts has names a flavour or format, and has to be
    // the SKU's own variant — "Potato Chips Lemon" is not the Masala SKU.
    return off.filter((w) => !koi.includes(w)).every((w) => variant.includes(w));
  });

  if (fits.length === 1) return { status: "matched", method: "name", row: fits[0], reason: `"${fits[0].product_name}", same brand.` };
  if (fits.length > 1) {
    return { status: "ambiguous", reason: `${fits.length} products of the brand fit: ${fits.slice(0, 3).map((c) => `"${c.product_name}"`).join(", ")}.` };
  }
  return { status: "no_match", reason: "No Open Food Facts product of this brand has this name." };
}

// ── Looking again ──────────────────────────────────────────────────────────

// A disagreement is a reason to read the pack again, not to trust either side.
// Once a month per product at most, so a lasting disagreement cannot become a
// loop of model calls.
export const REREAD_COOLDOWN_DAYS = 30;

/**
 * Should a disagreement queue a fresh reading of this product's labels?
 * @param {{ nutritionVerified?: boolean, lastRequestedAt?: string|null, now?: number }} input
 */
export function shouldReread({ nutritionVerified = false, lastRequestedAt = null, now = Date.now() } = {}) {
  // A person checked these figures against the pack; a community entry does not outweigh that.
  if (nutritionVerified) return false;
  if (!lastRequestedAt) return true;
  const last = new Date(lastRequestedAt).getTime();
  return !Number.isFinite(last) || now - last >= REREAD_COOLDOWN_DAYS * 86_400_000;
}

const round = (v) => Math.round(v * 10) / 10;

// Labels round, and a recipe tweak moves figures a little; beyond these it is
// a different number.
function tolerance(field, a, b) {
  const larger = Math.max(Math.abs(a), Math.abs(b));
  if (field === "energy_kcal") return Math.max(10, 0.1 * larger);
  if (field === "sodium_mg") return Math.max(20, 0.15 * larger);
  return Math.max(1, 0.15 * larger);
}

/**
 * @param {object} nutrition a public.sku_nutrition row
 * @param {object} offNutrients engine.off_products.nutrients_per_100
 * @returns {{ comparable: boolean, reason?: string, fields: Array<{ field, koi, off, agrees }>, disagreements: string[] }}
 */
export function compareWithOff(nutrition, offNutrients) {
  const koi = toPer100(nutrition || {});
  if (!koi.unit) return { comparable: false, reason: "KOI's figures do not convert to per 100.", fields: [], disagreements: [] };
  const fields = [];
  for (const field of COMPARED_NUTRIENTS) {
    const a = koi[field];
    const b = offNutrients?.[field];
    if (a === null || a === undefined || !Number.isFinite(Number(a)) || b === null || b === undefined) continue;
    fields.push({ field, koi: round(Number(a)), off: round(Number(b)), agrees: Math.abs(Number(a) - Number(b)) <= tolerance(field, Number(a), Number(b)) });
  }
  if (!fields.length) return { comparable: false, reason: "No figure is declared on both sides.", fields, disagreements: [] };
  return { comparable: true, fields, disagreements: fields.filter((f) => !f.agrees).map((f) => f.field) };
}
