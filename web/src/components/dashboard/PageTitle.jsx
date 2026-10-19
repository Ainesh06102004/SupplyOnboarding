"use client"

// The portal's page head: the title in the condensed display cut (it rises in
// on arrival), a line under it, an optional pill and an action on the right.

import React, { useRef } from 'react'
import { setupMotion, prefersReducedMotion, useGSAP, E } from '@/lib/motion/koiMotion'

export default function PageTitle({ title, sub, badge, action }) {
  const root = useRef(null)
  useGSAP(() => {
    if (prefersReducedMotion()) return
    const gsap = setupMotion()
    const q = (s) => root.current.querySelectorAll(s)
    gsap.from(q('[data-line]'), { yPercent: 115, duration: 1, ease: E.reveal })
    gsap.from(q('[data-rise]'), { autoAlpha: 0, y: 12, duration: 0.6, stagger: 0.07, delay: 0.15, ease: E.reveal, clearProps: 'opacity,visibility,transform' })
  }, { scope: root, dependencies: [title] })

  return (
    <section ref={root} className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex min-w-0 flex-col gap-2">
        <h1 className="koi-condensed m-0 font-koi-display text-[clamp(40px,4vw,60px)] font-extrabold leading-none tracking-[-0.03em] text-koi-forest">
          <span className="-mb-[0.06em] block overflow-hidden pb-[0.06em]"><span data-line className="block">{title}</span></span>
        </h1>
        {sub && <p data-rise className="m-0 text-base text-koi-ink2">{sub}</p>}
        {badge && <span data-rise className="self-start">{badge}</span>}
      </div>
      {action && <span data-rise>{action}</span>}
    </section>
  )
}
