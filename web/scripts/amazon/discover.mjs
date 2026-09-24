// Step 1 — find every protein-bar ASIN on amazon.in.
//   node --env-file=.env.local scripts/amazon/discover.mjs
// Sources: the Protein Bars browse node (11364590031) under six sort orders,
// keyword searches outside the node (bars filed elsewhere), and the node's
// best-seller list. Every page is cached; re-running skips cached pages.
import { query, pool, calls } from "./oxylabs.mjs";
import * as cache from "./cache.mjs";

export const NODE = "11364590031";
const SORTS = ["relevanceblender", "price-asc-rank", "price-desc-rank", "review-rank", "date-desc-rank", "exact-aware-popularity-rank"];
const KEYWORDS = [
  "protein bar", "whey protein bar", "vegan protein bar", "high protein bar",
  "protein bar no added sugar", "protein bars pack of 12", "energy bar protein",
];

const nodeUrl = (sort, page) => `https://www.amazon.in/s?rh=n%3A${NODE}&s=${sort}&page=${page}`;
const kwUrl = (k, page) => `https://www.amazon.in/s?k=${encodeURIComponent(k)}&page=${page}`;

async function page(key, url, meta) {
  if (cache.has("search", key)) return cache.read("search", key).content;
  const content = await query({ source: "amazon", url });
  cache.write("search", key, { ...meta, url, content });
  return content;
}

// Page 1 tells us how many pages exist; then fetch the rest in parallel.
async function crawl(label, urlFor, meta, maxPages) {
  const first = await page(`${label}-p1`, urlFor(1), { ...meta, page: 1 });
  const last = Math.min(first?.last_visible_page || 1, maxPages);
  const rest = Array.from({ length: last - 1 }, (_, i) => i + 2);
  await pool(rest, 8, (p) => page(`${label}-p${p}`, urlFor(p), { ...meta, page: p }));
  console.log(`  ${label}: ${last} pages`);
}

const jobs = [
  ...SORTS.map((s) => () => crawl(`node-${s}`, (p) => nodeUrl(s, p), { source: "amazon_search", query: `node:${NODE}`, sort: s }, 40)),
  ...KEYWORDS.map((k) => () => crawl(`kw-${k}`, (p) => kwUrl(k, p), { source: "amazon_search", query: k, sort: "relevanceblender" }, 20)),
];
await pool(jobs, 3, (job) => job());

for (const p of [1, 2]) {
  const key = `bestsellers-p${p}`;
  if (!cache.has("search", key)) {
    const content = await query({ source: "amazon_bestsellers", query: NODE, start_page: p });
    cache.write("search", key, { source: "amazon_bestsellers", query: `node:${NODE}`, sort: "bestsellers", page: p, content });
  }
}

const asins = new Set();
for (const s of cache.all("search")) {
  const r = s.content?.results;
  for (const item of Array.isArray(r) ? r : [...(r?.organic || []), ...(r?.paid || []), ...(r?.amazons_choices || [])]) {
    if (item.asin) asins.add(item.asin);
  }
}
console.log(`discover: ${asins.size} unique ASINs across ${cache.all("search").length} pages (${calls} Oxylabs calls this run)`);
