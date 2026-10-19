"use client";

// Step 5 · Cart — the store's one cart, inside the Plan.
//
// This step used to be a second cart: its own steppers, its own total, and an
// "Add to cart" that copied packs into the real one (and doubled them when
// pressed twice). It is now the real cart, drawn by the same pieces as the
// cart drawer and /store/cart (components/store/cart/CartView.jsx): this
// week's plan, anything added from the shop, an OFFERED update when the plan
// has moved on, and Checkout.
//
// Prices are the catalogue's MRP; Swiggy's own price, fees and delivery are
// shown by Swiggy before payment. "Targets met" is the planner's own reading
// (lib/plan/planView.js peopleOf), not a figure made here.
//
// Cinematic storefront (Oct 2026): before the week is in the cart, KOI waits
// by the button; putting it in sends the ember to the cart with a tick.

import { useEffect, useMemo, useRef } from "react";
import { peopleOf, rupees } from "@/lib/plan/planView";
import { packsToBuy } from "@/lib/cart/plan";
import { useCartStore } from "@/store/cartStore";
import { useCartGroups, PlanGroup, OwnGroup, PlanChangedBanner, CartSummary, CartLoading } from "@/components/store/cart/CartView";
import { TotalBar } from "@/components/store/cart/CartLayer";
import { StepHead, Footer } from "./bits";
import { setupMotion, prefersReducedMotion, useGSAP, E } from "@/lib/motion/koiMotion";
import { useEmber } from "@/components/store/ember/Ember";
import { useKoiVoice } from "@/store/koiVoiceStore";

export default function ShopStep({ s, onBack, onNext }) {
  const root = useRef(null);
  const ember = useEmber();
  const say = useKoiVoice((v) => v.say);
  const plan = s.plan;
  const days = plan?.days ?? 7;
  const { orderOf } = s;
  const groups = useCartGroups();
  const cartPlan = useCartStore((st) => st.plan);
  const people = useMemo(() => (plan ? peopleOf(plan.report, days).sort((a, b) => orderOf(a.id) - orderOf(b.id)) : []), [plan, days, orderOf]);
  const met = people.filter((p) => p.met).length;
  const notYet = Boolean(plan) && !cartPlan;

  useGSAP(() => {
    if (!plan || groups.loading || prefersReducedMotion()) return;
    setupMotion().from(root.current.querySelectorAll("[data-card], [data-item], [data-summary]"), { autoAlpha: 0, y: 26, duration: 0.8, stagger: 0.05, ease: E.dolly, delay: 0.15, clearProps: "opacity,visibility,transform" });
  }, { scope: root, dependencies: [Boolean(plan), groups.loading] });

  // KOI waits by the button while the week isn't in the cart yet.
  useEffect(() => {
    if (!plan || groups.loading) return undefined;
    if (!notYet) { say("This is your one cart: the week, and anything you added. Checkout hands it to Swiggy."); return undefined; }
    say("The week isn’t in your cart yet. One tap puts it there, and never doubles it.");
    const t = setTimeout(() => {
      const b = root.current?.querySelector("[data-put]");
      if (b) ember.go(b, { ax: 0, ay: 0.5, x: -14 }, () => ember.heartbeat(true));
    }, 1200);
    return () => clearTimeout(t);
  }, [plan, groups.loading, notYet, ember, say]);
  useEffect(() => () => ember.rest(), [ember]);

  if (!plan) {
    return (
      <div>
        <StepHead eyebrow="Plan · step 5 of 6" title="Your cart" sub="Plan the week first — KOI fills the cart from it. Anything you add from the shop is here too." />
        <Footer onBack={onBack} />
      </div>
    );
  }

  const toBuy = packsToBuy(plan.report?.basket ?? [], { atHome: s.have });
  const planCost = (plan.report?.basket ?? []).filter((l) => !s.have.has(String(l.skuId))).reduce((n, l) => n + (Number(l.cost) || 0), 0);
  const put = async () => {
    ember.heartbeat(false);
    ember.status("Filling your cart");
    const done = await s.addToCart();
    ember.status(null);
    if (!done) return;
    say("It’s in your cart. Your own picks stayed where they were.");
    const cart = [...document.querySelectorAll("[data-cart-target]")].find((el) => el.offsetParent !== null);
    if (cart) ember.go(cart, { ax: 1, ay: 0, x: -6, y: 6 }, () => ember.done(() => setTimeout(() => ember.home(), 400)));
  };

  return (
    <div ref={root} className="font-koi-sans text-koi-ink">
      <StepHead eyebrow="Plan · step 5 of 6" title="Your cart" sub="This week's plan and anything you added from the shop. One cart, one checkout." />

      {groups.loading ? <CartLoading /> : (
        <div className="flex flex-col gap-5">
          {notYet ? (
            <section data-card className="flex flex-wrap items-center gap-5 rounded-[28px] bg-koi-forest p-6 text-koi-bg">
              <div className="flex flex-[1_1_280px] flex-col gap-1.5">
                <span className="font-koi-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-koi-mint">This week’s plan{people.length ? ` · for ${people.length}` : ""}</span>
                <span className="font-koi-display text-[26px] font-extrabold leading-tight">Not in your cart yet</span>
                <span className="text-[13.5px] leading-normal text-koi-bg/75">
                  <span className="font-koi-num">{toBuy.length}</span> products, <span className="font-koi-num">{toBuy.reduce((n, l) => n + l.packs, 0)}</span> packs, <span className="font-koi-num">{rupees(planCost)}</span> at MRP{s.have.size ? ` — after the ${s.have.size} you have at home` : ""}.
                </span>
              </div>
              <button data-put type="button" onClick={put} disabled={!toBuy.length || s.cartResult?.busy} className="h-14 rounded-2xl bg-koi-lime px-6 text-[15px] font-bold text-koi-forest disabled:opacity-50">
                {s.cartResult?.busy ? "Putting it in your cart…" : "Put this week in my cart"}
              </button>
            </section>
          ) : (
            <PlanChangedBanner groups={groups} />
          )}

          <div className="grid grid-cols-1 gap-x-10 gap-y-8 lg:grid-cols-[minmax(0,1fr)_400px]">
            <div className="flex min-w-0 flex-col gap-8">
              <PlanGroup groups={groups} editHref="/store/plan?step=pantry" />
              <OwnGroup groups={groups} />
              {!groups.lines.length && !notYet && (
                <section data-card className="rounded-[26px] border border-koi-forest/10 bg-white p-6 text-sm text-koi-ink2">
                  Your cart is empty. Put this week back from the Pantry, or add things from the shop.
                </section>
              )}
            </div>
            <aside className="flex flex-col gap-4 self-start lg:sticky lg:top-[calc(var(--koi-header-h)+84px)]">
              <CartSummary groups={groups} checkoutHref="/store/checkout?from=plan" />
              {people.length > 0 && (
                <section data-card className="flex flex-col gap-2.5 rounded-[22px] border border-koi-forest/10 bg-white p-5">
                  <span className="font-koi-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-koi-ink2">What this week covers</span>
                  <div className="flex items-center gap-3">
                    <span className="font-koi-num text-[26px] font-semibold text-koi-forest">{met} of {people.length}</span>
                    <span className="text-[13.5px] leading-snug text-koi-ink2">{people.length === 1 ? "person meets" : "people meet"} their targets on this plan</span>
                  </div>
                  <button type="button" onClick={() => s.setNav?.("plan")} className="self-start text-[13.5px] font-semibold text-koi-primary hover:underline">See it on the Plan →</button>
                </section>
              )}
            </aside>
          </div>
          <TotalBar total={groups.all.total} products={groups.all.products} href="/store/checkout?from=plan" />
        </div>
      )}

      <Footer onBack={onBack} next={{ label: "Track", onClick: onNext }} />
    </div>
  );
}
