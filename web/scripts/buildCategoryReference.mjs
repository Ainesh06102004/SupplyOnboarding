// ============================================================================
// Build the category reference by hand (plan §11.2)
//
//   node --experimental-websocket --conditions=react-server \
//     --import ./scripts/testAlias.mjs --env-file=.env.local scripts/buildCategoryReference.mjs
//
// The same build /api/engine/category-reference runs weekly. Needs
// SUPABASE_SERVICE_ROLE_KEY. Prints a summary, never a key.
// ============================================================================

import { buildCategoryReference } from "@/lib/screening/categoryReference";

const started = Date.now();
const built = await buildCategoryReference();
console.log(`reference ${built.referenceVersion}: ${built.rows} rows over ${built.categories} categories from ${built.offProducts} Open Food Facts products in ${Date.now() - started} ms`);
const thin = built.skipped.filter((s) => s.metric === "nutrition_rating");
if (thin.length) console.log(`not enough products for a nutrition rating reference: ${thin.map((s) => `${s.node} (${s.n})`).join(", ")}`);
