import { createClient } from '@supabase/supabase-js';

// Setup Supabase Client
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function updateNutrition() {
  console.log("Updating Mama Nourish nutrition values...");

  const updates = [
    {
      sku_code: "MN-CHIVDA-01",
      nutrition: {
        energy_kcal: 139,
        protein_g: 2.5,
        carbs_g: 16.6,
        sugars_g: 1.3,
        added_sugar_g: 1,
        fibre_g: 0.4,
        total_fat_g: 7.9,
        saturated_fat_g: 1.3,
        trans_fat_g: 0,
        cholesterol_mg: 0,
        sodium_mg: 240,
        measurement_basis: "per_serving",
        serving_size: "30g"
      }
    },
    {
      sku_code: "MN-LADDUBAR-01",
      nutrition: {
        energy_kcal: 147,
        protein_g: 4.1,
        carbs_g: 19.2,
        sugars_g: 12.2,
        added_sugar_g: 0,
        fibre_g: 2.5,
        total_fat_g: 7.0,
        saturated_fat_g: 1.5,
        trans_fat_g: 0,
        cholesterol_mg: 0,
        sodium_mg: 2.8,
        measurement_basis: "per_serving",
        serving_size: "35g"
      }
    }
  ];

  for (const u of updates) {
    const { data: sku } = await supabase.from('skus').select('id').eq('sku_code', u.sku_code).single();
    if (sku) {
      await supabase.from('sku_nutrition').update(u.nutrition).eq('sku_id', sku.id);
      console.log(`Updated ${u.sku_code}`);
    }
  }

  console.log("Done!");
}

updateNutrition();
