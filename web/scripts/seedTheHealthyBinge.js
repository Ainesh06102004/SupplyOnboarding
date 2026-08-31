import { createClient } from '@supabase/supabase-js';

// Setup Supabase Client
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. Pass them as env vars.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const BRAND_NAME = "The Healthy Binge";
const BRAND_SLUG = "the-healthy-binge";

// Define Products and SKUs
const products = [
  {
    name: "Moringa Jowar Crispies - Indian Masala",
    category_l1: "Healthy Snacks",
    mrp: 50,
    net_weight: "40g",
    sku_code: "THB-CRISP-01",
    nutrition: {
      energy_kcal: 464.23,
      protein_g: 13.00,
      carbs_g: 62.07,
      sugars_g: 1.00,
      added_sugar_g: 0,
      fibre_g: 10.73,
      total_fat_g: 18.00,
      saturated_fat_g: 4.77,
      trans_fat_g: 0,
      cholesterol_mg: 0,
      sodium_mg: 737,
      measurement_basis: "per_100g",
      serving_size: "40g"
    },
    screening: {
      processing_level: "Nova 3",
      flags: { claims: ["Baked Healthy Snack", "Good Source of Iron & Calcium", "0% Cholesterol", "Vegan", "Gluten Free"], ingredients_partial: ["Jowar Flour", "Moringa Powder"] },
      final_score: 85,
      review_notes: "Baked crispies. Contains Emulsifiers (INS 170i) and acidity regulators."
    }
  },
  {
    name: "Healthy Snack Combo - Pack of 6",
    category_l1: "Healthy Snacks",
    mrp: 300,
    net_weight: "240g",
    sku_code: "THB-COMBO-01",
    nutrition: {
      energy_kcal: 460,
      protein_g: 12.5,
      carbs_g: 64.0,
      sugars_g: 1.2,
      added_sugar_g: 0,
      fibre_g: 9.5,
      total_fat_g: 16.0,
      saturated_fat_g: 4.5,
      trans_fat_g: 0,
      cholesterol_mg: 0,
      sodium_mg: 650,
      measurement_basis: "per_100g",
      serving_size: "40g"
    },
    screening: {
      processing_level: "Nova 3",
      flags: { claims: ["Baked Healthy Snack", "100% Baked", "0% Cholesterol", "Vegan", "Gluten Free"], ingredients_partial: ["Jowar", "Ragi", "Quinoa", "Amaranth"] },
      final_score: 84,
      review_notes: "Assorted pack of 6 baked crispies. Good alternative to fried snacks."
    }
  }
];

async function seedBrand() {
  console.log(`Starting ${BRAND_NAME} Ingestion...`);

  const ownerId = '00000000-0000-0000-0000-000000000001';
  console.log(`Using Existing Owner: ${ownerId}`);

  // Upsert Brand
  const { data: brandData, error: brandErr } = await supabase
    .from('brands')
    .insert({
      owner_id: ownerId,
      brand_name: BRAND_NAME,
      legal_entity_name: 'The Healthy Binge Pvt Ltd',
      business_type: 'private_limited',
      onboarding_status: 'approved'
    })
    .select('id')
    .single();

  let brandId;
  if (brandErr) {
    if (brandErr.code === '23505') { // Unique violation
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
  
  console.log(`Using Brand: ${BRAND_NAME} (${brandId})`);

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

seedBrand().catch(console.error);
