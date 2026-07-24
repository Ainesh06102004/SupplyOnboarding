"use client"

import React, { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { ShieldCheck } from 'lucide-react'
import { Textarea } from '@/components/ui/textarea'
import OnboardingLayout from '../layout/OnboardingLayout'
import InfoBanner from '../common/InfoBanner'
import DocumentUploadCard from '../common/DocumentUploadCard'
import StepActionBar from '../common/StepActionBar'
import { useOnboardingStore } from '@/store/onboardingStore'
import { validateStep3 } from '@/lib/validations/step3'
import { submitOnboarding } from '@/lib/supabase/submitOnboarding'

/* ────────────────────────────────────────────────
 *  Constants
 * ──────────────────────────────────────────────── */
const MAX_CLAIMS_CHARS = 500
const CLAIMS_WARN_THRESHOLD = 400
const CLAIMS_DANGER_THRESHOLD = 480

const TEXTAREA_CLASS =
  'min-h-[180px] rounded-xl border-[#E5E7EB] bg-[#FDFCFA] px-4 py-3 text-sm resize-none placeholder:text-muted/60 hover:border-[#C9C1B6] focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all duration-200'

const INITIAL_FORM = {
  fssaiFile: null,
  organicFiles: [],
  scientificEvidenceFiles: [],
  scientificEvidenceLinks: [],
  claimsSummary: '',
}

/* ════════════════════════════════════════════════
 *  Step3Compliance
 * ════════════════════════════════════════════════ */
export default function Step3Compliance() {
  const router = useRouter()
  const { brandData, productData, complianceData, updateComplianceData, setSaving, isSaving } = useOnboardingStore()

  const [form, setForm] = useState({ ...INITIAL_FORM, ...complianceData })
  const [errors, setErrors] = useState({})
  const [touched, setTouched] = useState(false)
  const [submitError, setSubmitError] = useState(null)

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

  /* ── Actions ──────────────────────────── */
  const handleBack = () => {
    updateComplianceData(form)
    router.push('/onboarding/step-2')
  }

  const handleSaveDraft = async () => {
    updateComplianceData(form)
    const { saveDraftToSupabase } = await import('@/lib/supabase/saveDraft')
    setSaving(true)
    await saveDraftToSupabase()
    setSaving(false)
  }

  const handleSubmit = async () => {
    setTouched(true)
    setSubmitError(null)
    const { isValid, errors: validationErrors } = validateStep3(form)

    if (!isValid) {
      setErrors(validationErrors)
      const firstKey = Object.keys(validationErrors)[0]
      const el = document.getElementById(`field-${firstKey}`)
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }

    // Persist to store
    updateComplianceData(form)
    setSaving(true)

    // Submit to Supabase
    const { success, error } = await submitOnboarding({
      brandData,
      productData,
      complianceData: form,
    })

    setSaving(false)

    if (!success) {
      setSubmitError(error || 'Submission failed. Please try again.')
      return
    }

    // Navigate to success page
    router.push('/onboarding/success')
  }

  /* ── Derived values ──────────────────── */
  const charCount = (form.claimsSummary || '').length
  const counterColor =
    charCount > CLAIMS_DANGER_THRESHOLD
      ? 'text-danger'
      : charCount > CLAIMS_WARN_THRESHOLD
        ? 'text-warning'
        : 'text-muted'

  /* ── Render ───────────────────────────── */
  return (
    <OnboardingLayout step={3} title="Compliance & Certifications" subtitle="Help us verify regulatory compliance and scientific backing to build consumer trust." saveStatus="saved">
      <main className="flex-1 overflow-y-auto px-4 md:px-8 py-8">
        <div className="max-w-[1100px] mx-auto space-y-7">

          {/* ─── Info Banner ─────────────────── */}
          <InfoBanner
            icon={ShieldCheck}
            title="Trust Through Transparency"
            description="KOI verifies regulatory and scientific evidence to ensure consumer trust. Strong documentation improves approval confidence."
          />

          {/* ─── FSSAI Certificate ───────────── */}
          <div id="field-fssaiFile">
            <DocumentUploadCard
              title="FSSAI Certificate"
              description="Upload your current Food Safety and Standards Authority of India license."
              required
              allowMultiple={false}
              acceptedFormats={['application/pdf', 'image/jpeg', 'image/png']}
              uploadMode="file"
              maxSizeMB={10}
              files={form.fssaiFile ? [form.fssaiFile] : []}
              onFilesChange={(f) => setField('fssaiFile', f[0] || null)}
              links={[]}
              onLinksChange={() => {}}
              error={touched ? errors.fssaiFile : undefined}
            />
          </div>

          {/* ─── Organic & Quality Certifications ── */}
          <div id="field-organicFiles">
            <DocumentUploadCard
              title="Organic & Quality Certifications"
              description="Upload certifications such as USDA Organic, Non-GMO, GMP, ISO."
              required={false}
              allowMultiple
              acceptedFormats={['application/pdf', 'image/jpeg', 'image/png']}
              uploadMode="file"
              maxSizeMB={10}
              files={form.organicFiles}
              onFilesChange={(f) => setField('organicFiles', f)}
              links={[]}
              onLinksChange={() => {}}
              error={errors.organicFiles}
            />
          </div>

          {/* ─── Scientific Evidence & Research ── */}
          <div id="field-scientificEvidenceFiles">
            <DocumentUploadCard
              title="Scientific Evidence & Research"
              description="Provide clinical trials or research papers backing your formulations."
              required={false}
              allowMultiple
              acceptedFormats={['application/pdf']}
              uploadMode="file_or_link"
              maxSizeMB={10}
              files={form.scientificEvidenceFiles}
              onFilesChange={(f) => setField('scientificEvidenceFiles', f)}
              links={form.scientificEvidenceLinks}
              onLinksChange={(l) => setField('scientificEvidenceLinks', l)}
              error={errors.scientificEvidenceFiles}
            />
          </div>

          {/* ─── Claims Summary ──────────────── */}
          <ClaimsSummarySection
            value={form.claimsSummary}
            charCount={charCount}
            maxChars={MAX_CLAIMS_CHARS}
            counterColor={counterColor}
            error={errors.claimsSummary}
            onChange={(v) => {
              if (v.length <= MAX_CLAIMS_CHARS) setField('claimsSummary', v)
            }}
          />

          {/* ─── Submit error ────────────────── */}
          {submitError && (
            <div className="bg-danger/10 border border-danger/30 rounded-xl px-5 py-3 text-sm text-danger">
              {submitError}
            </div>
          )}

        </div>
      </main>

      <StepActionBar
        onBack={handleBack}
        onSaveDraft={handleSaveDraft}
        onContinue={handleSubmit}
        isLastStep
        submitLabel="Submit for Review"
        isSaving={isSaving}
      />
    </OnboardingLayout>
  )
}

/* ────────────────────────────────────────────────
 *  Claims Summary section (internal)
 * ──────────────────────────────────────────────── */
function ClaimsSummarySection({ value, charCount, maxChars, counterColor, error, onChange }) {
  return (
    <section
      className="bg-card border border-[#E5E7EB] px-7 pt-6 pb-7 md:px-8 md:pt-7 md:pb-8 rounded-[20px]"
      style={{ boxShadow: '0 4px 20px rgba(0,0,0,0.03)' }}
    >
      <div className="flex items-start gap-3.5 mb-5">
        <div className="w-10 h-10 rounded-xl bg-primary/8 text-primary flex items-center justify-center shrink-0">
          <ShieldCheck className="w-[18px] h-[18px]" strokeWidth={2} />
        </div>
        <div className="pt-0.5">
          <h2 className="text-[17px] font-display font-bold text-foreground tracking-tight leading-tight">
            Claims Summary
          </h2>
          <p className="text-[13px] text-muted mt-0.5 leading-relaxed">
            Briefly summarize the primary health claims made by your products.
          </p>
        </div>
      </div>

      <div id="field-claimsSummary">
        <Textarea
          placeholder={`Example:\n• 24g protein per serving\n• Zero added sugar\n• Clinically studied probiotic blend`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={TEXTAREA_CLASS}
        />
        <div className="flex items-center justify-between mt-1.5">
          {error ? (
            <p className="text-xs text-danger flex items-center gap-1">
              <span className="inline-block w-1 h-1 rounded-full bg-danger" />
              {error}
            </p>
          ) : (
            <span />
          )}
          <span className={cn('text-xs tabular-nums', counterColor)}>
            {charCount} / {maxChars}
          </span>
        </div>
      </div>
    </section>
  )
}
