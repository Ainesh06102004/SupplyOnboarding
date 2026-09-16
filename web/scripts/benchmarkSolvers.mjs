// ============================================================================
// KOI - Which solver plans a household basket, and how fast
//
// Phase 3. The plan says to choose between HiGHS (wasm) and
// javascript-lp-solver by a benchmark at phase start, at 200 SKUs x 7 days x
// 4 members, under 2 seconds. This is that benchmark.
//
// It builds the real constraint model (src/lib/planner/model.js) over a
// synthetic catalogue of the stated size, converts it for each solver, and
// reports status, objective, basket and time. A solver that cannot hold
// integrality, or cannot finish, is the answer whatever its speed.
//
// javascript-lp-solver runs at a REDUCED scale by default. Its branch-and-cut
// did not finish the full model in ten minutes, so running it there only
// hangs the benchmark; --jslp-skus sets what it gets, and 0 skips it.
//
// Usage, from web/:
//   node --import ./scripts/testAlias.mjs scripts/benchmarkSolvers.mjs
//   node --import ./scripts/testAlias.mjs scripts/benchmarkSolvers.mjs --skus 400 --jslp-skus 0
// ============================================================================

import { createRequire } from "node:module";
import path from "node:path";
import { buildPlanModel } from "@/lib/planner/model.js";
// The same translation the planner uses, so the benchmark measures the real
// thing rather than a copy of it.
import { toLpText } from "@/lib/planner/lp.js";

const require = createRequire(import.meta.url);
const arg = (flag, fallback) => {
  const i = process.argv.indexOf(flag);
  return i === -1 ? fallback : Number(process.argv[i + 1]);
};

const SKUS = arg("--skus", 200);
const JSLP_SKUS = arg("--jslp-skus", 30);
const MEMBERS = arg("--members", 4);
const DAYS = arg("--days", 7);
// The configuration under test: how long the solver may take, how close to
// optimal is close enough, and how many products may enter the program.
const TIME_LIMIT = arg("--time-limit", 30);
const GAP = arg("--gap", 0.01);
const CANDIDATES = arg("--candidates", 0);

// A catalogue with the shape of KOI's: per-pack figures from a per-100 label
// and a net weight, prices in the range the storefront carries, and a spread
// of allergen flags so some products are refused for some members.
const FLAGS = ["tree_nut", "peanut", "dairy", "gluten", "soy", "root_veg", "honey"];
const catalogueOf = (count) => Array.from({ length: count }, (_, i) => {
  const per100Protein = 2 + ((i * 7) % 24);
  const packGrams = 100 + ((i * 37) % 900);
  const scale = packGrams / 100;
  return {
    skuId: `sku_${i}`,
    price: 40 + ((i * 13) % 460),
    availability: i % 3 === 0 ? "available" : "unknown",
    contains: i % 4 === 0 ? [FLAGS[i % FLAGS.length]] : [],
    perPack: {
      kcal: Math.round((80 + ((i * 11) % 500)) * scale),
      protein: Math.round(per100Protein * scale * 10) / 10,
      carbs: Math.round((10 + ((i * 17) % 70)) * scale),
      fat: Math.round((1 + ((i * 5) % 40)) * scale),
    },
  };
});

const members = Array.from({ length: MEMBERS }, (_, m) => ({
  id: `m${m}`,
  targets: { protein: 50 + m * 10, kcal: 1800 + m * 200 },
  avoidFlags: m === 1 ? ["tree_nut"] : m === 2 ? ["dairy"] : [],
  dietExcludes: m === 3 ? ["meat", "fish", "shellfish", "egg", "honey", "root_veg"] : [],
}));

const priceOf = (catalogue, sku) => catalogue.find((c) => c.skuId === sku)?.price ?? 0;
const basketFrom = (pairs, catalogue) => ({
  lines: pairs.length,
  packs: pairs.reduce((sum, [, n]) => sum + n, 0),
  cost: pairs.reduce((sum, [sku, n]) => sum + n * priceOf(catalogue, sku), 0),
});

function modelFor(count) {
  const catalogue = catalogueOf(count);
  const model = buildPlanModel({
    members,
    catalogue,
    days: DAYS,
    budget: 6000,
    candidateLimit: CANDIDATES > 0 ? CANDIDATES : null,
  });
  return { catalogue, model };
}

// ── HiGHS: a CPLEX LP string ────────────────────────────────────────────────

async function runHighs({ model, catalogue }) {
  const loader = require("highs");
  // require.resolve already lands inside highs/build, where the wasm sits.
  const build = path.dirname(require.resolve("highs"));
  const highs = await loader({ locateFile: (file) => path.join(build, file) });
  const started = performance.now();
  const solution = highs.solve(toLpText(model), { time_limit: TIME_LIMIT, mip_rel_gap: GAP, output_flag: false });
  const ms = performance.now() - started;
  const pairs = Object.entries(solution.Columns ?? {})
    .filter(([name, col]) => name.startsWith("packs_") && Number(col.Primal) > 0.5)
    .map(([name, col]) => [name.slice("packs_".length), Math.round(Number(col.Primal))]);
  const version = [highs.version?.major, highs.version?.minor, highs.version?.patch].filter((v) => v !== undefined).join(".");
  return { name: `HiGHS ${version}`.trim(), status: solution.Status, objective: solution.ObjectiveValue, ms, ...basketFrom(pairs, catalogue) };
}

// ── javascript-lp-solver: a model object ────────────────────────────────────

async function runJsLpSolver({ model, catalogue }) {
  const solver = require("javascript-lp-solver");
  const built = { optimize: "koi_objective", opType: "min", constraints: {}, variables: {}, ints: {} };
  for (const c of model.columns) {
    built.variables[c.name] = { koi_objective: c.cost || 0 };
    if (c.integer) built.ints[c.name] = 1;
    if (c.upper !== Infinity) {
      built.constraints[`ub_${c.name}`] = { max: c.upper };
      built.variables[c.name][`ub_${c.name}`] = 1;
    }
  }
  for (const r of model.rows) {
    built.constraints[r.name] = r.lower === r.upper
      ? { equal: r.lower }
      : { ...(r.lower !== -Infinity ? { min: r.lower } : {}), ...(r.upper !== Infinity ? { max: r.upper } : {}) };
    for (const [name, k] of Object.entries(r.coefficients)) built.variables[name][r.name] = k;
  }
  const started = performance.now();
  const solution = solver.Solve(built);
  const ms = performance.now() - started;
  const pairs = Object.entries(solution)
    .filter(([name, value]) => name.startsWith("packs_") && Number(value) > 0.5)
    .map(([name, value]) => [name.slice("packs_".length), Math.round(Number(value))]);
  return { name: "javascript-lp-solver", status: solution.feasible ? "Optimal" : "Infeasible", objective: solution.result, ms, ...basketFrom(pairs, catalogue) };
}

const report = (r, scale) => console.log(
  `\n${r.name}  (${scale} SKUs)\n  status:    ${r.status}\n  objective: ${Number(r.objective).toFixed(2)}`
  + `\n  basket:    ${r.lines} products, ${r.packs} packs, ₹${r.cost}`
  + `\n  time:      ${r.ms.toFixed(0)} ms${r.ms > 2000 ? "  (over the 2 s budget)" : ""}`,
);

const full = modelFor(SKUS);
console.log(`Model ${full.model.meta.version}: ${full.model.columns.length} columns (${full.model.columns.filter((c) => c.integer).length} integer), ${full.model.rows.length} rows, ${full.model.meta.skus.length} SKUs plannable, ${full.model.excluded.length} excluded, ${MEMBERS} members, ${DAYS} days.`);

try {
  report(await runHighs(full), SKUS);
} catch (err) {
  console.log(`\nHiGHS\n  failed: ${err?.message}`);
}

if (JSLP_SKUS > 0) {
  const small = modelFor(JSLP_SKUS);
  console.log(`\njavascript-lp-solver runs at ${JSLP_SKUS} SKUs: its branch-and-cut did not finish ${SKUS} in ten minutes.`);
  try {
    report(await runJsLpSolver(small), JSLP_SKUS);
  } catch (err) {
    console.log(`\njavascript-lp-solver\n  failed: ${err?.message}`);
  }
}
