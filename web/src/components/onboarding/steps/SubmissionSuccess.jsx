"use client"

// ============================================================================
// KOI for brands — application received (cinematic storefront, Oct 2026)
//
// The BrandSubmitted board: one white sheet; the check draws itself, the title
// rises in the display cut, and the four-stage timeline shows where the
// application is — submitted, then KOI's AI read (the ember dot sits on it),
// then a person's review, then approval. Home and support work as before.
// ============================================================================

import { useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Check, UserCheck, Rocket, Clock, ArrowLeft } from 'lucide-react'
import { useOnboardingStore } from '@/store/onboardingStore'
import { setupMotion, prefersReducedMotion, useGSAP, E } from '@/lib/motion/koiMotion'

const TIMELINE = [
  { title: 'Submitted', state: 'done', text: 'Your onboarding details have been securely submitted.' },
  { title: 'AI verification in progress', state: 'active', text: 'Our engine is reviewing your brand, certifications and product claims for completeness and compliance.' },
  { title: 'Expert review', state: 'pending', icon: UserCheck, text: "KOI's health and compliance team assesses your submission for quality, trust and marketplace fit." },
  { title: 'Approval & go live', state: 'pending', icon: Rocket, text: "If approved, we'll reach out with onboarding confirmation and dashboard access." },
]

export default function SubmissionSuccess() {
  const router = useRouter()
  const brandName = useOnboardingStore((s) => s.brandData?.brandName?.trim())
  const root = useRef(null)

  useGSAP(() => {
    if (prefersReducedMotion()) return
    const gsap = setupMotion()
    const q = (s) => root.current.querySelectorAll(s)
    const tl = gsap.timeline({ defaults: { ease: E.reveal } })
    tl.from(q('[data-card]'), { autoAlpha: 0, y: 50, duration: 1, ease: E.dolly, clearProps: 'opacity,visibility,transform' }, 0)
    tl.from(q('[data-ring]'), { drawSVG: '0%', duration: 0.9 }, 0.35)
    tl.from(q('[data-tick]'), { drawSVG: '0%', duration: 0.45 }, 1.05)
    tl.from(q('[data-line]'), { yPercent: 115, duration: 1 }, 0.5)
    tl.from(q('[data-rise]'), { autoAlpha: 0, y: 14, duration: 0.6, stagger: 0.08, clearProps: 'opacity,visibility,transform' }, 0.7)
    tl.from(q('[data-step]'), { autoAlpha: 0, x: -14, duration: 0.55, stagger: 0.1, clearProps: 'opacity,visibility,transform' }, 0.9)
    tl.fromTo(q('[data-mslot]'), { scale: 0 }, { scale: 1, duration: 0.5, ease: 'back.out(2.4)' }, 1.4)
    tl.to(q('[data-mslot]'), { scale: 1.35, duration: 0.9, repeat: -1, yoyo: true, ease: 'sine.inOut' })
  }, { scope: root })

  return (
    <main ref={root} className="relative flex min-h-screen flex-col items-center overflow-hidden bg-koi-bg px-4 py-10 font-koi-sans text-koi-ink antialiased">
      <header className="flex w-full max-w-[1100px] items-center justify-between gap-3">
        <span className="flex items-center gap-3">
          <span className="flex items-end gap-[3px] text-koi-forest"><span className="font-koi-display text-[26px] font-extrabold leading-none tracking-[-0.02em]">KOI</span><span aria-hidden="true" className="mb-[3px] size-[7px] rounded-full bg-koi-ember" /></span>
          <span className="rounded-full border border-koi-forest/20 px-2.5 py-1 font-koi-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-koi-forest">For Brands</span>
        </span>
        {brandName && <span className="truncate rounded-full border border-koi-forest/20 px-2.5 py-1 font-koi-mono text-[10px] font-medium uppercase tracking-[0.14em] text-koi-muted">{brandName}</span>}
      </header>

      <section data-card className="relative mt-8 flex w-full max-w-[720px] flex-col items-center rounded-[34px] border border-koi-forest/10 bg-white px-6 pb-10 pt-12 shadow-[0_50px_100px_-60px_rgba(8,61,45,.45)] md:px-14">
        <svg aria-hidden="true" viewBox="0 0 88 88" className="size-[88px] text-koi-green">
          <circle cx="44" cy="44" r="40" className="fill-koi-tint" />
          <circle data-ring cx="44" cy="44" r="40" fill="none" stroke="currentColor" strokeWidth="3" />
          <path data-tick d="M28 45.5 39.5 57 61 33" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span data-rise className="mt-6 flex items-center gap-1.5 rounded-full bg-koi-tint px-3 py-1 font-koi-mono text-[11px] font-bold uppercase tracking-[0.12em] text-koi-primary">Submitted</span>
        <h1 className="koi-condensed m-0 mt-3 text-center font-koi-display text-[clamp(48px,6vw,76px)] font-extrabold leading-[0.92] tracking-[-0.03em] text-koi-forest">
          <span className="-mb-[0.06em] block overflow-hidden pb-[0.06em]"><span data-line className="block">Application received</span></span>
        </h1>
        <p data-rise className="m-0 mt-3 max-w-[460px] text-center text-[15px] leading-relaxed text-koi-ink2">Building healthier choices for India starts with brands like yours.</p>

        <ol className="m-0 mt-9 flex w-full list-none flex-col rounded-[24px] border border-koi-forest/10 bg-koi-paper px-6 py-7">
          {TIMELINE.map((t, i) => {
            const Icon = t.icon
            const last = i === TIMELINE.length - 1
            return (
              <li key={t.title} data-step aria-current={t.state === 'active' ? 'step' : undefined} className="flex gap-4">
                <span className="flex flex-col items-center">
                  {t.state === 'done' && <span className="grid size-9 shrink-0 place-items-center rounded-full bg-koi-green text-white"><Check className="size-4" strokeWidth={3} /></span>}
                  {t.state === 'active' && <span className="grid size-9 shrink-0 place-items-center rounded-full border-2 border-koi-forest bg-white"><span data-mslot aria-hidden="true" className="size-[10px] rounded-full bg-koi-ember" /></span>}
                  {t.state === 'pending' && <span className="grid size-9 shrink-0 place-items-center rounded-full border-2 border-koi-forest/20 bg-white text-koi-muted"><Icon className="size-4" /></span>}
                  {!last && <span aria-hidden="true" className={`my-1.5 min-h-[30px] w-0.5 flex-1 ${t.state === 'done' ? 'bg-koi-green' : 'bg-koi-forest/15'}`} />}
                </span>
                <span className={`flex flex-col ${last ? '' : 'pb-5'}`}>
                  <span className={`text-[15px] font-bold ${t.state === 'active' ? 'text-koi-forest' : t.state === 'pending' ? 'text-koi-ink2' : ''}`}>{t.title}</span>
                  <span className={`mt-1 text-[13px] leading-relaxed ${t.state === 'pending' ? 'text-koi-muted' : 'text-koi-ink2'}`}>{t.text}</span>
                </span>
              </li>
            )
          })}
        </ol>

        <div data-rise className="mt-5 flex w-full flex-wrap items-center gap-4 rounded-[20px] bg-koi-forest p-5 text-koi-bg">
          <span aria-hidden="true" className="grid size-11 shrink-0 place-items-center rounded-xl bg-koi-lime text-koi-forest"><Clock className="size-5" /></span>
          <span className="flex flex-col"><span className="text-[12px] font-medium text-koi-bg/60">Expected review time</span><span className="font-koi-num text-[20px] font-bold tracking-tight">24–72 hours</span></span>
          <span className="ml-auto max-w-[200px] text-right text-[11.5px] leading-snug text-koi-bg/50">Varies with documentation completeness.</span>
        </div>

        <div data-rise className="mt-7 flex flex-wrap items-center justify-center gap-3">
          <button type="button" onClick={() => router.push('/')} className="flex h-12 items-center gap-2 rounded-full border border-koi-forest/15 px-6 text-sm font-semibold text-koi-forest transition-colors hover:bg-koi-paper"><ArrowLeft className="size-4" /> Back to home</button>
          <a href="mailto:support@koi.health" className="flex h-12 items-center rounded-full bg-koi-forest px-6 text-sm font-bold text-koi-lime no-underline">Contact support</a>
        </div>
      </section>
    </main>
  )
}
