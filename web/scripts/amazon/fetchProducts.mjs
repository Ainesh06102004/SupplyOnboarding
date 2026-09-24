// Step 2 — fetch the product page of every candidate ASIN, then their variation
// siblings (flavours, pack sizes), until no new ASIN appears.
//   node --env-file=.env.local scripts/amazon/fetchProducts.mjs
// Cached per ASIN; re-running skips pages already fetched.
import { query, pool, calls } from "./oxylabs.mjs";
import * as cache from "./cache.mjs";
import { proteinBarVerdict } from "./rules.mjs";

const itemsOf = (content) => {
  const r = content?.results;
  return Array.isArray(r) ? r : [...(r?.organic || []), ...(r?.paid || []), ...(r?.amazons_choices || [])];
};

// Node pages and best-sellers are protein bars by filing; keyword pages only if the title says so.
const candidates = new Set();
for (const page of cache.all("search")) {
  const inNode = page.query?.startsWith("node:");
  for (const item of itemsOf(page.content)) {
    if (!item.asin) continue;
    if (inNode || proteinBarVerdict({ title: item.title }).ok) candidates.add(item.asin);
  }
}
console.log(`fetch: ${candidates.size} candidates from search`);

async function fetchOne(asin) {
  if (cache.has("product", asin)) return;
  const content = await query({ source: "amazon_product", query: asin });
  cache.write("product", asin, { asin, content });
}

let todo = [...candidates];
for (let round = 1; todo.length && round <= 3; round++) {
  let done = 0;
  await pool(todo, 10, async (asin) => {
    await fetchOne(asin);
    if (++done % 50 === 0) console.log(`  round ${round}: ${done}/${todo.length}`);
  });
  // Siblings of protein bars we have not seen yet.
  const seen = new Set(cache.all("product").map((p) => p.asin));
  const next = new Set();
  for (const p of cache.all("product")) {
    const c = p.content || {};
    const path = (c.category?.[0]?.ladder || []).map((x) => x.name);
    if (!proteinBarVerdict({ title: c.title, categoryPath: path }).ok) continue;
    for (const v of c.variation || []) if (v.asin && !seen.has(v.asin)) next.add(v.asin);
  }
  console.log(`  round ${round} done; ${next.size} new variation siblings`);
  todo = [...next];
}
console.log(`fetch: ${cache.all("product").length} product pages cached (${calls} Oxylabs calls this run)`);
