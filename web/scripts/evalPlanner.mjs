// ============================================================================
// KOI — Run the planner's reference-household suite (plan §9.10.4, C8)
//
// Plans every reference household and a set of seeded random ones against
// the live catalogue (plus the local test catalogue when
// NEXT_PUBLIC_KOI_TEST_CATALOGUE is set), with the same solvePlan the
// storefront uses, checks every plan (lib/planner/eval/properties.js), and
// records the run in engine.planner_eval_runs.
//
//   node --experimental-websocket --conditions=react-server --import ./scripts/testAlias.mjs --env-file=.env.local scripts/evalPlanner.mjs
//
// Options:
//   --random N     random households (default 30; 0 for none)
//   --seed S       their seed (default 20260917), to replay a failure
//   --only ID,ID   just these reference households; not recorded
//   --no-record    print, don't record
//
// Nothing about a shopper is read or written: the households are fixtures.
// ============================================================================

import { fetchAllProducts } from "@/lib/data/productFetcher";
import { plannableFrom } from "@/lib/planner/candidates";
import { solvePlan } from "@/lib/planner/solvePlan";
import { MODEL_VERSION } from "@/lib/planner/model";
import { AGE_SAFETY_VERSION } from "@/lib/planner/ageSafety";
import { REFERENCE_HOUSEHOLDS, randomHouseholds } from "@/lib/planner/eval/households";
import { runPlannerSuite } from "@/lib/planner/eval/suite";

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const i = args.indexOf(name);
  return i === -1 ? fallback : args[i + 1];
};
const randomCount = Number(option("--random", 30));
const seed = Number(option("--seed", 20260917));
const only = option("--only", "").split(",").filter(Boolean);
const record = !args.includes("--no-record") && !only.length;

const products = await fetchAllProducts();
const { catalogue } = plannableFrom(products);
const reference = only.length ? REFERENCE_HOUSEHOLDS.filter((h) => only.includes(h.id)) : REFERENCE_HOUSEHOLDS;
const random = only.length ? [] : randomHouseholds({ count: randomCount, seed });

console.log(`Planning ${reference.length} reference and ${random.length} random households over ${catalogue.length} plannable products (${MODEL_VERSION}, ${AGE_SAFETY_VERSION})…`);
const started = Date.now();
const run = await runPlannerSuite({ catalogue, reference, random, solvePlan });

for (const c of run.cases) {
  const m = c.metrics;
  const short = m.worstShortShare ? `worst short kcal ${m.worstShortShare.kcal ?? "–"} protein ${m.worstShortShare.protein ?? "–"}` : "";
  const findings = c.findings.map((f) => `${f.kind}:${f.property}`).join(", ");
  console.log(`${c.passed ? "ok  " : "FAIL"} ${c.kind.padEnd(9)} ${c.id.padEnd(30)} ${String(m.reached ?? "-").padEnd(15)} ₹${m.cost ?? "-"}${m.budget ? `/${m.budget}` : ""}  ${m.products ?? 0} products  ${m.ms} ms  ${short}${findings ? `  [${findings}]` : ""}`);
}
console.log(`\n${JSON.stringify(run.metrics, null, 2)}`);
console.log(`\n${run.passed ? "PASSED" : "FAILED"} in ${Math.round((Date.now() - started) / 1000)} s.`);

if (!record) {
  console.log(only.length ? "A partial run (--only) is not recorded." : "Not recorded (--no-record).");
  process.exit(run.passed ? 0 : 1);
}

const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!base || !key) {
  console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required to record the run.");
  process.exit(1);
}
const res = await fetch(`${base}/rest/v1/planner_eval_runs`, {
  method: "POST",
  headers: {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    "Content-Profile": "engine",
    Prefer: "return=minimal",
  },
  body: JSON.stringify({
    model_version: MODEL_VERSION,
    age_safety_version: AGE_SAFETY_VERSION,
    properties_version: run.metrics.properties_version,
    households_version: run.metrics.households_version,
    reference_cases: reference.length,
    random_cases: random.length,
    random_seed: random.length ? seed : null,
    catalogue: {
      plannable: catalogue.length,
      products: products.length,
      test_catalogue: process.env.NEXT_PUBLIC_KOI_TEST_CATALOGUE ?? null,
    },
    passed: run.passed,
    metrics: run.metrics,
    failures: run.failures,
    cases: run.cases.map(({ id, kind, passed, findings, metrics }) => ({ id, kind, passed, findings, metrics })),
  }),
});
if (!res.ok) {
  console.error(`Recording the run failed: ${res.status} ${(await res.text()).slice(0, 300)}`);
  process.exit(1);
}
console.log("Recorded in engine.planner_eval_runs.");
process.exit(run.passed ? 0 : 1);
