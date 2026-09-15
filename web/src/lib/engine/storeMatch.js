// ============================================================================
// KOI ENGINE — Find a SKU's listing on its brand's own online store
//
// Phase 1.4. The re-check looks for fresh label images where brands keep their
// packs current: their own store. That only helps if the listing is the right
// product, and a near miss is worse than no source — "Golden Milk Mix" is not
// "Mango Milk Mix", and a gift box's gallery is full of other products'
// nutrition tables. So a listing matches only when:
//
//   - every word of KOI's product name is in its title or handle;
//   - it is not a combo, gift box, hamper or multi-pack, unless KOI's is;
//   - among several, the SKU's variant ("Masala") picks the flavour, and what
//     is left differs only by pack size or is a duplicate listing — then the
//     SKU's pack size, a handle that is not a copy, and the most images decide.
//
// Anything else is `no_match` or `ambiguous` and the SKU gets no source: its
// label ages out on the storefront rather than being refreshed from the wrong
// pack.
//
// Also here, because it is the same question asked of URLs: which hosts and
// image addresses the re-check may fetch at all.
//
// Pure.
// ============================================================================

const STOP = new Set(["the", "and", "with", "for", "of", "by", "a", "an", "in"]);
const SIZE = /(\d+(?:\.\d+)?)\s*(kgs|kg|grams|gram|gms|gm|g|ml|ltr|litre|liter|l)\b/gi;
const SIZE_WORD = /^\d+(?:\.\d+)?(kgs|kg|grams|gram|gms|gm|g|ml|ltr|litre|liter|l)$/;
const UNIT_GRAMS = Object.freeze({ kgs: 1000, kg: 1000, grams: 1, gram: 1, gms: 1, gm: 1, g: 1, ml: 1, ltr: 1000, litre: 1000, liter: 1000, l: 1000 });
const BUNDLE = /\b(combo|gift|hamper|bundle|assorted|sampler|kit)\b|\+|\bpack of \d+|\b\d+\s*x\s*\d+/i;

// "almonds" -> "almond", but not "madras", "hummus" or "ananas".
const singular = (w) => (w.length > 3 && w.endsWith("s") && !/(?:ss|as|is|us)$/.test(w) ? w.slice(0, -1) : w);

/** Lowercase words, pack sizes folded to one token ("95 g" -> "95g"), plurals dropped. */
export function words(text) {
  return String(text ?? "")
    .toLowerCase()
    .replace(SIZE, (_, n, unit) => ` ${n}${unit.toLowerCase()} `)
    .replace(/[^a-z0-9.]+/g, " ")
    .split(" ")
    .map((w) => w.replace(/^\.+|\.+$/g, ""))
    .filter((w) => w.length >= 2)
    .map(singular);
}

/** Every pack size in a string, in grams (ml counted as grams). */
export function sizesIn(text) {
  return [...String(text ?? "").matchAll(SIZE)].map((m) => Number(m[1]) * UNIT_GRAMS[m[2].toLowerCase()]);
}

/** "1kg" -> 1000; null when no size is stated. */
export function gramsOf(netWeight) {
  const sizes = sizesIn(netWeight);
  return sizes.length ? sizes[0] : null;
}

/**
 * @param {{ product: string, brand?: string, variant?: string, netWeight?: string }} sku
 * @param {Array<{ title: string, handle: string, variants?: Array<{title}>, images?: Array }>} listings
 * @returns {{ status: "matched"|"no_match"|"ambiguous", listing?: object, reason: string }}
 */
export function matchListing(sku, listings = []) {
  const want = [...new Set(words(sku.product).filter((w) => !STOP.has(w) && !SIZE_WORD.test(w)))];
  if (!want.length) return { status: "no_match", reason: "The product has no name to match." };
  const brand = new Set(words(sku.brand));
  const bundleAllowed = BUNDLE.test(sku.product ?? "");
  const variantWords = [...new Set(words(sku.variant).filter((w) => !want.includes(w) && !STOP.has(w) && w !== "default"))];

  const candidates = [];
  for (const listing of listings) {
    if (!listing?.title || !listing?.handle) continue;
    const handleText = String(listing.handle).replace(/-/g, " ");
    const title = words(listing.title);
    const have = new Set([...title, ...words(handleText)]);
    if (!want.every((w) => have.has(w))) continue;
    if (!bundleAllowed && (BUNDLE.test(listing.title) || BUNDLE.test(handleText))) continue;
    const extras = [...new Set(title.filter((w) => !want.includes(w) && !brand.has(w) && !STOP.has(w) && !SIZE_WORD.test(w) && !/^\d+$/.test(w)))];
    const sizes = [...sizesIn(listing.title), ...(listing.variants || []).flatMap((v) => sizesIn(v?.title))];
    candidates.push({ listing, extras, sizes, copy: /\bcopy\b/.test(handleText) });
  }
  if (!candidates.length) return { status: "no_match", reason: `No listing has every word of "${sku.product}".` };

  let pool = candidates;
  const flavoured = variantWords.length ? pool.filter((c) => c.extras.some((e) => variantWords.includes(e))) : [];
  if (flavoured.length) pool = flavoured;

  const unexplained = (c) => c.extras.filter((e) => !variantWords.includes(e)).sort();
  const fewest = Math.min(...pool.map((c) => unexplained(c).length));
  pool = pool.filter((c) => unexplained(c).length === fewest);

  // The SKU names a variant no listing mentions, and every listing names
  // something else: that is a different flavour, not this one.
  if (variantWords.length && !flavoured.length && fewest > 0) {
    return { status: "ambiguous", reason: `The SKU is "${sku.variant}", and the listings found are ${pool.map((c) => `"${c.listing.title}"`).join(", ")}.` };
  }
  if (new Set(pool.map((c) => unexplained(c).join(" "))).size > 1) {
    return { status: "ambiguous", reason: `Different listings fit equally: ${pool.map((c) => `"${c.listing.title}"`).join(", ")}.` };
  }

  const target = gramsOf(sku.netWeight);
  const fitsPack = (c) => (target !== null && c.sizes.some((s) => Math.abs(s - target) < 0.5) ? 1 : 0);
  const imageCount = (c) => c.listing.images?.length || 0;
  pool.sort((a, b) => fitsPack(b) - fitsPack(a) || Number(a.copy) - Number(b.copy) || imageCount(b) - imageCount(a));

  const chosen = pool[0].listing;
  return {
    status: "matched",
    listing: chosen,
    reason: pool.length > 1 ? `"${chosen.title}", one of ${pool.length} listings of the same product.` : `"${chosen.title}".`,
  };
}

// ── Who is checked ──────────────────────────────────────────────────────────

// Only brands that completed onboarding with KOI. Their store is part of how
// they sell through KOI, and the website is one they gave at onboarding (or
// one KOI confirmed lists their products). Foods that come from an open
// database (Open Food Facts, Phase 1.5) are never checked: they are staged in
// engine.off_products with no brand record and no website, and a food whose
// brand is missing or has not finished onboarding is refused here regardless.
export const ONBOARDED_BRAND_STATUSES = Object.freeze(["approved"]);

/**
 * @param {{ products?: { status?: string, brands?: { onboarding_status?: string, website?: string }|null } }} sku
 * @returns {{ ok: true, host: string }|{ ok: false, reason: string }}
 */
export function storeCheckEligibility(sku) {
  const product = sku?.products;
  const brand = product?.brands;
  if (product?.status !== "approved") return { ok: false, reason: "The product is not approved." };
  if (!brand || !ONBOARDED_BRAND_STATUSES.includes(brand.onboarding_status)) {
    return { ok: false, reason: "The brand has not completed onboarding with KOI." };
  }
  const host = storeHost(brand.website);
  if (!host) return { ok: false, reason: "The brand has no store KOI can check." };
  return { ok: true, host };
}

// ── What may be fetched ─────────────────────────────────────────────────────

/** A DNS name with a letter TLD: never an IP literal, localhost, or a private suffix. */
export function isPublicHostname(host) {
  const h = String(host ?? "").toLowerCase();
  if (!/^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(h)) return false;
  return !/(?:^|\.)(?:localhost|local|internal|intranet|lan|home|corp)$/.test(h);
}

/** The store host from brands.website, or null if it is not one KOI will fetch. */
export function storeHost(website) {
  const raw = typeof website === "string" ? website.trim() : "";
  if (!raw) return null;
  let url;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  return isPublicHostname(url.hostname) ? url.hostname.toLowerCase() : null;
}

const bare = (h) => String(h).toLowerCase().replace(/^www\./, "");

/** The brand's own domain or one of its subdomains. */
export function sameStore(host, store) {
  const a = bare(host);
  const b = bare(store);
  return a === b || a.endsWith(`.${b}`);
}

/** An https image on the store's own domain or Shopify's CDN, normalised; else null. */
export function allowedImageUrl(src, store) {
  let url;
  try {
    url = new URL(String(src ?? "").startsWith("//") ? `https:${src}` : String(src ?? ""));
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || !isPublicHostname(url.hostname)) return null;
  return url.hostname === "cdn.shopify.com" || sameStore(url.hostname, store) ? url.toString() : null;
}

// ── Which images are labels ─────────────────────────────────────────────────

const LABEL_HINT = /(?:^|[^a-z])(?:nutri[a-z]*|ingredients?|back|bop|labels?|tabel|table|panel)(?:[^a-z]|$)/i;

/** A file name or alt text that says "label" — checked first, and read even if the model misses the panel. */
export function isLabelHint(image) {
  let name = String(image?.src ?? "").split("?")[0].split("/").pop() ?? "";
  try { name = decodeURIComponent(name); } catch { /* keep it encoded */ }
  return LABEL_HINT.test(name) || LABEL_HINT.test(String(image?.alt ?? ""));
}

/** uploads.file_type for what an image shows. */
export function labelFileType(shows) {
  const ingredients = Boolean(shows?.ingredient_list || shows?.allergen_statement);
  const nutrition = Boolean(shows?.nutrition_table);
  if (ingredients && nutrition) return "back_image";
  if (ingredients) return "ingredient_label";
  if (nutrition) return "nutrition_label";
  return "back_image";
}
