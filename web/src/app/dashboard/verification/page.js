"use client"

// Brand portal — verification (BrandVerification board). A five-stage strip,
// the submissions table, and a detail panel for the picked submission: its
// timeline (KOI reads → a person checks → decision), any risks, the reviewer's
// note. Every figure here is still the page's original sample data — there is
// no submissions feed for brands yet — so each panel says "Sample".

import React, { useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { Plus, Check, X } from 'lucide-react'
import PageTitle from '@/components/dashboard/PageTitle'
import { cn } from '@/lib/utils'
import { setupMotion, prefersReducedMotion, useGSAP, E } from '@/lib/motion/koiMotion'

// --- SAMPLE DATA (unchanged records, regrouped) ---
const STAGES = [
  { key: 'draft', label: 'Draft', n: 1, sub: 'Not sent yet', cls: 'bg-koi-paper text-koi-ink2' },
  { key: 'submitted', label: 'Submitted', n: 2, sub: 'Waiting to be read', cls: 'bg-koi-tint text-koi-primary' },
  { key: 'ai', label: 'AI Review', n: 5, sub: 'KOI is reading labels', cls: 'bg-koi-forest text-koi-bg' },
  { key: 'human', label: 'Human Review', n: 3, sub: 'A person is checking', cls: 'bg-koi-amber-bg text-koi-amber-ink' },
  { key: 'approved', label: 'Approved', n: 16, sub: 'Live on KOI', cls: 'bg-koi-lime-soft text-koi-forest' },
]

const ROWS = [
  { id: 'PRD-001', product: 'Hydration Mix', sku: 'HYD-01', submitted: '2026-06-23', stage: 'AI Review', score: null,
    note: { text: 'Please provide clearer images of the back packaging for Hydration Mix. OCR confidence is below 80%.', by: 'KOI review team' } },
  { id: 'PRD-002', product: 'Sleep Gummies', sku: 'SLP-99', submitted: '2026-06-22', stage: 'Human Review', score: 62,
    risks: [{ impact: 'Medium', title: 'Missing Lab Report', body: 'Melatonin levels require 3rd party lab evidence.' }] },
  { id: 'PRD-003', product: 'Creatine Monohydrate', sku: 'CRT-05', submitted: '2026-06-20', stage: 'Approved', score: 98 },
  { id: 'PRD-004', product: 'Mass Gainer Pro', sku: 'MSG-01', submitted: '2026-06-19', stage: 'Rejected', score: 45,
    risks: [{ impact: 'High', title: 'Claim Unsupported', body: '“Zero Sugar” contradicts the parsed ingredients.' }],
    note: { text: 'Sugar claims unsupported. Remove the claim, or change the recipe and send new label photos.', by: 'KOI review team' } },
  { id: 'PRD-005', product: 'Pre-Workout Rush', sku: 'PWR-01', submitted: '2026-06-23', stage: 'Submitted', score: null },
]

const FEED = [
  { what: 'OCR complete', product: 'Hydration Mix', time: '10:48', dot: 'bg-koi-forest' },
  { what: 'AI review started', product: 'Pre-Workout Rush', time: '10:44', dot: 'bg-koi-amber' },
  { what: 'Submitted', product: 'Pre-Workout Rush', time: '10:42', dot: 'bg-koi-track' },
]

const PILL = {
  Draft: 'border-koi-forest/15 bg-white text-koi-ink2',
  Submitted: 'border-koi-tint-border bg-koi-tint text-koi-primary',
  'AI Review': 'border-koi-forest/30 bg-white text-koi-forest',
  'Human Review': 'border-koi-amber-border bg-koi-amber-bg text-koi-amber-ink',
  Approved: 'border-koi-tint-border bg-koi-tint text-koi-primary',
  Rejected: 'border-koi-red/20 bg-koi-red-bg text-koi-red',
}

const ORDER = ['Submitted', 'AI Review', 'Human Review', 'Decision']

// The submission's road so far: done, here, or still to come.
function timeline(stage) {
  const at = stage === 'Approved' || stage === 'Rejected' ? 3 : Math.max(0, ORDER.indexOf(stage))
  const notes = {
    Submitted: 'Your labels reached KOI.',
    'AI Review': 'KOI transcribes each label exactly as printed.',
    'Human Review': 'A KOI reviewer checks every ingredient and allergen.',
    Decision: stage === 'Approved' ? 'Approved — live on KOI.' : stage === 'Rejected' ? 'Not approved — see the note below.' : 'Approval, or a note on what to change.',
  }
  return ORDER.map((label, i) => ({
    label,
    note: notes[label],
    state: i < at || (i === at && (stage === 'Approved')) ? 'done' : i === at ? (stage === 'Rejected' ? 'rejected' : 'here') : 'later',
  }))
}

const IMPACT = {
  High: { box: 'border-koi-red/20 bg-koi-red-bg', tag: 'bg-koi-red', title: 'text-koi-red' },
  Medium: { box: 'border-koi-amber-border bg-koi-amber-bg', tag: 'bg-koi-amber', title: 'text-koi-amber-ink' },
}

export default function VerificationPage() {
  const [picked, setPicked] = useState(ROWS[1].id)
  const root = useRef(null)
  const detail = ROWS.find((r) => r.id === picked) ?? ROWS[0]
  const steps = useMemo(() => timeline(detail.stage), [detail.stage])

  useGSAP(() => {
    if (prefersReducedMotion()) return
    const gsap = setupMotion()
    const q = (s) => root.current.querySelectorAll(s)
    gsap.from(q('[data-stage]'), { autoAlpha: 0, y: 20, duration: 0.6, stagger: 0.06, delay: 0.15, ease: E.reveal, clearProps: 'opacity,visibility,transform' })
    gsap.from(q('[data-card]'), { autoAlpha: 0, y: 30, duration: 0.8, stagger: 0.08, delay: 0.3, ease: E.dolly, clearProps: 'opacity,visibility,transform' })
  }, { scope: root })

  // The detail panel re-cuts when another submission is picked.
  useGSAP(() => {
    if (prefersReducedMotion()) return
    const gsap = setupMotion()
    gsap.from(root.current.querySelectorAll('[data-detail] > *'), { autoAlpha: 0, x: 16, duration: 0.45, stagger: 0.05, ease: E.reveal, clearProps: 'opacity,visibility,transform' })
  }, { scope: root, dependencies: [picked] })

  return (
    <div ref={root} className="flex flex-col gap-6 pb-12">
      <PageTitle
        title="Verification"
        sub="Track AI screening, human review, and approval status for product submissions."
        action={<Link href="/dashboard/products/new" className="flex h-12 items-center gap-2 rounded-2xl bg-koi-forest px-5 text-sm font-bold text-koi-lime no-underline"><Plus className="size-5" />Submit New Product</Link>}
      />

      <section aria-label="Verification Pipeline" className="grid grid-cols-2 gap-3 rounded-[26px] border border-koi-forest/10 bg-white p-4 md:grid-cols-5 md:p-5">
        {STAGES.map((p) => (
          <div key={p.key} data-stage className={cn('flex flex-col gap-1 rounded-2xl p-4', p.cls)}>
            <span className="font-koi-mono text-[10.5px] font-semibold uppercase tracking-[0.14em] opacity-80">{p.label}</span>
            <span className="font-koi-num text-[32px] font-semibold leading-none">{p.n}</span>
            <span className="text-[12px] opacity-75">{p.sub}</span>
          </div>
        ))}
        <span className="col-span-2 font-koi-mono text-[10px] uppercase tracking-[0.14em] text-koi-muted md:col-span-5">Sample figures</span>
      </section>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <section data-card aria-label="All Submissions" className="flex flex-col rounded-[26px] border border-koi-forest/10 bg-white p-6">
          <span className="flex items-baseline justify-between gap-2"><span className="text-lg font-bold">All Submissions</span><span className="font-koi-mono text-[10px] uppercase tracking-[0.14em] text-koi-muted">Sample</span></span>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[480px] border-collapse text-left text-[14px]">
              <thead>
                <tr className="border-b border-koi-forest/10 font-koi-mono text-[10.5px] uppercase tracking-[0.12em] text-koi-muted">
                  <th scope="col" className="py-2.5 font-medium">Product</th>
                  <th scope="col" className="py-2.5 font-medium">Submitted</th>
                  <th scope="col" className="py-2.5 font-medium">Current Stage</th>
                  <th scope="col" className="py-2.5 text-right font-medium">Trust Score</th>
                </tr>
              </thead>
              <tbody>
                {ROWS.map((r) => {
                  const on = r.id === picked
                  return (
                    <tr key={r.id} className={cn('border-b border-koi-forest/10 transition-colors last:border-b-0', on ? 'bg-koi-paper' : 'hover:bg-koi-paper/60')}>
                      <td className="py-0">
                        <button type="button" aria-pressed={on} onClick={() => setPicked(r.id)} className="flex w-full items-center gap-2 py-3.5 text-left font-semibold">
                          {on && <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-koi-ember" />}
                          <span className="flex flex-col"><span>{r.product}</span><span className="font-koi-mono text-[11px] font-normal text-koi-muted">{r.sku}</span></span>
                        </button>
                      </td>
                      <td className="py-3.5 font-koi-num text-koi-ink2">{r.submitted}</td>
                      <td className="py-3.5"><span className={cn('rounded-full border px-2.5 py-1 text-[12px] font-bold', PILL[r.stage])}>{r.stage}</span></td>
                      <td className="py-3.5 text-right font-koi-num font-semibold">{r.score ?? <span className="text-koi-muted">—</span>}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section data-detail aria-label={detail.product} className="flex flex-col gap-4 rounded-[26px] border border-koi-forest/10 bg-white p-6">
          <span className="flex flex-col gap-0.5">
            <span className="font-koi-mono text-[10.5px] font-semibold uppercase tracking-[0.14em] text-koi-muted">Submission · sample</span>
            <span className="font-koi-display text-[24px] font-extrabold leading-tight tracking-[-0.01em] text-koi-forest">{detail.product}</span>
          </span>
          <ol className="m-0 flex list-none flex-col p-0">
            {steps.map((t, i) => (
              <li key={t.label} className="flex gap-3">
                <span className="flex flex-col items-center">
                  <span className={cn('grid size-7 shrink-0 place-items-center rounded-full border-2 text-[11px] font-bold',
                    t.state === 'done' && 'border-koi-green bg-koi-green text-white',
                    t.state === 'here' && 'border-koi-forest bg-white',
                    t.state === 'rejected' && 'border-koi-red bg-koi-red text-white',
                    t.state === 'later' && 'border-koi-forest/20 bg-white text-koi-muted')}>
                    {t.state === 'done' ? <Check className="size-3.5" strokeWidth={3} /> : t.state === 'rejected' ? <X className="size-3.5" strokeWidth={3} /> : t.state === 'here' ? <span aria-hidden="true" className="size-2 rounded-full bg-koi-ember" /> : i + 1}
                  </span>
                  {i < steps.length - 1 && <span aria-hidden="true" className={cn('my-1 min-h-[18px] w-0.5 flex-1', t.state === 'done' ? 'bg-koi-green' : 'bg-koi-forest/15')} />}
                </span>
                <span className="flex flex-col pb-3">
                  <span className={cn('text-[14px] font-bold', t.state === 'later' && 'text-koi-ink2')}>{t.label}</span>
                  <span className="text-[12.5px] text-koi-ink2">{t.note}</span>
                </span>
              </li>
            ))}
          </ol>
          {(detail.risks ?? []).map((risk) => (
            <div key={risk.title} className={cn('flex flex-col gap-2 rounded-2xl border p-4', IMPACT[risk.impact].box)}>
              <span className="flex items-center gap-2">
                <span className={cn('rounded-full px-2 py-0.5 font-koi-mono text-[9.5px] font-bold uppercase tracking-[0.12em] text-white', IMPACT[risk.impact].tag)}>{risk.impact} Impact</span>
                <span className={cn('text-[14px] font-bold', IMPACT[risk.impact].title)}>{risk.title}</span>
              </span>
              <span className="text-[13.5px] leading-relaxed text-koi-ink">{risk.body}</span>
            </div>
          ))}
          {detail.note && (
            <figure className="m-0 flex flex-col gap-1.5 rounded-2xl bg-koi-paper p-4">
              <span className="font-koi-mono text-[10.5px] font-semibold uppercase tracking-[0.14em] text-koi-muted">Reviewer Notes</span>
              <blockquote className="m-0 text-[14px] leading-relaxed">{detail.note.text}</blockquote>
              <figcaption className="text-[12.5px] text-koi-muted">— {detail.note.by}</figcaption>
            </figure>
          )}
          {detail.risks?.length > 0 && (
            <Link href="/dashboard/compliance" className="flex h-11 items-center self-start rounded-full border border-koi-forest/15 px-4 text-sm font-semibold text-koi-forest no-underline hover:bg-koi-paper">Upload Evidence</Link>
          )}
          {!detail.risks?.length && !detail.note && (
            <p className="m-0 rounded-2xl bg-koi-paper px-4 py-3 text-[13.5px] leading-relaxed text-koi-ink2">
              {detail.stage === 'Approved' ? 'Nothing to do — this one is live.' : 'Nothing needs you yet. KOI will note anything a reviewer finds.'}
            </p>
          )}
        </section>
      </div>

      <section data-card aria-label="Activity Feed" className="flex flex-col gap-3 rounded-[26px] border border-koi-forest/10 bg-white p-6">
        <span className="flex items-baseline justify-between gap-2"><span className="text-lg font-bold">Activity Feed</span><span className="font-koi-mono text-[10px] uppercase tracking-[0.14em] text-koi-muted">Today · sample data</span></span>
        <ol className="m-0 grid list-none grid-cols-1 gap-x-8 gap-y-1 p-0 md:grid-cols-2">
          {FEED.map((f) => (
            <li key={f.what + f.time} className="flex items-center gap-3 border-b border-koi-forest/10 py-2.5">
              <span aria-hidden="true" className={cn('size-2 shrink-0 rounded-full', f.dot)} />
              <span className="flex min-w-0 flex-1 flex-col"><span className="text-[14px] font-semibold">{f.what}</span><span className="truncate text-[12.5px] text-koi-muted">{f.product}</span></span>
              <span className="font-koi-num text-[12.5px] text-koi-muted">{f.time}</span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  )
}
