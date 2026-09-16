// ============================================================================
// KOI PLANNER — Solving the plan (HiGHS)
//
// Phase 3.3. SERVER ONLY: this loads a WebAssembly solver, which has no
// business in a browser bundle, and a plan is computed where the catalogue
// and the shopper's household can be read together.
//
// WHY HiGHS. The plan said to choose between HiGHS and javascript-lp-solver
// by benchmark at 200 products, 7 days, 4 members
// (scripts/benchmarkSolvers.mjs). Measured on this machine:
//
//   javascript-lp-solver  did not finish in ten minutes at 200 products;
//                         155 ms at 30. Its branch-and-cut cannot hold this
//                         many integer columns.
//   HiGHS 1.15.1          proved the optimum in 9,986 ms; with a 1.8 s limit,
//                         a 2% gap and 120 candidates it returns a basket of
//                         objective 0.07 against a proven optimum of 0.00 —
//                         and a cheaper one (₹1,542 against ₹3,013).
//
// So the default is a time limit, not a proof: a shopper waiting for a plan
// is better served by an excellent basket in two seconds than a perfect one
// in ten. `status` says which they got, and the plan records it.
//
// The wasm file sits next to the module in node_modules, and `locateFile`
// must say so explicitly — the default resolution looks in the process's
// working directory, which on a server is not where the package is.
// ============================================================================

import "server-only";

import { createRequire } from "node:module";
import path from "node:path";
import { toLp, readSolution, isUsable } from "./lp";

const require = createRequire(import.meta.url);

/** The configuration the benchmark settled on. */
export const SOLVER_DEFAULTS = Object.freeze({ timeLimitSeconds: 1.8, gap: 0.02 });

let loading = null;

/** One wasm instance per process: instantiating it is most of the cold cost. */
async function highsInstance() {
  if (!loading) {
    const loader = require("highs");
    const build = path.dirname(require.resolve("highs"));
    loading = loader({ locateFile: (file) => path.join(build, file) }).catch((err) => {
      loading = null;
      throw err;
    });
  }
  return loading;
}

/**
 * Solve a plan model.
 *
 * @param {object} model from buildPlanModel
 * @param {{ timeLimitSeconds?: number, gap?: number }} [options]
 * @returns {Promise<{ status, usable, objective, packs, eats, shortfall, excess,
 *   solver, solverVersion, timeLimitSeconds, gap, ms }>}
 */
export async function solvePlanModel(model, options = {}) {
  const { timeLimitSeconds = SOLVER_DEFAULTS.timeLimitSeconds, gap = SOLVER_DEFAULTS.gap } = options;
  const highs = await highsInstance();
  const version = [highs.version?.major, highs.version?.minor, highs.version?.patch].filter((v) => v !== undefined).join(".");

  // The solver sees safe aliases; `nameOfAlias` turns its answer back into
  // KOI's own names (lp.js explains why).
  const { text, nameOfAlias } = toLp(model);
  const started = Date.now();
  const solution = highs.solve(text, {
    time_limit: timeLimitSeconds,
    mip_rel_gap: gap,
    output_flag: false,
  });
  const ms = Date.now() - started;

  const read = readSolution(solution.Columns ?? {}, nameOfAlias);
  return {
    status: solution.Status ?? "Unknown",
    usable: isUsable(solution.Status, read.packs),
    objective: Number(solution.ObjectiveValue ?? 0),
    ...read,
    solver: "highs",
    solverVersion: version || null,
    timeLimitSeconds,
    gap,
    ms,
  };
}
