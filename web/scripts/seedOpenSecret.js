import { createClient } from '@supabase/supabase-js';

// Setup Supabase Client
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. Pass them as env vars.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const BRAND_NAME = "Open Secret";
const BRAND_SLUG = "open-secret";

// Define Products and SKUs
const products = [
  {
    name: "Daily Dry Fruit Mix",
    category_l1: "Healthy Snacks",
    mrp: 350,
    net_weight: "150g",
    sku_code: "OS-DFM-01",
    nutrition: {
      energy_kcal: 480,
      protein_g: 12,
      carbs_g: 45,
      sugars_g: 25,
      added_sugar_g: 0,
      fibre_g: 8,
      total_fat_g: 28,
      saturated_fat_g: 4,
      trans_fat_g: 0,
      cholesterol_mg: 0,
      sodium_mg: 10,
      measurement_basis: "per_100g",
      serving_size: "30g"
    },
    screening: {
      processing_level: "Unprocessed",
      flags: { claims: ["No Added Sugar", "High Protein", "High Fibre"], ingredients_partial: ["Almonds", "Cashews", "Raisins", "Walnuts", "Pistachios"] },
      final_score: 95,
      review_notes: "Excellent source of natural nutrients and healthy fats."
    }
  },
  {
    name: "Chocolate Biscuits",
    category_l1: "Healthy Snacks",
    mrp: 120,
    net_weight: "100g",
    sku_code: "OS-CB-01",
    nutrition: {
      energy_kcal: 450,
      protein_g: 8,
      carbs_g: 65,
      sugars_g: 15,
      added_sugar_g: 10,
      fibre_g: 5,
      total_fat_g: 18,
      saturated_fat_g: 8,
      trans_fat_g: 0,
      cholesterol_mg: 5,
      sodium_mg: 150,
      measurement_basis: "per_100g",
      serving_size: "20g"
    },
    screening: {
      processing_level: "Processed",
      flags: { claims: ["No Maida", "No Refined Sugar", "No Palm Oil"], ingredients_partial: ["Whole Wheat Flour", "Jaggery", "Cocoa", "Butter"] },
      final_score: 82,
      review_notes: "Better alternative to conventional biscuits, but contains some added sugar."
    }
  },
  {
    name: "California Almonds",
    category_l1: "Healthy Snacks",
    mrp: 450,
    net_weight: "200g",
    sku_code: "OS-CA-01",
    nutrition: {
      energy_kcal: 579,
      protein_g: 21.1,
      carbs_g: 21.6,
      sugars_g: 4.4,
      added_sugar_g: 0,
      fibre_g: 12.5,
      total_fat_g: 49.9,
      saturated_fat_g: 3.8,
      trans_fat_g: 0,
      cholesterol_mg: 0,
      sodium_mg: 1,
      measurement_basis: "per_100g",
      serving_size: "30g"
    },
    screening: {
      processing_level: "Unprocessed",
      flags: { claims: ["Zero Cholesterol", "High Protein", "Power Snacking"], ingredients_partial: ["100% California Almonds"] },
      final_score: 98,
      review_notes: "Pure, natural whole food. Excellent nutritional profile."
    }
  },
  {
    name: "Dates",
    category_l1: "Healthy Snacks",
    mrp: 299,
    net_weight: "250g",
    sku_code: "OS-DATES-01",
    nutrition: {
      energy_kcal: 277,
      protein_g: 1.8,
      carbs_g: 75,
      sugars_g: 66,
      added_sugar_g: 0,
      fibre_g: 6.7,
      total_fat_g: 0.2,
      saturated_fat_g: 0,
      trans_fat_g: 0,
      cholesterol_mg: 0,
      sodium_mg: 1,
      measurement_basis: "per_100g",
      serving_size: "40g"
    },
    screening: {
      processing_level: "Unprocessed",
      flags: { claims: ["High Fibre", "No Added Sugar", "Gluten-Free Snack"], ingredients_partial: ["100% Premium Dates"] },
      final_score: 92,
      review_notes: "Great natural sweetener, but very calorie-dense and high in natural sugars."
    }
  }
];

async function seedOpenSecret() {
  console.log("Starting Open Secret Ingestion...");

  const ownerId = '00000000-0000-0000-0000-000000000001';
  console.log(`Using Existing Owner: ${ownerId}`);

  // 2. Upsert Brand
  const { data: brandData, error: brandErr } = await supabase
    .from('brands')
    .insert({
      owner_id: ownerId,
      brand_name: 'Open Secret',
      legal_entity_name: 'Open Secret Pvt Ltd',
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
            .eq('brand_name', 'Open Secret')
            .single();
        var brandId = existingBrand.id;
    } else {
        console.error("Brand Insert Error:", brandErr.message || brandErr);
        process.exit(1);
    }
  } else {
      var brandId = brandData.id;
  }
  
  console.log(`Using Brand: Open Secret (${brandId})`);

  // 3. Insert Products
  for (const p of products) {
    const { data: product, error: productErr } = await supabase
      .from('products')
      .insert({
        brand_id: brandId,
        product_name: p.name,
        category_l1: p.category_l1,
        status: 'approved'
      })
      .select()
      .single();

    if (productErr) {
      console.error(`Error inserting product ${p.name}:`, productErr);
      continue;
    }
    console.log(`  Created Product: ${product.product_name} (${product.id})`);

    // 4. Insert SKU
    const { data: sku, error: skuErr } = await supabase
      .from('skus')
      .insert({
        product_id: product.id,
        sku_code: p.sku_code,
        variant_name: "Default",
        mrp: p.mrp,
        net_weight: p.net_weight
      })
      .select()
      .single();

    if (skuErr) {
      console.error(`  Error inserting SKU:`, skuErr);
      continue;
    }
    console.log(`    Created SKU: ${sku.sku_code} (${sku.id})`);

    // 5. Insert Nutrition
    await supabase.from('sku_nutrition').insert({
      sku_id: sku.id,
      ...p.nutrition
    });

    // 6. Insert Screening Report
    await supabase.from('screening_reports').insert({
      sku_id: sku.id,
      ...p.screening
    });
    
    console.log(`    Created Nutrition & Screening data`);
  }

  console.log("Ingestion Complete!");
}

seedOpenSecret().catch(console.error);
