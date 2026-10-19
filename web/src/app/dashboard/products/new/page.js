"use client"

// Brand portal — add a product (BrandAddProduct board). The numbered stepper
// fills in forest as you go (done steps are buttons back), each step sits in
// one white panel, and step 5 is the real Step5AIReview: it marks the product
// as waiting for KOI's label read and submits it — no instant verdict, because
// a person checks every label first. The URL <-> store step sync is unchanged.

import React, { useEffect, Suspense, useRef } from 'react'
import Link from 'next/link'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { Check } from 'lucide-react'
import Step1BasicInfo from '@/components/dashboard/products/new/Step1BasicInfo'
import Step2SkuSetup from '@/components/dashboard/products/new/Step2SkuSetup'
import Step3LabelUpload from '@/components/dashboard/products/new/Step3LabelUpload'
import Step4Compliance from '@/components/dashboard/products/new/Step4Compliance'
import Step5AIReview from '@/components/dashboard/products/new/Step5AIReview'
import { useProductCreationStore } from '@/store/productCreationStore'
import { setupMotion, prefersReducedMotion, useGSAP, E } from '@/lib/motion/koiMotion'

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
  const root = useRef(null)

  const { currentStep, setCurrentStep, resetStore, productId } = useProductCreationStore()

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

  useGSAP(() => {
    if (prefersReducedMotion()) return
    const gsap = setupMotion()
    const q = (s) => root.current.querySelectorAll(s)
    gsap.from(q('[data-line]'), { yPercent: 115, duration: 1, ease: E.reveal })
    gsap.from(q('[data-rise]'), { autoAlpha: 0, y: 12, duration: 0.6, delay: 0.1, ease: E.reveal, clearProps: 'opacity,visibility,transform' })
  }, { scope: root })

  // The fill follows the step; the panel's contents slide in on each change.
  useGSAP(() => {
    const gsap = setupMotion()
    const q = (s) => root.current.querySelectorAll(s)
    const reduced = prefersReducedMotion()
    gsap.to(q('[data-stepfill]'), { scaleX: (currentStep - 1) / (STEPS.length - 1), duration: reduced ? 0 : 0.8, ease: E.dolly })
    if (!reduced) gsap.from(q('[data-panel] > *'), { autoAlpha: 0, y: 18, duration: 0.55, ease: E.reveal, clearProps: 'opacity,visibility,transform' })
  }, { scope: root, dependencies: [currentStep] })

  return (
    <div ref={root} className="mx-auto flex max-w-5xl flex-col gap-6 pb-24">
      <section className="flex flex-col gap-2">
        <span data-rise className="font-koi-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-koi-muted"><Link href="/dashboard/products" className="text-koi-muted no-underline hover:text-koi-forest">Products</Link> / New</span>
        <h1 className="koi-condensed m-0 font-koi-display text-[clamp(40px,4vw,60px)] font-extrabold leading-none tracking-[-0.03em] text-koi-forest">
          <span className="-mb-[0.06em] block overflow-hidden pb-[0.06em]"><span data-line className="block">Add New Product</span></span>
        </h1>
      </section>

      <nav aria-label="Steps" className="relative overflow-x-auto">
        <div className="relative min-w-[460px]">
          <span aria-hidden="true" className="absolute left-[10%] right-[10%] top-[21px] h-[2px] bg-koi-forest/15" />
          <span data-stepfill aria-hidden="true" className="absolute left-[10%] top-[21px] h-[2px] w-[80%] origin-left scale-x-0 bg-koi-forest" />
          <ol className="relative m-0 grid list-none grid-cols-5 p-0">
            {STEPS.map((step) => {
              const isActive = step.id === currentStep
              const isCompleted = step.id < currentStep
              const ring = isActive
                ? 'border-koi-forest bg-koi-forest text-koi-lime'
                : isCompleted
                  ? 'border-koi-forest bg-white text-koi-forest'
                  : 'border-koi-forest/20 bg-white text-koi-muted'
              return (
                <li key={step.id} className="flex justify-center">
                  <button
                    type="button"
                    disabled={!isCompleted}
                    onClick={() => setCurrentStep(step.id)}
                    aria-current={isActive ? 'step' : undefined}
                    className="flex flex-col items-center gap-2 disabled:cursor-default"
                  >
                    <span className={`grid size-11 place-items-center rounded-full border-2 font-koi-num text-[15px] font-bold transition-colors ${ring}`}>
                      {isCompleted ? <Check className="size-4" strokeWidth={3} /> : step.id}
                    </span>
                    <span className={`text-[13px] font-bold ${isActive ? 'text-koi-forest' : isCompleted ? 'text-koi-ink' : 'text-koi-muted'}`}>{step.title}</span>
                  </button>
                </li>
              )
            })}
          </ol>
        </div>
      </nav>

      <section data-panel className="flex flex-col gap-5 rounded-[28px] border border-koi-forest/10 bg-white p-5 md:p-8">
        {currentStep === 1 && <Step1BasicInfo />}
        {currentStep === 2 && <Step2SkuSetup />}
        {currentStep === 3 && <Step3LabelUpload />}
        {currentStep === 4 && <Step4Compliance />}
        {currentStep === 5 && (
          <Step5AIReview
            productId={productId}
            onBack={() => setCurrentStep(3)}
            onComplete={() => router.push('/dashboard/verification')}
          />
        )}
      </section>
    </div>
  )
}

export default function AddProductPage() {
  return (
    <Suspense fallback={<div role="status" className="p-10 text-center text-koi-muted">Loading wizard…</div>}>
      <AddProductWizard />
    </Suspense>
  )
}
