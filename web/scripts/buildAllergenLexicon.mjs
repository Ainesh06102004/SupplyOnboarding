// ============================================================================
// KOI - Compile the allergen graph into the module the code reads
//
// Phase 2.1. The graph lives in the database: food.allergen_family,
// food.ingredient_alias and food.ingredient_allergen, and since Phase 2.2
// food.ingredient_flag (the additive-based shopper filters). The storefront matches
// allergens in the browser and the label engine must answer without a round
// trip, so both read a compiled copy: src/lib/food/allergenLexicon.js.
//
// This writes that file, normalising every name with src/lib/food/normalise.js
// (the same function the matcher applies to label text), and stamps it with a
// hash of its contents. The label engine's evaluation gate keys on that hash,
// so a changed graph pauses label reading until the evaluation passes on it.
//
// Two names that normalise the same but belong to different ingredients make
// the graph ambiguous, and the build fails naming them rather than guessing.
//
// Usage, from web/:
//   node --import ./scripts/testAlias.mjs --env-file=.env.local scripts/buildAllergenLexicon.mjs          write the file
//   node --import ./scripts/testAlias.mjs --env-file=.env.local scripts/buildAllergenLexicon.mjs --check  fail if it is stale
// ============================================================================

import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { normalise } from "@/lib/food/normalise.js";

const CHECK = process.argv.includes("--check");
const OUT = path.resolve(process.cwd(), "src", "lib", "food", "allergenLexicon.js");
const PAGE = 1000;

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!BASE || !KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Run with --env-file=.env.local from web/.");
  process.exit(1);
}

async function readAll(table, select) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const res = await fetch(`${BASE}/rest/v1/${table}?select=${select}&order=${select.split(",")[0]}`, {
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Accept-Profile": "food", Range: `${from}-${from + PAGE - 1}` },
    });
    if (!res.ok) throw new Error(`food.${table} -> ${res.status} ${(await res.text()).slice(0, 200)}`);
    const page = await res.json();
    rows.push(...page);
    if (page.length < PAGE) return rows;
  }
}

const [families, ingredients, aliases, links, flags, attributes] = await Promise.all([
  readAll("allergen_family", "key,label,statement_words"),
  readAll("ingredients_master", "id,canonical_name"),
  readAll("ingredient_alias", "alias,ingredient_id"),
  readAll("ingredient_allergen", "ingredient_id,allergen_key,relation"),
  readAll("ingredient_flag", "ingredient_id,flag"),
  readAll("attribute_term", "term,flag"),
]);

const sorted = [...ingredients].sort((a, b) => a.canonical_name.localeCompare(b.canonical_name));
const indexOf = new Map(sorted.map((row, i) => [row.id, i]));

const INGREDIENTS = sorted.map((row) => [
  row.canonical_name,
  links
    .filter((l) => l.ingredient_id === row.id)
    .map((l) => [l.allergen_key, l.relation])
    .sort((a, b) => a[0].localeCompare(b[0])),
  flags
    .filter((f) => f.ingredient_id === row.id)
    .map((f) => f.flag)
    .sort(),
]);

const owners = new Map();
const conflicts = [];
for (const { alias, ingredient_id: id } of aliases) {
  const key = normalise(alias);
  const idx = indexOf.get(id);
  if (!key || idx === undefined) continue;
  if (owners.has(key) && owners.get(key) !== idx) {
    conflicts.push(`"${key}": ${INGREDIENTS[owners.get(key)][0]} and ${INGREDIENTS[idx][0]}`);
    continue;
  }
  owners.set(key, idx);
}
if (conflicts.length) {
  console.error(`The allergen graph is ambiguous. These names normalise the same but belong to different ingredients:\n  ${conflicts.join("\n  ")}`);
  process.exit(1);
}
const ALIASES = [...owners.entries()].sort((a, b) => a[0].localeCompare(b[0]));

const FAMILIES = Object.fromEntries(
  [...families]
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((f) => [f.key, { label: f.label, statementWords: [...new Set((f.statement_words ?? []).map(normalise).filter(Boolean))].sort() }]),
);

// Name-level flags (food.attribute_term): "spicy" describes a product as often
// as an ingredient does.
const attributeOwners = new Map();
for (const { term, flag } of attributes) {
  const key = normalise(term);
  if (!key) continue;
  if (attributeOwners.has(key) && attributeOwners.get(key) !== flag) conflicts.push(`attribute "${key}": ${attributeOwners.get(key)} and ${flag}`);
  attributeOwners.set(key, flag);
}
if (conflicts.length) {
  console.error(`The attribute terms are ambiguous:\n  ${conflicts.join("\n  ")}`);
  process.exit(1);
}
const ATTRIBUTES = [...attributeOwners.entries()].sort((a, b) => a[0].localeCompare(b[0]));

const data = { FAMILIES, INGREDIENTS, ALIASES, ATTRIBUTES };
const version = createHash("sha256").update(JSON.stringify(data)).digest("hex").slice(0, 12);

const file = `// ============================================================================
// GENERATED by scripts/buildAllergenLexicon.mjs from food.allergen_family,
// food.ingredient_alias, food.ingredient_allergen, food.ingredient_flag and
// food.attribute_term. Do not edit by hand: change the graph, then rebuild.
// ${ALIASES.length} names, ${INGREDIENTS.length} ingredients, ${Object.keys(FAMILIES).length} allergen families.
// ============================================================================

export const LEXICON_VERSION = ${JSON.stringify(version)};

export const FAMILIES = ${JSON.stringify(FAMILIES)};

// [canonical name, [[allergen family, relation], ...], [shopper filter flag, ...]]
export const INGREDIENTS = ${JSON.stringify(INGREDIENTS)};

// [normalised name, index into INGREDIENTS]
export const ALIASES = ${JSON.stringify(ALIASES)};

// [normalised product word, flag] from food.attribute_term
export const ATTRIBUTES = ${JSON.stringify(ATTRIBUTES)};
`;

if (CHECK) {
  const current = fs.existsSync(OUT) ? fs.readFileSync(OUT, "utf8") : "";
  if (current !== file) {
    console.error(`src/lib/food/allergenLexicon.js is stale (graph version ${version}). Rebuild it.`);
    process.exit(1);
  }
  console.log(`The allergen lexicon matches the graph (${version}).`);
} else {
  fs.writeFileSync(OUT, file);
  console.log(`Wrote src/lib/food/allergenLexicon.js: ${ALIASES.length} names, ${INGREDIENTS.length} ingredients, ${Object.keys(FAMILIES).length} families, version ${version}.`);
}
