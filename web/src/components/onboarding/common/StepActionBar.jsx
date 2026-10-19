"use client"

import React from 'react'
import { ArrowRight, Save } from 'lucide-react'

/**
 * StepActionBar
 *
 * The boards' action strip: a white pill docked at the bottom of the form
 * column — a line on what comes next, then Back, Save Draft and Continue
 * (forest with a lime label). Same props and handlers as before.
 */
export default function StepActionBar({
  onBack,
  onSaveDraft,
  onContinue,
  isFirstStep = false,
  isLastStep = false,
  submitLabel = 'Submit',
  isSaving = false,
  hint,
}) {
  const line = hint ?? (isLastStep ? 'Next: KOI’s review begins — AI first, then a person.' : 'Save a draft any time and pick up where you left off.')
  return (
    <div className="sticky bottom-0 z-30 w-full px-4 pb-4 pt-2 md:px-8">
      <div className="mx-auto flex max-w-[1100px] items-center justify-between gap-3 rounded-[22px] border border-koi-forest/10 bg-white/95 p-3 shadow-[0_20px_50px_-30px_rgba(8,61,45,.45)] backdrop-blur-md md:pl-5">
        <span className="hidden text-[13px] text-koi-muted md:block">{line}</span>
        <span className="flex w-full items-center justify-end gap-2 md:w-auto">
          {!isFirstStep && (
            <button
              type="button"
              onClick={onBack}
              disabled={isSaving}
              className="mr-auto flex h-12 items-center rounded-2xl border border-koi-forest/15 px-5 text-sm font-semibold text-koi-forest transition-colors hover:bg-koi-paper disabled:opacity-50 md:mr-0"
            >
              Back
            </button>
          )}
          {onSaveDraft && (
            <button
              type="button"
              onClick={onSaveDraft}
              disabled={isSaving}
              className="flex h-12 items-center gap-2 rounded-2xl border border-koi-forest/15 px-4 text-sm font-semibold text-koi-forest transition-colors hover:bg-koi-tint disabled:opacity-50"
            >
              <Save className="size-4" />
              <span className="hidden sm:inline">Save Draft</span>
            </button>
          )}
          <button
            type="button"
            onClick={onContinue}
            disabled={isSaving}
            className="flex h-12 items-center gap-2 rounded-2xl bg-koi-forest px-6 text-sm font-bold text-koi-lime transition-opacity disabled:opacity-50"
          >
            {isLastStep ? submitLabel : 'Continue'}
            <ArrowRight className="size-4" />
          </button>
        </span>
      </div>
    </div>
  )
}
