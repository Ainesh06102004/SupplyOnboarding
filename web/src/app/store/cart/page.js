"use client";

// ============================================================================
// /store/cart — the one cart, full page (cinematic storefront, Oct 2026)
//
// The same pieces as the cart drawer and the Plan's Cart step (components/
// store/cart/CartView.jsx): this week's plan, what the shopper added, an
// offered update when the plan has moved on, the MRP total and Checkout.
//
// KOI on this page: it says what the cart is; when the plan has moved since the
// cart was filled, it flies to the banner, rings it and waits (a heartbeat)
// until the shopper keeps the cart or updates it — nothing changes untapped.
//
// Gone from the old page: "Delivery Fee: Free" (KOI cannot know Swiggy's fee;
// checkout had already removed it) and the floating mobile checkout card that
// sat on top of the tab bar and the agent dock. On phones the total sits in
// the one bottom stack instead (TotalBar).
// ============================================================================

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useCartStore } from "@/store/cartStore";
import { getSeedCatalogue } from "@/components/store/shop/shopData";
import { mergeCatalogue } from "@/lib/data/mergeCatalogue";
import { getCatalogue } from "@/lib/cart/client";
import { hasScore } from "@/lib/score";
import { useAddToCart, TotalBar } from "@/components/store/cart/CartLayer";
import { useCartGroups, PlanGroup, OwnGroup, PlanChangedBanner, CartSummary, CartRead, CartEmpty, CartLoading } from "@/components/store/cart/CartView";
import ExportList from "@/components/store/cart/ExportList";
import { Money, ProductThumb, ScoreBadge } from "@/components/store/system/primitives";
import { setupMotion, prefersReducedMotion, useGSAP, E } from "@/lib/motion/koiMotion";
import { useEmber } from "@/components/store/ember/Ember";
import { useKoiVoice } from "@/store/koiVoiceStore";

// KOI's lines here. No numbers in KOI's mouth.
const LINES = {
  open: "Everything from this week’s plan, plus what you added. Prices are MRP until Swiggy checks them.",
  own: "Everything you added, read and scored. Prices are MRP until Swiggy checks them.",
  empty: "Nothing here yet. Plan the week and I’ll fill it, or pick things yourself.",
  changed: "Your plan changed since you added it. Your cart stays as it is until you say.",
  kept: "Keeping your cart as it is. The plan still has the changes if you want them.",
  updated: "Updated. Your cart matches the plan again.",
  added: "Added. It’s one of the highest scores you hadn’t picked.",
};

export default function CartPage() {
  const groups = useCartGroups();
  const { all, lines } = groups;
  const root = useRef(null);
  const ember = useEmber();
  const say = useKoiVoice((s) => s.say);
  const ready = !groups.loading;
  const hasBanner = Boolean(groups.diff && groups.latest);

  // The opening: rows dolly in from the right, the summary rises; then KOI
  // says what this is, and points at the plan's change if there is one.
  useGSAP(() => {
    if (!ready) return;
    const gsap = setupMotion();
    const q = (s) => root.current.querySelector(s);
    const qa = (s) => root.current.querySelectorAll(s);
    const line = !lines.length ? LINES.empty : groups.planLines.length ? LINES.open : LINES.own;
    const point = () => {
      const b = q("[data-banner]");
      if (!b) return;
      ember.status("Plan changed");
      setTimeout(() => ember.go(b, ember.perch(b, 6), () => { ember.mark(b, "ring", 6); setTimeout(() => ember.heartbeat(true), 700); }), 1100);
    };
    if (prefersReducedMotion()) { say(hasBanner ? LINES.changed : line); point(); return; }
    const tl = gsap.timeline({ defaults: { ease: E.reveal } });
    tl.from(qa("[data-line]"), { yPercent: 115, duration: 1 }, 0.05);
    tl.from(qa("[data-rise]"), { autoAlpha: 0, y: 14, duration: 0.7, stagger: 0.08 }, 0.1);
    if (q("[data-banner]")) tl.from(q("[data-banner]"), { autoAlpha: 0, y: 18, duration: 0.8 }, 0.3);
    tl.from(qa("[data-item]"), { autoAlpha: 0, x: 60, duration: 0.85, stagger: 0.07, ease: E.dolly }, 0.35);
    if (q("[data-summary]")) tl.from(q("[data-summary]"), { autoAlpha: 0, y: 40, duration: 1, ease: E.dolly }, 0.35);
    tl.from(qa("[data-suggest]"), { autoAlpha: 0, y: 24, duration: 0.7, stagger: 0.06 }, 0.7);
    tl.add(() => say(line), 1.0);
    if (hasBanner) tl.add(() => { say(LINES.changed); point(); }, 2.4);
  }, { scope: root, dependencies: [ready] });

  // The total answers every change with a small bounce.
  const lastTotal = useRef(null);
  useGSAP(() => {
    const el = root.current?.querySelector("[data-total]");
    if (lastTotal.current !== null && lastTotal.current !== all.total && el && !prefersReducedMotion()) {
      setupMotion().fromTo(el, { scale: 1.25 }, { scale: 1, duration: 0.7, ease: "elastic.out(1, 0.4)", transformOrigin: "100% 50%" });
    }
    lastTotal.current = all.total;
  }, { scope: root, dependencies: [all.total] });

  // The dot lets go of the banner when the page leaves.
  useEffect(() => () => ember.rest(), [ember]);

  const onDecide = (how) => {
    ember.heartbeat(false);
    ember.mark(null);
    say(how === "updated" ? LINES.updated : LINES.kept);
    if (how === "updated") ember.done(() => setTimeout(() => ember.home(), 300));
    else ember.home();
  };

  return (
    <main ref={root} className="ks-page-pad mx-auto flex w-full max-w-[1440px] flex-col bg-koi-bg px-[clamp(16px,4vw,52px)] pt-8 font-koi-sans text-koi-ink">
      {/* Above the rows (their entrance leaves them on layers of their own), so the export menu opens over them. */}
      <section className="relative z-20 flex flex-wrap items-end justify-between gap-x-10 gap-y-4">
        <div className="flex flex-col gap-2.5">
          <div data-rise className="flex items-center gap-3">
            <span className="font-koi-mono text-xs font-semibold text-koi-primary">(05)</span>
            <span className="font-koi-mono text-xs font-medium uppercase tracking-[0.22em] text-koi-muted">Cart · one cart, one checkout</span>
          </div>
          <h1 className="koi-condensed m-0 font-koi-display text-[clamp(44px,5.2vw,78px)] font-extrabold leading-[0.92] tracking-[-0.03em] text-koi-forest">
            <span className="-mb-[0.06em] block overflow-hidden pb-[0.06em]"><span data-line className="block">Your cart</span></span>
          </h1>
        </div>
        <div data-rise className="flex flex-wrap items-center gap-2">
          {lines.length > 0 && <ExportList groups={groups} />}
          <Link href="/store/plan?step=shop" className="flex h-11 items-center gap-2 rounded-full border border-koi-forest/15 px-4 text-sm font-semibold text-koi-forest no-underline transition-colors hover:bg-white">Open in Plan <span aria-hidden="true">→</span></Link>
          <Link href="/store/shop" className="flex h-11 items-center rounded-full px-4 text-sm font-semibold text-koi-forest no-underline transition-colors hover:bg-white">Keep shopping</Link>
        </div>
      </section>

      {groups.loading ? <CartLoading /> : !lines.length ? (
        <section className="mt-7 rounded-[26px] border border-koi-forest/10 bg-white"><CartEmpty /></section>
      ) : (
        <>
          {hasBanner && <div className="pt-6"><PlanChangedBanner groups={groups} onDecide={onDecide} /></div>}
          <div className="grid grid-cols-1 gap-x-10 gap-y-8 pb-10 pt-7 lg:grid-cols-[minmax(0,1fr)_400px]">
            <div className="flex min-w-0 flex-col gap-8">
              <PlanGroup groups={groups} />
              <OwnGroup groups={groups} />
              <Suggestions lines={lines} onAdded={() => say(LINES.added)} />
            </div>
            <aside className="flex flex-col gap-4 self-start lg:sticky lg:top-[calc(var(--koi-header-h)+24px)]">
              <CartSummary groups={groups} />
              <CartRead lines={lines} />
            </aside>
          </div>
          <TotalBar total={all.total} products={all.products} />
        </>
      )}
    </main>
  );
}

// ── Complete your basket ────────────────────────────────────────────────────
// Drawn from KOI's own catalogue and ranked by KOI's own score. It once listed
// invented products attributed to real brands, each with a score never
// awarded; a verification verdict about something KOI has not screened is the
// same defect as an invented nutrition value.
function Suggestions({ lines, onAdded }) {
  const add = useAddToCart();
  const [pool, setPool] = useState(getSeedCatalogue);
  useEffect(() => {
    let alive = true;
    getCatalogue()
      .then((data) => { if (alive && data?.length) setPool(mergeCatalogue(getSeedCatalogue(), data)); })
      .catch(() => { /* the seed stands */ });
    return () => { alive = false; };
  }, []);
  const items = useCartStore((s) => s.items);
  const suggestions = useMemo(() => {
    const inCart = new Set(items.map((i) => String(i.productId ?? i.id)));
    return pool.filter((p) => !inCart.has(String(p.id)) && hasScore(p.score)).sort((a, b) => Number(b.score) - Number(a.score)).slice(0, 6);
  }, [pool, items]);
  if (!suggestions.length || !lines.length) return null;

  return (
    <section aria-label="Complete your basket" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="m-0 font-koi-display text-2xl font-extrabold text-koi-forest">Complete your basket</h2>
        <span className="font-koi-mono text-[11px] font-medium uppercase tracking-[0.14em] text-koi-muted">Highest KOI scores you haven’t added</span>
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(min(280px,100%),1fr))] gap-3.5">
        {suggestions.map((p) => (
          <article key={p.id} data-suggest className="flex items-center gap-3.5 rounded-[20px] border border-koi-forest/10 bg-white p-3.5">
            <Link href={`/store/product/${p.id}`} className="relative shrink-0">
              <ProductThumb src={p.image?.hero || null} alt="" size={64} radius={12} />
              <span className="absolute -left-1.5 -top-1.5"><ScoreBadge score={p.score} size={28} /></span>
            </Link>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <Link href={`/store/product/${p.id}`} className="truncate text-sm font-bold text-koi-ink no-underline hover:underline">{p.name}</Link>
              <span className="truncate font-koi-mono text-[10px] uppercase tracking-[0.12em] text-koi-muted">{p.brand}</span>
              <span className="font-koi-num text-sm font-semibold"><Money value={p.price} /></span>
            </div>
            <button type="button" aria-label={`Add ${p.name}`} onClick={() => { add(p); onAdded?.(); }} className="flex h-10 shrink-0 items-center gap-1 rounded-full bg-koi-forest px-3.5 text-[13px] font-bold text-koi-lime">+ Add</button>
          </article>
        ))}
      </div>
    </section>
  );
}
