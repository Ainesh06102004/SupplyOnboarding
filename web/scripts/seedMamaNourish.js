import { createClient } from '@supabase/supabase-js';

// Setup Supabase Client
//
// SERVICE ROLE, not the anon key. These scripts write catalogue data — product
// rows, nutrition panels, screening reports with KOI scores — and that is
// privileged work. Running them on the anon key is the reason `anon` held
// INSERT/UPDATE/DELETE on the catalogue tables at all, which meant anyone
// holding a publishable key could rewrite a KOI score.
//
// Seeding is an operator task run from a trusted machine, so it gets an
// operator's credential.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Pass them as env vars.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const BRAND_NAME = "Mama Nourish";
const BRAND_SLUG = "mama-nourish";

// Define Products and SKUs
const products = [
  {
    name: "Chivda Mix - Patal Poha",
    category_l1: "Healthy Snacks",
    mrp: 150,
    net_weight: "150g",
    sku_code: "MN-CHIVDA-01",
    nutrition: {
      energy_kcal: 420,
      protein_g: 8.5,
      carbs_g: 68.0,
      sugars_g: 2.5,
      added_sugar_g: 0,
      fibre_g: 6.2,
      total_fat_g: 12.0,
      saturated_fat_g: 3.5,
      trans_fat_g: 0,
      cholesterol_mg: 0,
      sodium_mg: 450,
      measurement_basis: "per_100g",
      serving_size: "30g"
    },
    screening: {
      processing_level: "Nova 3",
      flags: { claims: ["No Cholesterol", "No Transfat", "Roasted Not Fried", "No Maida", "No Preservatives", "No Palm Oil"], ingredients_partial: ["Patal Poha", "Nuts", "Spices"] },
      final_score: 89,
      review_notes: "Roasted poha chivda. Better alternative to deep fried snacks."
    }
  },
  {
    name: "Dryfruit Instant Energy Laddubar",
    category_l1: "Healthy Snacks",
    mrp: 299,
    net_weight: "175g",
    sku_code: "MN-LADDUBAR-01",
    nutrition: {
      energy_kcal: 410,
      protein_g: 10.0,
      carbs_g: 58.0,
      sugars_g: 30.0,
      added_sugar_g: 0,
      fibre_g: 8.5,
      total_fat_g: 16.5,
      saturated_fat_g: 4.0,
      trans_fat_g: 0,
      cholesterol_mg: 0,
      sodium_mg: 15,
      measurement_basis: "per_100g",
      serving_size: "35g"
    },
    screening: {
      processing_level: "Nova 2",
      flags: { claims: ["96% DryFruits", "No Refined Sugar", "Only Kitchen Ingredients", "No Preservatives", "Pure Cow Ghee", "Honey"], ingredients_partial: ["Almonds", "Cashews", "Dates", "Pumpkin Seeds", "Honey", "Ghee"] },
      final_score: 94,
      review_notes: "Very clean ingredient profile for an energy bar. Sweetened naturally with dates and honey."
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
      legal_entity_name: 'Mama Nourish Pvt Ltd',
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
