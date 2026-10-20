"use client";
// ============================================================================
// KOI — Orders, drawn (cinematic storefront, Oct 2026)
//
// The view of app/store/orders/page.js, which owns the data and every action.
// The latest basket with Swiggy leads as the forest hero: where it is (three
// steps, because KOI knows three things), what went, the way to the week's
// Track, and the one question only the shopper can answer — did it arrive?
// Below it: baskets not sent yet (finish or discard) and earlier ones (build
// again, details). KOI waits beside the arrival question with a heartbeat and
// ticks the status once it is answered.
// ============================================================================

import { useEffect, useRef } from "react";
import Link from "next/link";
import { FULFILMENT, DELIVERY_REPORT, describeState } from "@/lib/supabase/fulfilmentService";
import Sheet from "@/components/store/system/Sheet";
import { Money, ProductThumb, ScoreBadge } from "@/components/store/system/primitives";
import { setupMotion, prefersReducedMotion, useGSAP, E } from "@/lib/motion/koiMotion";
import { useEmber } from "@/components/store/ember/Ember";
import { useKoiVoice } from "@/store/koiVoiceStore";
import { useCartUi } from "@/store/cartUiStore";

// Three steps, because KOI knows three things. There is deliberately no
// "Packed" and no "Out for delivery": those happen inside Swiggy, which does
// not tell KOI about them. Showing them would be a guess dressed as tracking.
const STEPS = ["Basket assembled", "Handed off to Swiggy", "You confirm arrival"];

// KOI's lines. No numbers in KOI's mouth.
const LINES = {
  open: "Your basket is with Swiggy. When it lands, tell me, so next week’s plan knows what you have.",
  quiet: "Every basket you’ve sent, and the ones you haven’t yet.",
  yes: "Good. I’ll plan next week around what you have.",
  partly: "Thanks. Tell me what was missing and I’ll keep it in mind for next week.",
  rebuild: "Rebuilt that basket in your cart. Nothing is sent until you check out.",
};

// Spelled out rather than toLocaleDateString: Node's ICU and the browser's
// disagree on the comma in "Monday, 19 Oct", which breaks hydration.
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const fmtDay = (iso) => { if (!iso) return ""; const d = new Date(iso); return `${d.getDate()} ${MONTHS[d.getMonth()]}`; };
const fmtLong = (iso) => (iso ? `${DAYS[new Date(iso).getDay()]}, ${fmtDay(iso)}` : "");

function Thumbs({ lines, bySku, size = 48, ring = "border-koi-forest" }) {
  return (
    <span className="flex">
      {lines.slice(0, 4).map((l, i) => (
        <span key={l.id} className={`overflow-hidden rounded-xl border-2 bg-white ${ring} ${i ? "-ml-2.5" : ""}`}>
          <ProductThumb src={bySku.get(String(l.koi_sku_id))?.image?.hero || null} alt="" size={size} radius={10} />
        </span>
      ))}
      {lines.length > 4 && <span className={`-ml-2.5 grid place-items-center rounded-xl border-2 bg-koi-tint font-koi-num text-xs font-bold text-koi-primary ${ring}`} style={{ width: size + 4, height: size + 4 }}>+{lines.length - 4}</span>}
    </span>
  );
}

/** What a basket cost, in the only terms KOI holds: Swiggy's figure at hand-off, else MRP. */
function Price({ intent, tone = "dark" }) {
  const swiggy = intent.provider_subtotal_at_handoff;
  const value = swiggy !== null && swiggy !== undefined ? swiggy : intent.subtotal_at_handoff;
  if (value === null || value === undefined) return null;
  return (
    <span className="font-koi-num text-2xl font-semibold">
      <Money value={value} />{" "}
      <span className={`font-koi-mono text-[11px] font-medium tracking-[0.12em] ${tone === "dark" ? "text-koi-bg/70" : "text-koi-muted"}`}>{swiggy !== null && swiggy !== undefined ? "SWIGGY AT HAND-OFF" : "MRP"}</span>
    </span>
  );
}

/**
 * @param {object} p
 * @param {Array} p.intents
 * @param {Map} p.bySku   live catalogue by SKU, for pack shots
 * @param {string|null} p.busyId
 * @param {string|null} p.note
 * @param {object|null} p.selected
 * @param {(i: object|null) => void} p.onSelect
 * @param {(i: object, report: string) => Promise<void>} p.onReport
 * @param {(i: object) => Promise<void>} p.onReorder
 * @param {(i: object) => Promise<void>} p.onFinish
 * @param {(i: object) => Promise<void>} p.onDiscard
 */
export default function OrdersBoard({ intents, bySku, busyId, note, selected, onSelect, onReport, onReorder, onFinish, onDiscard }) {
  const root = useRef(null);
  const ember = useEmber();
  const say = useKoiVoice((s) => s.say);
  const openCart = useCartUi((s) => s.openSheet);

  const hero = intents.find((i) => i.state === FULFILMENT.HANDED_OFF) ?? null;
  const drafts = intents.filter((i) => i.state === FULFILMENT.DRAFT);
  const earlier = intents.filter((i) => i !== hero && i.state !== FULFILMENT.DRAFT);
  const heroLines = hero?.items ?? [];

  useGSAP(() => {
    const gsap = setupMotion();
    const q = (s) => root.current.querySelector(s);
    const qa = (s) => root.current.querySelectorAll(s);
    const ask = () => {
      const c = q("[data-arrive-choices]");
      if (c) ember.go(c, { ax: 0, ay: 0.5, x: -16 }, () => ember.heartbeat(true));
    };
    if (prefersReducedMotion()) { say(hero ? LINES.open : LINES.quiet); ask(); return; }
    const tl = gsap.timeline({ defaults: { ease: E.reveal } });
    tl.from(qa("[data-line]"), { yPercent: 115, duration: 1 }, 0.08);
    tl.from(qa("[data-rise]"), { autoAlpha: 0, y: 14, duration: 0.7, stagger: 0.08 }, 0.12);
    if (q("[data-hero]")) tl.from(q("[data-hero]"), { autoAlpha: 0, y: 40, scale: 0.98, duration: 1, ease: E.dolly }, 0.25);
    tl.fromTo(qa("[data-step-fill]"), { scaleX: 0, transformOrigin: "0% 50%" }, { scaleX: 1, duration: 0.8, stagger: 0.18, ease: E.dolly }, 0.7);
    tl.from(qa("[data-past]"), { autoAlpha: 0, y: 24, duration: 0.8, stagger: 0.08 }, 0.5);
    tl.from(q("[data-where]"), { autoAlpha: 0, y: 30, duration: 0.9, ease: E.dolly }, 0.4);
    tl.add(() => say(hero ? LINES.open : LINES.quiet), 1.0);
    if (hero) tl.add(ask, 2.2);
  }, { scope: root, dependencies: [hero?.id ?? null] });

  useEffect(() => () => ember.rest(), [ember]);

  const answer = async (intent, report) => {
    ember.heartbeat(false);
    say(report === DELIVERY_REPORT.ARRIVED ? LINES.yes : LINES.partly);
    await onReport(intent, report);
    const pill = root.current?.querySelector("[data-status-pill]");
    if (pill) ember.go(pill, { ax: 0, ay: 0.5, x: -12 }, () => ember.done(() => setTimeout(() => ember.home(), 500)));
    else ember.home();
  };

  const rebuild = async (intent) => {
    await onReorder(intent);
    say(LINES.rebuild);
    const cart = [...document.querySelectorAll("[data-cart-target]")].find((el) => el.offsetParent !== null);
    // KOI carries it to the cart, ticks, and the cart opens on what it rebuilt.
    if (cart) ember.go(cart, { ax: 1, ay: 0, x: -6, y: 6 }, () => ember.done(() => { openCart(); setTimeout(() => ember.home(), 450); }));
    else openCart();
  };

  const step = hero ? (hero.state === FULFILMENT.REPORTED_DELIVERED ? 2 : 1) : 0;

  return (
    <main ref={root} className="ks-page-pad mx-auto flex w-full max-w-[1440px] flex-col bg-koi-bg px-[clamp(16px,4vw,52px)] pt-8 font-koi-sans text-koi-ink">
      <section className="flex flex-col gap-2.5">
        <div data-rise className="flex items-center gap-3">
          <span className="font-koi-mono text-xs font-semibold text-koi-primary">(07)</span>
          <span className="font-koi-mono text-xs font-medium uppercase tracking-[0.22em] text-koi-muted">Orders</span>
        </div>
        <h1 className="koi-condensed m-0 font-koi-display text-[clamp(44px,5.2vw,78px)] font-extrabold leading-[0.92] tracking-[-0.03em] text-koi-forest">
          <span className="-mb-[0.06em] block overflow-hidden pb-[0.06em]"><span data-line className="block">Orders</span></span>
        </h1>
        <p data-rise className="m-0 max-w-[620px] text-base leading-relaxed text-koi-ink2">Baskets you sent to Swiggy, and the weeks they were for. KOI can see the first two steps. What happens inside Swiggy is theirs to show you.</p>
      </section>

      {note && <p role="status" className="m-0 mt-5 rounded-2xl bg-koi-warm-bg px-4 py-2.5 text-[13.5px] font-medium text-koi-warm-ink">{note}</p>}

      <div className="grid grid-cols-1 gap-x-10 gap-y-6 pb-10 pt-7 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-w-0 flex-col gap-6">
          {hero && (
            <article data-hero aria-label="Your latest basket" className="relative overflow-hidden rounded-[28px] bg-koi-forest p-6 text-koi-bg md:p-7">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex flex-col gap-2">
                  <span className="font-koi-mono text-[11px] font-medium uppercase tracking-[0.18em] text-koi-lime">{hero.nutrition_plan_id ? "This week’s plan" : "Your latest basket"} · {fmtLong(hero.handed_off_at ?? hero.created_at)}</span>
                  <span className="koi-condensed font-koi-display text-[clamp(32px,4vw,44px)] font-extrabold leading-none tracking-[-0.02em]">{hero.nutrition_plan_id ? "Your week is ordered." : "Your basket is with Swiggy."}</span>
                  <span className="font-koi-mono text-xs text-koi-bg/75">Sent to Swiggy on {fmtDay(hero.handed_off_at ?? hero.created_at)}{hero.external_order_ref ? ` · ref ${hero.external_order_ref}` : ""}</span>
                </div>
                <span data-status-pill className="flex items-center gap-2 rounded-full bg-koi-lime px-3.5 py-2 text-xs font-bold text-koi-forest"><span aria-hidden="true" className="size-2 rounded-full bg-current" />{describeState(hero.state).label}</span>
              </div>

              <ol aria-label="Where it is" className="m-0 mt-7 grid list-none grid-cols-3 gap-2 p-0">
                {STEPS.map((label, i) => (
                  <li key={label} className="flex flex-col gap-2" aria-current={i === step ? "step" : undefined}>
                    <span className="relative h-1.5 overflow-hidden rounded-full bg-koi-bg/20">{i <= step && <span data-step-fill className="absolute inset-0 rounded-full bg-koi-lime" />}</span>
                    <span className={`text-[13px] font-semibold ${i <= step ? "" : "text-koi-bg/60"}`}>{label}</span>
                  </li>
                ))}
              </ol>

              <div className="mt-7 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <Thumbs lines={heroLines} bySku={bySku} />
                  <div className="flex flex-col">
                    <span className="text-sm text-koi-bg/75"><span className="font-koi-num">{heroLines.length}</span> {heroLines.length === 1 ? "product" : "products"} · <span className="font-koi-num">{hero.item_count}</span> packs</span>
                    <Price intent={hero} />
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {hero.nutrition_plan_id && <Link href="/store/track" className="flex h-11 items-center gap-2 rounded-full bg-koi-lime px-5 text-sm font-bold text-koi-forest no-underline">Track this week <span aria-hidden="true">→</span></Link>}
                  <button type="button" onClick={() => onSelect(hero)} className="h-11 rounded-full border border-koi-bg/30 px-5 text-sm font-semibold text-koi-bg transition-colors hover:bg-koi-bg/10">Details</button>
                </div>
              </div>

              {hero.state === FULFILMENT.HANDED_OFF && (
                <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-koi-bg/10 px-4 py-3.5">
                  <span className="text-[15px] font-semibold">Did this arrive? It helps next week’s plan.</span>
                  <div data-arrive-choices className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => answer(hero, DELIVERY_REPORT.ARRIVED)} disabled={busyId === hero.id} className="h-11 rounded-full bg-koi-bg px-4 text-sm font-bold text-koi-forest disabled:opacity-60">Yes, it arrived</button>
                    <button type="button" onClick={() => answer(hero, DELIVERY_REPORT.PARTIAL)} disabled={busyId === hero.id} className="h-11 rounded-full border border-koi-bg/30 px-4 text-sm font-semibold text-koi-bg transition-colors hover:bg-koi-bg/10 disabled:opacity-60">Partly</button>
                  </div>
                </div>
              )}
            </article>
          )}

          {drafts.length > 0 && (
            <section aria-label="Not sent yet" className="flex flex-col gap-3">
              <span className="font-koi-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-koi-ink2">Not sent yet</span>
              {drafts.map((intent) => (
                <article key={intent.id} data-past className="flex flex-wrap items-center justify-between gap-4 rounded-[22px] border border-dashed border-koi-forest/25 bg-koi-paper p-5">
                  <div className="flex items-center gap-4">
                    <Thumbs lines={intent.items ?? []} bySku={bySku} size={40} ring="border-white" />
                    <div className="flex flex-col gap-0.5">
                      <span className="flex flex-wrap items-center gap-2 text-[15px] font-bold">{fmtLong(intent.created_at)} <span className="rounded-full border border-koi-amber-border bg-koi-amber-bg px-2 py-0.5 text-[11px] font-bold text-koi-amber-ink">Not sent</span></span>
                      <span className="font-koi-mono text-xs text-koi-muted">{intent.nutrition_plan_id ? "Week plan · " : ""}<span className="font-koi-num">{(intent.items ?? []).length}</span> {(intent.items ?? []).length === 1 ? "product" : "products"} · saved, never handed to Swiggy</span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => onDiscard(intent)} disabled={busyId === intent.id} className="h-11 rounded-full px-4 text-sm font-semibold text-koi-ink2 hover:bg-white disabled:opacity-60">Discard</button>
                    <button type="button" onClick={() => onFinish(intent)} disabled={busyId === intent.id} className="flex h-11 items-center rounded-full bg-koi-forest px-4 text-sm font-bold text-koi-lime disabled:opacity-60">Finish this basket <span aria-hidden="true" className="ml-1.5">→</span></button>
                  </div>
                </article>
              ))}
            </section>
          )}

          {earlier.length > 0 && (
            <section aria-label="Earlier baskets" className="flex flex-col gap-3">
              <span className="font-koi-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-koi-ink2">{hero ? "Earlier" : "Your baskets"}</span>
              {earlier.map((intent) => {
                const delivered = intent.state === FULFILMENT.REPORTED_DELIVERED;
                const handedOff = intent.state === FULFILMENT.HANDED_OFF;
                return (
                  <article key={intent.id} data-past className="flex flex-wrap items-center justify-between gap-4 rounded-[22px] border border-koi-forest/10 bg-white p-5">
                    <div className="flex items-center gap-4">
                      <Thumbs lines={intent.items ?? []} bySku={bySku} size={40} ring="border-white" />
                      <div className="flex flex-col gap-0.5">
                        <span className="flex flex-wrap items-center gap-2 text-[15px] font-bold">
                          {fmtLong(intent.handed_off_at ?? intent.created_at)}
                          <span className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${delivered || handedOff ? "border-koi-tint-border bg-koi-tint text-koi-primary" : "border-koi-forest/15 bg-koi-paper text-koi-ink2"}`}>{delivered ? "Arrived" : describeState(intent.state).label}</span>
                        </span>
                        <span className="font-koi-mono text-xs text-koi-muted"><span className="font-koi-num">{(intent.items ?? []).length}</span> {(intent.items ?? []).length === 1 ? "product" : "products"} · <span className="font-koi-num">{intent.item_count}</span> packs{intent.nutrition_plan_id ? " · week plan" : ""}</span>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {handedOff && <button type="button" onClick={() => answer(intent, DELIVERY_REPORT.ARRIVED)} disabled={busyId === intent.id} className="h-11 rounded-full border border-koi-forest/15 px-4 text-sm font-semibold text-koi-forest disabled:opacity-60">It arrived</button>}
                      <button type="button" onClick={() => rebuild(intent)} disabled={busyId === intent.id} className="h-11 rounded-full bg-koi-forest px-4 text-sm font-bold text-koi-lime disabled:opacity-60">Build this basket again</button>
                      <button type="button" onClick={() => onSelect(intent)} className="h-11 rounded-full border border-koi-forest/15 px-4 text-sm font-semibold text-koi-forest">Details</button>
                    </div>
                  </article>
                );
              })}
            </section>
          )}

          <p data-rise className="m-0 text-[13px] leading-normal text-koi-ink2">
            “Finish this basket” puts the draft’s own products back in your cart before checkout. “Build this basket again” adds every product back at the quantity you sent.
          </p>
        </div>

        {/* What KOI can and cannot tell you. Replaces the old "Your KOI
            Insights" panel, which asserted an average score and an average
            protein per order that were both literals unconnected to any basket. */}
        <aside data-where aria-label="Where your order lives" className="flex flex-col gap-4 self-start rounded-[26px] border border-koi-forest/10 bg-white p-6 lg:sticky lg:top-[calc(var(--koi-header-h)+24px)]">
          <span className="font-koi-display text-2xl font-extrabold text-koi-forest">Where your order lives</span>
          <p className="m-0 text-sm leading-relaxed text-koi-ink2">KOI curates and hands off. Once a basket reaches Swiggy, they own the delivery, and they hold the live tracking, the payment record and support.</p>
          <ol className="m-0 flex list-none flex-col gap-3 p-0">
            <li className="flex items-start gap-3"><span aria-hidden="true" className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-koi-forest font-koi-num text-[11px] font-bold text-koi-lime">K</span><span className="text-sm"><strong>KOI</strong> · plans the week, reads the labels, sends the basket</span></li>
            <li className="flex items-start gap-3"><span aria-hidden="true" className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-koi-ember font-koi-num text-[11px] font-bold text-white">S</span><span className="text-sm"><strong>Swiggy</strong> · price, payment, packing, delivery, support</span></li>
          </ol>
          <a href="https://www.swiggy.com/instamart" target="_blank" rel="noopener noreferrer" className="flex h-11 items-center justify-center gap-2 rounded-full border border-koi-forest/20 text-sm font-semibold text-koi-forest no-underline transition-colors hover:bg-koi-paper">Track on Swiggy <span aria-hidden="true">↗</span></a>
          <p className="m-0 rounded-xl bg-koi-paper px-3.5 py-2.5 text-[13px] leading-normal text-koi-ink2">Need to cancel? Swiggy has no cancellation API — call their support on 080-67466729.</p>
        </aside>
      </div>

      <Sheet open={Boolean(selected)} onClose={() => onSelect(null)} label="Basket details">
        {selected && (
          <div className="flex flex-1 flex-col gap-5 overflow-y-auto bg-koi-bg p-6 font-koi-sans text-koi-ink">
            <div className="flex items-center justify-between">
              <span className="font-koi-display text-2xl font-extrabold text-koi-forest">Basket details</span>
              <button type="button" onClick={() => onSelect(null)} aria-label="Close" className="grid size-11 place-items-center rounded-full border border-koi-forest/15 text-koi-forest">
                <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12" /><path d="M18 6 6 18" /></svg>
              </button>
            </div>
            <dl className="m-0 grid grid-cols-[110px_minmax(0,1fr)] gap-x-4 gap-y-2.5 rounded-2xl bg-white p-4 text-sm">
              <dt className="font-koi-mono text-[11px] uppercase tracking-[0.14em] text-koi-muted">Basket</dt><dd className="m-0 font-semibold">{describeState(selected.state).label}</dd>
              <dt className="font-koi-mono text-[11px] uppercase tracking-[0.14em] text-koi-muted">{selected.handed_off_at ? "Sent" : "Saved"}</dt><dd className="m-0">{fmtLong(selected.handed_off_at ?? selected.created_at)}</dd>
              {selected.address_snapshot && (<><dt className="font-koi-mono text-[11px] uppercase tracking-[0.14em] text-koi-muted">Delivering to</dt><dd className="m-0">{[selected.address_snapshot.label, selected.address_snapshot.street, selected.address_snapshot.city, selected.address_snapshot.state, selected.address_snapshot.pincode].filter(Boolean).join(", ")}</dd></>)}
              {selected.external_order_ref && (<><dt className="font-koi-mono text-[11px] uppercase tracking-[0.14em] text-koi-muted">Swiggy ref</dt><dd className="m-0 font-koi-num">{selected.external_order_ref}</dd></>)}
            </dl>
            <div className="flex flex-col">
              <span className="font-koi-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-koi-ink2">Products · <span className="font-koi-num">{(selected.items || []).length}</span></span>
              {(selected.items || []).map((line) => (
                <div key={line.id} className="flex items-center gap-3 border-b border-koi-forest/10 py-3">
                  <ProductThumb src={bySku.get(String(line.koi_sku_id))?.image?.hero || null} alt="" size={48} radius={12} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    {line.brand_name && <span className="truncate font-koi-mono text-[10px] uppercase tracking-[0.12em] text-koi-muted">{line.brand_name}</span>}
                    <span className="text-sm font-bold">{line.product_name} <span className="font-normal text-koi-muted">× {line.quantity}</span></span>
                  </span>
                  <ScoreBadge score={line.koi_score_at_handoff} size={32} />
                  {line.unit_mrp_at_handoff !== null && <span className="font-koi-num text-sm font-semibold"><Money value={Number(line.unit_mrp_at_handoff) * line.quantity} /></span>}
                </div>
              ))}
              <div className="flex justify-between pt-3 text-sm">
                <span className="font-bold">MRP total</span>
                {selected.subtotal_at_handoff !== null ? <span className="font-koi-num font-semibold"><Money value={selected.subtotal_at_handoff} /></span> : <span>—</span>}
              </div>
            </div>
            <p className="m-0 text-[12.5px] leading-normal text-koi-ink2">KOI’s listed prices at hand-off. What you paid is on your Swiggy receipt.</p>
            {selected.state === FULFILMENT.HANDED_OFF && (
              <section className="flex flex-col gap-2.5 rounded-2xl bg-white p-4">
                <span className="text-sm font-bold">Did this arrive?</span>
                <span className="text-[12.5px] leading-normal text-koi-ink2">KOI doesn’t get delivery updates from Swiggy, so this is the only way we know.</span>
                <div className="flex gap-2">
                  <button type="button" onClick={() => answer(selected, DELIVERY_REPORT.ARRIVED)} disabled={busyId === selected.id} className="h-11 flex-1 rounded-full bg-koi-forest text-sm font-bold text-koi-lime disabled:opacity-60">Yes, it arrived</button>
                  <button type="button" onClick={() => answer(selected, DELIVERY_REPORT.PARTIAL)} disabled={busyId === selected.id} className="h-11 flex-1 rounded-full border border-koi-forest/20 bg-white text-sm font-semibold text-koi-forest disabled:opacity-60">Partly</button>
                </div>
              </section>
            )}
          </div>
        )}
      </Sheet>
    </main>
  );
}

/** Signed out, loading or empty: one calm card. */
export function OrdersEmpty({ title, body, cta, href, onCta }) {
  return (
    <main className="mx-auto flex w-full max-w-[640px] flex-col px-4 pt-12 font-koi-sans text-koi-ink">
      <section className="flex flex-col items-center gap-3 rounded-[26px] border border-koi-forest/10 bg-white p-8 text-center">
        <span aria-hidden="true" className="grid size-16 place-items-center rounded-full bg-koi-tint text-koi-primary">
          <svg className="size-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 7h12l-1 13H7L6 7z" /><path d="M9 7a3 3 0 0 1 6 0" /></svg>
        </span>
        <h1 className="koi-condensed m-0 font-koi-display text-[34px] font-extrabold tracking-[-0.02em] text-koi-forest">{title}</h1>
        {body && <p className="m-0 max-w-[420px] text-[14.5px] leading-relaxed text-koi-ink2">{body}</p>}
        {cta && (onCta
          ? <button type="button" onClick={onCta} className="mt-1 flex h-12 items-center rounded-full bg-koi-forest px-6 text-[15px] font-bold text-koi-lime">{cta}</button>
          : <Link href={href} className="mt-1 flex h-12 items-center rounded-full bg-koi-forest px-6 text-[15px] font-bold text-koi-lime no-underline">{cta} →</Link>)}
      </section>
    </main>
  );
}
