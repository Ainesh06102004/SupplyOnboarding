"use client"

import React, { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Package, LayoutGrid, Box, BarChart3, HeartPulse } from 'lucide-react'
import { Textarea } from '@/components/ui/textarea'
import OnboardingLayout from '../layout/OnboardingLayout'
import FormSectionCard from '../common/FormSectionCard'
import MultiSelectChipInput from '../common/MultiSelectChipInput'
import FileUploadDropzone from '../common/FileUploadDropzone'
import SkuEntryCard from '../common/SkuEntryCard'
import VolumeSelector from '../common/VolumeSelector'
import StepActionBar from '../common/StepActionBar'
import { useOnboardingStore } from '@/store/onboardingStore'
import { PRODUCT_CATEGORIES } from '@/lib/constants/onboardingOptions'
import { validateStep2 } from '@/lib/validations/step2'

/* ────────────────────────────────────────────────
 *  Constants
 * ──────────────────────────────────────────────── */
const VOLUME_OPTIONS = [
  { value: '1-3', label: '1–3', subtitle: 'Starter' },
  { value: 'up-to-10', label: 'Up to 10', subtitle: 'Growing' },
  { value: '15+', label: '15+', subtitle: 'Scale' },
]

const EMPTY_SKU = {
  productName: '',
  nutritionLabelMethod: 'upload',
  nutritionFile: null,
  nutritionLink: '',
  ingredientLabelMethod: 'upload',
  ingredientFile: null,
  ingredientLink: '',
}

const INITIAL_FORM = {
  catalogFile: null,
  categories: [],
  skus: [{ ...EMPTY_SKU }, { ...EMPTY_SKU }, { ...EMPTY_SKU }],
  skuVolume: '',
  healthDifferentiation: '',
}

const MAX_CHARS = 600

/* ════════════════════════════════════════════════
 *  Step2ProductPortfolio
 * ════════════════════════════════════════════════ */
export default function Step2ProductPortfolio() {
  const router = useRouter()
  const { productData, updateProductData, prevStep, nextStep } = useOnboardingStore()

  const [form, setForm] = useState({ ...INITIAL_FORM, ...productData })
  const [errors, setErrors] = useState({})

  /* ── Generic field setter ─────────────── */
  const setField = useCallback((field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }))
    setErrors((prev) => {
      if (!prev[field]) return prev
      const next = { ...prev }
      delete next[field]
      return next
    })
  }, [])

  /* ── SKU field setter ─────────────────── */
  const handleSkuChange = useCallback((skuIndex, field, value) => {
    setForm((prev) => {
      const skus = [...prev.skus]
      skus[skuIndex] = { ...skus[skuIndex], [field]: value }
      return { ...prev, skus }
    })
    // Clear related error
    const errorKey = field === 'productName'
      ? `sku${skuIndex}_productName`
      : field.includes('nutrition')
        ? `sku${skuIndex}_nutritionFile`
        : `sku${skuIndex}_ingredientFile`
    setErrors((prev) => {
      if (!prev[errorKey]) return prev
      const next = { ...prev }
      delete next[errorKey]
      return next
    })
  }, [])

  /* ── Actions ──────────────────────────── */
  const handleBack = () => {
    updateProductData(form)
    prevStep()
    router.push('/onboarding/step-1')
  }

  const handleSaveDraft = async () => {
    updateProductData(form)
    const { saveDraftToSupabase } = await import('@/lib/supabase/saveDraft')
    await saveDraftToSupabase()
    // Ideally add a toast here in the future
  }

  const handleContinue = () => {
    const { isValid, errors: validationErrors } = validateStep2(form)

    if (!isValid) {
      setErrors(validationErrors)
      const firstKey = Object.keys(validationErrors)[0]
      const el = document.getElementById(`field-${firstKey}`)
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }

    updateProductData(form)
    nextStep()
    router.push('/onboarding/step-3')
  }

  /* ── Collect SKU errors per card ──────── */
  const getSkuErrors = (idx) => ({
    productName: errors[`sku${idx}_productName`],
    nutritionFile: errors[`sku${idx}_nutritionFile`],
    ingredientFile: errors[`sku${idx}_ingredientFile`],
  })

  const charCount = (form.healthDifferentiation || '').length

  /* ── Render ───────────────────────────── */
  return (
    <OnboardingLayout step={2} title="Product Portfolio" subtitle="Help us understand your product range and quality standards" saveStatus="saved">
      <main className="flex-1 overflow-y-auto px-4 md:px-8 py-8">
        <div className="max-w-[1100px] mx-auto space-y-7">

          {/* ─── Section A: Upload Product Catalog ──── */}
          <FormSectionCard
            icon={Package}
            title="Upload Product Catalog"
            description="Upload your catalog, portfolio sheet, or SKU list."
          >
            <FileUploadDropzone
              file={form.catalogFile}
              onFileSelect={(f) => setField('catalogFile', f)}
              onFileRemove={() => setField('catalogFile', null)}
              accept={{
                'text/csv': ['.csv'],
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
                'application/vnd.ms-excel': ['.xls'],
                'application/pdf': ['.pdf'],
              }}
              hint="Supported formats: CSV, XLSX, PDF · Max 10MB"
              maxSizeMB={10}
            />
          </FormSectionCard>

          {/* ─── Section B: Primary Product Categories ──── */}
          <FormSectionCard
            icon={LayoutGrid}
            title="Primary Product Categories"
            description="Select categories that best represent your portfolio."
          >
            <div id="field-categories">
              <MultiSelectChipInput
                label="Product Categories *"
                placeholder="Search categories…"
                options={PRODUCT_CATEGORIES}
                selected={form.categories}
                onChange={(vals) => setField('categories', vals)}
                maxSelections={5}
              />
              {errors.categories && <InlineError message={errors.categories} />}
            </div>
          </FormSectionCard>

          {/* ─── Section C: Top 3 Representative Products ──── */}
          <FormSectionCard
            icon={Box}
            title="Top 3 Representative Products"
            description="Share your top 3 SKUs for KOI verification."
          >
            <div className="space-y-4">
              {[0, 1, 2].map((idx) => (
                <div key={idx} id={`field-sku${idx}_productName`}>
                  <SkuEntryCard
                    index={idx}
                    data={form.skus[idx]}
                    onChange={(field, value) => handleSkuChange(idx, field, value)}
                    errors={getSkuErrors(idx)}
                    defaultOpen={idx === 0}
                  />
                </div>
              ))}
            </div>
          </FormSectionCard>

          {/* ─── Section D: Total Active SKUs ──── */}
          <FormSectionCard
            icon={BarChart3}
            title="Total Active SKUs"
            description="Estimate your initial onboarding volume."
          >
            <div id="field-skuVolume">
              <VolumeSelector
                options={VOLUME_OPTIONS}
                selected={form.skuVolume}
                onChange={(v) => setField('skuVolume', v)}
              />
              {errors.skuVolume && <InlineError message={errors.skuVolume} />}
            </div>
          </FormSectionCard>

          {/* ─── Section E: Health Differentiation ──── */}
          <FormSectionCard
            icon={HeartPulse}
            title="Health Differentiation"
            description={`The \u201cwhy this one?\u201d moment a shopper experiences \u2014 be specific about what makes your products nutritionally better.`}
          >
            <div id="field-healthDifferentiation">
              <label className="block text-[13px] font-semibold text-foreground mb-1.5 tracking-tight">
                What makes your products a healthier choice? <span className="text-danger">*</span>
              </label>
              <Textarea
                placeholder="Our products contain 24g protein per serving, zero refined sugar, and clinically studied probiotics..."
                value={form.healthDifferentiation}
                onChange={(e) => {
                  const v = e.target.value
                  if (v.length <= MAX_CHARS) setField('healthDifferentiation', v)
                }}
                className="min-h-[150px] rounded-xl border-[#E5E7EB] bg-[#FDFCFA] px-4 py-3 text-sm resize-none placeholder:text-muted/60 hover:border-[#C9C1B6] focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all duration-200"
              />
              <div className="flex items-center justify-between mt-1.5">
                {errors.healthDifferentiation ? (
                  <InlineError message={errors.healthDifferentiation} />
                ) : (
                  <span />
                )}
                <span className={cn(
                  'text-xs tabular-nums',
                  charCount > MAX_CHARS * 0.9 ? 'text-warning' : 'text-muted',
                )}>
                  {charCount}/{MAX_CHARS}
                </span>
              </div>
            </div>
          </FormSectionCard>

        </div>
      </main>

      <StepActionBar
        onBack={handleBack}
        onSaveDraft={handleSaveDraft}
        onContinue={handleContinue}
      />
    </OnboardingLayout>
  )
}

/* ── InlineError (internal) ────────────── */
function InlineError({ message }) {
  return (
    <p className="text-xs text-danger mt-1.5 flex items-center gap-1">
      <span className="inline-block w-1 h-1 rounded-full bg-danger" />
      {message}
    </p>
  )
}
