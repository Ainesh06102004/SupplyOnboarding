"use client";

// ============================================================================
// /store/cart — the one cart, full page
//
// The same pieces as the cart drawer and the Plan's Cart step (components/
// store/cart/CartView.jsx): this week's plan, what the shopper added, an
// offered update when the plan has moved on, the MRP total and Checkout.
//
// Gone from the old page: "Delivery Fee: Free" (KOI cannot know Swiggy's fee;
// checkout had already removed it) and the floating mobile checkout card that
// sat on top of the tab bar and the agent dock. On phones the total sits in
// the one bottom stack instead (TotalBar).
// ============================================================================

import { useEffect, useMemo, useState } from "react";
import { useCartStore } from "@/store/cartStore";
import { getSeedCatalogue } from "@/components/store/shop/shopData";
import { mergeCatalogue } from "@/lib/data/mergeCatalogue";
import { getCatalogue } from "@/lib/cart/client";
import { hasScore } from "@/lib/score";
import { useAddToCart, TotalBar } from "@/components/store/cart/CartLayer";
import { useCartGroups, PlanGroup, OwnGroup, PlanChangedBanner, CartSummary, CartRead, CartEmpty, CartLoading } from "@/components/store/cart/CartView";
import { MonoLabel, Money, ProductThumb, ScoreBadge } from "@/components/store/system/primitives";

export default function CartPage() {
  const groups = useCartGroups();
  const { all, lines } = groups;

  return (
    <main className="ks-page ks-page-pad" style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <h1 className="ks-h1">Your cart</h1>
        <p className="ks-lede">This week&apos;s plan and anything you added from the shop. One cart, one checkout.</p>
      </div>

      {groups.loading ? <CartLoading /> : !lines.length ? (
        <section className="ks-card"><CartEmpty /></section>
      ) : (
        <>
          <PlanChangedBanner groups={groups} />
          <div className="ks-split">
            <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
              <PlanGroup groups={groups} />
              <OwnGroup groups={groups} />
              <Suggestions lines={lines} />
            </div>
            <aside className="ks-rail">
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
function Suggestions({ lines }) {
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
    <section style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <h2 style={{ margin: 0, font: "800 20px var(--koi-sans-stack)", letterSpacing: "-.02em" }}>Complete your basket</h2>
        <MonoLabel>Highest KOI scores you haven&apos;t added</MonoLabel>
      </div>
      <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 6, scrollbarWidth: "thin" }}>
        {suggestions.map((p) => (
          <article key={p.id} className="ks-card" style={{ width: 176, flex: "none", padding: 10, display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ position: "relative" }}>
              <ProductThumb src={p.image?.hero || null} alt={p.name} size={154} radius={14} />
              <span style={{ position: "absolute", top: 6, left: 6 }}><ScoreBadge score={p.score} size={32} /></span>
            </div>
            <MonoLabel style={{ letterSpacing: ".08em" }}>{p.brand}</MonoLabel>
            <span style={{ font: "700 13.5px/1.3 var(--koi-sans-stack)", minHeight: 35 }}>{p.name}</span>
            <div style={{ marginTop: "auto", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <Money value={p.price} size={15} />
              <button type="button" onClick={() => add(p)} className="ks-btn" data-variant="secondary" data-size="sm" aria-label={`Add ${p.name}`} style={{ minHeight: 34, padding: "6px 12px", color: "var(--koi-primary)", borderColor: "var(--koi-tint-border)" }}>+ Add</button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
