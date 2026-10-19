"use client"

// "Trust Metrics" from the BrandDashboard board: a forest card, lime bars that
// fill once on arrival. `sample` marks mock-backed figures.

import React, { useRef } from 'react'
import { setupMotion, prefersReducedMotion, useGSAP, E } from '@/lib/motion/koiMotion'

export default function TrustMetricsCard({ metrics, sample = false }) {
  const root = useRef(null)
  useGSAP(() => {
    const gsap = setupMotion()
    root.current.querySelectorAll('[data-metric]').forEach((bar, i) => {
      gsap.to(bar, { width: `${bar.dataset.score}%`, duration: prefersReducedMotion() ? 0 : 1.1, delay: prefersReducedMotion() ? 0 : 0.1 * i, ease: E.dolly })
    })
  }, { scope: root, dependencies: [metrics] })

  return (
    <section ref={root} data-card aria-label="Trust Metrics" className="flex h-full flex-col gap-4 rounded-[26px] bg-koi-forest p-6 text-koi-bg">
      <span className="text-lg font-bold">Trust Metrics</span>
      {metrics.map((m) => (
        <div key={m.label} className="flex flex-col gap-1.5">
          <span className="flex justify-between text-[13.5px]"><span>{m.label}</span><span className="font-koi-num font-semibold">{m.score}%</span></span>
          <span className="h-[7px] overflow-hidden rounded-full bg-koi-bg/15">
            <span data-metric data-score={m.score} className={`block h-full w-0 rounded-full ${m.score < 80 ? 'bg-koi-ember' : 'bg-koi-lime'}`} />
          </span>
        </div>
      ))}
      {sample && <span className="mt-auto font-koi-mono text-[10px] uppercase tracking-[0.14em] text-koi-bg/50">Sample figures</span>}
    </section>
  )
}
