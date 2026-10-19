"use client"

// Brand portal — compliance (BrandDocs board). A forest score card whose ring
// draws in, four status tiles, the document vault, expiry alerts, missing
// coverage and activity. All of it is still the page's original sample data
// (no document store exists for brands yet), so it is labelled as such, and
// the upload / view / replace buttons — which never had handlers — say "Soon".

import React, { useRef } from 'react'
import { Upload } from 'lucide-react'
import PageTitle from '@/components/dashboard/PageTitle'
import { cn } from '@/lib/utils'
import { setupMotion, prefersReducedMotion, useGSAP, E } from '@/lib/motion/koiMotion'

// --- SAMPLE DATA ---
const COMPLIANCE_SCORE = 86

const TILES = [
  { label: 'FSSAI Status', value: '100/100', sub: 'Licence valid', cls: 'border-koi-tint-border bg-koi-tint text-koi-forest' },
  { label: 'Certifications', value: '78/100', sub: 'Partial coverage', cls: 'border-koi-amber-border bg-koi-amber-bg text-koi-amber-ink' },
  { label: 'Claims Evidence', value: '72/100', sub: 'For 5 claims', cls: 'border-koi-amber-border bg-koi-amber-bg text-koi-amber-ink' },
  { label: 'Lab Coverage', value: '91/100', sub: '18/24 products covered', cls: 'border-koi-forest/10 bg-white text-koi-ink' },
]

const VAULT = [
  { key: 'fssai', kind: 'FSSAI', name: 'FSSAI License', note: 'License 10023011000567 · expires Dec 2026', tone: 'text-koi-muted' },
  { key: 'certs', kind: 'CERT', name: 'Certifications', note: '4 uploaded · partial coverage', tone: 'text-koi-amber-ink' },
  { key: 'labs', kind: 'LAB', name: 'Lab Reports', note: '12 uploaded · 18/24 products covered', tone: 'text-koi-muted' },
  { key: 'evidence', kind: 'SCI', name: 'Scientific Evidence', note: '3 uploaded · for 5 claims', tone: 'text-koi-muted' },
]

const ALERTS = [
  { id: 1, title: 'FSSAI expires in 45 days', sub: 'Renew soon to avoid compliance disruption', box: 'border-koi-red/20 bg-koi-red-bg', dot: 'bg-koi-red' },
  { id: 2, title: 'Organic certificate expires in 72 days', sub: 'Schedule renewal', box: 'border-koi-amber-border bg-koi-amber-bg', dot: 'bg-koi-amber' },
  { id: 3, title: '3 lab reports older than 12 months', sub: 'Re-upload recommended', box: 'border-koi-tint-border bg-koi-tint', dot: 'bg-koi-green' },
]

const MISSING_COVERAGE = [
  { id: 1, product: 'Gut Health Shake', requirement: 'Lab Report', impact: 'High' },
  { id: 2, product: 'Keto Granola', requirement: 'Claim Evidence', impact: 'Medium' },
  { id: 3, product: 'Plant Protein', requirement: 'Vegan Certification', impact: 'Medium' },
  { id: 4, product: 'Pre-Workout Rush', requirement: 'Caffeine Lab Report', impact: 'High' },
]

const ACTIVITY = [
  { id: 1, when: 'Jun 21', what: 'FSSAI renewed', dot: 'bg-koi-primary' },
  { id: 2, when: 'Jun 18', what: 'Lab report uploaded', dot: 'bg-koi-forest' },
  { id: 3, when: 'Jun 15', what: 'Organic certification approved', dot: 'bg-koi-green' },
]

const IMPACT = {
  High: 'border-koi-red/20 bg-koi-red-bg text-koi-red',
  Medium: 'border-koi-amber-border bg-koi-amber-bg text-koi-amber-ink',
}

function Sample({ dark }) {
  return <span className={cn('font-koi-mono text-[10px] uppercase tracking-[0.14em]', dark ? 'text-koi-bg/50' : 'text-koi-muted')}>Sample data</span>
}

export default function CompliancePage() {
  const root = useRef(null)

  useGSAP(() => {
    const gsap = setupMotion()
    const q = (s) => root.current.querySelectorAll(s)
    const reduced = prefersReducedMotion()
    gsap.fromTo(q('[data-score-ring]'), { drawSVG: '0%' }, { drawSVG: `0% ${COMPLIANCE_SCORE}%`, duration: reduced ? 0 : 1.4, delay: reduced ? 0 : 0.3, ease: E.dolly })
    if (reduced) return
    gsap.from(q('[data-tile]'), { autoAlpha: 0, y: 20, duration: 0.6, stagger: 0.06, delay: 0.2, ease: E.reveal, clearProps: 'opacity,visibility,transform' })
    gsap.from(q('[data-card]'), { autoAlpha: 0, y: 30, duration: 0.8, stagger: 0.07, delay: 0.25, ease: E.dolly, clearProps: 'opacity,visibility,transform' })
  }, { scope: root })

  return (
    <div ref={root} className="flex flex-col gap-6 pb-12">
      <PageTitle
        title="Compliance"
        sub="Monitor regulatory compliance, certifications, and document health across your catalog."
        action={<button type="button" disabled title="Document uploads are coming" className="flex h-12 items-center gap-2 rounded-2xl bg-koi-forest/50 px-5 text-sm font-bold text-koi-lime"><Upload className="size-5" />Upload Document · Soon</button>}
      />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
        <section data-card aria-label="Score" className="flex items-center gap-5 rounded-[26px] bg-koi-forest p-6 text-koi-bg">
          <span className="relative grid size-[120px] shrink-0 place-items-center">
            <svg aria-hidden="true" viewBox="0 0 100 100" className="absolute inset-0 -rotate-90">
              <circle cx="50" cy="50" r="42" fill="none" strokeWidth="8" className="stroke-koi-bg/15" />
              <circle data-score-ring cx="50" cy="50" r="42" fill="none" strokeWidth="8" strokeLinecap="round" className="stroke-koi-lime" />
            </svg>
            <span className="flex flex-col items-center"><span className="font-koi-num text-[38px] font-semibold leading-none">{COMPLIANCE_SCORE}</span><span className="font-koi-mono text-[10px] uppercase tracking-[0.14em] text-koi-bg/60">Score</span></span>
          </span>
          <span className="flex flex-col gap-1.5">
            <span className="text-[17px] font-bold">Good compliance standing</span>
            <span className="text-[13.5px] leading-relaxed text-koi-bg/75">Your overall catalog health is strong. However, <strong className="text-koi-lime">2 documents need renewal</strong> to maintain your premium trust score on the marketplace.</span>
            <Sample dark />
          </span>
        </section>
        <section aria-label="Status" className="grid grid-cols-2 gap-3 self-start md:grid-cols-4">
          {TILES.map((t) => (
            <article key={t.label} data-tile className={cn('flex flex-col gap-2 rounded-[22px] border p-5', t.cls)}>
              <span className="font-koi-mono text-[10.5px] font-semibold uppercase tracking-[0.14em] opacity-80">{t.label}</span>
              <span className="font-koi-num text-[24px] font-semibold leading-tight">{t.value}</span>
              <span className="text-[12.5px] opacity-80">{t.sub}</span>
            </article>
          ))}
        </section>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <section data-card aria-label="Document Vault" className="flex flex-col rounded-[26px] border border-koi-forest/10 bg-white p-6">
          <span className="flex items-baseline justify-between gap-2"><span className="text-lg font-bold">Document Vault</span><Sample /></span>
          <ul className="m-0 mt-3 flex list-none flex-col p-0">
            {VAULT.map((d) => (
              <li key={d.key} className="flex flex-wrap items-center gap-4 border-b border-koi-forest/10 py-3.5 last:border-b-0">
                <span aria-hidden="true" className="grid size-11 shrink-0 place-items-center rounded-xl bg-koi-paper font-koi-mono text-[10px] font-bold text-koi-primary">{d.kind}</span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5"><span className="truncate text-[15px] font-semibold">{d.name}</span><span className={cn('text-[12.5px]', d.tone)}>{d.note}</span></span>
                <span className="rounded-full border border-koi-forest/10 px-3 py-1.5 text-[12px] font-semibold text-koi-muted">View / Replace · Soon</span>
              </li>
            ))}
          </ul>
        </section>
        <section data-card aria-label="Expiry Alerts" className="flex flex-col gap-3 rounded-[26px] border border-koi-forest/10 bg-white p-6">
          <span className="flex items-baseline justify-between gap-2"><span className="text-lg font-bold">Expiry Alerts</span><Sample /></span>
          {ALERTS.map((e) => (
            <article key={e.id} className={cn('flex items-start gap-3 rounded-2xl border p-4', e.box)}>
              <span aria-hidden="true" className={cn('mt-1.5 size-2.5 shrink-0 rounded-full', e.dot)} />
              <span className="flex flex-col gap-0.5"><span className="text-[14.5px] font-bold">{e.title}</span><span className="text-[13px] text-koi-ink2">{e.sub}</span></span>
            </article>
          ))}
        </section>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <section data-card aria-label="Missing Coverage" className="flex flex-col rounded-[26px] border border-koi-forest/10 bg-white p-6">
          <span className="flex items-baseline justify-between gap-2"><span className="text-lg font-bold">Missing Coverage</span><Sample /></span>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[420px] border-collapse text-left text-[14px]">
              <thead>
                <tr className="border-b border-koi-forest/10 font-koi-mono text-[10.5px] uppercase tracking-[0.12em] text-koi-muted">
                  <th scope="col" className="py-2.5 font-medium">Product</th>
                  <th scope="col" className="py-2.5 font-medium">Missing Requirement</th>
                  <th scope="col" className="py-2.5 font-medium">Impact</th>
                </tr>
              </thead>
              <tbody>
                {MISSING_COVERAGE.map((row) => (
                  <tr key={row.id} className="border-b border-koi-forest/10 last:border-b-0">
                    <td className="py-3 font-semibold">{row.product}</td>
                    <td className="py-3 text-koi-ink2">{row.requirement}</td>
                    <td className="py-3"><span className={cn('rounded-full border px-2.5 py-0.5 text-[12px] font-bold', IMPACT[row.impact])}>{row.impact}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <section data-card aria-label="Compliance Activity" className="flex flex-col gap-3 rounded-[26px] border border-koi-forest/10 bg-white p-6">
          <span className="flex items-baseline justify-between gap-2"><span className="text-lg font-bold">Compliance Activity</span><Sample /></span>
          <ol className="m-0 flex list-none flex-col p-0">
            {ACTIVITY.map((a) => (
              <li key={a.id} className="flex items-center gap-3 border-b border-koi-forest/10 py-2.5 last:border-b-0">
                <span aria-hidden="true" className={cn('size-2 shrink-0 rounded-full', a.dot)} />
                <span className="flex-1 text-[14px]">{a.what}</span>
                <span className="font-koi-num text-[12.5px] text-koi-muted">{a.when}</span>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  )
}
