"use client"

// The five-stage pipeline from the BrandDashboard board: counts in rings along
// a rail that draws itself, and the line that says a person checks every label.

import React, { useRef } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { setupMotion, prefersReducedMotion, useGSAP, E } from '@/lib/motion/koiMotion'

const RING = {
  draft: 'border-koi-forest/20 text-koi-muted',
  submitted: 'border-koi-forest/40 text-koi-forest',
  ai_review: 'border-koi-amber text-koi-amber-ink',
  human_review: 'border-koi-forest text-koi-forest',
  approved: 'border-koi-green bg-koi-tint text-koi-primary',
}
const SUB = {
  draft: 'Not sent yet',
  submitted: 'Waiting to be read',
  ai_review: 'KOI is reading labels',
  human_review: 'A person is checking',
  approved: 'Live on KOI',
}

export default function VerificationPipeline({ pipeline, sample = false }) {
  const root = useRef(null)
  useGSAP(() => {
    if (prefersReducedMotion()) return
    const gsap = setupMotion()
    const q = (s) => root.current.querySelectorAll(s)
    gsap.from(q('[data-pipe]'), { scaleX: 0, transformOrigin: 'left center', duration: 1.1, ease: E.dolly })
    gsap.from(q('[data-stage]'), { autoAlpha: 0, y: 10, duration: 0.5, stagger: 0.08, delay: 0.2, ease: E.reveal, clearProps: 'opacity,visibility,transform' })
  }, { scope: root })

  return (
    <section ref={root} data-card aria-label="Verification Pipeline" className="flex h-full flex-col gap-4 rounded-[26px] border border-koi-forest/10 bg-white p-6">
      <span className="flex items-baseline justify-between gap-2">
        <span className="text-lg font-bold">Verification Pipeline</span>
        <span className="flex items-baseline gap-3">
          {sample && <span className="font-koi-mono text-[10px] uppercase tracking-[0.14em] text-koi-muted">Sample</span>}
          <Link href="/dashboard/verification" className="text-[13px] font-semibold text-koi-primary no-underline hover:underline">Open</Link>
        </span>
      </span>
      <div className="relative overflow-x-auto">
        <span data-pipe aria-hidden="true" className="absolute left-[10%] right-[10%] top-[22px] h-[2px] bg-koi-forest/15" />
        <ol className="relative m-0 grid min-w-[440px] list-none grid-cols-5 gap-2 p-0">
          {pipeline.map((p) => (
            <li key={p.key} data-stage className="flex flex-col items-center gap-2 text-center">
              <span className={cn('grid size-11 place-items-center rounded-full border-2 bg-white font-koi-num text-[17px] font-bold', RING[p.key])}>{p.count}</span>
              <span className="text-[13px] font-bold leading-tight">{p.stage}</span>
              {SUB[p.key] && <span className="text-[11.5px] leading-snug text-koi-muted">{SUB[p.key]}</span>}
            </li>
          ))}
        </ol>
      </div>
      <p className="m-0 mt-auto rounded-2xl bg-koi-paper px-4 py-3 text-[13px] leading-normal text-koi-ink2">Nothing is published from the model alone: a KOI reviewer confirms every ingredient list and allergen before screening.</p>
    </section>
  )
}
