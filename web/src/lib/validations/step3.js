/**
 * KOI Onboarding - Step 3 Compliance & Certifications Validation
 */

/**
 * @param {Object} data – flat object with all Step 3 field values
 * @returns {{ isValid: boolean, errors: Object }}
 */
export function validateStep3(data) {
  const errors = {}

  // FSSAI certificate - required
  if (!data.fssaiFiles || data.fssaiFiles.length === 0) {
    errors.fssaiFiles = 'FSSAI certificate is required'
  }

  // Organic certifications - optional (no validation)

  // Scientific evidence - optional (no validation)

  // Claims summary - optional but enforce max length if provided
  if (data.claimsSummary && data.claimsSummary.length > 500) {
    errors.claimsSummary = 'Maximum 500 characters allowed'
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  }
}
