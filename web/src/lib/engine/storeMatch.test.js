// ============================================================================
// KOI ENGINE — tests for matching a SKU to its brand's store listing
// Run with `npm test`. Listings are the real ones found on 15 Sep 2026.
// ============================================================================

import test from "node:test";
import assert from "node:assert/strict";

import {
  matchListing, words, sizesIn, gramsOf, storeHost, isPublicHostname, allowedImageUrl, isLabelHint, labelFileType,
} from "@/lib/engine/storeMatch.js";

const L = (title, handle, { variants = [], images = 1 } = {}) => ({
  title,
  handle,
  variants: variants.map((t) => ({ title: t })),
  images: Array.from({ length: images }, (_, i) => ({ src: `https://cdn.shopify.com/s/files/1/${handle}-${i}.jpg` })),
});

const CHIPS = [
  L("Troovy Potato Chips - Lemon", "healthy-potato-chips-lemon"),
  L("Troovy Potato Chips - Masala", "healthy-tangy-potato-chips-masala"),
  L("Troovy Potato Chips - Tangy Tomato", "healthy-potato-chips-tangy-tomato"),
];

test("the SKU's variant picks the flavour", () => {
  const m = matchListing({ product: "The Healthy Potato Chips", brand: "Troovy", variant: "Masala", netWeight: "200g" }, CHIPS);
  assert.equal(m.status, "matched");
  assert.equal(m.listing.handle, "healthy-tangy-potato-chips-masala");
});

test("several flavours and no variant to choose between them is ambiguous, not a guess", () => {
  assert.equal(matchListing({ product: "The Healthy Potato Chips", brand: "Troovy", variant: "Default" }, CHIPS).status, "ambiguous");
});

test("a flavour the store does not list is not matched to one it does", () => {
  const m = matchListing({ product: "The Healthy Potato Chips", brand: "Troovy", variant: "Peri Peri" }, [CHIPS[0]]);
  assert.equal(m.status, "ambiguous");
});

test("a near name is no match: Golden Milk Mix is not Mango Milk Mix", () => {
  const m = matchListing({ product: "Golden Milk Mix", brand: "Sweet Karam Coffee" }, [L("Mango Milk Mix", "mango-milk-mix")]);
  assert.equal(m.status, "no_match");
});

test("combos, gift boxes and multi-packs are never one product's listing", () => {
  const ragi = matchListing({ product: "Ragi Hot Chocolate Milk Mix", brand: "Sweet Karam Coffee", variant: "Chocolate" }, [
    L("ABC + Ragi Hot Chocolate Milk Mix Combo", "milk-mix-combo"),
    L("Ragi Hot Chocolate Milk Mix", "buy-ragi-hot-chocolate-mix-online"),
  ]);
  assert.equal(ragi.listing.handle, "buy-ragi-hot-chocolate-mix-online");
  const almonds = matchListing({ product: "California Almonds", brand: "Open Secret" }, [
    L("Premium California Almond (501g) | pack of 2", "premium-california-almond-501g-pack-of-2"),
  ]);
  assert.equal(almonds.status, "no_match");
});

test("the same product in several sizes: the SKU's pack size wins", () => {
  const m = matchListing({ product: "Premium Pampore Saffron", brand: "KisaanSay", variant: "Default", netWeight: "1g" }, [
    L("Premium Pampore Saffron - 2g", "premium-pampore-saffron-2g", { variants: ["2g"], images: 6 }),
    L("Premium Pampore Saffron - 1g", "premium-pampore-saffron", { variants: ["1g"], images: 6 }),
  ]);
  assert.equal(m.listing.handle, "premium-pampore-saffron");
});

test("with no size to go by, a plain listing with the most images beats a renamed one", () => {
  const m = matchListing({ product: "Madras Mixture", brand: "Sweet Karam Coffee", variant: "Classic", netWeight: "250g" }, [
    L("Madras Mixture 30 g", "madras-mixture-30-g", { variants: ["30 g"], images: 1 }),
    L("Madras Mixture 95 g", "spl-madras-mixture-95-g", { variants: ["95 g"], images: 5 }),
    L("Spl Madras Mixture", "buy-spl-madras-mixture-online", { variants: ["500 g", "200 g"], images: 8 }),
  ]);
  assert.equal(m.status, "matched");
  assert.equal(m.listing.handle, "spl-madras-mixture-95-g");
});

test("a duplicated listing: the one that is not a copy", () => {
  const m = matchListing({ product: "The Healthy Butter Cookies", brand: "Troovy", variant: "Better Butter", netWeight: "200g" }, [
    L("Troovy Butter Cookies", "healthy-butter-cookies-copy-1", { images: 20 }),
    L("Troovy Butter Cookies", "the-healthy-butter-cookie", { images: 16 }),
  ]);
  assert.equal(m.listing.handle, "the-healthy-butter-cookie");
});

test("words fold pack sizes and plurals", () => {
  assert.deepEqual(words("Madras Mixture 95 g"), ["madras", "mixture", "95g"]);
  assert.equal(gramsOf("1kg"), 1000);
  assert.equal(gramsOf("Default"), null);
  assert.deepEqual(sizesIn("2 x 250 g + Shaker"), [250]);
});

test("only public, named hosts on the brand's own domain or Shopify's CDN are fetched", () => {
  assert.equal(storeHost("https://opensecret.in/"), "opensecret.in");
  assert.equal(storeHost("kisaansay.com"), "kisaansay.com");
  assert.equal(storeHost("http://169.254.169.254/latest"), null);
  assert.equal(storeHost("https://localhost:3000"), null);
  assert.equal(storeHost(""), null);
  assert.equal(isPublicHostname("printer.local"), false);
  assert.equal(allowedImageUrl("//cdn.shopify.com/s/files/1/x.jpg?v=1", "opensecret.in"), "https://cdn.shopify.com/s/files/1/x.jpg?v=1");
  assert.equal(allowedImageUrl("https://www.opensecret.in/cdn/shop/files/x.jpg", "opensecret.in"), "https://www.opensecret.in/cdn/shop/files/x.jpg");
  assert.equal(allowedImageUrl("https://evil-opensecret.in/x.jpg", "opensecret.in"), null);
  assert.equal(allowedImageUrl("http://cdn.shopify.com/x.jpg", "opensecret.in"), null);
});

test("label images are hinted by name and filed by what they show", () => {
  assert.equal(isLabelHint({ src: "https://cdn.shopify.com/s/files/1/Nutritional_Tabel.png?v=2" }), true);
  assert.equal(isLabelHint({ src: "https://cdn.shopify.com/s/files/1/Almonds-back-1-768x768.jpg" }), true);
  assert.equal(isLabelHint({ src: "https://cdn.shopify.com/s/files/1/vegetable_chips.jpg" }), false);
  assert.equal(isLabelHint({ src: "https://cdn.shopify.com/s/files/1/lifestyle.jpg", alt: "Ingredients" }), true);
  assert.equal(labelFileType({ ingredient_list: true, nutrition_table: true }), "back_image");
  assert.equal(labelFileType({ nutrition_table: true }), "nutrition_label");
  assert.equal(labelFileType({ allergen_statement: true }), "ingredient_label");
});
