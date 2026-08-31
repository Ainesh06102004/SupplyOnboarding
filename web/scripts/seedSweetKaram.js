import { createClient } from '@supabase/supabase-js';

// Setup Supabase Client
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. Pass them as env vars.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const skcProducts = [
  {
    product: {
      product_name: "Madras Mixture",
      category_l1: "Snacks",
      category_l2: "Savouries",
      product_type: "food",
      status: "approved"
    },
    sku: {
      variant_name: "Classic",
      sku_code: "SKC-MM-01",
      net_weight: "250g",
      mrp: 180,
    },
    nutrition: {
      energy_kcal: 480,
      protein_g: 11,
      carbs_g: 58,
      sugars_g: 2,
      added_sugar_g: 0,
      fibre_g: 5,
      total_fat_g: 22,
      saturated_fat_g: 8,
      trans_fat_g: 0,
      cholesterol_mg: 0,
      sodium_mg: 450,
      measurement_basis: "per_100g",
      serving_size: "30g"
    },
    screening: {
      final_score: 82,
      verdict: "eligible",
      review_notes: "Traditional recipe, no palm oil, clean ingredients.",
      flags: {
        claims: ["No Palm Oil", "No Preservatives", "Vegan"],
        ingredients_partial: ["Gram Flour", "Rice Flour", "Peanuts", "Curry Leaves", "Spices", "Cold Pressed Oil"]
      }
    }
  },
  {
    product: {
      product_name: "Mango Mysore Pak",
      category_l1: "Sweets",
      category_l2: "Traditional",
      product_type: "food",
      status: "approved"
    },
    sku: {
      variant_name: "Mango",
      sku_code: "SKC-MMP-01",
      net_weight: "250g",
      mrp: 220,
    },
    nutrition: {
      energy_kcal: 510,
      protein_g: 4,
      carbs_g: 62,
      sugars_g: 45,
      added_sugar_g: 40,
      fibre_g: 1,
      total_fat_g: 28,
      saturated_fat_g: 15,
      trans_fat_g: 0,
      cholesterol_mg: 20,
      sodium_mg: 10,
      measurement_basis: "per_100g",
      serving_size: "40g"
    },
    screening: {
      final_score: 75,
      verdict: "eligible",
      review_notes: "High in sugar and ghee, but uses natural mango and no artificial colours.",
      flags: {
        claims: ["Real Mango", "Pure Ghee", "No Artificial Colours"],
        ingredients_partial: ["Gram Flour", "Sugar", "Pure Ghee", "Mango Pulp"]
      }
    }
  },
  {
    product: {
      product_name: "Ragi Hot Chocolate Milk Mix",
      category_l1: "Beverages",
      category_l2: "Health Mix",
      product_type: "food",
      status: "approved"
    },
    sku: {
      variant_name: "Chocolate",
      sku_code: "SKC-RHC-01",
      net_weight: "200g",
      mrp: 250,
    },
    nutrition: {
      energy_kcal: 380,
      protein_g: 8,
      carbs_g: 72,
      sugars_g: 35,
      added_sugar_g: 25,
      fibre_g: 6,
      total_fat_g: 5,
      saturated_fat_g: 2,
      trans_fat_g: 0,
      cholesterol_mg: 0,
      sodium_mg: 40,
      measurement_basis: "per_100g",
      serving_size: "20g"
    },
    screening: {
      final_score: 88,
      verdict: "eligible",
      review_notes: "Excellent alternative to sugary health drinks. Ragi adds great fibre.",
      flags: {
        claims: ["Millet Based", "No Refined Sugar", "High Fibre"],
        ingredients_partial: ["Sprouted Ragi", "Cocoa Powder", "Jaggery", "Almonds"]
      }
    }
  },
  {
    product: {
      product_name: "Golden Milk Mix",
      category_l1: "Beverages",
      category_l2: "Health Mix",
      product_type: "food",
      status: "approved"
    },
    sku: {
      variant_name: "Turmeric Latte",
      sku_code: "SKC-GMM-01",
      net_weight: "150g",
      mrp: 200,
    },
    nutrition: {
      energy_kcal: 350,
      protein_g: 10,
      carbs_g: 65,
      sugars_g: 10,
      added_sugar_g: 0,
      fibre_g: 12,
      total_fat_g: 8,
      saturated_fat_g: 2,
      trans_fat_g: 0,
      cholesterol_mg: 0,
      sodium_mg: 25,
      measurement_basis: "per_100g",
      serving_size: "10g"
    },
    screening: {
      final_score: 95,
      verdict: "eligible",
      review_notes: "Potent anti-inflammatory mix. Exceptional ingredient purity.",
      flags: {
        claims: ["Immunity Booster", "No Added Sugar", "100% Natural"],
        ingredients_partial: ["Lakadong Turmeric", "Black Pepper", "Ashwagandha", "Cardamom"]
      }
    }
  }
];

async function seed() {
  console.log("Starting Sweet Karam Coffee Ingestion...");

  const ownerId = '00000000-0000-0000-0000-000000000001';
  console.log(`Using Existing Owner: ${ownerId}`);

  // 1. Insert Brand
  const { data: brandData, error: brandErr } = await supabase
    .from('brands')
    .insert({
      owner_id: ownerId,
      brand_name: 'Sweet Karam Coffee',
      legal_entity_name: 'Sweet Karam Coffee Pvt Ltd',
      business_type: 'private_limited',
      onboarding_status: 'approved'
    })
    .select('id')
    .single();

  if (brandErr) {
    if (brandErr.code === '23505') { // Unique violation, brand might exist
        console.log("Brand already exists, fetching it...");
        const { data: existingBrand } = await supabase
            .from('brands')
            .select('id')
            .eq('brand_name', 'Sweet Karam Coffee')
            .single();
        var brandId = existingBrand.id;
    } else {
        console.error("Brand Insert Error:", brandErr.message);
        process.exit(1);
    }
  } else {
      var brandId = brandData.id;
  }

  console.log(`Using Brand: Sweet Karam Coffee (${brandId})`);

  // 2. Insert Products, SKUs, Nutrition, Screening
  for (const item of skcProducts) {
    // Insert Product
    const { data: pData, error: pErr } = await supabase
      .from('products')
      .insert({
        brand_id: brandId,
        ...item.product
      })
      .select('id')
      .single();

    if (pErr) throw pErr;
    console.log(`  Created Product: ${item.product.product_name} (${pData.id})`);

    // Insert SKU
    const { data: sData, error: sErr } = await supabase
      .from('skus')
      .insert({
        product_id: pData.id,
        ...item.sku
      })
      .select('id')
      .single();

    if (sErr) throw sErr;
    console.log(`    Created SKU: ${item.sku.sku_code} (${sData.id})`);

    // Insert Nutrition
    const { error: nErr } = await supabase
      .from('sku_nutrition')
      .insert({
        sku_id: sData.id,
        ...item.nutrition
      });

    if (nErr) throw nErr;

    // Insert Screening
    const { error: scErr } = await supabase
      .from('screening_reports')
      .insert({
        sku_id: sData.id,
        ...item.screening
      });

    if (scErr) throw scErr;
    console.log(`    Created Nutrition & Screening data`);
  }

  console.log("Ingestion Complete!");
}

seed().catch(console.error);
