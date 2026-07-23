/**
 * KOI Onboarding - Step 2 Product Portfolio Validation
 */

/**
 * @param {Object} data – flat object with all Step 2 field values
 * @returns {{ isValid: boolean, errors: Object }}
 */
export function validateStep2(data) {
  const errors = {}

  // Categories
  if (!data.productCategories || data.productCategories.length === 0) {
    errors.productCategories = 'Select at least one product category'
  }

  // SKU entries
  for (let i = 0; i < 3; i++) {
    const sku = data.skus?.[i]
    if (!sku?.productName?.trim()) {
      errors[`sku${i}_productName`] = `Product ${i + 1} name is required`
    }

    const hasNutritionFile = sku?.nutritionLabelFile != null
    const hasNutritionLink = sku?.nutritionLabelLink?.trim()
    if (!hasNutritionFile && !hasNutritionLink) {
      errors[`sku${i}_nutritionLabel`] = `Nutrition label is required`
    }

    const hasIngredientFile = sku?.ingredientLabelFile != null
    const hasIngredientLink = sku?.ingredientLabelLink?.trim()
    if (!hasIngredientFile && !hasIngredientLink) {
      errors[`sku${i}_ingredientLabel`] = `Ingredient label is required`
    }
  }

  // Volume
  if (!data.skuVolume) {
    errors.skuVolume = 'Select your SKU volume'
  }

  // Health differentiation
  if (!data.healthDifferentiation?.trim()) {
    errors.healthDifferentiation = 'Health differentiation is required'
  } else if (data.healthDifferentiation.trim().length < 80) {
    errors.healthDifferentiation = 'Minimum 80 characters required'
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  }
}
