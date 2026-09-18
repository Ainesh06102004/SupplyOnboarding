// ============================================================================
// KOI - Live catalogue fetch
// Maps screened Supabase rows into the shape the storefront renders.
//
// Rule: every field is either read from the database or omitted. Nothing here
// may invent a score, a macro, a dietary flag or a comparison. Where a column
// is absent the value is null and the UI renders no claim - see
// lib/availability.js for the same principle applied to stock.
//
// This file previously stamped every product with an identical scoreBreakdown
// of {85, 90, 95, 85}, declared them all "Vegetarian", and invented a category
// average, a watchout and a verdict con. Those were fabrications, not defaults.
// ============================================================================

import { getSupabaseClient } from '@/lib/supabase/client';
import { AVAILABILITY } from '@/lib/recommendation/config';
import { guardClaims, isClaimSafeText, isHighProtein } from '@/lib/nutrition/claims';
import { isLabelCurrent } from '@/lib/recommendation/verification';
import { categorise } from '@/lib/food/taxonomy';
import { latestReport } from '@/lib/score';
import { testCatalogueRows } from '@/lib/data/testCatalogue';

/** Number, or null when the column is absent. Never coerces missing to 0. */
const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));

/**
 * Every approved product, plus the local test catalogue when it is switched on
 * (lib/data/testCatalogue.js). Test rows go through the same mapping as live
 * ones, so what the storefront and the planner see is shaped identically.
 */
export async function fetchAllProducts() {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('products')
    .select(`
      id,
      product_name,
      category_l1,
      category_l2,
      brand_id,
      brands (brand_name),
      skus (
        id, variant_name, mrp, net_weight,
        sku_nutrition (*),
        screening_reports (*),
        sku_label_facts (*)
      )
    `)
    .eq('status', 'approved');

  if (error) {
    console.error("Error fetching products:", JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
    return mapProducts(testCatalogueRows());
  }

  return mapProducts([...data, ...testCatalogueRows()]);
}

/**
 * Supabase product rows (with brands, skus, sku_nutrition, screening_reports
 * and sku_label_facts nested) in the shape the storefront renders.
 * @param {Array<object>} rows
 * @returns {Array<object>}
 */
export function mapProducts(rows) {
  // Map to the complex frontend structure
  return rows.map(p => {
    const sku = p.skus?.[0] || {};
    const nutrition = sku.sku_nutrition?.[0] || {};
    // The report that stands now, not the first row returned: older versions
    // are kept for history, and the first was a hand-typed June score.
    const screening = latestReport(sku.screening_reports) || {};
    const flags = screening.flags || {};
    // A published ingredient label, or nothing. The view returns only
    // published rows, each saying how it was established: `verified` (a person
    // checked it) or `machine_read` (two agreeing readings, checks passed —
    // migration 00024). An absent row means "not checked", never "clean".
    // Selected with `*` and read defensively so this works whether or not the
    // `evidence` column exists yet; PostgREST nests it as an array today.
    const labelRow = Array.isArray(sku.sku_label_facts) ? sku.sku_label_facts[0] : sku.sku_label_facts;
    const evidence = labelRow ? (labelRow.evidence ?? (labelRow.manually_verified ? 'verified' : null)) : null;
    const label = evidence
      ? {
          evidence,
          verified: evidence === 'verified',
          ingredientsText: labelRow.raw_ingredient_text || '',
          allergens: labelRow.allergens || [],
          mayContain: labelRow.may_contain || [],
          // When KOI last saw the pack (migration 00029). A year without a
          // fresh sighting and the list stops counting as complete.
          confirmedAt: labelRow.confirmed_at ?? null,
        }
      : null;
    // Only claims the screening report actually made. This used to default to
    // ["Healthy", "Natural"] for any product without flags, which invented a
    // claim for every unscreened row.
    //
    // And only the ones KOI may repeat. The storefront is a marketer under the
    // claims regulations, so "Immunity Booster" is dropped as a physiological
    // claim, and a brand's "High protein" survives only if its own declared
    // figures pass the test KOI's badge applies (lib/nutrition/claims.js).
    //
    // Figures nobody has seen on a pack for a year support no nutrient claim,
    // the brand's or KOI's: the recipe may have changed. They still display as
    // what was declared.
    // The aisle and category come from KOI's category tree, not the brand's
    // typed category ("Healthy Snacks" put a prohibited word on the shelf).
    // The category also carries its reference portion, so a per-serving claim
    // is judged on a realistic serving (lib/food/taxonomy.js, basis.js).
    const taxonomy = categorise({ name: p.product_name, categoryL2: p.category_l2, categoryL1: p.category_l1 });
    const portion = taxonomy?.portion ?? null;
    const figures = isLabelCurrent(nutrition.confirmed_at) ? { ...nutrition, portion_reference: portion } : {};
    const claims = guardClaims(flags.claims, figures);

    // "High protein" is derived from the declared value, never from the name.
    // The previous rule also fired on any product whose name contained
    // "almond", which asserted a macro claim from a substring match.
    //
    // It then read `protein_g` raw, which carried two faults. It ignored
    // `measurement_basis`, so a per-serving row and a per-100g row were judged
    // by one number that meant different things. And density alone cannot carry
    // a claim: Premium Pampore Saffron declares 11.4 g per 100 g and a 0.1 g
    // serving, so it wore this badge on about 0.01 g of protein per pinch.
    //
    // Both gates now have to pass - dense enough per 100, and enough in the
    // serving a shopper actually eats. The threshold is the published
    // proteinHigh (12) rather than a local 10, which also settles a live
    // disagreement: at 10 a product got the badge on its card while shelves.js
    // and search, both reading 12, left it out.
    const hasHighProtein = claims.some(c => String(c).toLowerCase() === 'high protein');
    if (!hasHighProtein && isHighProtein(figures)) claims.push("High Protein");
    // A reviewer's note is KOI's own voice, so it answers to the same rule as
    // a brand claim. "Potent anti-inflammatory mix" is a physiological claim
    // no pack could print; KOI showing it is KOI making it.
    const reviewNotes = isClaimSafeText(screening.review_notes) ? (screening.review_notes || null) : null;
    const skus = p.skus || [];
    const mainSku = skus[0] || {};
    const skuNutrition = mainSku.sku_nutrition || [];

    let image = null;
    if (p.brands?.brand_name === 'Troovy') {
      let imageType = 'butter';
      if (p.product_name.includes('Chocolate')) imageType = 'chocolate';
      if (p.product_name.includes('Chips')) imageType = 'chips';
      image = {
        hero: `/media/troovy-${imageType}-hero.jpg`,
        label: `/media/troovy-${imageType}-label.jpg`,
        lifestyle: `/media/troovy-${imageType}-lifestyle.jpg`,
      };
    } else if (p.brands?.brand_name === 'Sweet Karam Coffee') {
      let imageType = 'madras';
      if (p.product_name.includes('Mango')) imageType = 'mango';
      if (p.product_name.includes('Chocolate')) imageType = 'ragi';
      if (p.product_name.includes('Golden')) imageType = 'golden';
      image = {
        hero: `/media/skc-${imageType}-hero.jpg`,
        label: `/media/skc-${imageType}-label.jpg`,
        lifestyle: `/media/skc-${imageType}-lifestyle.jpg`,
      };
    } else if (p.brands?.brand_name === 'Open Secret') {
      let imageType = 'dfm';
      if (p.product_name.includes('Biscuits')) imageType = 'cb';
      if (p.product_name.includes('Almonds')) imageType = 'ca';
      if (p.product_name.includes('Dates')) imageType = 'dates';
      image = {
        hero: `/media/os-${imageType}-hero.jpg`,
        label: `/media/os-${imageType}-label.jpg`,
        lifestyle: `/media/os-${imageType}-lifestyle.jpg`,
      };
    } else if (p.brands?.brand_name === 'KisaanSay') {
      let imageType = 'honey';
      if (p.product_name.includes('Saffron')) imageType = 'saffron';
      if (p.product_name.includes('Rice')) imageType = 'rice';
      image = {
        hero: `/media/kisaansay-${imageType}-hero.jpg`,
        label: `/media/kisaansay-${imageType}-label.jpg`,
        lifestyle: `/media/kisaansay-${imageType}-lifestyle.jpg`,
      };
    } else if (p.brands?.brand_name === 'The Healthy Binge') {
      let imageType = 'crispies';
      if (p.product_name.includes('Combo')) imageType = 'combo';
      image = {
        hero: `/media/thb-${imageType}-hero.jpg`,
        label: `/media/thb-${imageType}-label.jpg`,
        lifestyle: `/media/thb-${imageType}-lifestyle.jpg`,
      };
    } else if (p.brands?.brand_name === 'Mama Nourish') {
      let imageType = 'chivda';
      if (p.product_name.includes('Laddubar')) imageType = 'laddubar';
      image = {
        hero: `/media/mn-${imageType}-hero.jpg`,
        label: `/media/mn-${imageType}-label.jpg`,
        lifestyle: `/media/mn-${imageType}-lifestyle.jpg`,
      };
    }
    
    return {
      id: p.id,
      // The SKU, not the product, is what a supply source can answer about: a
      // 60 g pack can be in stock while the 200 g pack is not. Availability
      // lookups key on this, and marketplace_sku_map references skus(id).
      skuId: sku.id ?? null,
      brand: p.brands?.brand_name || "Unknown",
      name: p.product_name,
      // null when the name and the brand's category name nothing KOI knows:
      // an unplaced product is shown under "All", never under a made-up aisle.
      category: taxonomy?.aisle ?? null,
      subcategory: taxonomy?.subcategory ?? null,
      categoryKey: taxonomy?.key ?? null,
      portion,
      goalTags: claims,
      // A product from the local test catalogue brings its own photographs from
      // Open Food Facts (CC-BY-SA), so `imageCredit` travels with them and is
      // printed wherever they are shown.
      image: p._test?.image ?? image ?? { hero: '', label: '', lifestyle: '' },
      imageCredit: p._test?.imageCredit ?? null,
      price: sku.mrp || 0,
      weight: sku.net_weight || "N/A",
      // null, not a default. An unscored product shows no score.
      score: num(screening.final_score),
      tags: claims.slice(0, 3),
      // Only what the screening report actually declared.
      dietary: Array.isArray(flags.dietary) ? flags.dietary : [],
      insight: reviewNotes,
      recommended: true,

      // No supply source is wired yet, so availability is genuinely unknown.
      availability: AVAILABILITY.UNKNOWN,
      deliveryEta: null,

      // Intelligence overlays — the three sub-scores are real columns on
      // screening_reports. Anything the report did not carry stays null so the
      // UI can omit it rather than show a plausible-looking constant.
      scoreBreakdown: {
        "Ingredient Quality": num(screening.ingredient_score),
        "Nutrition": num(screening.nutrition_score),
        "Processing": num(screening.processing_score),
      },
      betterThanPercentage: null,
      categoryAverage: null,
      strengths: claims,
      watchouts: [],
      compareInsight: null,

      // Details page extra mapping
      // Shown only when it is a pass. Scores are computed now, and "KOI review"
      // or "KOI rejected" printed over a listed product's photo reads as a
      // warning label nobody decided to publish. The score ring still shows
      // the number; whether a low-scoring product stays listed is a decision.
      koiStatus: screening.verdict === 'eligible' ? screening.verdict : null,
      verdict: {
        summary: reviewNotes,
        pros: claims,
        cons: [],
      },
      labelLens: [],
      nutrition: [
        { label: "Calories", value: num(nutrition.energy_kcal), unit: "kcal", icon: "Flame" },
        { label: "Protein", value: num(nutrition.protein_g), unit: "g", icon: "Dumbbell" },
        { label: "Carbs", value: num(nutrition.carbs_g), unit: "g", icon: "Zap" },
        { label: "Sugar", value: num(nutrition.sugars_g), unit: "g", icon: "CircleDot" },
        { label: "Added sugar", value: num(nutrition.added_sugar_g), unit: "g", icon: "CircleDot" },
        { label: "Fat", value: num(nutrition.total_fat_g), unit: "g", icon: "Heart" },
        { label: "Saturated fat", value: num(nutrition.saturated_fat_g), unit: "g", icon: "Heart" },
        { label: "Fibre", value: num(nutrition.fibre_g), unit: "g", icon: "Leaf" },
        { label: "Sodium", value: num(nutrition.sodium_mg), unit: "mg", icon: "CircleDot" },
      ].filter((n) => n.value !== null),
      servingSize: nutrition.serving_size || null,
      measurementBasis: nutrition.measurement_basis || null,
      benefits: [],
      goodIngredients: (flags.ingredients_partial || []).map(name => ({ name, desc: null })),
      label,
      watchOuts: [],
      alternatives: [],
      reviews: [],
      reviewTags: [],
      // Set only on the local test catalogue: where it came from, its licence,
      // and that the price is an estimate. null for every live product.
      testCatalogue: p._test ?? null,
    };
  });
}
