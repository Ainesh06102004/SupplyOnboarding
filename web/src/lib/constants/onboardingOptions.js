/**
 * KOI Onboarding - Static Option Sets
 *
 * Central source of truth for every multi-select, dropdown, and chip input
 * used across the brand onboarding wizard.
 *
 * Taxonomy separation:
 *   SALES_CHANNELS              → Where the brand currently sells (Step 1)
 *   PRODUCT_CATEGORIES          → What the product IS (shelf category, Step 2)
 *   HEALTH_POSITIONING_OPTIONS  → What health CLAIM it makes (Step 1)
 *
 * Naming convention:
 *   value  → stored in Supabase / sent to APIs (snake_case)
 *   label  → displayed to the user (Title Case)
 */

export const SALES_CHANNELS = [
  { value: "d2c_website", label: "D2C Website" },
  { value: "amazon", label: "Amazon" },
  { value: "flipkart", label: "Flipkart" },
  { value: "quick_commerce", label: "Quick Commerce" },
  { value: "modern_retail", label: "Modern Retail" },
  { value: "offline_retail", label: "Offline Retail" },
  { value: "gyms_clinics", label: "Gyms / Clinics" },
  { value: "b2b_distribution", label: "B2B Distribution" },
  { value: "export_markets", label: "Export Markets" },
  { value: "other", label: "Other" },
]

export const PRODUCT_CATEGORIES = [
  { value: "dairy", label: "Dairy" },
  { value: "snacks", label: "Snacks" },
  { value: "beverages", label: "Beverages" },
  { value: "supplements", label: "Supplements" },
  { value: "functional_foods", label: "Functional Foods" },
  { value: "breakfast", label: "Breakfast" },
  { value: "bakery", label: "Bakery" },
  { value: "ready_to_eat", label: "Ready-to-Eat" },
  { value: "frozen", label: "Frozen" },
  { value: "kids_nutrition", label: "Kids Nutrition" },
  { value: "condiments", label: "Condiments" },
  { value: "plant_based", label: "Plant-Based" },
]

export const HEALTH_POSITIONING_OPTIONS = [
  { value: "high_protein", label: "High Protein" },
  { value: "high_fibre", label: "High Fibre" },
  { value: "gut_friendly", label: "Gut Friendly" },
  { value: "low_sugar", label: "Low Sugar" },
  { value: "clean_label", label: "Clean Label" },
  { value: "keto_friendly", label: "Keto Friendly" },
  { value: "vegan", label: "Vegan" },
  { value: "gluten_free", label: "Gluten Free" },
  { value: "organic", label: "Organic" },
  { value: "probiotic", label: "Probiotic" },
  { value: "low_gi", label: "Low GI" },
  { value: "sports_nutrition", label: "Sports Nutrition" },
]
