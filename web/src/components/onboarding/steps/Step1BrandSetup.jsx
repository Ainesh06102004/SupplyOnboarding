"use client"

import React, { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Building2, User, ShieldCheck } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import ProgressHeader from '../common/ProgressHeader'
import FormSectionCard from '../common/FormSectionCard'
import MultiSelectChipInput from '../common/MultiSelectChipInput'
import StepActionBar from '../common/StepActionBar'
import { useOnboardingStore } from '@/store/onboardingStore'
import { SALES_CHANNELS, HEALTH_POSITIONING_OPTIONS } from '@/lib/constants/onboardingOptions'
import { validateStep1 } from '@/lib/validations/step1'

/* ────────────────────────────────────────────────
 *  Shared input class - premium KOI styling
 * ──────────────────────────────────────────────── */
const INPUT_CLASS =
  'h-12 rounded-xl border-[#E5E7EB] bg-[#FDFCFA] px-4 text-sm placeholder:text-muted/60 hover:border-[#C9C1B6] focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all duration-200'

const TEXTAREA_CLASS =
  'min-h-[140px] rounded-xl border-[#E5E7EB] bg-[#FDFCFA] px-4 py-3 text-sm resize-none placeholder:text-muted/60 hover:border-[#C9C1B6] focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all duration-200'

/* ────────────────────────────────────────────────
 *  Initial form shape
 * ──────────────────────────────────────────────── */
const INITIAL_FORM = {
  brandName: '',
  legalEntityName: '',
  website: '',
  salesChannels: [],
  healthPositioning: [],
  brandDescription: '',
  contactName: '',
  designation: '',
  workEmail: '',
  phoneNumber: '',
  gstNumber: '',
  fssaiNumber: '',
  hqLocation: '',
}

/* ════════════════════════════════════════════════
 *  Step1BrandSetup
 * ════════════════════════════════════════════════ */
export default function Step1BrandSetup() {
  const router = useRouter()
  const { brandData, updateBrandData, prevStep } = useOnboardingStore()

  const [form, setForm] = useState({ ...INITIAL_FORM, ...brandData })
  const [errors, setErrors] = useState({})

  /* ── Field helpers ────────────────────────── */
  const handleChange = useCallback((field) => (e) => {
    const value = e?.target ? e.target.value : e
    setForm((prev) => ({ ...prev, [field]: value }))
    setErrors((prev) => {
      if (!prev[field]) return prev
      const next = { ...prev }
      delete next[field]
      return next
    })
  }, [])

  const handleMultiSelect = useCallback((field) => (values) => {
    setForm((prev) => ({ ...prev, [field]: values }))
    setErrors((prev) => {
      if (!prev[field]) return prev
      const next = { ...prev }
      delete next[field]
      return next
    })
  }, [])

  /* ── Actions ──────────────────────────────── */
  const handleBack = () => {
    updateBrandData(form)
    prevStep()
    router.push('/onboarding')
  }

  const handleSaveDraft = async () => {
    updateBrandData(form)
    const { saveDraftToSupabase } = await import('@/lib/supabase/saveDraft')
    await saveDraftToSupabase()
    // Ideally add a toast here in the future
  }

  const handleContinue = () => {
    const { isValid, errors: validationErrors } = validateStep1(form)

    if (!isValid) {
      setErrors(validationErrors)
      const firstErrorKey = Object.keys(validationErrors)[0]
      const el = document.getElementById(`field-${firstErrorKey}`)
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }

    updateBrandData(form)
    router.push('/onboarding/step-2')
  }

  /* ── Render ───────────────────────────────── */
  return (
    <div className="flex flex-col min-h-screen bg-background">
      <ProgressHeader
        step={1}
        totalSteps={4}
        title="Brand Setup"
        subtitle="Tell us about your brand and business"
        saveStatus="saved"
      />

      <main className="flex-1 overflow-y-auto px-4 md:px-8 py-8">
        <div className="max-w-[1100px] mx-auto space-y-7">

          {/* ─── Section 1: Brand Identity ──── */}
          <FormSectionCard
            icon={Building2}
            title="Brand Identity"
            description="Basic details about your brand and product range"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5">
              <FieldWrapper id="brandName" label="Brand Name" required error={errors.brandName}>
                <Input
                  id="field-brandName"
                  placeholder="e.g. TrueNut"
                  value={form.brandName}
                  onChange={handleChange('brandName')}
                  className={INPUT_CLASS}
                />
              </FieldWrapper>

              <FieldWrapper id="legalEntityName" label="Legal Entity Name" required error={errors.legalEntityName}>
                <Input
                  id="field-legalEntityName"
                  placeholder="e.g. TrueNut Foods Pvt Ltd"
                  value={form.legalEntityName}
                  onChange={handleChange('legalEntityName')}
                  className={INPUT_CLASS}
                />
              </FieldWrapper>

              <FieldWrapper id="website" label="Website">
                <Input
                  id="field-website"
                  placeholder="https://truenut.in"
                  value={form.website}
                  onChange={handleChange('website')}
                  className={INPUT_CLASS}
                />
              </FieldWrapper>

              <div className="hidden md:block" />

              <div id="field-salesChannels" className="md:col-span-2">
                <MultiSelectChipInput
                  label="Current Sales Channels *"
                  placeholder="Search channels…"
                  options={SALES_CHANNELS}
                  selected={form.salesChannels}
                  onChange={handleMultiSelect('salesChannels')}
                  maxSelections={10}
                />
                {errors.salesChannels && <InlineError message={errors.salesChannels} />}
              </div>

              <div id="field-healthPositioning" className="md:col-span-2">
                <MultiSelectChipInput
                  label="Health Positioning"
                  placeholder="Search health claims…"
                  options={HEALTH_POSITIONING_OPTIONS}
                  selected={form.healthPositioning}
                  onChange={handleMultiSelect('healthPositioning')}
                  maxSelections={5}
                />
                {errors.healthPositioning && <InlineError message={errors.healthPositioning} />}
              </div>

              <div className="md:col-span-2">
                <FieldWrapper id="brandDescription" label="Brand Description">
                  <Textarea
                    id="field-brandDescription"
                    placeholder="Tell us what makes your brand unique, your mission, and the problem you solve for consumers…"
                    value={form.brandDescription}
                    onChange={handleChange('brandDescription')}
                    className={TEXTAREA_CLASS}
                  />
                </FieldWrapper>
              </div>
            </div>
          </FormSectionCard>

          {/* ─── Section 2: Primary Contact ──── */}
          <FormSectionCard
            icon={User}
            title="Primary Contact"
            description="Who should KOI reach out to for onboarding queries?"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5">
              <FieldWrapper id="contactName" label="Full Name" required error={errors.contactName}>
                <Input
                  id="field-contactName"
                  placeholder="e.g. Priya Sharma"
                  value={form.contactName}
                  onChange={handleChange('contactName')}
                  className={INPUT_CLASS}
                />
              </FieldWrapper>

              <FieldWrapper id="designation" label="Designation" required error={errors.designation}>
                <Input
                  id="field-designation"
                  placeholder="e.g. Head of Partnerships"
                  value={form.designation}
                  onChange={handleChange('designation')}
                  className={INPUT_CLASS}
                />
              </FieldWrapper>

              <FieldWrapper id="workEmail" label="Work Email" required error={errors.workEmail}>
                <Input
                  id="field-workEmail"
                  type="email"
                  placeholder="e.g. priya@truenut.in"
                  value={form.workEmail}
                  onChange={handleChange('workEmail')}
                  className={INPUT_CLASS}
                />
              </FieldWrapper>

              <FieldWrapper id="phoneNumber" label="Phone Number" required error={errors.phoneNumber}>
                <Input
                  id="field-phoneNumber"
                  type="tel"
                  placeholder="e.g. 9876543210"
                  value={form.phoneNumber}
                  onChange={handleChange('phoneNumber')}
                  className={INPUT_CLASS}
                />
              </FieldWrapper>
            </div>
          </FormSectionCard>

          {/* ─── Section 3: Business Verification ──── */}
          <FormSectionCard
            icon={ShieldCheck}
            title="Business Verification"
            description="Official registration numbers for compliance checks"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5">
              <FieldWrapper id="gstNumber" label="GST Number" required error={errors.gstNumber}>
                <Input
                  id="field-gstNumber"
                  placeholder="e.g. 27AADCB2230M1Z3"
                  value={form.gstNumber}
                  onChange={handleChange('gstNumber')}
                  className={INPUT_CLASS + ' uppercase'}
                />
              </FieldWrapper>

              <FieldWrapper id="fssaiNumber" label="FSSAI License Number" required error={errors.fssaiNumber}>
                <Input
                  id="field-fssaiNumber"
                  placeholder="e.g. 10014021000123"
                  value={form.fssaiNumber}
                  onChange={handleChange('fssaiNumber')}
                  className={INPUT_CLASS}
                />
              </FieldWrapper>

              <FieldWrapper id="hqLocation" label="Headquarters Location" required error={errors.hqLocation}>
                <Input
                  id="field-hqLocation"
                  placeholder="e.g. Mumbai, Maharashtra"
                  value={form.hqLocation}
                  onChange={handleChange('hqLocation')}
                  className={INPUT_CLASS}
                />
              </FieldWrapper>
            </div>
          </FormSectionCard>

        </div>
      </main>

      <StepActionBar
        onBack={handleBack}
        onSaveDraft={handleSaveDraft}
        onContinue={handleContinue}
        isFirstStep={false}
      />
    </div>
  )
}


/* ────────────────────────────────────────────────
 *  FieldWrapper - label + error display (internal)
 * ──────────────────────────────────────────────── */
function FieldWrapper({ id, label, required, error, children }) {
  return (
    <div>
      <Label htmlFor={`field-${id}`} className="block text-[13px] font-semibold text-foreground mb-1.5 tracking-tight">
        {label}
        {required && <span className="text-danger ml-0.5">*</span>}
      </Label>
      {children}
      {error && <InlineError message={error} />}
    </div>
  )
}

/* ────────────────────────────────────────────────
 *  InlineError - validation error text (internal)
 * ──────────────────────────────────────────────── */
function InlineError({ message }) {
  return (
    <p className="text-xs text-danger mt-1.5 flex items-center gap-1">
      <span className="inline-block w-1 h-1 rounded-full bg-danger" />
      {message}
    </p>
  )
}
