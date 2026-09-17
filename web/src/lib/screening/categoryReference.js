// ============================================================================
// KOI SCREENING — Building the category reference (plan §11.2)
//
// SERVER ONLY, service role: it reads engine.off_products and writes
// engine.category_reference, both internal. Run weekly by
// /api/engine/category-reference, or by hand with
// scripts/buildCategoryReference.mjs.
//
// For every KOI category that Open Food Facts can be crosswalked to
// (food.taxonomy_node.off_categories, its own tags and every descendant's):
// the Indian products in it with per-100 figures, rated by the same rubric
// KOI rates its own products with (relative.js nutritionRating), and reduced
// to 101 percentile cut points per measure. Drinks are per 100 ml, everything
// else per 100 g. A measure with fewer than RELATIVE.minSample products is not
// stored, so nothing can be compared against it.
//
// A new build is a new reference_version; old versions stay, so a comparison
// can always say which reference it used.
// ============================================================================

import "server-only";

import { getServiceClient } from "@/lib/supabase/admin";
import { RUBRIC_VERSION } from "./score";
import { RELATIVE, REFERENCE_METRICS, nutritionRating, quantileCuts } from "./relative";

const PAGE = 1000;
const LIQUID_AISLES = new Set(["beverages"]);

/** Every Open Food Facts row with figures, in pages. */
async function offRows(db) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .schema("engine")
      .from("off_products")
      .select("categories_tags, nutrients_per_100, off_last_modified")
      .not("nutrients_per_100", "is", null)
      .order("code")
      .range(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...data);
    if (data.length < PAGE) return rows;
  }
}

/**
 * @param {{ version?: string, now?: Date }} [options]
 * @returns {Promise<{ referenceVersion: string, offProducts: number, categories: number, rows: number, skipped: Array }>}
 */
export async function buildCategoryReference({ version = null, now = new Date() } = {}) {
  const db = getServiceClient();
  if (!db) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set: the category reference cannot be built.");

  const { data: nodes, error: nodeError } = await db.schema("food").from("taxonomy_node").select("key, parent_key, off_categories");
  if (nodeError) throw nodeError;

  // Each node's tags: its own and every descendant's.
  const tagsOf = new Map(nodes.map((n) => [n.key, new Set(n.off_categories ?? [])]));
  for (const node of nodes) {
    for (let parent = node.parent_key; parent; parent = nodes.find((n) => n.key === parent)?.parent_key) {
      for (const tag of node.off_categories ?? []) tagsOf.get(parent)?.add(tag);
    }
  }

  const products = await offRows(db);
  const dataThrough = products.reduce((latest, p) => (p.off_last_modified && p.off_last_modified > latest ? p.off_last_modified : latest), "");
  const referenceVersion = version ?? `${RELATIVE.referencePrefix}-${now.toISOString().slice(0, 10)}`;

  const rows = [];
  const skipped = [];
  for (const node of nodes) {
    const tags = tagsOf.get(node.key);
    if (!tags?.size) continue;
    const unit = LIQUID_AISLES.has(node.key.split(".")[0]) ? "ml" : "g";
    const members = products.filter((p) => (p.categories_tags ?? []).some((t) => tags.has(t)));
    const values = Object.fromEntries(REFERENCE_METRICS.map((m) => [m, []]));
    for (const p of members) {
      const row = { measurement_basis: unit === "ml" ? "per_100ml" : "per_100g", ...p.nutrients_per_100 };
      for (const metric of REFERENCE_METRICS) {
        const value = metric === "nutrition_rating" ? nutritionRating(row) : row[metric];
        if (value !== null && value !== undefined && Number.isFinite(Number(value))) values[metric].push(Number(value));
      }
    }
    for (const metric of REFERENCE_METRICS) {
      const n = values[metric].length;
      if (n < RELATIVE.minSample) {
        skipped.push({ node: node.key, metric, n });
        continue;
      }
      rows.push({
        reference_version: referenceVersion,
        node_key: node.key,
        metric,
        unit,
        n,
        cuts: quantileCuts(values[metric]),
        rubric_version: metric === "nutrition_rating" ? RUBRIC_VERSION : null,
        off_data_through: dataThrough || null,
        built_at: now.toISOString(),
      });
    }
  }

  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await db.schema("engine").from("category_reference").upsert(rows.slice(i, i + 200), { onConflict: "reference_version,node_key,metric" });
    if (error) throw error;
  }

  return { referenceVersion, offProducts: products.length, categories: new Set(rows.map((r) => r.node_key)).size, rows: rows.length, skipped };
}

/**
 * The newest reference's rows for some categories.
 * @param {string[]} nodeKeys
 * @returns {Promise<Array>}
 */
export async function latestReference(nodeKeys) {
  const db = getServiceClient();
  if (!db || !nodeKeys.length) return [];
  const { data: newest, error } = await db
    .schema("engine")
    .from("category_reference")
    .select("reference_version")
    .order("built_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!newest) return [];
  const { data, error: rowsError } = await db
    .schema("engine")
    .from("category_reference")
    .select("reference_version, node_key, metric, unit, n, cuts, rubric_version, off_data_through, built_at")
    .eq("reference_version", newest.reference_version)
    .in("node_key", nodeKeys);
  if (rowsError) throw rowsError;
  return data ?? [];
}
