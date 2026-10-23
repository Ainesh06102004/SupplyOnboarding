"use client";

// ============================================================================
// KOI — one cart, three places
//
// The same pieces draw the cart drawer (CartSheet), the /store/cart page and
// the Plan's Cart step, so they cannot disagree about what is in the basket:
//
//   PlanGroup           "This week · from your plan" — the lines the plan put
//                       there, what was marked at home, and "plan said N"
//                       where the shopper changed a count.
//   OwnGroup            "You added" — everything the shopper added, and from
//                       where when it says (the Plan's Pantry shop).
//   PlanChangedBanner   the plan moved since it was added; OFFER the update
//                       (See what changed · Keep my cart · Update cart).
//   CartSummary         MRP total, the honest note about Swiggy's price, and
//                       Checkout.
//   CartRead            KOI's read of the basket, computed from it or absent.
//
// Every ₹ here is catalogue MRP × packs. Swiggy's own price, fees and delivery
// are shown by Swiggy before payment, and the copy says so; there is no
// "Delivery: Free" line, because KOI cannot know it.
//
// Cinematic storefront (Oct 2026): drawn in the koi-* Tailwind tokens; rows
// carry data-item so the page can move them and KOI can point at them.
// ============================================================================

import { useMemo, useState } from "react";
import Link from "next/link";
import { useCartStore, isDescribable } from "@/store/cartStore";
import { useCartUi } from "@/store/cartUiStore";
import { lineKey, packs, totals } from "@/lib/cart/lines";
import { diffBaskets, basketSnapshot } from "@/lib/cart/plan";
import { putPlanInCart, updateCartToPlan } from "@/lib/cart/client";
import { averageScore, scoredOnly, hasScore } from "@/lib/score";
import { toPer100, toPerServing } from "@/lib/nutrition/basis";
import { isLowSugar, rowFromProduct } from "@/lib/nutrition/claims";
import { Money, ProductThumb, QtyStepper, Icon } from "@/components/store/system/primitives";

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

const scoreTone = (n) => (n >= 80 ? "border-koi-tint-border bg-koi-tint text-koi-primary" : n >= 50 ? "border-koi-amber-border bg-koi-amber-bg text-koi-amber-ink" : "border-koi-warm-border bg-koi-warm-bg text-koi-warm-ink");
const mono = "font-koi-mono text-[11px] font-semibold uppercase tracking-[0.16em]";

/**
 * One cart line: the pack shot, the name, the count, the money.
 * @param {{ line: object, planned?: number|null, compact?: boolean }} props
 */
export function CartLine({ line, planned = null, compact = false, forWhom = null }) {
  const setQty = useCartStore((s) => s.setQty);
  const key = lineKey(line);
  const q = packs(line.quantity);
  const price = Number(line.price);
  const amount = Number.isFinite(price) && price > 0 ? price * q : null;
  const edited = planned !== null && planned !== undefined && planned !== q;
  const meta = [line.brand && line.brand !== "Unknown" ? line.brand : null, line.weight && line.weight !== "N/A" ? line.weight : null].filter(Boolean).join(" · ");
  const scored = hasScore(line.score);
  const name = line.productId ? (
    <Link href={`/store/product/${line.productId}`} className="text-inherit no-underline hover:underline">{line.name}</Link>
  ) : line.name;
  return (
    <li
      data-item={key}
      className={`grid items-center border-b border-koi-forest/10 last:border-b-0 ${compact ? "grid-cols-[44px_minmax(0,1fr)_auto_auto] gap-3 px-4 py-3" : "grid-cols-[56px_minmax(0,1fr)_auto] gap-3 py-4 sm:grid-cols-[76px_minmax(0,1fr)_auto_92px] sm:gap-4"}`}
    >
      <ProductThumb src={line.image?.hero || null} alt="" size={compact ? 44 : 76} radius={compact ? 11 : 16} />
      <div className="flex min-w-0 flex-col gap-1">
        {meta && <span className="truncate font-koi-mono text-[10.5px] font-medium uppercase tracking-[0.13em] text-koi-muted">{meta}</span>}
        <span className={`font-bold leading-snug text-koi-ink ${compact ? "text-[14px]" : "text-[15.5px] sm:text-[17px]"}`}>{name}</span>
        {forWhom && <span className="text-[12.5px] font-medium text-koi-primary">{forWhom}</span>}
        {(!compact && scored) || edited ? (
          <span className="flex flex-wrap gap-1.5">
            {!compact && scored && <span className={`rounded-full border px-2.5 py-0.5 font-koi-num text-[11.5px] font-bold ${scoreTone(Number(line.score))}`}>KOI {Math.round(Number(line.score))}</span>}
            {edited && <span className="rounded-full border border-koi-warm-border bg-koi-warm-bg px-2.5 py-0.5 text-[11.5px] font-semibold text-koi-warm-ink">plan said <span className="font-koi-num">{planned}</span></span>}
          </span>
        ) : null}
      </div>
      <QtyStepper value={q} onChange={(n) => setQty(key, n)} label={line.name} />
      <span className={`text-right font-koi-num font-semibold ${compact ? "min-w-[52px] text-[14px]" : "col-start-2 row-start-2 text-left text-base sm:col-start-auto sm:row-start-auto sm:text-right sm:text-lg"}`}>
        {amount !== null ? <Money value={amount} /> : <span className="font-koi-mono text-[11px] text-koi-muted">No price</span>}
      </span>
    </li>
  );
}

/**
 * "This week · from your plan". Expands in the drawer; open on a page.
 * @param {{ groups: object, collapsible?: boolean, editHref?: string|null }} props
 */
/** "For Me and Kid 1" / "For everyone": who a planned line is for (Plan · Cart board). */
const forLine = (eaters, everyone) => {
  if (!eaters?.length) return null;
  if (everyone > 1 && eaters.length >= everyone) return "For everyone";
  const names = eaters.map((p) => p.label);
  return `For ${names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : names[0]}`;
};

export function PlanGroup({ groups, collapsible = false, editHref = "/store/plan?step=pantry", eaters = null, everyone = 0 }) {
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

  const summary = (
    <span className="text-[13px] font-semibold text-koi-ink2">
      <span className="font-koi-num">{planLines.length}</span> {planLines.length === 1 ? "product" : "products"} · <span className="font-koi-num">{planTotals.packs}</span> packs · <Money value={planTotals.total} />
    </span>
  );

  return (
    <section aria-label="This week's plan" className={collapsible ? "overflow-hidden rounded-[20px] border border-koi-forest/10 bg-white" : ""}>
      {collapsible ? (
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center gap-3 bg-koi-paper px-4 py-3.5 text-left">
          <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-koi-tint text-koi-primary"><Icon.Calendar /></span>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className={`${mono} text-koi-primary`}>This week · from your plan{members ? ` · for ${members}` : ""}</span>
            {summary}
          </span>
          <Icon.Chevron className={`text-koi-ink2 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-koi-forest/15 pb-3">
          <span className="flex flex-col gap-1">
            <span className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-koi-lime px-2.5 py-0.5 font-koi-mono text-[10.5px] font-bold uppercase tracking-[0.08em] text-koi-forest">Plan</span>
              <span className="font-koi-display text-[22px] font-extrabold leading-tight text-koi-forest">From this week&apos;s plan{members ? ` · for ${members}` : ""}</span>
            </span>
            <span className="text-[13px] text-koi-ink2">Bought so the week works. Each line says who it&apos;s for.</span>
            {summary}
          </span>
          {editHref && <Link href={editHref} className="text-sm font-semibold text-koi-primary hover:underline">Edit in Pantry</Link>}
        </div>
      )}
      {open && planLines.length > 0 && (
        <ol className="m-0 list-none p-0">
          {planLines.map((l) => <CartLine key={lineKey(l)} line={l} planned={planned.get(String(l.skuId)) ?? null} compact={collapsible} forWhom={eaters ? forLine(eaters.get(String(l.skuId)), everyone) : null} />)}
        </ol>
      )}
      {open && planLines.length === 0 && (
        <p className="m-0 border-t border-koi-forest/10 px-4 py-3 text-[13.5px] text-koi-ink2">Everything on this week’s plan is marked as already at home.</p>
      )}
      {(atHome.length > 0 || collapsible) && (
        <div className={`flex flex-wrap items-center justify-between gap-2.5 text-[13px] text-koi-ink2 ${collapsible ? "border-t border-koi-forest/10 px-4 py-2.5" : "pt-3"}`}>
          {atHome.length > 0 ? (
            <span className="flex flex-wrap items-center gap-1.5">
              <span className="font-koi-mono text-[10.5px] font-semibold uppercase tracking-[0.1em] text-koi-muted"><span className="font-koi-num">{atHome.length}</span> at home</span>
              {atHome.slice(0, 3).map((skuId) => (
                <span key={skuId} className="inline-flex items-center gap-1.5">
                  · {names.get(String(skuId)) ?? "an item"}
                  <button type="button" onClick={() => putBack(skuId)} disabled={busy === skuId} className="font-semibold text-koi-primary disabled:opacity-60">
                    {busy === skuId ? "Putting back…" : "Put it back"}
                  </button>
                </span>
              ))}
            </span>
          ) : <span />}
          {collapsible && <Link href="/store/plan?step=shop" className="font-semibold text-koi-primary no-underline">Open in Plan →</Link>}
        </div>
      )}
    </section>
  );
}

/** Where a line the shopper added came from, when it was somewhere worth saying. */
const ADDED_FROM = Object.freeze({ pantry: "Added from the Pantry shop" });

/** "You added": what the shopper added themselves, apart from the plan. */
export function OwnGroup({ groups, compact = false, title = "You added" }) {
  const { ownLines, ownTotals, plan } = groups;
  if (!ownLines.length) return null;
  return (
    <section aria-label={plan ? title : "Your cart"} className={compact ? "overflow-hidden rounded-[20px] border border-koi-forest/10 bg-white" : ""}>
      {compact ? (
        <div className="flex items-center justify-between gap-3 px-4 pb-1 pt-3">
          <span className={`${mono} text-koi-ink2`}>{plan ? title : "In your cart"}</span>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-koi-forest/15 pb-3">
          <span className="flex flex-col gap-1">
            <span className="flex flex-wrap items-center gap-2">
              {plan && <span className="rounded-full bg-koi-warm-bg px-2.5 py-0.5 font-koi-mono text-[10.5px] font-bold uppercase tracking-[0.08em] text-koi-warm-ink">You</span>}
              <span className="font-koi-display text-[22px] font-extrabold leading-tight text-koi-forest">{plan ? title : "In your cart"}</span>
            </span>
            {plan && <span className="text-[13px] text-koi-ink2">Not planned around. KOI still screens them for everyone at home.</span>}
            <span className="text-[13px] font-semibold text-koi-ink2"><span className="font-koi-num">{ownLines.length}</span> {ownLines.length === 1 ? "product" : "products"} · <Money value={ownTotals.total} /></span>
          </span>
          <Link href="/store/shop" className="text-sm font-semibold text-koi-primary hover:underline">Keep shopping</Link>
        </div>
      )}
      <ol className="m-0 list-none p-0">
        {ownLines.map((l) => <CartLine key={lineKey(l)} line={l} compact={compact} forWhom={ADDED_FROM[l.addedFrom] ?? null} />)}
      </ol>
    </section>
  );
}

/**
 * The plan moved since the cart was filled. Nothing changes without a tap.
 * @param {{ groups: object, compact?: boolean, onDecide?: (how: "kept"|"updated") => void }} props
 */
export function PlanChangedBanner({ groups, compact = false, onDecide }) {
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
      onDecide?.("updated");
    } finally {
      setBusy(false);
    }
  };
  const keep = () => {
    keepPlanAsIs(basketSnapshot(latest.basket));
    onDecide?.("kept");
  };

  return (
    <section data-banner role="status" className={`flex flex-col gap-3 border border-koi-amber-border bg-koi-amber-bg ${compact ? "rounded-2xl px-3.5 py-3" : "rounded-[22px] px-5 py-4"}`}>
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <div className="flex min-w-0 items-start gap-3.5">
          {!compact && (
            <span aria-hidden="true" className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full bg-white text-koi-amber-ink"><Icon.Refresh /></span>
          )}
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="text-[15px] font-bold text-koi-ink">Your plan changed since you added it</span>
            <span className="text-[13.5px] leading-normal text-koi-ink2">{parts.join(" · ")}. Your cart stays as it is until you say.</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="flex h-11 items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold text-koi-amber-ink transition-colors hover:bg-white">
            See what changed
            <svg className={`size-4 transition-transform ${open ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
          </button>
          {open && <button type="button" onClick={keep} className="h-11 rounded-full border border-koi-forest/20 bg-white px-4 text-sm font-semibold text-koi-forest">Keep my cart</button>}
          <button type="button" onClick={update} disabled={busy} aria-busy={busy} className="h-11 rounded-full bg-koi-forest px-4 text-sm font-bold text-koi-lime disabled:opacity-70">{busy ? "Updating…" : "Update cart"}</button>
        </div>
      </div>
      {open && (
        <ul className="m-0 list-none overflow-hidden rounded-2xl bg-white p-0 text-sm">
          {diff.added.map((d) => <DiffRow key={`a${d.skuId}`} mark="+" tone="text-koi-primary" name={names.get(d.skuId)} right={`× ${d.packs}`} />)}
          {diff.removed.map((d) => <DiffRow key={`r${d.skuId}`} mark="−" tone="text-koi-red" name={names.get(d.skuId)} right={`× ${d.packs}`} strike />)}
          {diff.changed.map((d) => <DiffRow key={`c${d.skuId}`} mark="~" tone="text-koi-warm" name={names.get(d.skuId)} right={`${d.from} → ${d.to}`} />)}
        </ul>
      )}
    </section>
  );
}

function DiffRow({ mark, tone, name, right, strike = false }) {
  return (
    <li className="flex gap-2.5 border-t border-koi-forest/10 px-3.5 py-2.5 first:border-t-0">
      <span className={`w-3.5 font-koi-num ${tone}`} aria-hidden="true">{mark}</span>
      <span className={`flex-1 ${strike ? "text-koi-ink2 line-through" : "text-koi-ink"}`}>{name ?? "A product no longer in the catalogue"}</span>
      <span className="font-koi-num font-semibold">{right}</span>
    </li>
  );
}

/** The one note about price, said once wherever a total is. */
export const SWIGGY_NOTE = "MRP from KOI's catalogue. Swiggy shows the final price, fees and delivery before you pay.";

/**
 * The totals and the way to checkout: the forest summary.
 * @param {{ groups: object, checkoutHref?: string, children?: React.ReactNode }} props
 */
export function CartSummary({ groups, checkoutHref = "/store/checkout", children }) {
  const { all, planTotals, ownTotals, plan, lines } = groups;
  const avg = averageScore(lines);
  const ready = all.products > 0;
  return (
    <section data-summary aria-label="Summary" className="rounded-[26px] bg-koi-forest p-6 text-koi-bg">
      <div className="flex items-baseline justify-between">
        <span className="font-koi-display text-2xl font-extrabold">Summary</span>
        <span className="font-koi-mono text-[11px] font-medium uppercase tracking-[0.14em] text-koi-bg/70">MRP</span>
      </div>
      <dl className="m-0 mt-5 flex flex-col gap-3 border-b border-koi-bg/15 pb-5 text-sm">
        {plan && planTotals.products > 0 && (
          <div className="flex justify-between"><dt className="text-koi-bg/75">From the plan · <span className="font-koi-num">{planTotals.products}</span></dt><dd className="m-0 font-koi-num font-semibold"><Money value={planTotals.total} /></dd></div>
        )}
        {plan && planTotals.products > 0 && ownTotals.products > 0 && (
          <div className="flex justify-between"><dt className="text-koi-bg/75">You added · <span className="font-koi-num">{ownTotals.products}</span></dt><dd className="m-0 font-koi-num font-semibold"><Money value={ownTotals.total} /></dd></div>
        )}
        <div className="flex justify-between"><dt className="text-koi-bg/75">Products</dt><dd className="m-0 font-koi-num font-semibold">{all.products}</dd></div>
        <div className="flex justify-between"><dt className="text-koi-bg/75">Packs</dt><dd className="m-0 font-koi-num font-semibold">{all.packs}</dd></div>
        {avg !== null && <div className="flex justify-between"><dt className="text-koi-bg/75">Average KOI score</dt><dd className="m-0 font-koi-num font-semibold">{avg}</dd></div>}
        {all.unpriced > 0 && <div className="flex justify-between"><dt className="text-koi-bg/75">Without a price yet</dt><dd className="m-0 font-koi-num font-semibold">{all.unpriced}</dd></div>}
      </dl>
      <div className="flex items-baseline justify-between pt-5">
        <span className="text-sm text-koi-bg/75">MRP total</span>
        <span data-total className="inline-block font-koi-num text-[38px] font-semibold leading-none text-koi-lime"><Money value={all.total} /></span>
      </div>
      <p className="m-0 mt-3 text-[13px] leading-relaxed text-koi-bg/75">{SWIGGY_NOTE} KOI never takes payment.</p>
      {ready ? (
        <Link data-checkout href={checkoutHref} className="mt-6 flex h-[58px] items-center justify-center gap-2.5 rounded-full bg-koi-lime text-base font-bold text-koi-forest no-underline transition-transform hover:-translate-y-0.5">
          Checkout
          <svg className="size-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></svg>
        </Link>
      ) : (
        <span aria-disabled="true" className="mt-6 flex h-[58px] items-center justify-center rounded-full bg-koi-bg/15 text-base font-bold text-koi-bg/60">Checkout</span>
      )}
      <Link href="/store/shop" className="mt-2.5 flex h-11 items-center justify-center rounded-full text-sm font-semibold text-koi-bg/85 no-underline transition-colors hover:bg-koi-bg/10">Keep shopping</Link>
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
  const tile = "flex flex-col gap-0.5 rounded-[14px] border border-koi-forest/10 bg-white px-3 py-2.5";
  const label = "font-koi-mono text-[10px] font-medium uppercase tracking-[0.12em] text-koi-muted";
  return (
    <section data-read className="flex flex-col gap-3 rounded-[22px] border border-koi-forest/10 bg-koi-paper p-5">
      <span className="flex items-center gap-2 font-koi-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-koi-ink2">
        <span aria-hidden="true" className="size-[7px] rounded-full bg-koi-ember" />KOI’s read of this cart
      </span>
      <div className="grid grid-cols-2 gap-2.5">
        {avgScore !== null && <div className={tile}><span className="font-koi-num text-xl font-semibold">{avgScore}</span><span className={label}>Avg KOI score · {scored.length} scored</span></div>}
        {sugars.length > 0 && <div className={tile}><span className="font-koi-num text-xl font-semibold">{lowSugar} of {sugars.length}</span><span className={label}>Low sugar · ≤5 g/100 g</span></div>}
        {protein !== null && <div className={tile}><span className="font-koi-num text-xl font-semibold">{protein} g</span><span className={label}>Protein · one serving each of {proteins.length}</span></div>}
      </div>
    </section>
  );
}

/** Two honest routes in, no filler products. */
export function CartEmpty({ onNavigate }) {
  return (
    <div className="flex flex-col items-center gap-3 px-4 py-12 text-center">
      <span className="grid size-16 place-items-center rounded-full border border-koi-forest/10 bg-white text-koi-green"><Icon.Bag style={{ width: 26, height: 26 }} /></span>
      <span className="text-xl font-extrabold tracking-[-0.02em]">Your cart is empty</span>
      <span className="max-w-[300px] text-sm leading-normal text-koi-ink2">Plan the week and KOI fills it, or pick things yourself.</span>
      <div className="flex flex-wrap justify-center gap-2">
        <Link href="/store/plan" onClick={onNavigate} className="flex h-11 items-center rounded-full bg-koi-forest px-5 text-sm font-bold text-koi-lime no-underline">Plan this week</Link>
        <Link href="/store/shop" onClick={onNavigate} className="flex h-11 items-center rounded-full border border-koi-forest/20 bg-white px-5 text-sm font-semibold text-koi-forest no-underline">Browse the shop</Link>
      </div>
    </div>
  );
}

/** While the saved basket is still being matched to the catalogue. */
export function CartLoading() {
  return (
    <div role="status" className="flex items-center gap-2.5 px-4 py-8 text-sm font-medium text-koi-ink2">
      <span aria-hidden="true" className="size-3.5 animate-spin rounded-full border-2 border-koi-track border-t-koi-green" />
      Loading your cart…
    </div>
  );
}
