"use client";
// ============================================================================
// KOI — the checkout's header: Cart ✓ ── Checkout ── Swiggy
//
// The focused header (StoreHeader, mode "focused") shows where the basket is.
// The first leg fills on arrival; the second fills, and Swiggy ticks, when the
// checkout page reports the hand-off (store/checkoutStageStore). The Swiggy
// node carries data-node-swiggy: the basket's thumbnails fly to it on send.
// ============================================================================

import { useRef } from "react";
import Link from "next/link";
import { useCheckoutStage } from "@/store/checkoutStageStore";
import { setupMotion, prefersReducedMotion, useGSAP, E } from "@/lib/motion/koiMotion";

function Tick() {
  return <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12 5 5 9-10" /></svg>;
}

export default function CheckoutRail() {
  const ref = useRef(null);
  const stage = useCheckoutStage((s) => s.stage);
  const sent = stage === "sent";

  useGSAP(() => {
    const gsap = setupMotion();
    const one = ref.current.querySelector('[data-rail-fill="1"]');
    if (prefersReducedMotion()) return;
    gsap.fromTo(one, { width: "0%" }, { width: "100%", duration: 0.9, ease: E.dolly, delay: 0.2 });
  }, { scope: ref });

  useGSAP(() => {
    const gsap = setupMotion();
    const two = ref.current.querySelector('[data-rail-fill="2"]');
    const target = stage === "review" ? "0%" : "100%";
    if (prefersReducedMotion()) gsap.set(two, { width: target });
    else gsap.to(two, { width: target, duration: 0.6, ease: E.dolly });
  }, { scope: ref, dependencies: [stage] });

  return (
    <nav ref={ref} aria-label="Checkout progress" className="flex items-center">
      <ol className="m-0 flex list-none items-center p-0">
        <li>
          <Link href="/store/cart" className="flex items-center gap-2 rounded-full p-2 text-sm font-semibold text-koi-primary no-underline hover:underline">
            <span aria-hidden="true" className="grid size-6 place-items-center rounded-full bg-koi-primary text-white"><Tick /></span>
            <span className="max-sm:sr-only">Cart</span>
          </Link>
        </li>
        <li aria-hidden="true" className="relative mx-1 h-[2px] w-8 overflow-hidden rounded-full bg-koi-forest/15 sm:mx-2 sm:w-16"><span data-rail-fill="1" className="absolute inset-y-0 left-0 w-full rounded-full bg-koi-primary" /></li>
        <li>
          <span aria-current={sent ? undefined : "step"} className="flex items-center gap-2 p-2 text-sm font-bold text-koi-forest">
            <span aria-hidden="true" className={`grid size-6 place-items-center rounded-full ${sent ? "bg-koi-primary text-white" : "bg-koi-lime text-koi-forest"}`}>
              {sent ? <Tick /> : <span className="size-2 rounded-full bg-current" />}
            </span>
            <span className="max-sm:sr-only">Checkout</span>
          </span>
        </li>
        <li aria-hidden="true" className="relative mx-1 h-[2px] w-8 overflow-hidden rounded-full bg-koi-forest/15 sm:mx-2 sm:w-16"><span data-rail-fill="2" className="absolute inset-y-0 left-0 w-0 rounded-full bg-koi-primary" /></li>
        <li>
          <span data-node-swiggy aria-current={sent ? "step" : undefined} className={`flex items-center gap-2 p-2 text-sm font-semibold ${sent ? "text-koi-primary" : "text-koi-muted"}`}>
            <span aria-hidden="true" className={`grid size-6 place-items-center rounded-full border-2 ${sent ? "border-koi-primary bg-koi-primary text-white" : "border-koi-forest/25 text-koi-forest"}`}>{sent && <Tick />}</span>
            Swiggy
          </span>
        </li>
      </ol>
    </nav>
  );
}
