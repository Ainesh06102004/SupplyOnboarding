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

import { useMemo } from "react";
import { peopleOf, rupees } from "@/lib/plan/planView";
import { packsToBuy } from "@/lib/cart/plan";
import { useCartStore } from "@/store/cartStore";
import { useCartGroups, PlanGroup, OwnGroup, PlanChangedBanner, CartSummary, CartLoading } from "@/components/store/cart/CartView";
import { TotalBar } from "@/components/store/cart/CartLayer";
import { Button, MonoLabel } from "@/components/store/system/primitives";
import { C, font } from "./tokens";
import { StepHead, Footer } from "./bits";

export default function ShopStep({ s, onBack, onNext }) {
  const plan = s.plan;
  const days = plan?.days ?? 7;
  const { orderOf } = s;
  const groups = useCartGroups();
  const cartPlan = useCartStore((st) => st.plan);
  const people = useMemo(() => (plan ? peopleOf(plan.report, days).sort((a, b) => orderOf(a.id) - orderOf(b.id)) : []), [plan, days, orderOf]);
  const met = people.filter((p) => p.met).length;

  if (!plan) {
    return (
      <div>
        <StepHead title="Your cart" sub="Plan the week first — KOI fills the cart from it. Anything you add from the shop is here too." />
        <Footer onBack={onBack} />
      </div>
    );
  }

  const notYet = !cartPlan;
  const toBuy = packsToBuy(plan.report?.basket ?? [], { atHome: s.have });
  const planCost = (plan.report?.basket ?? []).filter((l) => !s.have.has(String(l.skuId))).reduce((n, l) => n + (Number(l.cost) || 0), 0);

  return (
    <div>
      <StepHead title="Your cart" sub="This week's plan and anything you added from the shop. One cart, one checkout." />

      {groups.loading ? <CartLoading /> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {notYet ? (
            <section style={{ background: C.deep, borderRadius: 22, padding: 22, color: "#fff", display: "flex", flexWrap: "wrap", alignItems: "center", gap: 18, animation: "koiUp .35s ease" }}>
              <div style={{ flex: "1 1 280px", display: "flex", flexDirection: "column", gap: 6 }}>
                <MonoLabel tone="mint">This week&apos;s plan{people.length ? ` · for ${people.length}` : ""}</MonoLabel>
                <span style={{ font: font(700, 19) }}>Not in your cart yet</span>
                <span style={{ font: font(400, 13, "sans", 1.5), color: "rgba(255,255,255,.75)" }}>
                  <span className="ks-num">{toBuy.length}</span> products, <span className="ks-num">{toBuy.reduce((n, l) => n + l.packs, 0)}</span> packs, {rupees(planCost)} at MRP{s.have.size ? ` — after the ${s.have.size} you have at home` : ""}.
                </span>
              </div>
              <Button variant="mint" size="lg" onClick={s.addToCart} busy={s.cartResult?.busy} disabled={!toBuy.length}>Put this week in my cart</Button>
            </section>
          ) : (
            <PlanChangedBanner groups={groups} />
          )}

          <div className="ks-split">
            <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
              <PlanGroup groups={groups} editHref="/store/plan?step=pantry" />
              <OwnGroup groups={groups} />
              {!groups.lines.length && !notYet && (
                <section className="ks-card" style={{ padding: 22, font: font(400, 14), color: C.ink2 }}>
                  Your cart is empty. Put this week back from the Pantry, or add things from the shop.
                </section>
              )}
            </div>
            <aside className="ks-rail">
              <CartSummary groups={groups} checkoutHref="/store/checkout?from=plan" />
              {people.length > 0 && (
                <section style={{ background: C.deep, borderRadius: 22, padding: "18px 20px", color: "#fff", display: "flex", flexDirection: "column", gap: 10 }}>
                  <MonoLabel tone="mint">What this week covers</MonoLabel>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span className="ks-num" style={{ fontSize: 26 }}>{met} of {people.length}</span>
                    <span style={{ font: font(400, 13.5, "sans", 1.4), color: "rgba(255,255,255,.78)" }}>{people.length === 1 ? "person meets" : "people meet"} their targets on this plan</span>
                  </div>
                  <button type="button" onClick={() => s.setNav?.("plan")} style={{ alignSelf: "flex-start", border: 0, background: "none", padding: 0, cursor: "pointer", font: font(600, 13.5), color: C.mint }}>See it on the Plan →</button>
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
