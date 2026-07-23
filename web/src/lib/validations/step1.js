/**
 * KOI Onboarding - Step 1 Brand Setup Validation
 *
 * Regex patterns and validation helpers for the Brand Setup form.
 * Kept separate from the component to stay testable and reusable.
 */

const GST_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/
const FSSAI_REGEX = /^\d{14}$/
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE_REGEX = /^[6-9]\d{9}$/

/**
 * Validate every field in the Step 1 Brand Setup form.
 *
 * @param {Object} data  – flat object with all form field values
 * @returns {Object}     – { isValid, errors } where errors is { fieldName: message }
 */
export function validateStep1(data) {
  const errors = {}

  // ── Section 1: Brand Identity ──────────────
  if (!data.brandName?.trim()) {
    errors.brandName = 'Brand name is required'
  }

  if (!data.legalEntityName?.trim()) {
    errors.legalEntityName = 'Legal entity name is required'
  }

  if (!data.salesChannels || data.salesChannels.length === 0) {
    errors.salesChannels = 'Select at least one sales channel'
  }

  if (!data.healthPositioning || data.healthPositioning.length === 0) {
    errors.healthPositioning = 'Select at least one health positioning'
  }

  // ── Section 2: Primary Contact ─────────────
  if (!data.contactName?.trim()) {
    errors.contactName = 'Contact name is required'
  }

  if (!data.designation?.trim()) {
    errors.designation = 'Designation is required'
  }

  if (!data.workEmail?.trim()) {
    errors.workEmail = 'Work email is required'
  } else if (!EMAIL_REGEX.test(data.workEmail.trim())) {
    errors.workEmail = 'Enter a valid email address'
  }

  if (!data.phone?.trim()) {
    errors.phone = 'Phone number is required'
  } else if (!PHONE_REGEX.test(data.phone.trim())) {
    errors.phone = 'Enter a valid 10-digit Indian mobile number'
  }

  // ── Section 3: Business Verification ───────
  if (!data.gstNumber?.trim()) {
    errors.gstNumber = 'GST number is required'
  } else if (!GST_REGEX.test(data.gstNumber.trim())) {
    errors.gstNumber = 'Enter a valid 15-character GST number'
  }

  if (!data.fssaiNumber?.trim()) {
    errors.fssaiNumber = 'FSSAI license number is required'
  } else if (!FSSAI_REGEX.test(data.fssaiNumber.trim())) {
    errors.fssaiNumber = 'FSSAI number must be exactly 14 digits'
  }

  if (!data.headquarters?.trim()) {
    errors.headquarters = 'Headquarters location is required'
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  }
}
