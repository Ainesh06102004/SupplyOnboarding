// Step 3 — parse the cached Oxylabs responses into amazon_products.
//   node --env-file=.env.local scripts/amazon/load.mjs
// Idempotent: upserts listings and hits; a snapshot is added only for a
// response not stored before (keyed by asin + fetched_at).
import * as cache from "./cache.mjs";
import { upsert, insert, selectAll } from "./db.mjs";
import { proteinBarVerdict, packCount, grams, NODE } from "./rules.mjs";
import { PINCODE } from "./oxylabs.mjs";

const itemsOf = (content) => {
  const r = content?.results;
  if (Array.isArray(r)) return r.map((x) => ({ ...x, _kind: "bestseller" }));
  return [
    ...(r?.organic || []).map((x) => ({ ...x, _kind: "organic" })),
    ...(r?.paid || []).map((x) => ({ ...x, _kind: "paid" })),
    ...(r?.amazons_choices || []).map((x) => ({ ...x, _kind: "choice" })),
  ];
};
const num = (x) => (typeof x === "number" && Number.isFinite(x) && x > 0 ? x : null);
const str = (x) => (typeof x === "string" && x.trim() ? x.trim() : null);
const unquote = (s) => s?.replace(/^"+|"+$/g, "").trim() || null;

// ── search hits ─────────────────────────────────────────────────────────
const pages = cache.all("search");
const hits = new Map();
const inNode = new Set();
for (const p of pages) {
  const node = p.query?.startsWith("node:");
  for (const item of itemsOf(p.content)) {
    if (!item.asin) continue;
    if (node) inNode.add(item.asin);
    const row = {
      query: p.query, source: p.source, sort: p.sort ?? null, page: p.page ?? null,
      position: item.pos ?? null, asin: item.asin,
      sponsored: item._kind === "paid" || item.is_sponsored === true,
      price: num(item.price), fetched_at: p.fetched_at,
    };
    hits.set([row.query, row.source, row.sort, row.page, row.position, row.asin].join("|"), row);
  }
}

// ── listings ────────────────────────────────────────────────────────────
const products = cache.all("product").filter((p) => p.content?.asin || p.content?.title);
const listings = products.map(({ asin, content: c, fetched_at }) => {
  const path = (c.category?.[0]?.ladder || []).map((x) => x.name);
  const nodeMatch = /node=(\d+)/.exec(c.category?.[0]?.ladder?.at(-1)?.url || "");
  const selected = (c.variation || []).find((v) => v.selected) || (c.variation || []).find((v) => v.asin === asin);
  const dims = selected?.dimensions || {};
  const overview = Object.fromEntries((c.product_overview || []).map((o) => [o.title, o.description]));
  const details = c.product_details || {};
  const info = c.important_information || [];
  const ingredients = unquote(info.find((i) => /ingredient/i.test(i.title))?.description);
  const pbRank = (c.sales_rank || []).find((r) => r.ladder?.some((l) => /protein bars/i.test(l.name)))?.rank ?? null;
  const size = dims.Size || dims["Size Name"] || dims["Number of Items"] || null;
  const verdict = proteinBarVerdict({ title: c.title, categoryPath: path, inNode: inNode.has(asin) || nodeMatch?.[1] === NODE });
  return {
    asin,
    parent_asin: str(c.parent_asin),
    url: str(c.url),
    title: str(c.title) || str(c.product_name),
    brand: str(c.brand),
    manufacturer: str(details.manufacturer) || str(c.manufacturer),
    flavour: dims["Flavour Name"] || dims.Flavour || overview.Flavour || null,
    size,
    pack_count: packCount(size, c.title),
    net_quantity: str(details.net_quantity) || str(overview["Net Quantity"]),
    net_quantity_g: grams(details.net_quantity || overview["Net Quantity"]),
    item_weight: str(details.item_weight),
    price: num(c.price) ?? num(c.price_buybox),
    mrp: num(c.price_strikethrough),
    discount_pct: num(c.discount_percentage),
    price_per_unit: c.price_per_unit || null,
    price_sns: num(c.price_sns),
    currency: str(c.currency),
    pincode: PINCODE,
    stock: str(c.stock),
    delivery: c.delivery || null,
    is_amazon_fulfilled: c.featured_merchant?.is_amazon_fulfilled ?? null,
    seller: c.featured_merchant || null,
    rating: num(c.rating),
    reviews_count: Number.isInteger(c.reviews_count) ? c.reviews_count : null,
    rating_distribution: c.rating_stars_distribution || null,
    sales_volume: str(c.sales_volume),
    sales_rank: c.sales_rank || null,
    protein_bar_rank: pbRank,
    category_path: path.length ? path : null,
    category_node: nodeMatch?.[1] || null,
    bullet_points: str(c.bullet_points) ? c.bullet_points.split("\n").map(unquote).filter(Boolean) : null,
    description: str(c.description),
    ingredients_text: ingredients,
    important_information: info.length ? info : null,
    product_details: Object.keys(details).length ? details : null,
    product_overview: c.product_overview?.length ? c.product_overview : null,
    country_of_origin: str(details.country_of_origin) || str(overview["Country of Origin"]),
    diet_type: str(overview["Diet Type"]),
    variations: c.variation?.length ? c.variation : null,
    store_url: str(c.store_url),
    has_videos: c.has_videos ?? null,
    is_protein_bar: verdict.ok,
    protein_bar_reason: verdict.reason,
    last_scraped: fetched_at,
  };
});

await upsert("listing", listings, "asin");
console.log(`load: ${listings.length} listings (${listings.filter((l) => l.is_protein_bar).length} protein bars)`);

// Hits reference listings loosely (no FK), so every hit is kept.
await upsert("search_hit", [...hits.values()], "query,source,sort,page,position,asin");
console.log(`load: ${hits.size} search hits from ${pages.length} pages`);

// ── snapshots: only responses not stored yet ────────────────────────────
const stored = new Set((await selectAll("snapshot", "select=asin,fetched_at&source=eq.amazon_product")).map((s) => `${s.asin}|${new Date(s.fetched_at).toISOString()}`));
const fresh = products.filter((p) => !stored.has(`${p.asin}|${new Date(p.fetched_at).toISOString()}`));
for (let i = 0; i < fresh.length; i += 25) {
  await insert("snapshot", fresh.slice(i, i + 25).map((p) => ({
    asin: p.asin, source: "amazon_product", fetched_at: p.fetched_at,
    request: { source: "amazon_product", query: p.asin, domain: "in", geo_location: PINCODE },
    raw: p.content,
  })));
}
console.log(`load: ${fresh.length} new product snapshots`);
