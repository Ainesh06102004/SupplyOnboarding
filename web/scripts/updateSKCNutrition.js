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

const updateData = {
  "SKC-MM-01": {
    energy_kcal: 560,
    protein_g: 10.4,
    carbs_g: 50,
    sugars_g: 0,
    added_sugar_g: 0,
    fibre_g: 4,
    total_fat_g: 35,
    saturated_fat_g: 8.6,
    trans_fat_g: 0,
    cholesterol_mg: 0,
    sodium_mg: 453.7,
    measurement_basis: "per_100g",
    serving_size: "20g"
  },
  "SKC-MMP-01": {
    energy_kcal: 547,
    protein_g: 2.7,
    carbs_g: 55.6,
    sugars_g: 44.4,
    added_sugar_g: 35,
    total_fat_g: 34.9,
    saturated_fat_g: 14.5,
    trans_fat_g: 0.17,
    cholesterol_mg: 20.4,
    sodium_mg: 3.6,
    measurement_basis: "per_100g",
    serving_size: "16g"
  },
  "SKC-GMM-01": {
    energy_kcal: 327.6,
    protein_g: 19.9,
    carbs_g: 54.9,
    sugars_g: 24.2,
    added_sugar_g: 0,
    total_fat_g: 3.1,
    saturated_fat_g: 1,
    trans_fat_g: 0,
    cholesterol_mg: 0,
    sodium_mg: 262.1,
    measurement_basis: "per_100g",
    serving_size: "5g"
  },
  "SKC-RHC-01": {
    energy_kcal: 397.3,
    protein_g: 9.1,
    carbs_g: 80.5,
    sugars_g: 59.7,
    added_sugar_g: 40.7,
    fibre_g: 4.5,
    total_fat_g: 4.3,
    saturated_fat_g: 0.1,
    trans_fat_g: 0,
    cholesterol_mg: 0,
    sodium_mg: 119,
    measurement_basis: "per_100g",
    serving_size: "15g"
  }
};

async function update() {
  console.log("Updating Sweet Karam Coffee Nutrition...");

  for (const [skuCode, nutrition] of Object.entries(updateData)) {
    // get sku_id
    const { data: skuData, error: skuErr } = await supabase
      .from('skus')
      .select('id')
      .eq('sku_code', skuCode)
      .single();

    if (skuErr) {
      console.error(`Error fetching SKU ${skuCode}:`, skuErr.message);
      continue;
    }

    const { error: updateErr } = await supabase
      .from('sku_nutrition')
      .update(nutrition)
      .eq('sku_id', skuData.id);

    if (updateErr) {
      console.error(`Error updating nutrition for ${skuCode}:`, updateErr.message);
    } else {
      console.log(`Successfully updated nutrition for ${skuCode}`);
    }
  }

  console.log("Update Complete!");
}

update().catch(console.error);
