"use client"

// A KPI tile from the BrandDashboard board: a mono label, a big Space Grotesk
// figure that counts up once, and a tone — white, tint (good), amber (waiting),
// forest (the headline), red (risk). `sample` marks mock-backed figures.

import React, { useRef } from 'react'
import { cn } from '@/lib/utils'
import { setupMotion, prefersReducedMotion, useGSAP } from '@/lib/motion/koiMotion'

const TONE = {
  neutral: { card: 'border border-koi-forest/10 bg-white', label: 'text-koi-muted', value: 'text-koi-ink', sub: 'text-koi-muted' },
  success: { card: 'border border-koi-tint-border bg-koi-tint', label: 'text-koi-primary', value: 'text-koi-forest', sub: 'text-koi-primary/70' },
  warning: { card: 'border border-koi-amber-border bg-koi-amber-bg', label: 'text-koi-amber-ink', value: 'text-koi-amber-ink', sub: 'text-koi-amber-ink/70' },
  special: { card: 'bg-koi-forest text-koi-bg', label: 'text-koi-lime', value: 'text-koi-bg', sub: 'text-koi-bg/60' },
  danger: { card: 'border border-koi-red/20 bg-koi-red-bg', label: 'text-koi-red', value: 'text-koi-red', sub: 'text-koi-red/70' },
}

export default function StatsCard({ icon: Icon, value, label, styleType = 'neutral', suffix, sample = false, className }) {
  const t = TONE[styleType] ?? TONE.neutral
  const num = useRef(null)
  const numeric = typeof value === 'number' && Number.isFinite(value)

  useGSAP(() => {
    if (!numeric || !num.current || prefersReducedMotion()) return
    const gsap = setupMotion()
    const o = { v: 0 }
    gsap.to(o, { v: value, duration: 1.1, ease: 'power3.out', onUpdate: () => { if (num.current) num.current.textContent = String(Math.round(o.v)) } })
  }, { dependencies: [value] })

  return (
    <article data-kpi className={cn('flex flex-col gap-3 rounded-[24px] p-5', t.card, className)}>
      <span className="flex items-center justify-between gap-2">
        <span className={cn('font-koi-mono text-[10.5px] font-semibold uppercase tracking-[0.14em]', t.label)}>{label}</span>
        {Icon && <Icon aria-hidden="true" className={cn('size-4 shrink-0', t.label)} />}
      </span>
      <span className={cn('font-koi-num text-[44px] font-semibold leading-none', t.value)}>
        <span ref={num}>{value ?? '—'}</span>
        {suffix && <span className={cn('ml-1 text-lg font-medium', t.sub)}>{suffix}</span>}
      </span>
      {sample && <span className={cn('font-koi-mono text-[9.5px] uppercase tracking-[0.14em]', t.sub)}>Sample figure</span>}
    </article>
  )
}
