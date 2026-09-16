// ============================================================================
// KOI SCREENING — Recompute and record KOI scores
//
// SERVER ONLY, service client. Reads what KOI holds for each SKU — nutrition,
// the published ingredient list, the brand's claims from the latest report —
// scores it with lib/screening/score.js, and records the result through
// engine.record_screening(), which versions the report and skips no-change
// writes.
//
// Called after every automatic publish (lib/engine/pipeline.js), daily from
// the store check (/api/engine/recheck), and for the whole catalogue from
// /api/engine/run?rescore=all when the rubric changes.
//
// It also records where each SKU sits in the category tree
// (food.sku_taxonomy, Phase 2.3), because the category's reference portion is
// part of what the score reads: a per-serving claim is judged on a realistic
// serving.
// ============================================================================

import "server-only";

import { getServiceClient } from "@/lib/supabase/admin";
import { buildMasterIndex, screen } from "./score";
import { isLabelCurrent } from "@/lib/recommendation/verification";
import { categorise } from "@/lib/food/taxonomy";
import { skuFacts } from "@/lib/food/facts";
import { buildSubstitutionEdges } from "@/lib/food/substitutions";
import { nodeInfo } from "@/lib/food/taxonomy";
import { toPer100 } from "@/lib/nutrition/basis";

const FULL_LIST = ["verified", "machine_read"];

/**
 * @param {string[]|null} skuIds null = every SKU of an approved product
 * @returns {Promise<Array<{ skuId, product, final?, verdict?, changed?, error? }>>}
 */
export async function rescoreSkus(skuIds = null) {
  const db = getServiceClient();
  if (!db) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set; scores cannot be recorded.");

  let skuQuery = db
    .from("skus")
    .select("id, mrp, net_weight, products!inner(product_name, category_l1, category_l2, status), sku_nutrition(*), screening_reports(flags, is_latest)");
  skuQuery = skuIds ? skuQuery.in("id", skuIds) : skuQuery.eq("products.status", "approved");

  const [{ data: skus, error: e1 }, { data: master, error: e2 }, { data: labels, error: e3 }, { data: readings, error: e4 }] = await Promise.all([
    skuQuery,
    db.schema("food").from("ingredients_master").select("canonical_name, aliases, ingredient_category, risk_level, is_blocked"),
    db.schema("food").from("sku_ingredients").select("sku_id, parsed_ingredients, raw_ingredient_text, evidence, confirmed_at"),
    db.schema("engine").from("extraction_outputs")
      .select("sku_id, created_at, first:extracted->>veg_mark, second:second_read->>veg_mark")
      .order("created_at", { ascending: false }),
  ]);
  if (e1 || e2 || e3 || e4) throw e1 || e2 || e3 || e4;

  const index = buildMasterIndex(master);
  const labelBySku = new Map(labels.map((l) => [l.sku_id, l]));
  const vegReadingsBySku = new Map();
  for (const r of readings) {
    if (!vegReadingsBySku.has(r.sku_id)) vegReadingsBySku.set(r.sku_id, []);
    vegReadingsBySku.get(r.sku_id).push({ first: r.first, second: r.second });
  }
  const results = [];
  const placed = [];
  const unplaced = [];
  const facts = [];

  for (const sku of skus) {
    const category = categorise({
      name: sku.products.product_name,
      categoryL2: sku.products.category_l2,
      categoryL1: sku.products.category_l1,
    });
    if (category) {
      placed.push({ sku_id: sku.id, node_key: category.key, matched_on: category.matchedOn, term: category.term, taxonomy_version: category.version, classified_at: new Date().toISOString() });
    } else {
      unplaced.push(sku.id);
    }

    const declared = [].concat(sku.sku_nutrition || [])[0] || null;
    const nutrition = declared ? { ...declared, portion_reference: category?.portion ?? null } : null;
    const latest = [].concat(sku.screening_reports || []).find((r) => r.is_latest);
    const label = labelBySku.get(sku.id);
    const listIsCurrent = Boolean(label && isLabelCurrent(label.confirmed_at) && FULL_LIST.includes(label.evidence));
    facts.push({
      sku_id: sku.id,
      ...skuFacts({
        ingredientsText: listIsCurrent ? label.raw_ingredient_text : null,
        mrp: sku.mrp,
        netWeight: sku.net_weight,
        nutrition: declared,
        vegReadings: vegReadingsBySku.get(sku.id) ?? [],
      }),
      computed_at: new Date().toISOString(),
    });
    const report = screen({
      nutrition,
      // A list nobody has seen on a pack for a year is no longer the complete
      // list, so the score is capped as if none had been read.
      label: label
        ? { evidence: isLabelCurrent(label.confirmed_at) ? label.evidence : "partial", parsed: label.parsed_ingredients, text: label.raw_ingredient_text }
        : null,
      claims: latest?.flags?.claims ?? [],
      index,
    });

    const { data, error } = await db.schema("engine").rpc("record_screening", { p_sku_id: sku.id, p_report: report });
    results.push(error
      ? { skuId: sku.id, product: sku.products.product_name, error: error.message }
      : { skuId: sku.id, product: sku.products.product_name, category: category?.key ?? null, final: report.final_score, verdict: report.verdict, changed: data.changed, previous: data.previous_final ?? null });
  }

  // A SKU whose name no longer names a known category loses its old placement
  // rather than keeping a stale one.
  const taxonomy = db.schema("food").from("sku_taxonomy");
  if (placed.length) {
    const { error } = await taxonomy.upsert(placed, { onConflict: "sku_id" });
    if (error) console.error("[screening] category placement failed", error.message);
  }
  if (unplaced.length) {
    const { error } = await db.schema("food").from("sku_taxonomy").delete().in("sku_id", unplaced);
    if (error) console.error("[screening] clearing stale placements failed", error.message);
  }
  // What KOI derives per SKU (lib/food/facts.js): processing group, rupees per
  // gram of protein, agreed veg mark.
  if (facts.length) {
    const { error } = await db.schema("food").from("sku_facts").upsert(facts, { onConflict: "sku_id" });
    if (error) console.error("[screening] recording SKU facts failed", error.message);
  }
  await rebuildSubstitutionEdges(db);
  return results;
}

/**
 * Recompute food.substitution_edge for the whole catalogue.
 *
 * Always the whole catalogue: an edge is about a PAIR, so one SKU's new facts
 * change the edges of every product it could replace. 18 products is 300-odd
 * comparisons, so there is nothing to be gained by being clever about it.
 *
 * @param {import("@supabase/supabase-js").SupabaseClient} db service client
 */
export async function rebuildSubstitutionEdges(db) {
  const [{ data: skus, error: e1 }, { data: placements, error: e2 }, { data: facts, error: e3 }, { data: labels, error: e4 }] = await Promise.all([
    db.from("skus").select("id, products!inner(status), sku_nutrition(*)").eq("products.status", "approved"),
    db.schema("food").from("sku_taxonomy").select("sku_id, node_key"),
    db.schema("food").from("sku_facts").select("sku_id, nova_group, rupees_per_g_protein"),
    db.schema("food").from("sku_ingredients").select("sku_id, allergens, may_contain, evidence, confirmed_at"),
  ]);
  if (e1 || e2 || e3 || e4) {
    console.error("[screening] reading substitution inputs failed", (e1 || e2 || e3 || e4).message);
    return;
  }

  const nodeBySku = new Map((placements ?? []).map((p) => [p.sku_id, p.node_key]));
  const factsBySku = new Map((facts ?? []).map((f) => [f.sku_id, f]));
  const labelBySku = new Map((labels ?? []).map((l) => [l.sku_id, l]));

  const products = (skus ?? []).map((sku) => {
    const nutrition = [].concat(sku.sku_nutrition || [])[0] || null;
    const per100 = toPer100(nutrition);
    const node = nodeBySku.get(sku.id) ?? null;
    const label = labelBySku.get(sku.id);
    // Absence is only claimable from a complete, current list.
    const listIsCurrent = Boolean(label && isLabelCurrent(label.confirmed_at) && FULL_LIST.includes(label.evidence));
    return {
      skuId: sku.id,
      categoryKey: node,
      role: node ? nodeInfo(node)?.role ?? null : null,
      per100Unit: per100.unit,
      sugarsPer100: per100.sugars_g,
      proteinPer100: per100.protein_g,
      rupeesPerGProtein: factsBySku.get(sku.id)?.rupees_per_g_protein ?? null,
      novaGroup: factsBySku.get(sku.id)?.nova_group ?? null,
      allergens: listIsCurrent ? [...new Set([...(label.allergens ?? []), ...(label.may_contain ?? [])])] : null,
    };
  });

  const rows = buildSubstitutionEdges(products);
  // Replace rather than merge: an edge that no longer holds must disappear,
  // and a stale "less sugar" is worse than none.
  const { error: cleared } = await db.schema("food").from("substitution_edge").delete().not("from_sku", "is", null);
  if (cleared) {
    console.error("[screening] clearing substitution edges failed", cleared.message);
    return;
  }
  if (!rows.length) return;
  const { error } = await db.schema("food").from("substitution_edge").insert(rows);
  if (error) console.error("[screening] recording substitution edges failed", error.message);
}
