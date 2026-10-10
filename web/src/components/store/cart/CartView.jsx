"use client";

// ============================================================================
// KOI — one cart, three places
//
// The same pieces draw the cart drawer (CartSheet), the /store/cart page and
// the Plan's Cart step, so they cannot disagree about what is in the basket:
//
//   PlanGroup           "This week's plan · for N" — the lines the plan put
//                       there, what was marked at home, and "plan said N"
//                       where the shopper changed a count.
//   OwnGroup            "Also in your cart" — everything the shopper added.
//   PlanChangedBanner   the plan moved since it was added; OFFER the update
//                       (See what changed · Keep my cart · Update cart).
//   CartSummary         MRP total, the honest note about Swiggy's price, and
//                       Checkout.
//   CartRead            KOI's read of the basket, computed from it or absent.
//
// Every ₹ here is catalogue MRP × packs. Swiggy's own price, fees and delivery
// are shown by Swiggy before payment, and the copy says so; there is no
// "Delivery: Free" line, because KOI cannot know it.
// ============================================================================

import { useMemo, useState } from "react";
import Link from "next/link";
import { useCartStore, isDescribable } from "@/store/cartStore";
import { useCartUi } from "@/store/cartUiStore";
import { lineKey, packs, totals } from "@/lib/cart/lines";
import { diffBaskets, basketSnapshot } from "@/lib/cart/plan";
import { putPlanInCart, updateCartToPlan } from "@/lib/cart/client";
import { averageScore, scoredOnly } from "@/lib/score";
import { toPer100, toPerServing } from "@/lib/nutrition/basis";
import { isLowSugar, rowFromProduct } from "@/lib/nutrition/claims";
import { Button, Money, MonoLabel, ProductThumb, QtyStepper, Icon } from "@/components/store/system/primitives";

/**
 * Everything the cart surfaces read, derived once.
 * @returns {object}
 */
export function useCartGroups() {
  const items = useCartStore((s) => s.items);
  const plan = useCartStore((s) => s.plan);
  const hydrated = useCartStore((s) => s.hydrated);
  const resolved = useCartStore((s) => s.resolved);
  const latest = useCartUi((s) => s.latestPlan);

  return useMemo(() => {
    const lines = items.filter(isDescribable);
    const planLines = lines.filter((l) => packs(l.fromPlan) > 0);
    const ownLines = lines.filter((l) => packs(l.fromPlan) === 0);
    const planned = new Map((plan?.basket ?? []).map((b) => [String(b.skuId), packs(b.packs)]));
    const names = new Map();
    for (const b of latest?.basket ?? []) names.set(String(b.skuId), b.name);
    for (const l of lines) if (l.skuId !== null && l.skuId !== undefined) names.set(String(l.skuId), l.name);
    const diff = plan && latest?.basket ? diffBaskets(plan.basket, latest.basket) : null;
    return {
      lines,
      planLines,
      ownLines,
      planned,
      names,
      plan,
      latest: latest ?? null,
      diff: diff?.any ? diff : null,
      all: totals(lines),
      planTotals: totals(planLines),
      ownTotals: totals(ownLines),
      loading: !hydrated || (items.length > 0 && lines.length === 0 && !resolved),
      empty: hydrated && items.length === 0,
    };
  }, [items, plan, hydrated, resolved, latest]);
}

/**
 * One cart line: the pack shot, the name, the count, the money.
 * @param {{ line: object, planned?: number|null, compact?: boolean }} props
 */
export function CartLine({ line, planned = null, compact = false }) {
  const setQty = useCartStore((s) => s.setQty);
  const key = lineKey(line);
  const q = packs(line.quantity);
  const price = Number(line.price);
  const amount = Number.isFinite(price) && price > 0 ? price * q : null;
  const edited = planned !== null && planned !== undefined && planned !== q;
  const meta = [line.brand && line.brand !== "Unknown" ? line.brand : null, line.weight && line.weight !== "N/A" ? line.weight : null].filter(Boolean).join(" · ");
  return (
    <div className="ks-line">
      <ProductThumb src={line.image?.hero || null} alt="" size={compact ? 44 : 52} radius={compact ? 11 : 13} />
      <div className="ks-line-main">
        {line.productId ? (
          <Link href={`/store/product/${line.productId}`} className="ks-line-name">{line.name}</Link>
        ) : (
          <span className="ks-line-name">{line.name}</span>
        )}
        <span className="ks-mono" style={{ letterSpacing: ".06em" }}>
          {meta}
          {edited && <span style={{ color: "var(--koi-warm)" }}>{meta ? " · " : ""}plan said <span className="ks-num">{planned}</span></span>}
        </span>
      </div>
      <QtyStepper value={q} onChange={(n) => setQty(key, n)} label={line.name} />
      <span className="ks-line-amount">{amount !== null ? <Money value={amount} /> : <span className="ks-mono">No price</span>}</span>
    </div>
  );
}

/**
 * "This week's plan · for N". Expands in the drawer; open on a page.
 * @param {{ groups: object, collapsible?: boolean, editHref?: string|null }} props
 */
export function PlanGroup({ groups, collapsible = false, editHref = "/store/plan?step=pantry" }) {
  const [open, setOpen] = useState(!collapsible);
  const { planLines, planned, plan, names, planTotals } = groups;
  const [busy, setBusy] = useState(null);
  if (!plan || (!planLines.length && !(plan.atHome ?? []).length)) return null;
  const members = plan.members ?? groups.latest?.members ?? null;
  const atHome = plan.atHome ?? [];

  const putBack = async (skuId) => {
    setBusy(skuId);
    try {
      await putPlanInCart({ planId: plan.planId, basket: plan.basket, atHome: atHome.filter((s) => s !== skuId), members });
    } finally {
      setBusy(null);
    }
  };

  const head = (
    <>
      <span style={{ width: 36, height: 36, borderRadius: 10, background: "var(--koi-tint)", display: "inline-flex", alignItems: "center", justifyContent: "center", flex: "none", color: "var(--koi-primary)" }}><Icon.Calendar /></span>
      <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 1, textAlign: "left" }}>
        <MonoLabel tone="green">This week&apos;s plan{members ? ` · for ${members}` : ""}</MonoLabel>
        <span style={{ font: "600 13.5px var(--koi-sans-stack)", color: "var(--koi-ink2)" }}>
          <span className="ks-num">{planLines.length}</span> {planLines.length === 1 ? "product" : "products"} · <span className="ks-num">{planTotals.packs}</span> packs
        </span>
      </span>
      <Money value={planTotals.total} size={16} />
    </>
  );

  return (
    <section aria-label="This week's plan" className="ks-card" style={{ overflow: "hidden" }}>
      {collapsible ? (
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", background: "#fbfaf7", border: 0, cursor: "pointer", fontFamily: "inherit" }}>
          {head}
          <Icon.Chevron style={{ color: "var(--koi-ink2)", transform: open ? "rotate(180deg)" : "none", transition: "transform .2s" }} />
        </button>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "16px 20px 12px", background: "#fbfaf7" }}>
          {head}
          {editHref && <Link href={editHref} className="ks-btn" data-variant="ghost" data-size="sm">Edit in Pantry</Link>}
        </div>
      )}
      {open && planLines.map((l) => <CartLine key={lineKey(l)} line={l} planned={planned.get(String(l.skuId)) ?? null} compact={collapsible} />)}
      {open && planLines.length === 0 && (
        <p style={{ margin: 0, padding: "12px 20px", borderTop: "1px solid var(--koi-divider)", font: "400 13.5px var(--koi-sans-stack)", color: "var(--koi-ink2)" }}>Everything on this week&apos;s plan is marked as already at home.</p>
      )}
      {(atHome.length > 0 || collapsible) && (
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "10px 16px", borderTop: "1px solid var(--koi-divider)", font: "400 13px var(--koi-sans-stack)", color: "var(--koi-ink2)" }}>
          {atHome.length > 0 ? (
            <span style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
              <MonoLabel style={{ letterSpacing: ".06em" }}>{atHome.length} at home</MonoLabel>
              {atHome.slice(0, 3).map((skuId) => (
                <span key={skuId} style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                  · {names.get(String(skuId)) ?? "an item"}
                  <button type="button" onClick={() => putBack(skuId)} disabled={busy === skuId} style={{ border: 0, background: "none", padding: 0, cursor: "pointer", font: "600 13px var(--koi-sans-stack)", color: "var(--koi-primary)" }}>
                    {busy === skuId ? "Putting back…" : "Put it back"}
                  </button>
                </span>
              ))}
            </span>
          ) : <span />}
          {collapsible && <Link href="/store/plan?step=shop" style={{ font: "600 13px var(--koi-sans-stack)", textDecoration: "none", color: "var(--koi-primary)" }}>Open in Plan →</Link>}
        </div>
      )}
    </section>
  );
}

/** "Also in your cart": what the shopper added themselves. */
export function OwnGroup({ groups, compact = false, title = "Also in your cart" }) {
  const { ownLines, plan } = groups;
  if (!ownLines.length) return null;
  return (
    <section aria-label={plan ? title : "Your cart"} className="ks-card" style={{ overflow: "hidden" }}>
      {plan && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: compact ? "12px 16px 8px" : "14px 20px 10px" }}>
          <MonoLabel>{title}</MonoLabel>
          {!compact && <Link href="/store/shop" className="ks-btn" data-variant="ghost" data-size="sm">Keep shopping</Link>}
        </div>
      )}
      {ownLines.map((l) => <CartLine key={lineKey(l)} line={l} compact={compact} />)}
    </section>
  );
}

/**
 * The plan moved since the cart was filled. Nothing changes without a tap.
 * @param {{ groups: object, compact?: boolean }} props
 */
export function PlanChangedBanner({ groups, compact = false }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const keepPlanAsIs = useCartStore((s) => s.keepPlanAsIs);
  const setUpdated = useCartUi((s) => s.setUpdated);
  const { diff, latest, names } = groups;
  if (!diff || !latest) return null;
  const n = (k) => diff[k].length;
  const parts = [n("added") && `${n("added")} added`, n("removed") && `${n("removed")} removed`, n("changed") && `${n("changed")} ${n("changed") === 1 ? "count" : "counts"} changed`].filter(Boolean);

  const update = async () => {
    setBusy(true);
    try {
      await updateCartToPlan(latest);
      setUpdated({ at: Date.now() });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section role="status" style={{ background: "var(--koi-warm-bg)", border: "1px solid var(--koi-warm-border)", borderRadius: compact ? 16 : 18, padding: compact ? "12px 14px" : "16px 18px", display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        {!compact && (
          <span style={{ width: 34, height: 34, borderRadius: "50%", background: "var(--koi-warm)", color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", flex: "none" }}><Icon.Refresh /></span>
        )}
        <div style={{ flex: 1, minWidth: 200, display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={{ font: "700 15px var(--koi-sans-stack)", color: "var(--koi-warm-ink)" }}>Your plan changed since you added it</span>
          <span style={{ font: "400 13.5px var(--koi-sans-stack)", color: "#8a5434" }}>{parts.join(" · ")}. Nothing in your cart has moved yet.</span>
        </div>
      </div>
      {open && (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, background: "#fff", borderRadius: 12, overflow: "hidden" }}>
          {diff.added.map((d) => <DiffRow key={`a${d.skuId}`} mark="+" tone="var(--koi-primary)" name={names.get(d.skuId)} right={`× ${d.packs}`} />)}
          {diff.removed.map((d) => <DiffRow key={`r${d.skuId}`} mark="−" tone="var(--koi-red)" name={names.get(d.skuId)} right={`× ${d.packs}`} strike />)}
          {diff.changed.map((d) => <DiffRow key={`c${d.skuId}`} mark="~" tone="var(--koi-warm)" name={names.get(d.skuId)} right={`${d.from} → ${d.to}`} />)}
        </ul>
      )}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {!open ? (
          <Button variant="warm-outline" size="sm" onClick={() => setOpen(true)}>See what changed</Button>
        ) : (
          <Button variant="warm-outline" size="sm" onClick={() => keepPlanAsIs(basketSnapshot(latest.basket))}>Keep my cart</Button>
        )}
        <Button variant="warm" size="sm" onClick={update} busy={busy}>Update cart</Button>
      </div>
    </section>
  );
}

function DiffRow({ mark, tone, name, right, strike = false }) {
  return (
    <li style={{ display: "flex", gap: 10, padding: "9px 12px", font: "400 13.5px var(--koi-sans-stack)", borderTop: "1px solid var(--koi-divider)" }}>
      <span className="ks-num" style={{ color: tone, width: 14 }} aria-hidden="true">{mark}</span>
      <span style={{ flex: 1, textDecoration: strike ? "line-through" : "none", color: strike ? "var(--koi-ink2)" : "var(--koi-ink)" }}>{name ?? "A product no longer in the catalogue"}</span>
      <span className="ks-num">{right}</span>
    </li>
  );
}

/** The one note about price, said once wherever a total is. */
export const SWIGGY_NOTE = "MRP from KOI's catalogue. Swiggy shows the final price, fees and delivery before you pay.";

/**
 * The totals and the way to checkout.
 * @param {{ groups: object, checkoutHref?: string, children?: React.ReactNode }} props
 */
export function CartSummary({ groups, checkoutHref = "/store/checkout", children }) {
  const { all, planTotals, ownTotals, plan } = groups;
  return (
    <section className="ks-card" style={{ padding: 22, display: "flex", flexDirection: "column", gap: 14 }}>
      <MonoLabel>Summary</MonoLabel>
      {plan && planTotals.products > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 9, font: "400 14px var(--koi-sans-stack)" }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "var(--koi-ink2)" }}>This week&apos;s plan</span><Money value={planTotals.total} /></div>
          {ownTotals.products > 0 && <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "var(--koi-ink2)" }}>Also in your cart</span><Money value={ownTotals.total} /></div>}
        </div>
      )}
      <div style={{ borderTop: plan && planTotals.products > 0 ? "1px solid var(--koi-divider)" : "none", paddingTop: plan && planTotals.products > 0 ? 14 : 0, display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span style={{ font: "700 15px var(--koi-sans-stack)" }}>MRP total</span>
        <Money value={all.total} size={30} style={{ letterSpacing: "-.02em" }} />
      </div>
      <MonoLabel style={{ letterSpacing: ".06em" }}>
        <span className="ks-num">{all.products}</span> {all.products === 1 ? "product" : "products"} · <span className="ks-num">{all.packs}</span> packs
        {all.unpriced > 0 && <> · <span className="ks-num">{all.unpriced}</span> without a price yet</>}
      </MonoLabel>
      <Button href={checkoutHref} size="lg" block disabled={!all.products}>Checkout <span aria-hidden="true">→</span></Button>
      <p style={{ margin: 0, font: "400 12.5px/1.5 var(--koi-sans-stack)", color: "var(--koi-ink2)" }}>{SWIGGY_NOTE}</p>
      {children}
    </section>
  );
}

// ── KOI's read of the basket ───────────────────────────────────────────────
// Every figure is computed from the basket or the tile is absent. Macros are
// declared on the product's own basis — per 100 g for almost every live row —
// so they are converted before anything is added up. Nothing is multiplied by
// quantity: a basket total would need servings-per-pack, which a line does not
// carry. (Moved here unchanged in substance from the old cart page.)
const proteinInServing = (item) => {
  const v = toPerServing(rowFromProduct(item)).protein_g;
  return Number.isFinite(Number(v)) && v !== null ? Number(v) : null;
};
const sugarDeclared = (item) => {
  const v = toPer100(rowFromProduct(item)).sugars_g;
  return v !== null && Number.isFinite(Number(v));
};

export function CartRead({ lines }) {
  const scored = scoredOnly(lines);
  const avgScore = averageScore(lines);
  const proteins = lines.map(proteinInServing).filter((v) => v !== null);
  const protein = proteins.length ? Math.round(proteins.reduce((s, v) => s + v, 0)) : null;
  const sugars = lines.filter(sugarDeclared);
  const lowSugar = sugars.filter((i) => isLowSugar(rowFromProduct(i))).length;
  if (avgScore === null && protein === null && !sugars.length) return null;
  const tile = { background: "rgba(255,255,255,.07)", borderRadius: 14, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 2 };
  return (
    <section className="ks-card" data-tone="deep" style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
      <MonoLabel tone="mint">KOI&apos;s read of this cart</MonoLabel>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
        {avgScore !== null && <div style={tile}><span className="ks-num" style={{ fontSize: 20 }}>{avgScore}</span><MonoLabel style={{ color: "rgba(255,255,255,.7)" }}>Avg KOI score · {scored.length} scored</MonoLabel></div>}
        {sugars.length > 0 && <div style={tile}><span className="ks-num" style={{ fontSize: 20 }}>{lowSugar} of {sugars.length}</span><MonoLabel style={{ color: "rgba(255,255,255,.7)" }}>Low sugar · ≤5 g/100 g</MonoLabel></div>}
        {protein !== null && <div style={tile}><span className="ks-num" style={{ fontSize: 20 }}>{protein} g</span><MonoLabel style={{ color: "rgba(255,255,255,.7)" }}>Protein · one serving each of {proteins.length}</MonoLabel></div>}
      </div>
    </section>
  );
}

/** Two honest routes in, no filler products. */
export function CartEmpty({ onNavigate }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 12, padding: "48px 16px" }}>
      <span style={{ width: 64, height: 64, borderRadius: "50%", background: "#fff", border: "1px solid var(--koi-line2)", display: "inline-flex", alignItems: "center", justifyContent: "center", color: "#8fae98" }}><Icon.Bag style={{ width: 26, height: 26 }} /></span>
      <span style={{ font: "800 20px var(--koi-sans-stack)", letterSpacing: "-.02em" }}>Your cart is empty</span>
      <span style={{ font: "400 14px/1.5 var(--koi-sans-stack)", color: "var(--koi-ink2)", maxWidth: 300 }}>Plan the week and KOI fills it, or pick things yourself.</span>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
        <Button href="/store/plan" size="sm" onClick={onNavigate}>Plan this week</Button>
        <Button href="/store/shop" variant="secondary" size="sm" onClick={onNavigate}>Browse the shop</Button>
      </div>
    </div>
  );
}

/** While the saved basket is still being matched to the catalogue. */
export function CartLoading() {
  return (
    <div role="status" style={{ display: "flex", alignItems: "center", gap: 10, padding: "32px 16px", font: "500 14px var(--koi-sans-stack)", color: "var(--koi-ink2)" }}>
      <span aria-hidden="true" style={{ width: 14, height: 14, border: "2px solid var(--koi-track)", borderTopColor: "var(--koi-accent)", borderRadius: "50%", animation: "koiSpin .8s linear infinite" }} />
      Loading your cart…
    </div>
  );
}
