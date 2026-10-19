"use client"

import React, { useEffect, Suspense, useRef } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { Check, ChevronRight } from 'lucide-react'
import Step1BasicInfo from '@/components/dashboard/products/new/Step1BasicInfo'
import Step2SkuSetup from '@/components/dashboard/products/new/Step2SkuSetup'
import Step3LabelUpload from '@/components/dashboard/products/new/Step3LabelUpload'
import Step4Compliance from '@/components/dashboard/products/new/Step4Compliance'
import { useProductCreationStore } from '@/store/productCreationStore'

const STEPS = [
  { id: 1, title: 'Basic Info' },
  { id: 2, title: 'SKUs' },
  { id: 3, title: 'Labels' },
  { id: 4, title: 'Compliance' },
  { id: 5, title: 'AI Review' }
]

function AddProductWizard() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const urlStep = parseInt(searchParams.get('step')) || 1
  const isMounted = useRef(false)

  const { currentStep, setCurrentStep, resetStore } = useProductCreationStore()

  // Sync URL -> Store (Browser back/forward or direct link)
  // Only trigger when the URL changes
  useEffect(() => {
    if (urlStep >= 1 && urlStep <= 5) {
      setCurrentStep(urlStep)
    }
  }, [urlStep]) // <-- Crucial: don't depend on currentStep here

  // Sync Store -> URL (Component navigation via "Continue" buttons)
  // Only trigger when the Zustand store step changes
  useEffect(() => {
    if (!isMounted.current) {
      isMounted.current = true
      return // Skip first render to prevent default store state (1) from overwriting URL
    }

    if (currentStep !== urlStep) {
      const params = new URLSearchParams(searchParams.toString())
      params.set('step', currentStep.toString())
      router.push(`${pathname}?${params.toString()}`)
    }
  }, [currentStep]) // <-- Crucial: don't depend on urlStep here

  // Reset store when component unmounts
  useEffect(() => {
    return () => resetStore()
  }, [resetStore])

  return (
    <div className="max-w-5xl mx-auto pb-24">
      {/* Header & Stepper */}
      <div className="mb-8">
        <h2 className="text-[32px] md:text-[36px] font-display font-bold text-koi-ink tracking-tight leading-none mb-6" style={{ fontFamily: "var(--font-koi-heading)" }}>
          Add New Product
        </h2>
        
        <div className="flex items-center gap-2 overflow-x-auto pb-4 hide-scrollbar">
          {STEPS.map((step, idx) => {
            const isActive = step.id === currentStep
            const isCompleted = step.id < currentStep

            return (
              <React.Fragment key={step.id}>
                <div className={`flex items-center justify-center h-8 px-4 rounded-full text-sm font-semibold whitespace-nowrap transition-all ${
                  isActive ? 'bg-koi-forest text-white shadow-md' :
                  isCompleted ? 'bg-koi-forest/10 text-koi-forest' :
                  'bg-gray-100 text-gray-400'
                }`}>
                  {isCompleted && <Check className="w-4 h-4 mr-1.5" />}
                  {step.title}
                </div>
                {idx < STEPS.length - 1 && (
                  <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0" />
                )}
              </React.Fragment>
            )
          })}
        </div>
      </div>

      {/* Step Content Shell */}
      <div className="bg-white rounded-3xl shadow-[0_2px_10px_rgba(0,0,0,0.04)] border border-koi-track p-6 md:p-10">
        {currentStep === 1 && <Step1BasicInfo />}
        {currentStep === 2 && <Step2SkuSetup />}
        {currentStep === 3 && <Step3LabelUpload />}
        {currentStep === 4 && <Step4Compliance />}
        
        {currentStep === 5 && (
          <div className="py-20 text-center">
            <h3 className="text-2xl font-bold text-gray-900 mb-2" style={{ fontFamily: "var(--font-koi-heading)" }}>Step 5: AI Review & Submit</h3>
            <p className="text-gray-500 mb-6">This step will be implemented in the next sprint.</p>
            <div className="inline-block px-4 py-2 bg-green-50 text-green-700 rounded-lg font-medium border border-green-200">
              Compliance Evidence saved successfully!
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default function AddProductPage() {
  return (
    <Suspense fallback={<div className="p-10 text-center text-gray-500">Loading wizard...</div>}>
      <AddProductWizard />
    </Suspense>
  )
}
