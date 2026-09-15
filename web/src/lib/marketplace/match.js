// ============================================================================
// KOI — Is this marketplace listing the SKU KOI screened?
//
// Phase 1.6. A KOI SKU is linked to a provider's listing with nobody asked to
// confirm it, so a link has to be a fact about identity, not a resemblance:
//
//   brand      the listing's brand is the SKU's brand
//   name       at least two of KOI's name words (all of them, for a one-word
//              name), and no flavour or format word beyond the SKU's own
//              variant — "Potato Chips Lemon" is not the Masala SKU
//   pack size  the SKU's net weight, within 2%. A multi-pack is never the pack.
//   MRP        within 10% raises confidence; beyond 20% under or 25% over, the
//              listing is taken to be a different pack and is not trusted
//
// Confidence 0.85 for brand, name and exact pack; 0.95 with a close MRP. No
// pack size to compare, or an MRP far off, caps it at 0.6 — below
// MATCH.minConfidence, so it is recorded but not trusted and availability
// stays `unknown`. Two different listings that clear the same bar are
// ambiguous, and nothing is linked.
//
// Pure, and provider-agnostic: it reads MarketplaceItem (lib/marketplace/types).
// ============================================================================

import { words, sizesIn, gramsOf } from "@/lib/engine/storeMatch";
import { MATCH } from "./config";

// A link is looked for again after this long, found or not.
export const REMATCH_AFTER_MS = 7 * 86_400_000;

const STOP = new Set([
  "the", "and", "with", "of", "for", "by", "a", "an", "in", "default", "new",
  "flavour", "flavor", "flavoured", "flavored", "pack", "pouch", "jar", "box", "bottle", "tin", "can",
]);
const MULTIPACK = /\bpack of \d+|\bset of \d+|\b\d+\s*x\s*\d+|\bcombo\b/i;

const clean = (text, exclude) =>
  [...new Set(words(text).filter((w) => !STOP.has(w) && !exclude.has(w) && !/^\d/.test(w)))];

const squash = (s) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");

function sameBrand(brand, item) {
  const koi = squash(brand);
  if (!koi) return false;
  return item.rawBrand ? squash(item.rawBrand) === koi : squash(item.rawName).startsWith(koi);
}

/** The search that finds a SKU: KOI's own brand and product name, never a shopper's words. */
export function matchQueryFor(koi) {
  const query = [koi?.brand, koi?.product].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  return query ? query.slice(0, 120) : null;
}

/**
 * @param {{ brand: string, product: string, variant?: string|null, netWeight?: string|null, mrp?: number|null }} koi
 * @param {import('./types').MarketplaceItem} item
 * @returns {{ confidence: number, reason: string }}
 */
export function scoreListing(koi, item) {
  if (!item?.externalId) return { confidence: 0, reason: "The listing has no id." };
  if (!sameBrand(koi?.brand, item)) return { confidence: 0, reason: "Another brand." };
  if (!MULTIPACK.test(koi.product ?? "") && (MULTIPACK.test(item.rawName ?? "") || MULTIPACK.test(item.rawPackSize ?? ""))) {
    return { confidence: 0, reason: "A multi-pack, not this pack." };
  }

  const brandWords = new Set([...words(koi.brand), ...words(item.rawBrand)]);
  const koiWords = clean(koi.product, brandWords);
  const variant = clean(koi.variant, brandWords).filter((w) => !koiWords.includes(w));
  const listing = clean(item.rawName, brandWords);
  const needed = Math.min(2, koiWords.length);
  if (!needed || listing.filter((w) => koiWords.includes(w)).length < needed) {
    return { confidence: 0, reason: "The names do not match." };
  }
  const foreign = listing.filter((w) => !koiWords.includes(w) && !variant.includes(w));
  if (foreign.length) return { confidence: 0, reason: `The listing also names ${foreign.join(", ")}.` };

  let confidence = 0.85;
  const doubts = [];
  const target = gramsOf(koi.netWeight);
  const sizes = [...sizesIn(item.rawPackSize), ...sizesIn(item.rawName)];
  if (target === null || !sizes.length) {
    confidence = 0.6;
    doubts.push("no pack size to compare");
  } else if (!sizes.some((s) => Math.abs(s - target) <= target * 0.02)) {
    return { confidence: 0, reason: `A ${sizes[0]} g pack, not ${target} g.` };
  }

  const koiMrp = Number(koi.mrp);
  const mrp = Number(item.mrp);
  if (koiMrp > 0 && mrp > 0) {
    const ratio = mrp / koiMrp;
    if (ratio < 0.8 || ratio > 1.25) {
      confidence = Math.min(confidence, 0.6);
      doubts.push(`MRP ₹${mrp} against KOI's ₹${koiMrp}`);
    } else if (ratio >= 0.9 && ratio <= 1.1 && confidence === 0.85) {
      confidence = 0.95;
    }
  }
  return {
    confidence,
    reason: doubts.length ? `Same brand and name, but ${doubts.join("; ")}.` : "Same brand, name and pack.",
  };
}

/**
 * The listing that is this SKU, if exactly one is.
 * @returns {{ status: "matched"|"weak"|"ambiguous"|"no_match", item?: object, confidence: number, reason: string }}
 */
export function pickListingMatch(koi, items = []) {
  const scored = (Array.isArray(items) ? items : [])
    .map((item) => ({ item, ...scoreListing(koi, item) }))
    .filter((s) => s.confidence > 0)
    .sort((a, b) => b.confidence - a.confidence);
  if (!scored.length) return { status: "no_match", confidence: 0, reason: "No listing is this product." };

  const [top] = scored;
  const rivals = scored.filter((s) => s.confidence === top.confidence && s.item.externalId !== top.item.externalId);
  if (rivals.length) return { status: "ambiguous", confidence: 0, reason: `${rivals.length + 1} listings fit equally.` };

  return {
    status: top.confidence >= MATCH.minConfidence ? "matched" : "weak",
    item: top.item,
    confidence: top.confidence,
    reason: top.reason,
  };
}
