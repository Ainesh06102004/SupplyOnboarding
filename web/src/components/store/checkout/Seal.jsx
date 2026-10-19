"use client";
// ============================================================================
// KOI — the seal: checkout's last page (cinematic storefront, Oct 2026)
//
// Replaces the old end credits. The ring draws, the seal lands, the tick draws,
// and KOI's dot drops into it as its own check before going home. Below it:
// what went to Swiggy (Swiggy's prices when its plan was complete, else MRP),
// what stayed in the KOI cart, and what happens next. Everything shown comes
// from the hand-off the checkout just made (app/store/checkout/page.js).
// ============================================================================

import { useRef } from "react";
import Link from "next/link";
import { packs } from "@/lib/cart/lines";
import { Money, ProductThumb } from "@/components/store/system/primitives";
import { setupMotion, prefersReducedMotion, useGSAP, E } from "@/lib/motion/koiMotion";

/** The seal: after the hand-off — where the basket is, what went, what stayed, what happens next. */
export default function Seal({ sent, error, ember, say, line }) {
  const ref = useRef(null);
  const mrp = sent.went.reduce((s, l) => s + (l.mrp ? l.mrp * packs(l.quantity) : 0), 0);

  useGSAP(() => {
    const gsap = setupMotion();
    const q = (s) => ref.current.querySelector(s);
    const qa = (s) => ref.current.querySelectorAll(s);
    window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? "auto" : "smooth" });
    ember.status(null);
    say(line);
    const seal = q("[data-seal]");
    if (prefersReducedMotion()) { ember.at(seal, { ax: 0.5, ay: 0, y: 6 }); ember.done(); return; }
    const tl = gsap.timeline({ defaults: { ease: E.reveal } });
    tl.fromTo(q("[data-seal-ring]"), { drawSVG: "0% 0%" }, { drawSVG: "0% 100%", duration: 1.1, ease: E.dolly }, 0);
    tl.from(seal, { scale: 0.4, autoAlpha: 0, duration: 0.7, ease: "back.out(2)" }, 0.2);
    tl.fromTo(q("[data-seal-tick]"), { drawSVG: "0% 0%" }, { drawSVG: "0% 100%", duration: 0.45, ease: "power2.out" }, 0.7);
    tl.from(qa("[data-done-line]"), { yPercent: 115, duration: 1 }, 0.35);
    tl.from(qa("[data-done-rise]"), { autoAlpha: 0, y: 16, duration: 0.8, stagger: 0.08 }, 0.5);
    tl.from(q("[data-receipt]"), { autoAlpha: 0, y: 40, duration: 1, ease: E.dolly }, 0.7);
    tl.from(qa("[data-receipt-line]"), { autoAlpha: 0, x: -20, duration: 0.6, stagger: 0.07 }, 1.0);
    tl.from(q("[data-next]"), { autoAlpha: 0, y: 40, duration: 1, ease: E.dolly }, 0.85);
    // The dot lands in the seal as KOI's own check, then goes home.
    tl.call(() => ember.go(seal, { ax: 0.5, ay: 0, y: 6 }, () => ember.done(() => setTimeout(() => ember.home(), 600))), null, 0.9);
  }, { scope: ref });

  return (
    <main ref={ref} className="mx-auto flex w-full max-w-[1440px] flex-col items-center bg-koi-bg px-[clamp(16px,4vw,52px)] pb-12 pt-8 font-koi-sans text-koi-ink">
      <div className="relative grid size-[150px] place-items-center">
        <svg viewBox="0 0 150 150" className="absolute inset-0 size-[150px] -rotate-90" aria-hidden="true">
          <circle cx="75" cy="75" r="68" fill="none" stroke="rgba(8,61,45,.08)" strokeWidth="4" />
          <circle data-seal-ring cx="75" cy="75" r="68" fill="none" stroke="#16a06e" strokeWidth="4" strokeLinecap="round" />
        </svg>
        <span data-seal className="grid size-[104px] place-items-center rounded-full bg-koi-forest text-koi-lime">
          <svg className="size-12" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path data-seal-tick d="M6 12.5l4 4L18 8" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </span>
      </div>
      <span data-done-rise className="mt-7 font-koi-mono text-xs font-medium uppercase tracking-[0.22em] text-koi-muted">Basket · sent {sent.at}</span>
      <h1 className="koi-condensed m-0 mt-3 text-center font-koi-display text-[clamp(48px,6.4vw,96px)] font-extrabold leading-[0.92] tracking-[-0.03em] text-koi-forest">
        <span className="-mb-[0.06em] block overflow-hidden pb-[0.06em]"><span data-done-line className="block">Sent to Swiggy.</span></span>
      </h1>
      <p data-done-rise className="m-0 mt-4 max-w-[560px] text-center text-lg leading-relaxed text-koi-ink2">
        Your basket is waiting in your Swiggy cart. Pay and pick a delivery window there.
        {sent.kept > 0 ? ` The ${sent.kept} ${sent.kept === 1 ? "product" : "products"} Swiggy couldn't take stayed in your KOI cart.` : ""}
      </p>
      {error && <p role="alert" className="m-0 mt-4 max-w-[560px] rounded-xl bg-koi-red-bg px-3.5 py-2.5 text-center text-[13.5px] font-medium leading-normal text-koi-red">{error}</p>}
      <div data-done-rise className="mt-7 flex flex-wrap justify-center gap-3">
        {sent.url && (
          <a href={sent.url} target="_blank" rel="noopener" className="flex h-14 items-center gap-2.5 rounded-full bg-koi-forest px-7 text-[15px] font-bold text-koi-lime no-underline">
            Open Swiggy
            <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 17 17 7" /><path d="M8 7h9v9" /></svg>
          </a>
        )}
        <Link href="/store/orders" className="flex h-14 items-center rounded-full border border-koi-forest/25 px-6 text-[15px] font-semibold text-koi-forest no-underline transition-colors hover:bg-white">See it in Orders</Link>
      </div>

      <div className="mt-12 grid w-full max-w-[1100px] grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <section data-receipt aria-label="What went to Swiggy" className="relative rounded-[24px] bg-white p-7 shadow-[0_30px_60px_-44px_rgba(15,61,46,.5)]">
          <div className="flex items-baseline justify-between border-b-2 border-dashed border-koi-forest/15 pb-4">
            <span className="font-koi-display text-2xl font-extrabold">What went</span>
            <span className="font-koi-mono text-[11px] font-medium uppercase tracking-[0.14em] text-koi-muted">{sent.subtotal !== null ? "Swiggy’s prices" : "MRP"}</span>
          </div>
          <ul className="m-0 flex list-none flex-col p-0">
            {sent.went.map((l) => {
              const each = sent.subtotal !== null && l.unitPrice !== null ? Number(l.unitPrice) : l.mrp;
              return (
                <li key={l.id} data-receipt-line className="grid grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-3.5 border-b border-koi-forest/10 py-3">
                  <ProductThumb src={l.image} alt="" size={44} radius={10} />
                  <span className="flex min-w-0 flex-col"><span className="truncate text-sm font-bold">{l.name}</span><span className="truncate font-koi-mono text-[10.5px] uppercase tracking-[0.12em] text-koi-muted">× {packs(l.quantity)}{l.brand ? ` · ${l.brand}` : ""}</span></span>
                  <span className="font-koi-num text-sm font-semibold">{each ? <Money value={each * packs(l.quantity)} /> : "—"}</span>
                </li>
              );
            })}
          </ul>
          <div className="flex items-baseline justify-between pt-4">
            <span className="text-sm font-semibold text-koi-ink2">{sent.subtotal !== null ? "Swiggy’s prices, this basket" : "MRP total · Swiggy’s price applies"}</span>
            <span className="font-koi-num text-2xl font-semibold"><Money value={sent.subtotal !== null ? sent.subtotal : mrp} /></span>
          </div>
          {sent.stayed.length > 0 && (
            <p className="m-0 mt-4 rounded-xl bg-koi-amber-bg px-3.5 py-2.5 text-[13px] leading-normal text-koi-amber-ink">Stayed in your KOI cart: {sent.stayed.join(", ")}.</p>
          )}
        </section>

        <section data-next aria-label="What happens next" className="flex flex-col gap-5 rounded-[24px] border border-koi-forest/10 bg-koi-paper p-7">
          <span className="font-koi-display text-2xl font-extrabold">What happens next</span>
          <ol className="m-0 flex list-none flex-col gap-4 p-0">
            <li className="flex gap-3.5"><span aria-hidden="true" className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-koi-primary text-white"><svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 5 5 9-10" /></svg></span><span className="flex flex-col gap-0.5"><span className="text-sm font-bold">KOI handed it over</span><span className="text-[13px] text-koi-ink2">Your Swiggy cart holds this basket now.</span></span></li>
            <li className="flex gap-3.5"><span aria-hidden="true" className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border-2 border-koi-ember"><span className="size-2 rounded-full bg-koi-ember" /></span><span className="flex flex-col gap-0.5"><span className="text-sm font-bold">You pay on Swiggy</span><span className="text-[13px] text-koi-ink2">Swiggy shows the final price and the delivery window.</span></span></li>
            <li className="flex gap-3.5"><span aria-hidden="true" className="mt-0.5 size-6 shrink-0 rounded-full border-2 border-koi-forest/20" /><span className="flex flex-col gap-0.5"><span className="text-sm font-bold">Swiggy delivers</span><span className="text-[13px] text-koi-ink2">Then tell KOI it arrived, from Orders, so next week’s plan knows.</span></span></li>
          </ol>
          <div className="mt-auto flex flex-col gap-1 border-t border-koi-forest/10 pt-4">
            {sent.address && <span className="text-[13px] font-bold">Deliver to · {sent.address}</span>}
            <span className="text-[13px] leading-normal text-koi-ink2">Need to change or cancel it? That happens on Swiggy, in your Swiggy cart or with Swiggy’s support.</span>
          </div>
        </section>
      </div>
    </main>
  );
}
