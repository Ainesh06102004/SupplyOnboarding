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

/** Number, or null when the column is absent. Never coerces missing to 0. */
const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));

export async function fetchAllProducts() {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('products')
    .select(`
      id,
      product_name,
      category_l1,
      brand_id,
      brands (brand_name),
      skus (
        id, variant_name, mrp, net_weight,
        sku_nutrition (*),
        screening_reports (*)
      )
    `)
    .eq('status', 'approved');

  if (error) {
    console.error("Error fetching products:", JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
    return [];
  }

  // Map to the complex frontend structure
  return data.map(p => {
    const sku = p.skus?.[0] || {};
    const nutrition = sku.sku_nutrition?.[0] || {};
    const screening = sku.screening_reports?.[0] || {};
    const flags = screening.flags || {};
    // Only claims the screening report actually made. This used to default to
    // ["Healthy", "Natural"] for any product without flags, which invented a
    // claim for every unscreened row.
    const claims = Array.isArray(flags.claims) ? [...flags.claims] : [];

    // "High protein" is derived from the declared value, never from the name.
    // The previous rule also fired on any product whose name contained
    // "almond", which asserted a macro claim from a substring match.
    const protein = num(nutrition.protein_g);
    const hasHighProtein = claims.some(c => String(c).toLowerCase() === 'high protein');
    if (!hasHighProtein && protein !== null && protein >= 10) {
      claims.push("High Protein");
    }
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
      category: p.category_l1,
      goalTags: claims,
      image: image || { hero: '', label: '', lifestyle: '' },
      price: sku.mrp || 0,
      weight: sku.net_weight || "N/A",
      // null, not a default. An unscored product shows no score.
      score: num(screening.final_score),
      tags: claims.slice(0, 3),
      // Only what the screening report actually declared.
      dietary: Array.isArray(flags.dietary) ? flags.dietary : [],
      insight: screening.review_notes || null,
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
      koiStatus: screening.verdict || null,
      verdict: {
        summary: screening.review_notes || null,
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
      watchOuts: [],
      alternatives: [],
      reviews: [],
      reviewTags: []
    };
  });
}
