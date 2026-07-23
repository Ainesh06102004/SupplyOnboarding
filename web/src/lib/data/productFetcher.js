import { getSupabaseClient } from '@/lib/supabase/client';

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
    const claims = flags.claims || ["Healthy", "Natural"];
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
      brand: p.brands?.brand_name || "Unknown",
      name: p.product_name,
      category: p.category_l1,
      goalTags: claims,
      image: image || { hero: '', label: '', lifestyle: '' },
      price: sku.mrp || 0,
      weight: sku.net_weight || "N/A",
      score: screening.final_score || 80,
      tags: claims.slice(0, 3),
      dietary: ["Vegetarian"],
      insight: screening.review_notes || "Clean ingredients",
      recommended: true,
      
      // Intelligence Overlays
      scoreBreakdown: { 
        "Protein Quality": 85, 
        "Sugar Content": 90, 
        "Additives": 95, 
        "Ingredient Quality": 85 
      },
      betterThanPercentage: screening.final_score ? Math.min(99, screening.final_score + 10) : 90,
      categoryAverage: { Protein: "10g", Sugar: "10g", Fibre: "2g", Additives: "Medium" },
      strengths: claims,
      watchouts: ["Consume in moderation"],
      compareInsight: "Better ingredient profile than category average.",
      
      // Details page extra mapping
      koiStatus: "Approved",
      verdict: {
        summary: screening.review_notes || "Good option.",
        pros: claims,
        cons: ["Slightly calorie dense"]
      },
      labelLens: [
        { label: "Protein", value: "Good", status: "good" },
        { label: "Sugar", value: "Checked", status: "neutral" },
        { label: "Additives", value: "Minimal", status: "good" }
      ],
      nutrition: [
        { label: "Calories", value: nutrition.energy_kcal || 0, unit: "kcal", icon: "Flame" },
        { label: "Protein", value: nutrition.protein_g || 0, unit: "g", icon: "Dumbbell" },
        { label: "Carbs", value: nutrition.carbs_g || 0, unit: "g", icon: "Zap" },
        { label: "Sugar", value: nutrition.sugars_g || 0, unit: "g", icon: "CircleDot" },
        { label: "Fat", value: nutrition.total_fat_g || 0, unit: "g", icon: "Heart" },
        { label: "Fibre", value: nutrition.fibre_g || 0, unit: "g", icon: "Leaf" },
      ],
      benefits: [
        { title: "Clean Label", desc: "No harmful additives.", icon: "ShieldCheck" }
      ],
      goodIngredients: (flags.ingredients_partial || ["Whole ingredients"]).map(name => ({ name, desc: "Source of nutrition" })),
      watchOuts: [{ name: "Calorie Density", desc: "Mindful portion sizing" }],
      alternatives: [],
      reviews: [],
      reviewTags: []
    };
  });
}
