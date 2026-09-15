// ============================================================================
// KOI - Apply supabase/seed/ingredients_master.sql without psql
//
// The seed files in supabase/seed/ are plain SQL because that is what they are:
// the artifact a human runs in the Supabase SQL editor, and the form the rest of
// this repo already uses. But neither psql nor the Supabase CLI is installed on
// every machine that needs to apply one, so this reads that same .sql file and
// replays its rows through PostgREST instead. The SQL file stays the single
// source of truth; this is only a second way to execute it.
//
// It parses one specific and very regular shape - the INSERT ... VALUES block
// that ingredients_master.sql contains - with a real string-aware scan rather
// than a regex, so an apostrophe or a comma inside a note cannot split a tuple
// in the wrong place. It is not a general SQL parser and should not be pointed
// at arbitrary files.
//
// Upsert is on `canonical_name`, matching the ON CONFLICT clause in the file,
// so re-running updates in place and never duplicates.
//
// The table is `food.ingredients_master` since migration 00019, so every
// request names the schema: PostgREST reads `Content-Profile` for writes. That
// only works once `food` is in the project's Exposed schemas (Dashboard ->
// Project Settings -> Data API); until then the write fails with PGRST106,
// which is the error to expect rather than a bug in this script.
//
// Since migration 00035 every alias is also a name in the allergen graph
// (food.ingredient_alias). After upserting, this adds any new name to the graph
// (food.sync_ingredient_aliases, 00036); after that, rebuild the lexicon and
// re-run the label evaluation. --check changes nothing: it reports every
// difference between the file and the database, including names the graph
// lacks, and exits 1 if there is any.
//
// Usage, from web/:
//   node --env-file=.env.local scripts/applyIngredientsSeed.mjs --check
//   node --env-file=.env.local scripts/applyIngredientsSeed.mjs --dry-run
//   node --env-file=.env.local scripts/applyIngredientsSeed.mjs
// ============================================================================

import fs from "node:fs";
import path from "node:path";

const DRY_RUN = process.argv.includes("--dry-run");
const CHECK = process.argv.includes("--check");

const SEED_FILE = path.resolve(
  process.cwd(), "..", "supabase", "seed", "ingredients_master.sql",
);

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.\n" +
    "Run with --env-file=.env.local from the web/ directory.",
  );
  process.exit(1);
}

const BASE = SUPABASE_URL.replace(/\/$/, "");
const HEADERS = { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` };

async function callFood(fn) {
  const res = await fetch(`${BASE}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { ...HEADERS, "Content-Type": "application/json", "Content-Profile": "food" },
    body: "{}",
  });
  if (!res.ok) throw new Error(`food.${fn} failed: ${res.status} ${await res.text()}`);
  return res.json();
}

/** Every difference between the seed rows and the database, as sentences. */
async function driftFrom(rows) {
  const res = await fetch(
    `${BASE}/rest/v1/ingredients_master?select=canonical_name,aliases,ingredient_category,risk_level,is_blocked,notes`,
    { headers: { ...HEADERS, "Accept-Profile": "food" } },
  );
  if (!res.ok) throw new Error(`Reading food.ingredients_master failed: ${res.status} ${await res.text()}`);
  const db = new Map((await res.json()).map((r) => [r.canonical_name, r]));
  const problems = [];

  for (const row of rows) {
    const stored = db.get(row.canonical_name);
    if (!stored) {
      problems.push(`${row.canonical_name}: in the file, not in the database`);
      continue;
    }
    const inFile = new Set(row.aliases);
    const inDb = new Set(stored.aliases ?? []);
    const onlyFile = [...inFile].filter((a) => !inDb.has(a));
    const onlyDb = [...inDb].filter((a) => !inFile.has(a));
    if (onlyFile.length) problems.push(`${row.canonical_name}: aliases only in the file: ${onlyFile.join(", ")}`);
    if (onlyDb.length) problems.push(`${row.canonical_name}: aliases only in the database: ${onlyDb.join(", ")}`);
    for (const field of ["ingredient_category", "risk_level", "is_blocked", "notes"]) {
      if (row[field] !== stored[field]) problems.push(`${row.canonical_name}: ${field} differs`);
    }
  }
  const inFile = new Set(rows.map((r) => r.canonical_name));
  for (const name of db.keys()) if (!inFile.has(name)) problems.push(`${name}: in the database, not in the file`);

  const { missing = [], orphaned = [] } = await callFood("ingredient_alias_drift");
  if (missing.length) problems.push(`names the allergen graph does not have yet: ${missing.join(", ")}`);
  if (orphaned.length) problems.push(`graph names no ingredient lists any more: ${orphaned.join(", ")}`);
  return problems;
}

const COLUMNS = [
  "canonical_name", "aliases", "ingredient_category",
  "risk_level", "is_blocked", "notes",
];

/**
 * Split the VALUES block into top-level `( ... )` tuples, then each tuple into
 * top-level comma-separated fields. String-aware: a quote opens a literal, '' is
 * an escaped quote inside one, and parens or commas inside a literal are text.
 */
function parseTuples(sql) {
  const start = sql.indexOf("VALUES");
  if (start === -1) throw new Error("No VALUES block found in the seed file.");

  const tuples = [];
  let field = "";
  let fields = null;      // non-null while inside a tuple
  let inString = false;

  for (let i = start + "VALUES".length; i < sql.length; i += 1) {
    const ch = sql[i];

    if (inString) {
      if (ch === "'") {
        if (sql[i + 1] === "'") { field += "'"; i += 1; }  // escaped quote
        else inString = false;
      } else {
        field += ch;
      }
      continue;
    }

    // A `--` comment runs to end of line. This has to happen before the quote
    // check: the commentary in the seed file quotes risk levels ('caution',
    // 'risky'), and treating those as string literals desynchronises everything
    // that follows.
    if (ch === "-" && sql[i + 1] === "-") {
      const newline = sql.indexOf("\n", i);
      if (newline === -1) break;
      i = newline;
      continue;
    }

    if (ch === "'") { inString = true; continue; }
    if (ch === "(" && fields === null) { fields = []; field = ""; continue; }
    if (fields === null) {
      // Between tuples. ON CONFLICT ends the block.
      if (sql.startsWith("ON CONFLICT", i)) break;
      continue;
    }
    if (ch === ",") { fields.push(field.trim()); field = ""; continue; }
    if (ch === ")") { fields.push(field.trim()); tuples.push(fields); fields = null; continue; }

    field += ch;
  }

  return tuples;
}

/** One parsed tuple -> the row PostgREST expects. */
function toRow(tuple, index) {
  if (tuple.length !== COLUMNS.length) {
    throw new Error(
      `Row ${index + 1} has ${tuple.length} fields, expected ${COLUMNS.length}: ${tuple[0]}`,
    );
  }
  const [canonical_name, aliases, ingredient_category, risk_level, is_blocked, notes] = tuple;

  let parsedAliases;
  try {
    parsedAliases = JSON.parse(aliases);
  } catch {
    throw new Error(`Row "${canonical_name}" has unparseable aliases JSON: ${aliases}`);
  }

  return {
    canonical_name,
    aliases: parsedAliases,
    ingredient_category,
    risk_level,
    is_blocked: /^TRUE$/i.test(is_blocked),
    notes,
  };
}

async function main() {
  const sql = fs.readFileSync(SEED_FILE, "utf8");
  const rows = parseTuples(sql).map(toRow);

  // The CHECK constraint on the table allows only these four.
  const LEVELS = new Set(["safe", "caution", "risky", "blocked"]);
  for (const row of rows) {
    if (!LEVELS.has(row.risk_level)) {
      throw new Error(`Row "${row.canonical_name}" has invalid risk_level: ${row.risk_level}`);
    }
    if (row.is_blocked !== (row.risk_level === "blocked")) {
      throw new Error(
        `Row "${row.canonical_name}": is_blocked and risk_level disagree ` +
        `(${row.is_blocked} vs ${row.risk_level}).`,
      );
    }
  }

  const names = rows.map((r) => r.canonical_name);
  const duplicates = names.filter((n, i) => names.indexOf(n) !== i);
  if (duplicates.length > 0) {
    throw new Error(`Duplicate canonical_name in the seed file: ${duplicates.join(", ")}`);
  }

  const byLevel = rows.reduce((acc, r) => ({ ...acc, [r.risk_level]: (acc[r.risk_level] ?? 0) + 1 }), {});
  const byCategory = new Set(rows.map((r) => r.ingredient_category));

  console.log(`Parsed ${rows.length} ingredients from ${path.basename(SEED_FILE)}`);
  console.log(`  risk levels: ${JSON.stringify(byLevel)}`);
  console.log(`  categories:  ${byCategory.size}`);
  console.log(`  blocked:     ${rows.filter((r) => r.is_blocked).map((r) => r.canonical_name).join(", ")}`);

  if (CHECK) {
    const problems = await driftFrom(rows);
    if (problems.length) {
      console.error(`\nThe seed file and the database differ:\n  ${problems.join("\n  ")}`);
      process.exit(1);
    }
    console.log("\nThe seed file, food.ingredients_master and the allergen graph agree.");
    return;
  }

  if (DRY_RUN) {
    console.log("\nDRY RUN - nothing written.");
    return;
  }

  const res = await fetch(
    `${SUPABASE_URL.replace(/\/$/, "")}/rest/v1/ingredients_master?on_conflict=canonical_name`,
    {
      method: "POST",
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json",
        "Content-Profile": "food",
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify(rows),
    },
  );

  if (!res.ok) {
    console.error(`Upsert failed: ${res.status} ${await res.text()}`);
    process.exit(1);
  }

  console.log(`\nUpserted ${rows.length} rows into food.ingredients_master.`);

  const added = await callFood("sync_ingredient_aliases");
  console.log(added
    ? `Added ${added} new name(s) to the allergen graph. Rebuild the lexicon (scripts/buildAllergenLexicon.mjs) and re-run the label evaluation.`
    : "The allergen graph already had every name.");
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
