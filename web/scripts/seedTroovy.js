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

const troovyProducts = [
  {
    product: {
      product_name: "The Healthy Butter Cookies",
      category_l1: "Snacks",
      category_l2: "Cookies",
      product_type: "food",
      status: "approved"
    },
    sku: {
      variant_name: "Better Butter",
      sku_code: "TROOVY-BC-01",
      net_weight: "200g",
      mrp: 120,
    },
    nutrition: {
      energy_kcal: 430.8,
      protein_g: 10.9,
      carbs_g: 52,
      sugars_g: 26.2,
      added_sugar_g: 20.9,
      fibre_g: 3.6,
      total_fat_g: 20.9,
      saturated_fat_g: 3.2,
      trans_fat_g: 0.2,
      cholesterol_mg: 19.8,
      sodium_mg: 114.5,
      measurement_basis: "per_100g",
      serving_size: "40g"
    },
    screening: {
      final_score: 78,
      verdict: "eligible",
      review_notes: "Cleaner than conventional butter cookies, but still a treat.",
      flags: {
        claims: ["No refined sugar", "No palm oil", "No preservatives", "No maida", "High protein"],
        ingredients_partial: ["Grains and millets", "Milk solids", "Jaggery", "White butter"]
      }
    }
  },
  {
    product: {
      product_name: "The Healthy Chocolate Cookies",
      category_l1: "Snacks",
      category_l2: "Cookies",
      product_type: "food",
      status: "approved"
    },
    sku: {
      variant_name: "Classic Chocolate",
      sku_code: "TROOVY-CC-01",
      net_weight: "200g",
      mrp: 120,
    },
    nutrition: {
      energy_kcal: 430.8,
      protein_g: 10.9,
      carbs_g: 52,
      sugars_g: 26.2,
      added_sugar_g: 20.9,
      fibre_g: 3.6,
      total_fat_g: 20.9,
      saturated_fat_g: 3.2,
      trans_fat_g: 0.2,
      cholesterol_mg: 19.8,
      sodium_mg: 114.5,
      measurement_basis: "per_100g",
      serving_size: "40g"
    },
    screening: {
      final_score: 79,
      verdict: "eligible",
      review_notes: "Better ingredient profile than mass-market chocolate cookies.",
      flags: {
        claims: ["No refined sugar", "No palm oil", "No preservatives", "No maida", "High protein"],
        ingredients_partial: ["Grains and millets", "Milk solids", "Jaggery", "Cocoa"]
      }
    }
  },
  {
    product: {
      product_name: "The Healthy Potato Chips",
      category_l1: "Snacks",
      category_l2: "Chips",
      product_type: "food",
      status: "approved"
    },
    sku: {
      variant_name: "Masala",
      sku_code: "TROOVY-PC-01",
      net_weight: "200g",
      mrp: 150,
    },
    nutrition: {
      energy_kcal: 420,
      protein_g: 12.8,
      carbs_g: 74.3,
      sugars_g: 2.2,
      added_sugar_g: 1.5,
      fibre_g: 0,
      total_fat_g: 10.5,
      saturated_fat_g: 3.1,
      trans_fat_g: 0,
      cholesterol_mg: 0,
      sodium_mg: 550,
      measurement_basis: "per_100g",
      serving_size: "40g"
    },
    screening: {
      final_score: 84,
      verdict: "eligible",
      review_notes: "One of the better chips options with lower oil.",
      flags: {
        claims: ["Vacuum cooked", "70% less oil", "No palm oil", "No preservatives", "No artificial additives"],
        ingredients_partial: ["Potatoes", "Edible Vegetable Oil", "Spices", "Salt"]
      }
    }
  }
];

async function seed() {
  console.log("Starting Troovy Ingestion...");

  const ownerId = '00000000-0000-0000-0000-000000000001';
  console.log(`Using Existing Owner: ${ownerId}`);

  // 2. Insert Brand
  const { data: brandData, error: brandErr } = await supabase
    .from('brands')
    .insert({
      owner_id: ownerId,
      brand_name: 'Troovy',
      legal_entity_name: 'Troovy Foods Pvt Ltd',
      business_type: 'private_limited',
      onboarding_status: 'approved'
    })
    .select('id')
    .single();

  if (brandErr) {
    console.error("Brand Insert Error:", brandErr.message);
    process.exit(1);
  }

  const brandId = brandData.id;
  console.log(`Created Brand: Troovy (${brandId})`);

  // 3. Insert Products, SKUs, Nutrition, Screening
  for (const item of troovyProducts) {
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
