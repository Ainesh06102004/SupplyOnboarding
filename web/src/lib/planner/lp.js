// ============================================================================
// KOI PLANNER — The model as text a solver will read, and back again
//
// Phase 3.3. HiGHS takes a problem as CPLEX LP format and hands back a
// solution keyed by column name. This module is that translation, and only
// that: pure, so the same function serves the planner
// (lib/planner/solve.js) and the benchmark (scripts/benchmarkSolvers.mjs)
// and neither can drift from the other.
//
// WHY THE NAMES ARE REWRITTEN. lib/planner/model.js names columns after the
// things they mean — packs_<sku>, eats_<sku>_<member> — because a plan has to
// be explainable afterwards, and an index explains nothing. But a real SKU id
// is a uuid, and CPLEX LP format reads `-` as an operator rather than as part
// of a name: `packs_9a80563e-22ac-42d2` is a subtraction, and HiGHS rejects
// the file. The synthetic benchmark never caught it, because `sku_0` has no
// hyphen.
//
// So every column is renamed to a short safe alias on the way out (c0, c1...)
// and the aliases are mapped back on the way in. The solver sees nothing but
// letters and digits; KOI keeps its own names.
// ============================================================================

const number = (v) => (v === Infinity ? "+inf" : v === -Infinity ? "-inf" : String(v));
const term = (coefficient, name) => `${coefficient >= 0 ? "+" : "-"} ${Math.abs(coefficient)} ${name}`;

/** LP format's own naming rules: letters, digits and underscores only. */
export const isLpSafe = (name) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(name);

/**
 * Aliases for a model's columns and rows, so nothing a solver reads contains
 * a character it would treat as arithmetic.
 *
 * @param {{columns: Array, rows: Array}} model
 * @returns {{ columnAlias: Map<string,string>, rowAlias: Map<string,string>, nameOfAlias: Map<string,string> }}
 */
export function aliasesFor(model) {
  const columnAlias = new Map();
  const nameOfAlias = new Map();
  model.columns.forEach((column, i) => {
    const alias = `c${i}`;
    columnAlias.set(column.name, alias);
    nameOfAlias.set(alias, column.name);
  });
  const rowAlias = new Map();
  model.rows.forEach((row, i) => rowAlias.set(row.name, `r${i}`));
  return { columnAlias, rowAlias, nameOfAlias };
}

/**
 * @param {{columns: Array, rows: Array}} model from buildPlanModel
 * @returns {{ text: string, nameOfAlias: Map<string,string> }}
 *   `text` is the problem in CPLEX LP format; `nameOfAlias` reads a solution back.
 */
export function toLp(model) {
  const { columnAlias, rowAlias, nameOfAlias } = aliasesFor(model);
  const col = (name) => columnAlias.get(name) ?? name;

  const objective = model.columns.filter((c) => c.cost).map((c) => term(c.cost, col(c.name))).join(" ");
  const rows = model.rows.map((r) => {
    const terms = Object.entries(r.coefficients).map(([name, k]) => term(k, col(name))).join(" ");
    const label = rowAlias.get(r.name) ?? r.name;
    if (r.lower === r.upper) return ` ${label}: ${terms} = ${r.lower}`;
    if (r.lower === -Infinity) return ` ${label}: ${terms} <= ${r.upper}`;
    if (r.upper === Infinity) return ` ${label}: ${terms} >= ${r.lower}`;
    return ` ${label}: ${r.lower} <= ${terms} <= ${r.upper}`;
  }).join("\n");
  const bounds = model.columns.map((c) => ` ${number(c.lower)} <= ${col(c.name)} <= ${number(c.upper)}`).join("\n");
  const integers = model.columns.filter((c) => c.integer).map((c) => ` ${col(c.name)}`).join("\n");

  return {
    text: `Minimize\n obj: ${objective}\nSubject To\n${rows}\nBounds\n${bounds}\nGeneral\n${integers}\nEnd\n`,
    nameOfAlias,
  };
}

/** The text alone, for callers that do not need to read a solution back. */
export const toLpText = (model) => toLp(model).text;

/** A solved column's value, whatever shape the solver returned it in. */
const valueOf = (column) => Number(column?.Primal ?? column?.primal ?? column ?? 0);

/**
 * Read a HiGHS solution back into the plan's own terms.
 *
 * Packs are rounded: a MIP returns 2.9999999996 for three packs, and a basket
 * of 2.9999999996 packs is not a thing to show anyone.
 *
 * @param {object} columns solution.Columns from HiGHS
 * @param {Map<string,string>} [nameOfAlias] from toLp(); omit when the model's
 *   own names were used directly
 * @returns {{ packs, eats, shortfall, excess }}
 */
export function readSolution(columns = {}, nameOfAlias = null) {
  const packs = {};
  const eats = {};
  const shortfall = {};
  const excess = {};

  for (const [key, column] of Object.entries(columns)) {
    const name = nameOfAlias?.get(key) ?? key;
    const value = valueOf(column);
    if (name.startsWith("packs_")) {
      const rounded = Math.round(value);
      if (rounded > 0) packs[name.slice("packs_".length)] = rounded;
      continue;
    }
    if (name.startsWith("eats_")) {
      // eats_<sku>_<member>: the member id is the last segment, and a SKU id
      // is a uuid with hyphens, so split from the right.
      const rest = name.slice("eats_".length);
      const cut = rest.lastIndexOf("_");
      if (cut < 1) continue;
      if (value > 1e-6) ((eats[rest.slice(0, cut)] ??= {})[rest.slice(cut + 1)] = Math.round(value * 1000) / 1000);
      continue;
    }
    for (const [prefix, into] of [["short_", shortfall], ["over_", excess]]) {
      if (!name.startsWith(prefix)) continue;
      const rest = name.slice(prefix.length);
      const cut = rest.lastIndexOf("_");
      if (cut < 1) continue;
      if (value > 1e-6) ((into[rest.slice(0, cut)] ??= {})[rest.slice(cut + 1)] = Math.round(value * 100) / 100);
    }
  }

  return { packs, eats, shortfall, excess };
}

/** Which HiGHS statuses mean KOI has a basket it can show. */
export const USABLE_STATUSES = Object.freeze(["Optimal", "Time limit reached", "Feasible", "Solution limit reached"]);

/** Did the solver come back with something a shopper can be shown? */
export const isUsable = (status, packs) => USABLE_STATUSES.includes(status) && Object.keys(packs ?? {}).length > 0;
