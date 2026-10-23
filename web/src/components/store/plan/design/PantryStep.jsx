"use client";

// Step 4 · Pantry — one order, the whole week.
//
// The design compared "your cart before KOI" with "your KOI cart". KOI has no
// record of a cart before it, so the comparison is the one it can make
// honestly: your last plan against this one. Unticking a line means "I have
// this at home": it stays in the plan and is left out of the cart.
//
// Below it, the whole shop (PantryShop): anything else for the week goes in the
// same cart, as the shopper's own.
//
// It ends with "Put this week in my cart": the plan's packs go into the store's
// ONE cart (lib/cart/client.js putPlanInCart), replacing whatever the plan put
// there before — pressing it again never doubles — and the shopper's own items
// stay. Then the Cart step shows that cart.
//
// Cinematic storefront (Oct 2026): the canvas's pantry. KOI carries the week to
// the cart (the ember flies there and ticks) before the step moves on.

import Link from "next/link";
import { useEffect, useMemo, useRef } from "react";
import { proteinSources, peopleOf, rupees } from "@/lib/plan/planView";
import { inr } from "./tokens";
import { StepHead, Footer, Unverified } from "./bits";
import { useCartStore } from "@/store/cartStore";
import { ProductThumb } from "@/components/store/system/primitives";
import { setupMotion, prefersReducedMotion, useGSAP, E } from "@/lib/motion/koiMotion";
import { useEmber } from "@/components/store/ember/Ember";
import { useKoiVoice } from "@/store/koiVoiceStore";
import PantryShop from "./PantryShop";

const monoHead = "font-koi-mono text-[11px] font-semibold uppercase tracking-[0.16em]";

function Check({ on, onClick, label }) {
  return (
    <button type="button" role="checkbox" aria-checked={on} aria-label={label} onClick={onClick} className={`grid size-7 shrink-0 place-items-center rounded-lg border-2 transition-colors ${on ? "border-koi-forest bg-koi-forest text-koi-lime" : "border-koi-forest/25 bg-white text-transparent"}`}>
      <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12 5 5 9-10" /></svg>
    </button>
  );
}

export default function PantryStep({ s, onBack, onNext }) {
  const root = useRef(null);
  const ember = useEmber();
  const say = useKoiVoice((v) => v.say);
  const plan = s.plan;
  const lines = s.lines;
  const days = plan?.days ?? 7;
  const { orderOf } = s;
  const people = useMemo(() => (plan ? peopleOf(plan.report, days).sort((a, b) => orderOf(a.id) - orderOf(b.id)) : []), [plan, days, orderOf]);
  const sources = useMemo(() => proteinSources(lines, days), [lines, days]);
  const labelsById = Object.fromEntries((plan?.report?.perMember ?? []).map((m) => [String(m.id), m.label ?? "Someone"]));
  const swappedIn = new Set(s.requests.filter((r) => !r.undone && r.kind === "upgrade").flatMap((r) => (r.basketChange?.added ?? []).map((a) => String(a.skuId))));
  const cartPlan = useCartStore((st) => st.plan);
  const ownCount = useCartStore((st) => st.items.filter((i) => !(Number(i.fromPlan) > 0)).length);

  useGSAP(() => {
    if (!plan) return;
    const gsap = setupMotion();
    const qa = (sel) => root.current.querySelectorAll(sel);
    if (prefersReducedMotion()) return;
    gsap.from(qa("[data-card]"), { autoAlpha: 0, y: 30, duration: 0.85, stagger: 0.08, ease: E.dolly, delay: 0.15, clearProps: "opacity,visibility,transform" });
    gsap.from(qa("[data-share]"), { scaleX: 0, transformOrigin: "0% 50%", duration: 1, stagger: 0.08, ease: E.reveal, delay: 0.6 });
  }, { scope: root, dependencies: [Boolean(plan)] });

  useEffect(() => {
    say(plan ? "Untick anything you already have. It stays in the plan, and stays out of the cart." : "Plan the week first. The pantry and the cart are built from it.");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on arrival
  }, []);
  useEffect(() => () => ember.rest(), [ember]);

  if (!plan) {
    return (
      <div>
        <StepHead eyebrow="Plan · step 4 of 5" title="One order. Whole week handled." sub="Plan the week first — your pantry and cart are built from it." />
        <Footer onBack={onBack} />
      </div>
    );
  }

  const before = s.compareTo;
  const beforeBySku = new Map((before?.basket ?? []).map((l) => [String(l.skuId), l]));
  const nowBySku = new Map(lines.map((l) => [String(l.skuId), l]));
  const gone = (before?.basket ?? []).filter((l) => !nowBySku.has(String(l.skuId)));
  const delta = before && Number.isFinite(Number(before.cost)) ? Number(plan.report.cost) - Number(before.cost) : null;
  const buying = lines.filter((l) => s.packsFor(l) > 0);
  const cartTotal = buying.reduce((sum, l) => sum + (l.price ? l.price * s.packsFor(l) : 0), 0);
  const priceless = buying.filter((l) => !l.price).length;
  const weekly = lines.filter((l) => !swappedIn.has(String(l.skuId)));
  // The cart already holds exactly this plan, with these things at home.
  const homeNow = [...s.have].map(String).sort().join("|");
  const inCart = Boolean(cartPlan && cartPlan.planId === plan.planId && [...(cartPlan.atHome ?? [])].map(String).sort().join("|") === homeNow);
  const swapped = lines.filter((l) => swappedIn.has(String(l.skuId)));

  // KOI carries the week to the cart, ticks, and the step moves on.
  const putInCart = async () => {
    ember.status("Filling your cart");
    const done = await s.addToCart();
    ember.status(null);
    if (!done) return;
    say("It’s in your cart. Your own picks stayed where they were.");
    const cart = [...document.querySelectorAll("[data-cart-target]")].find((el) => el.offsetParent !== null);
    if (cart && !prefersReducedMotion()) ember.go(cart, { ax: 1, ay: 0, x: -6, y: 6 }, () => ember.done(() => onNext()));
    else onNext();
  };

  const Row = ({ line }) => {
    const on = !s.have.has(String(line.skuId));
    const whose = Object.keys(line.shares ?? {}).map((id) => labelsById[id]).filter(Boolean);
    return (
      <li className={`flex flex-col gap-2 border-b border-koi-forest/10 py-3.5 last:border-b-0 ${on ? "" : "opacity-60"}`}>
        <span className="flex items-center gap-3.5">
          <Check on={on} onClick={() => s.toggleHave(line.skuId)} label={`Buy ${line.name}`} />
          <ProductThumb src={line.product?.image?.hero || null} alt="" size={56} radius={16} />
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className={`truncate text-[15px] font-bold ${on ? "" : "line-through"}`}>{line.name}</span>
            <span className="text-[13px] text-koi-muted">{line.weight ?? "pack"}{whose.length ? ` · for ${whose.join(", ")}` : ""}{line.estimate ? " · price is an estimate" : ""}</span>
          </span>
          <span className="font-koi-num text-sm text-koi-muted">{line.packs} ×</span>
          <span className="w-20 text-right font-koi-num text-base font-semibold">{line.cost !== null ? rupees(line.cost) : "—"}</span>
        </span>
        {line.notVerifiedFor?.length > 0 && <span className="ml-[42px]"><Unverified allergens={line.notVerifiedFor} /></span>}
        {!on && (
          <span className="ml-[42px] flex flex-wrap items-center gap-2 text-[13px] text-koi-ink2">
            At home this week. It stays in the plan, left out of the cart.
            {UUIDish(line.skuId) && <button type="button" onClick={() => s.keepInPantry(line.skuId)} className="font-semibold text-koi-primary underline-offset-4 hover:underline">Keep in my pantry, so later plans skip it</button>}
          </span>
        )}
      </li>
    );
  };

  return (
    <div ref={root} className="font-koi-sans text-koi-ink">
      <StepHead eyebrow="Plan · step 4 of 5" title="One order. Whole week handled." sub="Your last plan against this one — and everything to buy. Untick what's already at home." />

      <section className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-w-0 flex-col gap-5">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <article data-card aria-label={before ? before.label : "Before this plan"} className="flex flex-col gap-3 rounded-[26px] border border-koi-forest/10 bg-koi-paper p-5">
              <span className={`${monoHead} text-koi-muted`}>{before ? before.label : "Before this plan"}</span>
              {before?.basket?.length ? (
                <>
                  <ul className="m-0 flex list-none flex-col gap-2 p-0 text-[14px]">
                    {before.basket.slice(0, 8).map((l) => (
                      <li key={l.skuId} className={`flex justify-between gap-3 ${nowBySku.has(String(l.skuId)) ? "" : "text-koi-muted line-through"}`}><span>{l.name ?? "A product"}</span><span className="font-koi-num text-koi-muted">{l.packs} ×</span></li>
                    ))}
                  </ul>
                  <span className="mt-auto border-t border-koi-forest/10 pt-3 text-[13px] font-semibold text-koi-ink2">Cost then <span className="font-koi-num">{rupees(before.cost)}</span></span>
                </>
              ) : (
                <p className="m-0 text-[13.5px] text-koi-muted">This is your first plan with KOI. Next time, this side shows it, so you can see what changed.</p>
              )}
            </article>
            <article data-card aria-label="This plan" className="flex flex-col gap-3 rounded-[26px] border-2 border-koi-forest bg-white p-5">
              <span className={`${monoHead} text-koi-green`}>This plan</span>
              <ul className="m-0 flex list-none flex-col gap-2 p-0 text-[14px]">
                {lines.slice(0, 8).map((l) => {
                  const was = beforeBySku.get(String(l.skuId));
                  const tag = !before ? null : !was ? "NEW" : was.packs !== l.packs ? `${was.packs} → ${l.packs}` : null;
                  return (
                    <li key={l.skuId} className="flex items-center justify-between gap-3">
                      <span>{l.name}</span>
                      <span className="flex items-center gap-1.5">
                        {tag && <span className="rounded-full bg-koi-lime px-2 py-0.5 font-koi-mono text-[9.5px] font-bold text-koi-forest">{tag}</span>}
                        <span className="font-koi-num text-koi-muted">{l.packs} ×</span>
                      </span>
                    </li>
                  );
                })}
              </ul>
              {gone.length > 0 && <span className="text-[12.5px] text-koi-muted">No longer: {gone.map((l) => l.name ?? "a product").join(", ")}</span>}
              <span className="mt-auto border-t border-koi-forest/10 pt-3 text-[13px] font-semibold text-koi-primary">Cost now <span className="font-koi-num">{rupees(plan.report.cost)}</span></span>
            </article>
          </div>
          {delta !== null && Math.round(delta) !== 0 && (
            <p data-card className={`m-0 flex items-center gap-2.5 self-start rounded-full px-4 py-2 text-sm ${delta > 0 ? "bg-koi-warm-bg text-koi-warm-ink" : "bg-koi-lime text-koi-forest"}`}>
              <span aria-hidden="true" className="size-2 rounded-full bg-current" />This plan costs <strong className="font-koi-num">{rupees(Math.abs(delta))} {delta > 0 ? "more" : "less"}</strong> than your last one.
            </p>
          )}

          {swapped.length > 0 && (
            <article data-card aria-label="Upgraded swaps" className="flex flex-col rounded-[28px] border border-koi-forest/10 bg-white p-6">
              <span className="flex items-center gap-2"><span className="font-koi-display text-[22px] font-extrabold text-koi-forest">Your second takes</span><span className="rounded-full bg-koi-lime px-2 py-0.5 font-koi-mono text-[9.5px] font-bold text-koi-forest">SWAPPED IN</span></span>
              <p className="m-0 mt-1 text-[13.5px] text-koi-ink2">What you swapped in on the Plan step, in its place in the trolley.</p>
              <ul className="m-0 mt-2 flex list-none flex-col p-0">{swapped.map((l) => <Row key={l.skuId} line={l} />)}</ul>
            </article>
          )}

          <article data-card aria-label="This week’s groceries" className="flex flex-col rounded-[28px] border border-koi-forest/10 bg-white p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-koi-display text-[24px] font-extrabold tracking-[-0.01em] text-koi-forest">This week’s groceries</span>
              <span className={`${monoHead} text-koi-muted`}><span className="font-koi-num">{buying.length}</span> in cart</span>
            </div>
            <p className="m-0 mt-1 text-[14px] text-koi-ink2">Everything the plan buys, and who it’s for. Untick anything you already have.</p>
            <ul className="m-0 mt-3 flex list-none flex-col p-0">{weekly.map((l) => <Row key={l.skuId} line={l} />)}</ul>
            <SizedNeeds s={s} />
            <AlsoNeed s={s} />
            <p className="m-0 mt-4 rounded-2xl bg-koi-paper px-4 py-3 text-[13px] text-koi-ink2">
              Staples you always keep in go in <Link href="/store/household" className="font-semibold text-koi-primary underline-offset-4 hover:underline">your household pantry</Link> — plans won’t buy them again.
            </p>
          </article>
        </div>

        <aside className="flex flex-col gap-4 lg:sticky lg:top-[calc(var(--koi-header-h)+84px)] lg:self-start">
          <article data-card aria-label="Your cart for the week" className="flex flex-col gap-4 rounded-[28px] bg-koi-forest p-6 text-koi-bg">
            <span className={`${monoHead} text-koi-mint`}>Your cart for the week</span>
            <span className="flex items-baseline gap-2"><span className="font-koi-num text-[46px] font-semibold leading-none">{rupees(cartTotal)}</span><span className="font-koi-mono text-[11px] uppercase tracking-[0.14em] text-koi-bg/70">MRP</span></span>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-0.5 rounded-2xl bg-koi-bg/10 p-3.5"><span className="font-koi-num text-[26px] font-semibold leading-none">{buying.length}</span><span className="font-koi-mono text-[10px] uppercase tracking-[0.14em] text-koi-bg/70">Products</span></div>
              <div className="flex flex-col gap-0.5 rounded-2xl bg-koi-bg/10 p-3.5"><span className="font-koi-num text-[26px] font-semibold leading-none">{buying.reduce((n, l) => n + s.packsFor(l), 0)}</span><span className="font-koi-mono text-[10px] uppercase tracking-[0.14em] text-koi-bg/70">Packs</span></div>
            </div>
            <span className="text-[12.5px] text-koi-bg/75">{priceless ? `${priceless} without a price · ` : ""}{s.have.size ? `${s.have.size} at home, left out` : "Nothing marked at home"}</span>
            {inCart ? (
              <>
                <button type="button" onClick={onNext} className="flex h-14 items-center justify-center rounded-2xl bg-koi-lime text-[15px] font-bold text-koi-forest">In your cart ✓ — open it →</button>
                <p className="m-0 text-[12.5px] leading-normal text-koi-bg/75">Change what’s at home and press again: the plan’s packs are replaced, never doubled.</p>
              </>
            ) : (
              <>
                <button type="button" onClick={putInCart} disabled={!buying.length || s.cartResult?.busy} className="flex h-14 items-center justify-center rounded-2xl bg-koi-lime text-[15px] font-bold text-koi-forest disabled:opacity-50">
                  {s.cartResult?.busy ? "Putting it in your cart…" : cartPlan ? "Update my cart to this plan →" : "Put this week in my cart →"}
                </button>
                <p className="m-0 text-[12.5px] leading-normal text-koi-bg/75">
                  Puts the plan’s packs in your one cart. Pressing it again replaces them — it never doubles.{ownCount ? ` The ${ownCount} ${ownCount === 1 ? "thing" : "things"} you added yourself stay.` : ""}
                </p>
              </>
            )}
            {s.cartResult?.missing?.length > 0 && <p className="m-0 text-xs font-medium text-[#f5b8ae]">Not in the shop right now: {s.cartResult.missing.join(", ")}</p>}
            {s.cartResult?.error && <p className="m-0 text-xs font-medium text-[#f5b8ae]">{s.cartResult.error}</p>}
          </article>

          <article data-card aria-label="This plan’s nutrition" className="flex flex-col gap-3 rounded-[28px] border border-koi-forest/10 bg-white p-6">
            <div className="flex items-baseline justify-between gap-2"><span className="text-base font-bold">This plan’s nutrition</span><span className="font-koi-mono text-[10px] uppercase tracking-[0.14em] text-koi-muted">a day, per person</span></div>
            {people.map((p) => {
              const pct = p.coverage.protein ?? 0;
              return (
                <div key={p.id} className="flex flex-col gap-1.5">
                  <span className="flex justify-between text-[13px] font-semibold"><span>{p.label}</span><span className="font-koi-mono text-[11px] text-koi-ink2">{p.perDay.protein ?? "—"} / {p.target.protein ?? "—"} g protein</span></span>
                  <span className="h-2 overflow-hidden rounded-full bg-koi-track"><span data-share className={`block h-full rounded-full ${pct >= 100 ? "bg-koi-green" : "bg-koi-warm"}`} style={{ width: `${pct}%` }} /></span>
                  <span className="font-koi-mono text-[10.5px] text-koi-muted">{p.perDay.kcal !== null ? inr(p.perDay.kcal) : "—"}{p.target.kcal ? ` of ${inr(p.target.kcal)}` : ""} kcal</span>
                </div>
              );
            })}
            {sources.length > 0 && (
              <div className="mt-1 flex flex-col gap-3 border-t border-koi-forest/10 pt-3">
                <span className="font-koi-mono text-[10px] uppercase tracking-[0.14em] text-koi-muted">Top protein sources this plan</span>
                {sources.map((src) => (
                  <div key={src.skuId} className="flex flex-col gap-1.5">
                    <span className="flex justify-between text-[13.5px]"><span>{src.name}</span><span className="font-koi-num font-semibold">{src.perDay} g/day</span></span>
                    <span className="h-1.5 overflow-hidden rounded-full bg-koi-track"><span data-share className="block h-full rounded-full bg-koi-green" style={{ width: `${src.share}%` }} /></span>
                  </div>
                ))}
                <p className="m-0 text-[12px] leading-normal text-koi-muted">From each label’s declared protein. Products without a declared figure aren’t counted.</p>
              </div>
            )}
          </article>
        </aside>
      </section>
      <PantryShop s={s} />
      <Footer onBack={onBack} next={{ label: inCart ? "Open your cart" : "Go to your cart", onClick: onNext }} />
    </div>
  );
}

const UUIDish = (id) => /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(String(id));

/**
 * What the week's dishes need that the basket doesn't bring (lib/plan/schedule.js):
 * fresh things to buy, shelf things KOI stocks but this plan didn't buy, and
 * what a kitchen usually has. Names only — no amounts: a recipe's grams are
 * not KOI's to invent.
 */
/**
 * For someone on their own numbers, the week is sized in grams, so the list can
 * say how much: the fresh food by weight, and any KOI product the portions now
 * use more of than the plan bought (lib/plan/reconcile.js). An offer, never a
 * change: "Add 1 pack" is the person's to tap.
 */
function SizedNeeds({ s }) {
  const me = s.active?.memberId ? String(s.active.memberId) : null;
  const sized = me ? s.portions?.[me] : null;
  if (!sized?.reconcile) return null;
  const { fresh, short } = sized.reconcile;
  if (!fresh.length && !short.length) return null;
  const whose = s.active.label === "Me" ? "your" : `${s.active.label}'s`;
  const label = "mt-4 block font-koi-mono text-[10.5px] font-semibold uppercase tracking-[0.14em]";
  return (
    <div className="mt-5 border-t border-koi-forest/10 pt-5">
      <span className="text-base font-bold">For {whose} sized week</span>
      <p className="m-0 mt-1 text-[13.5px] text-koi-ink2">Weighed from {whose} portions, so it&apos;s what the week really uses.</p>
      {short.length > 0 && (
        <>
          <span className={`${label} text-koi-warm`}>The portions use more than the plan bought</span>
          <ul className="m-0 mt-1 list-none p-0">
            {short.map((row) => {
              const line = s.lines.find((l) => String(l.skuId) === row.skuId);
              return (
                <li key={row.skuId} className="flex items-center gap-2.5 border-b border-koi-forest/10 py-2.5">
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="text-[14px] font-semibold">{row.name}</span>
                    <span className="font-koi-num text-[12.5px] text-koi-muted">uses {row.grams} g · {whose} share {row.have} g</span>
                  </span>
                  {line && (
                    <button type="button" onClick={() => s.setPacks(row.skuId, s.packsFor(line) + row.morePacks)} className="h-9 shrink-0 rounded-full bg-koi-tint px-3.5 text-xs font-semibold text-koi-primary">
                      Add {row.morePacks} {row.morePacks === 1 ? "pack" : "packs"}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
      {fresh.length > 0 && <span className={`${label} text-koi-green`}>Fresh, for the week</span>}
      {fresh.length > 0 && (
        <ul className="m-0 mt-1 grid list-none grid-cols-1 gap-x-6 p-0 md:grid-cols-2">
          {fresh.map((row) => (
            <li key={row.food} className="flex items-baseline justify-between gap-3 border-b border-koi-forest/10 py-2.5">
              <span className="text-[14px] font-semibold">{row.name.replace(/\s*\(.*?\)/g, "")}</span>
              <span className="font-koi-num text-[13px] font-semibold text-koi-ink2">{row.text}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AlsoNeed({ s }) {
  const need = s.week?.alsoNeed;
  if (!need || (!need.fresh.length && !need.shop.length && !need.kitchen.length)) return null;
  const busy = Boolean(s.run && !s.run.done);
  const label = "mt-4 block font-koi-mono text-[10.5px] font-semibold uppercase tracking-[0.14em]";
  const Row = ({ item, action }) => (
    <li className="flex items-center gap-2.5 border-b border-koi-forest/10 py-2.5">
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[14px] font-semibold">{item.ingredient}</span>
        <span className="text-[12.5px] text-koi-muted">used in: {item.dishes.slice(0, 3).join(", ")}{item.dishes.length > 3 ? ` +${item.dishes.length - 3}` : ""} · {item.meals} {item.meals === 1 ? "meal" : "meals"}</span>
      </span>
      {action}
    </li>
  );
  return (
    <div className="mt-5 border-t border-koi-forest/10 pt-5">
      <span className="text-base font-bold">You’ll also need</span>
      <p className="m-0 mt-1 text-[13.5px] text-koi-ink2">For the week’s dishes — how much depends on your recipe.</p>
      {need.fresh.length > 0 && <span className={`${label} text-koi-green`}>Fresh</span>}
      {need.fresh.length > 0 && <ul className="m-0 mt-1 grid list-none grid-cols-1 gap-x-6 p-0 md:grid-cols-2">{need.fresh.map((item) => <Row key={item.ingredient} item={item} />)}</ul>}
      {s.menuNeeds.stocked.length > 0 && (
        <div className="mt-4 flex items-center justify-between">
          <span className={`${label} mt-0 text-koi-green`}>KOI stocks these — not in this plan</span>
          {s.menuNeeds.stocked.length > 1 && <button type="button" disabled={busy} onClick={() => s.buyForMenu(s.menuNeeds.stocked).catch((e) => s.setError(e?.message))} className="text-xs font-semibold text-koi-primary disabled:opacity-60">Add all to the plan</button>}
        </div>
      )}
      {s.menuNeeds.stocked.length > 0 && (
        <ul className="m-0 mt-1 list-none p-0">
          {s.menuNeeds.stocked.map((item) => (
            <Row key={item.ingredient} item={item} action={<button type="button" disabled={busy} onClick={() => s.buyForMenu([item]).catch((e) => s.setError(e?.message))} className="h-9 rounded-full bg-koi-tint px-3.5 text-xs font-semibold text-koi-primary disabled:opacity-60">{busy ? "Adding…" : "Add to the plan"}</button>} />
          ))}
        </ul>
      )}
      {s.menuNeeds.notStocked.length > 0 && (
        <>
          <span className={`${label} text-koi-muted`}>KOI doesn’t stock these yet — buy them fresh</span>
          <ul className="m-0 mt-1 grid list-none grid-cols-1 gap-x-6 p-0 md:grid-cols-2">{s.menuNeeds.notStocked.map((item) => <Row key={item.ingredient} item={item} />)}</ul>
        </>
      )}
      {need.kitchen.length > 0 && (
        <>
          <span className={`${label} text-koi-muted`}>Check your kitchen for</span>
          <p className="m-0 mt-1.5 text-[14px] text-koi-ink2">{need.kitchen.map((k) => k.ingredient).join(" · ")}</p>
        </>
      )}
    </div>
  );
}
