import { createClient } from '@supabase/supabase-js';

// Setup Supabase Client
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. Pass them as env vars.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const BRAND_NAME = "KisaanSay";
const BRAND_SLUG = "kisaansay";

// Define Products and SKUs
const products = [
  {
    name: "Uttrakhand Honey",
    category_l1: "Farm Foods",
    mrp: 450,
    net_weight: "500g",
    sku_code: "KS-HONEY-01",
    nutrition: {
      energy_kcal: 304,
      protein_g: 0.3,
      carbs_g: 82.4,
      sugars_g: 82.12,
      added_sugar_g: 0,
      fibre_g: 0.2,
      total_fat_g: 0,
      saturated_fat_g: 0,
      trans_fat_g: 0,
      cholesterol_mg: 0,
      sodium_mg: 4,
      measurement_basis: "per_100g",
      serving_size: "20g"
    },
    screening: {
      processing_level: "Unprocessed",
      flags: { claims: ["Pure", "Natural", "Authentic"], ingredients_partial: ["100% Pure Honey"] },
      final_score: 96,
      review_notes: "Pure, natural unadulterated honey sourced directly from farms."
    }
  },
  {
    name: "Premium Pampore Saffron",
    category_l1: "Farm Foods",
    mrp: 1250,
    net_weight: "1g",
    sku_code: "KS-SAFFRON-01",
    nutrition: {
      energy_kcal: 310,
      protein_g: 11.4,
      carbs_g: 65.3,
      sugars_g: 0,
      added_sugar_g: 0,
      fibre_g: 3.9,
      total_fat_g: 5.8,
      saturated_fat_g: 1.5,
      trans_fat_g: 0,
      cholesterol_mg: 0,
      sodium_mg: 148,
      measurement_basis: "per_100g",
      serving_size: "0.1g"
    },
    screening: {
      processing_level: "Unprocessed",
      flags: { claims: ["Exquisite Kashmiri Treasure", "Pure", "Nutritious"], ingredients_partial: ["100% Saffron Threads"] },
      final_score: 99,
      review_notes: "Highest quality natural saffron. Rich in antioxidants."
    }
  },
  {
    name: "Gorakhpur Kalanamak Rice",
    category_l1: "Farm Foods",
    mrp: 299,
    net_weight: "1kg",
    sku_code: "KS-RICE-01",
    nutrition: {
      energy_kcal: 350,
      protein_g: 9.5,
      carbs_g: 75.2,
      sugars_g: 0.1,
      added_sugar_g: 0,
      fibre_g: 2.8,
      total_fat_g: 1.2,
      saturated_fat_g: 0.3,
      trans_fat_g: 0,
      cholesterol_mg: 0,
      sodium_mg: 5,
      measurement_basis: "per_100g",
      serving_size: "50g"
    },
    screening: {
      processing_level: "Unprocessed",
      flags: { claims: ["Diabetic Friendly", "2x Protein", "Aromatic", "Low GI Rice"], ingredients_partial: ["100% Kalanamak Rice"] },
      final_score: 97,
      review_notes: "Excellent nutritional profile compared to regular white rice. High protein and low GI."
    }
  }
];

async function seedKisaanSay() {
  console.log("Starting KisaanSay Ingestion...");

  const ownerId = '00000000-0000-0000-0000-000000000001';
  console.log(`Using Existing Owner: ${ownerId}`);

  // Upsert Brand
  const { data: brandData, error: brandErr } = await supabase
    .from('brands')
    .insert({
      owner_id: ownerId,
      brand_name: BRAND_NAME,
      legal_entity_name: 'KisaanSay Pvt Ltd',
      business_type: 'private_limited',
      onboarding_status: 'approved'
    })
    .select('id')
    .single();

  let brandId;
  if (brandErr) {
    if (brandErr.code === '23505') { // Unique violation, brand might exist
        console.log("Brand already exists, fetching it...");
        const { data: existingBrand } = await supabase
            .from('brands')
            .select('id')
            .eq('brand_name', BRAND_NAME)
            .single();
        brandId = existingBrand.id;
    } else {
        console.error("Brand Insert Error:", brandErr.message || brandErr);
        process.exit(1);
    }
  } else {
      brandId = brandData.id;
  }
  
  console.log(`Using Brand: KisaanSay (${brandId})`);

  // Insert Products
  for (const p of products) {
    const { data: product, error: productErr } = await supabase
      .from('products')
      .insert({
        brand_id: brandId,
        product_name: p.name,
        category_l1: p.category_l1,
        status: 'approved'
      })
      .select('id')
      .single();

    if (productErr) {
      console.error(`Error inserting product ${p.name}:`, productErr);
      continue;
    }
    console.log(`  Created Product: ${p.name} (${product.id})`);

    // Insert SKU
    const { data: sku, error: skuErr } = await supabase
      .from('skus')
      .insert({
        product_id: product.id,
        sku_code: p.sku_code,
        variant_name: "Default",
        mrp: p.mrp,
        net_weight: p.net_weight
      })
      .select('id')
      .single();

    if (skuErr) {
      console.error(`  Error inserting SKU:`, skuErr);
      continue;
    }
    console.log(`    Created SKU: ${sku.sku_code} (${sku.id})`);

    // Insert Nutrition
    await supabase.from('sku_nutrition').insert({
      sku_id: sku.id,
      ...p.nutrition
    });

    // Insert Screening Report
    await supabase.from('screening_reports').insert({
      sku_id: sku.id,
      ...p.screening
    });
    
    console.log(`    Created Nutrition & Screening data`);
  }

  console.log("Ingestion Complete!");
}

seedKisaanSay().catch(console.error);
