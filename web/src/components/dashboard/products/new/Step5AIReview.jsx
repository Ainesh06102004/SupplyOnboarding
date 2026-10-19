"use client"

import React, { useEffect, useRef, useState } from 'react'
import { Check, FileEdit, Send } from 'lucide-react'
import { queueLabelReading, submitProductForReview } from '@/lib/dashboard/productCreation'
import { setupMotion, prefersReducedMotion, useGSAP, E } from '@/lib/motion/koiMotion'

// This step used to "run AI extraction": it waited three seconds, showed a
// hardcoded result — 25 g protein, whey protein isolate, "Score: 85/100",
// "All Clear! No banned substances detected" — for every product, and wrote
// that score into screening_reports as if KOI had read the label. Nothing had
// read anything. The brand saw an approval KOI never gave, and the storefront
// got a trust score nobody computed.
//
// What really happens now: the labels are queued for KOI's label engine, a
// model transcribes them, and a KOI reviewer checks every ingredient list and
// every allergen before anything reaches the storefront. So this step says
// that, and asks for nothing it cannot deliver. (BrandAddProduct board: the
// First card is ringed and carries KOI's ember while it waits.)
const STEPS = [
  { when: 'First', title: 'KOI reads your labels', body: 'Each photo is transcribed exactly as printed — ingredients, allergen statement and nutrition table.' },
  { when: 'Then', title: 'A person checks it', body: 'A KOI reviewer confirms every ingredient list and every allergen against your photo. Nothing is published from the model alone.' },
  { when: 'Last', title: 'Then it is screened', body: 'Claims are tested against FSSAI’s conditions using your declared figures before the product is listed.' },
]

export default function Step5AIReview({ productId, onBack, onComplete }) {
  const [queued, setQueued] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const root = useRef(null)

  useEffect(() => {
    if (!productId || queued) return
    queueLabelReading(productId)
      .then(() => setQueued(true))
      .catch((err) => {
        console.error('Failed to queue labels', err)
        setError('Your labels were uploaded, but we could not queue them for reading. Try again in a moment.')
      })
  }, [productId, queued])

  useGSAP(() => {
    const gsap = setupMotion()
    const q = (s) => root.current.querySelectorAll(s)
    if (prefersReducedMotion()) { gsap.set(q('[data-mslot]'), { opacity: 1 }); return }
    gsap.from(q('[data-next-step]'), { autoAlpha: 0, y: 18, duration: 0.6, stagger: 0.1, ease: E.reveal, clearProps: 'opacity,visibility,transform' })
    gsap.timeline({ delay: 0.5 })
      .to(q('[data-mslot]'), { opacity: 1, duration: 0.3 })
      .to(q('[data-mslot]'), { scale: 1.4, duration: 0.9, repeat: -1, yoyo: true, ease: 'sine.inOut' })
  }, { scope: root })

  const handleSubmit = async () => {
    try {
      setSubmitting(true)
      setError(null)
      await submitProductForReview(productId)
      onComplete()
    } catch (err) {
      console.error('Failed to submit for review', err)
      setError('We could not submit the product. Please try again.')
      setSubmitting(false)
    }
  }

  return (
    <div ref={root} className="flex flex-col gap-5">
      <span className="flex flex-col gap-1">
        <span className="flex flex-wrap items-center gap-3">
          <span className="font-koi-display text-[26px] font-extrabold tracking-[-0.01em] text-koi-forest">Your labels are with KOI</span>
          {queued && <span className="flex items-center gap-1.5 rounded-full bg-koi-tint px-3 py-1 text-[12.5px] font-bold text-koi-primary"><Check className="size-3.5" strokeWidth={3} />Queued for reading</span>}
        </span>
        <span className="text-[15px] text-koi-ink2">There is no instant result here on purpose. This is what happens next.</span>
      </span>

      <ol className="m-0 grid list-none grid-cols-1 gap-3 p-0 lg:grid-cols-3">
        {STEPS.map(({ when, title, body }, i) => (
          <li key={title} data-next-step className={`flex flex-col gap-2 rounded-2xl p-5 ${i === 0 ? 'border-2 border-koi-forest bg-koi-paper' : 'border border-koi-forest/10 bg-white'}`}>
            <span className="flex items-center gap-2">
              {i === 0 && <span data-mslot aria-hidden="true" className="size-[10px] rounded-full bg-koi-ember opacity-0" />}
              <span className={`font-koi-mono text-[10.5px] font-semibold uppercase tracking-[0.14em] ${i === 0 ? 'text-koi-forest' : 'text-koi-muted'}`}>{when}</span>
            </span>
            <span className="text-[16px] font-bold">{title}</span>
            <span className="text-[13px] leading-relaxed text-koi-ink2">{body}</span>
          </li>
        ))}
      </ol>

      <p className="m-0 rounded-2xl bg-koi-paper px-4 py-3 text-[13px] leading-relaxed text-koi-ink2">
        The clearest results come from a photo of the back of the pack showing the full ingredient list, the allergen
        statement and the nutrition table. If yours were cropped or blurred, go back and replace them.
      </p>
      {!productId && (
        <p role="alert" className="m-0 rounded-2xl border border-koi-amber-border bg-koi-amber-bg px-4 py-3 text-[13px] text-koi-amber-ink">
          This product has not been created yet — start from Basic Info so there is something to submit.
        </p>
      )}
      {error && <p className="m-0 text-sm text-koi-red" role="alert">{error}</p>}

      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        <button type="button" onClick={onBack} disabled={submitting} className="flex h-12 items-center justify-center gap-2 rounded-2xl border border-koi-forest/15 px-5 text-sm font-semibold text-koi-forest transition-colors hover:bg-koi-paper disabled:opacity-40">
          <FileEdit className="size-4" />Replace labels
        </button>
        <button type="button" onClick={handleSubmit} disabled={submitting || !queued} className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-koi-forest px-6 text-sm font-bold text-koi-lime disabled:opacity-40">
          {submitting ? 'Submitting…' : (<><Send className="size-4" />Submit for approval</>)}
        </button>
      </div>
    </div>
  )
}
