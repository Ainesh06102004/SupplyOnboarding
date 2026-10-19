"use client";
// ============================================================================
// KOI PRODUCT - the close-up (cinematic storefront, Oct 2026)
//
// The pack fills the left of the frame inside a viewfinder; it tilts with the
// pointer and turns over in 3D to "the label, read": the declared figures per
// 100, decoding under a scan line. On the right: the name, the price, the KOI
// score as a ring that draws itself, the facts at a glance, and the purchase.
//
// KOI walks the label once, on its own timeline (any turn or add cuts it): it
// reads, flies to the figure worth knowing, rings it and says why — only what
// the claim rules or the figures themselves back, never a verdict.
//
// Everything the old hero and buy panel did is here: the image rail and the
// fullscreen view, quantity, add (useAddToCart, so the ember carries it), the
// in-cart note, save, share, the stock line only when a source answered, and
// the line about who delivers.
// ============================================================================

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { X, Maximize2, Share2, Heart, ShieldCheck, Truck } from "lucide-react";
import { toast } from "sonner";
import { useCartStore } from "@/store/cartStore";
import { useCartUi } from "@/store/cartUiStore";
import { lineKey, packs } from "@/lib/cart/lines";
import { useAddToCart } from "@/components/store/cart/CartLayer";
import { availabilityOf, canClaimAvailability, AVAILABILITY } from "@/lib/availability";
import { QtyStepper } from "@/components/store/system/primitives";
import { setupMotion, prefersReducedMotion, useGSAP, SplitText, E } from "@/lib/motion/koiMotion";
import { useEmber } from "@/components/store/ember/Ember";
import { useKoiVoice } from "@/store/koiVoiceStore";

const VIEWS = { hero: "Pack", label: "Label", lifestyle: "In use" };
const ringTone = (n) => (n >= 80 ? "#1f5c3a" : n >= 50 ? "#b07d2b" : "#c2683a");

/** The declared rows, per 100, that the product actually has. */
function labelRows(f) {
  if (!f) return [];
  return [
    { key: "energy", label: "Energy", value: f.kcal, unit: "kcal" },
    { key: "protein", label: "Protein", value: f.protein, unit: "g", badge: f.high?.protein ? "High" : null },
    { key: "carbs", label: "Carbohydrate", value: f.carbs, unit: "g" },
    { key: "sugar", label: "of which sugars", value: f.sugar, unit: "g", sub: true, badge: f.high?.sugarFree ? "Sugar free" : f.high?.lowSugar ? "Low" : null },
    { key: "fat", label: "Fat", value: f.fat, unit: "g" },
    { key: "fibre", label: "Fibre", value: f.fibre, unit: "g", badge: f.high?.fibre ? "High" : null },
  ].filter((r) => r.value !== null && r.value !== undefined);
}

/** What KOI points out on its walk: only what the rules or the figures back. */
function storyOf(f) {
  if (!f) return [];
  const s = [];
  if (f.sugar != null && (f.high?.sugarFree || f.high?.lowSugar)) s.push({ key: "sugar", line: f.high.sugarFree ? "No sugar to speak of, by the label." : "Low in sugar, by the label." });
  if (f.protein != null && f.high?.protein) s.push({ key: "protein", line: "High in protein, by our own rule on the declared figures." });
  if (f.fat != null && f.kcal && f.fat * 9 > f.kcal * 0.5) s.push({ key: "fat", line: "Most of its energy comes from fat. The serving panel below shows what a portion holds." });
  return s.slice(0, 2);
}

const LINES = {
  read: "I’ve read the label. Turn it over for every figure.",
  back: "Here’s the whole label, as it’s declared.",
  added: "Added. It’s in your cart.",
};

async function shareProduct(name) {
  try {
    const url = window.location.href;
    if (navigator.share) await navigator.share({ title: `${name} - KOI`, url });
    else { await navigator.clipboard.writeText(url); toast.success("Link copied to clipboard"); }
  } catch { /* dismissed */ }
}

function StockLine({ product }) {
  if (!canClaimAvailability(product)) return null;
  const out = availabilityOf(product) === AVAILABILITY.UNAVAILABLE;
  return (
    <div className="flex items-center gap-2 text-[13px] font-semibold">
      <span aria-hidden="true" className={`size-1.5 rounded-full ${out ? "bg-koi-warm" : "bg-koi-green"}`} />
      <span className={out ? "text-koi-warm" : "text-koi-primary"}>{out ? "Not available right now" : "In stock"}</span>
      {product.deliveryEta && <span className="ml-auto inline-flex items-center gap-1.5 text-koi-ink2"><Truck className="size-3.5" /> {product.deliveryEta}</span>}
    </div>
  );
}

export default function CloseUp({ product }) {
  const root = useRef(null);
  const ember = useEmber();
  const say = useKoiVoice((s) => s.say);
  const add = useAddToCart();
  const openSheet = useCartUi((s) => s.openSheet);
  const item = product.raw || product;
  const key = lineKey({ skuId: item.skuId, productId: item.id });
  const inCart = useCartStore((s) => packs(s.items.find((i) => lineKey(i) === key)?.quantity));

  const views = ["hero", "label", "lifestyle"].filter((k) => product.image?.[k]);
  const [view, setView] = useState(views[0] || "hero");
  const [back, setBack] = useState(false);
  const [lightbox, setLightbox] = useState(false);
  const [qty, setQty] = useState(1);
  const [saved, setSaved] = useState(false);
  const story = useRef(null);

  const facts = product.facts;
  const rows = labelRows(facts);
  const glance = rows.filter((r) => r.key !== "carbs");
  const per = facts?.unit ? `per 100 ${facts.unit}` : "per 100";
  const scored = product.trust?.scored;
  const score = Number(product.score);
  const price = Number(product.price);
  const size = product.weight && product.weight !== "N/A" ? product.weight : null;
  const isPhoto = view === "lifestyle";

  // ── the opening, and KOI's walk of the label ──
  const { contextSafe } = useGSAP(() => {
    const gsap = setupMotion();
    const q = (s) => root.current.querySelector(s);
    const qa = (s) => root.current.querySelectorAll(s);
    const reduce = prefersReducedMotion();
    const walk = storyOf(facts);
    if (reduce) { say(walk[0]?.line ?? LINES.read); return; }

    const tl = gsap.timeline({ defaults: { ease: E.reveal } });
    tl.from(q("[data-crumbs]"), { autoAlpha: 0, x: -12, duration: 0.7 }, 0.05);
    tl.from(q("[data-tilt]"), { autoAlpha: 0, y: 60, rotationX: 14, transformPerspective: 1400, duration: 1.3, ease: E.dolly }, 0.05);
    tl.fromTo(qa("[data-finder] path"), { drawSVG: "50% 50%" }, { drawSVG: "0% 100%", duration: 0.9, stagger: 0.06, ease: E.cut }, 0.7);
    const ring = q("[data-ring]");
    if (ring && scored) tl.fromTo(ring, { drawSVG: "0% 0%" }, { drawSVG: `0% ${Math.max(0, Math.min(100, score))}%`, duration: 1.4 }, 0.7);
    const num = q("[data-score]");
    if (num && scored) { const o = { v: 0 }; tl.to(o, { v: score, duration: 1.4, onUpdate: () => { num.textContent = String(Math.round(o.v)); } }, 0.7); }
    const title = q("[data-title]");
    if (title) {
      const split = SplitText.create(title, { type: "chars,words", mask: "words" });
      tl.from(split.chars, { yPercent: 110, rotationX: -70, transformOrigin: "50% 100%", duration: 1, stagger: 0.02 }, 0.25);
    }
    tl.from(qa("[data-rise]"), { autoAlpha: 0, y: 18, duration: 0.8, stagger: 0.08 }, 0.4);
    tl.from(qa("[data-fact]"), { autoAlpha: 0, y: 16, duration: 0.7, stagger: 0.06 }, 0.75);

    // KOI walks the label once; any turn or add cuts it.
    const s = gsap.timeline({ delay: 1.6 });
    if (walk.length) {
      s.call(() => ember.status("Reading the label"));
      walk.forEach((w, i) => {
        const at = 1.3 + i * 2.7;
        s.call(() => { const el = q(`[data-fact="${w.key}"]`); if (el) ember.go(el, ember.perch(el, 6), () => ember.mark(el, "ring", 6)); }, null, at);
        s.call(() => say(w.line), null, at + 0.3);
      });
      s.call(() => { ember.mark(null); ember.home(); }, null, 1.3 + walk.length * 2.7 + 1.4);
    } else {
      s.call(() => say(LINES.read), null, 0.2);
    }
    story.current = s;

    // The pack follows the pointer, a little.
    const node = root.current;
    const stage = q("[data-tilt]");
    gsap.set(stage, { transformPerspective: 1400 });
    const rx = gsap.quickTo(stage, "rotationX", { duration: 1, ease: "power3.out" });
    const ry = gsap.quickTo(stage, "rotationY", { duration: 1, ease: "power3.out" });
    const onMove = (e) => {
      const r = node.getBoundingClientRect();
      ry(((e.clientX - r.left) / r.width - 0.5) * 10);
      rx(-((e.clientY - r.top) / r.height - 0.5) * 6);
    };
    node.addEventListener("pointermove", onMove);
    return () => node.removeEventListener("pointermove", onMove);
  }, { scope: root, dependencies: [product.id] });

  // The dot lets go of this page's figures when the page leaves.
  useEffect(() => () => ember.rest(), [ember]);

  const cut = () => { story.current?.kill(); story.current = null; ember.mark(null); };

  // Turn the pack: on the back, the figures decode under a scan line and KOI rings the one worth knowing.
  // contextSafe at click time, so the tweens belong to this page's context.
  const turn = (toBack) => contextSafe(() => {
    const gsap = setupMotion();
    cut();
    setBack(toBack);
    const flip = root.current.querySelector("[data-flip]");
    const afterBack = () => {
      const want = storyOf(facts)[0]?.key ?? rows[0]?.key;
      const row = root.current.querySelector(`[data-row="${want}"]`);
      if (row) ember.go(row, ember.perch(row, 4), () => ember.mark(row, "ring", 4));
      say(LINES.back);
    };
    if (prefersReducedMotion()) { gsap.set(flip, { rotationY: toBack ? 180 : 0 }); if (toBack) afterBack(); else ember.home(); return; }
    const tl = gsap.timeline();
    tl.to(flip, { rotationY: toBack ? 180 : 0, duration: 1.2, ease: E.dolly }, 0);
    tl.to(flip, { scale: 0.93, duration: 0.6, ease: "power2.out", yoyo: true, repeat: 1 }, 0);
    if (toBack) {
      tl.add(() => {
        root.current.querySelectorAll("[data-val]").forEach((v, i) => {
          const t = v.dataset.val;
          v.textContent = "";
          gsap.to(v, { duration: 0.85, delay: 0.08 + i * 0.1, scrambleText: { text: t, chars: "0123456789.", speed: 0.8 } });
        });
        const backFace = root.current.querySelector("[data-back]");
        gsap.fromTo(root.current.querySelector("[data-scan]"), { y: 0, autoAlpha: 1 }, { y: backFace.offsetHeight, autoAlpha: 0, duration: 1.4, ease: "power1.inOut" });
      }, 0.7);
      tl.add(afterBack, 1.3);
    } else ember.home();
  })();

  const onAdd = () => {
    cut();
    add(item, qty);
    say(LINES.added);
  };

  return (
    <section ref={root} className="relative bg-koi-bg font-koi-sans text-koi-ink">
      <nav data-crumbs aria-label="Breadcrumb" className="mx-auto max-w-[1440px] px-[clamp(16px,4vw,52px)] pt-6">
        <ol className="m-0 flex list-none flex-wrap items-center gap-2.5 p-0 font-koi-mono text-[11px] font-medium uppercase tracking-[0.14em] text-koi-muted">
          <li><a href="/store/shop" className="text-koi-primary hover:underline">Shop</a></li>
          <li aria-hidden="true">/</li>
          <li>{product.subcategory || product.category}</li>
          <li aria-hidden="true">/</li>
          <li aria-current="page" className="max-w-[40ch] truncate">{product.name}</li>
        </ol>
      </nav>

      <div className="mx-auto grid w-full max-w-[1440px] grid-cols-1 items-start gap-x-[clamp(32px,6vw,96px)] gap-y-10 px-[clamp(16px,4vw,52px)] pb-6 pt-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-center">
        {/* ── the pack ── */}
        <div className="flex min-w-0 flex-col items-center gap-5 lg:sticky lg:top-[calc(var(--koi-header-h)+24px)]">
          <div data-tilt className="relative aspect-[11/14] w-full max-w-[420px] [perspective:1600px]">
            <svg data-finder viewBox="0 0 456 576" preserveAspectRatio="none" aria-hidden="true" className="absolute -left-[18px] -top-[18px] h-[calc(100%+36px)] w-[calc(100%+36px)] overflow-visible">
              <path d="M1 40V1h39" fill="none" stroke="rgba(8,61,45,.35)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
              <path d="M416 1h39v39" fill="none" stroke="rgba(8,61,45,.35)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
              <path d="M455 536v39h-39" fill="none" stroke="rgba(8,61,45,.35)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
              <path d="M40 575H1v-39" fill="none" stroke="rgba(8,61,45,.35)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
            </svg>
            <div data-flip className="absolute inset-0 transform-3d">
              {/* front: the pack */}
              <div className={`group absolute inset-0 overflow-hidden rounded-[28px] shadow-[0_1px_0_rgba(20,22,15,.06),0_50px_80px_-50px_rgba(15,61,46,.6)] backface-hidden ${isPhoto ? "bg-black" : "bg-white"}`}>
                {product.image?.[view] ? (
                  <Image
                    src={product.image[view]}
                    alt={`${product.brand} ${product.name}, ${VIEWS[view] || view}`}
                    fill
                    preload
                    sizes="(min-width: 1024px) 420px, 90vw"
                    className={isPhoto ? "object-cover" : "object-contain p-[9%]"}
                    style={{ mixBlendMode: isPhoto ? "normal" : "multiply" }}
                  />
                ) : (
                  <div className="grid size-full place-items-center"><ShieldCheck className="size-24 text-koi-forest/10" /></div>
                )}
                {product.image?.[view] && (
                  <button type="button" onClick={() => setLightbox(true)} aria-label="View fullscreen" className="absolute right-4 top-4 grid size-10 place-items-center rounded-full border border-koi-forest/10 bg-white/85 text-koi-forest opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100 focus-visible:opacity-100">
                    <Maximize2 className="size-4" />
                  </button>
                )}
              </div>
              {/* back: the label, read */}
              <div data-back aria-hidden={!back} className="absolute inset-0 flex flex-col overflow-hidden rounded-[28px] bg-koi-forest px-[30px] pb-6 pt-7 text-koi-bg backface-hidden [transform:rotateY(180deg)]">
                <div className="flex items-baseline justify-between gap-3 border-b border-koi-bg/20 pb-3.5">
                  <span className="font-koi-display text-[22px] font-extrabold">The label, read</span>
                  <span className="font-koi-mono text-[11px] font-medium uppercase tracking-[0.14em] text-koi-bg/70">{per}</span>
                </div>
                {rows.length ? (
                  <div className="flex flex-1 flex-col justify-around">
                    {rows.map((r, i) => (
                      <div key={r.key} data-row={r.key} className={`flex items-baseline justify-between py-2 ${i < rows.length - 1 ? "border-b border-koi-bg/10" : ""} ${r.sub ? "pl-[18px]" : ""}`}>
                        <span className={`flex items-center gap-2.5 text-[15px] font-medium ${r.sub ? "text-koi-bg/90" : ""}`}>
                          {r.label}
                          {r.badge && <span className="rounded-full bg-koi-lime px-2 py-[3px] font-koi-mono text-[10.5px] font-bold uppercase tracking-[0.1em] text-koi-forest">{r.badge}</span>}
                        </span>
                        <span className="flex items-baseline gap-1.5">
                          <span data-val={r.value} className="font-koi-num text-[26px] font-semibold">{r.value}</span>
                          <span className="font-koi-mono text-xs text-koi-bg/70">{r.unit}</span>
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="m-0 flex flex-1 items-center text-[15px] text-koi-bg/80">KOI doesn’t hold this product’s nutrition panel yet.</p>
                )}
                <p className="m-0 mt-3 font-koi-mono text-[10.5px] uppercase leading-relaxed tracking-[0.1em] text-koi-bg/70">As declared on the pack · claims tested by KOI</p>
                <div data-scan aria-hidden="true" className="absolute inset-x-0 top-0 h-[2px] bg-koi-lime opacity-0 shadow-[0_0_18px_4px_rgba(221,242,71,.45)]" />
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              aria-pressed={back}
              onClick={() => turn(!back)}
              className="flex h-11 items-center gap-2.5 rounded-full border border-koi-forest/20 bg-white px-[18px] text-sm font-semibold text-koi-forest transition-colors hover:border-koi-forest/40"
            >
              <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 0 1 15-6.7L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-15 6.7L3 16" /><path d="M3 21v-5h5" /></svg>
              {back ? "Show the pack" : "Turn it over"}
            </button>
            {!back && views.length > 1 && (
              <div role="group" aria-label="Views" className="flex gap-1.5">
                {views.map((k) => (
                  <button key={k} type="button" aria-pressed={view === k} onClick={() => setView(k)} className={`h-11 rounded-full px-3.5 font-koi-mono text-[11px] font-semibold uppercase tracking-[0.12em] transition-colors ${view === k ? "bg-koi-tint text-koi-forest" : "text-koi-muted hover:bg-white"}`}>
                    {VIEWS[k] || k}
                  </button>
                ))}
              </div>
            )}
            {(back || views.length <= 1) && <span className="font-koi-mono text-[11px] font-medium uppercase tracking-[0.14em] text-koi-muted">{back ? "Back · the label" : "Front · the pack"}</span>}
          </div>
        </div>

        {/* ── the facts and the purchase ── */}
        <div className="flex min-w-0 flex-col gap-6">
          <div className="flex flex-col gap-3.5">
            <span data-rise className="font-koi-mono text-xs font-medium uppercase tracking-[0.18em] text-koi-muted">{product.brand} · {product.subcategory || product.category}</span>
            <h1 data-title className="koi-condensed m-0 font-koi-display text-[clamp(40px,4.8vw,74px)] font-extrabold leading-[0.95] tracking-[-0.03em] text-koi-forest">{product.name}</h1>
            <div data-rise className="flex flex-wrap items-center gap-3.5">
              {size && <span className="rounded-full border border-koi-forest/10 bg-white px-3 py-1.5 text-[13px] font-semibold text-koi-forest">{size}</span>}
              {price > 0 && <span className="font-koi-num text-[26px] font-semibold">₹{price.toLocaleString("en-IN")}</span>}
              <span className="font-koi-mono text-[11px] font-medium uppercase tracking-[0.14em] text-koi-muted">MRP</span>
            </div>
            {product.philosophy && <p data-rise className="m-0 max-w-xl text-[16px] leading-relaxed text-koi-ink/70">{product.philosophy}</p>}
            {product.dietary?.length > 0 && (
              <div data-rise className="flex flex-wrap gap-2">
                {product.dietary.map((d) => <span key={d} className="rounded-full border border-koi-tint-border bg-koi-tint px-3 py-1 text-[12px] font-bold text-koi-primary">{d}</span>)}
              </div>
            )}
          </div>

          {/* the score */}
          <div data-rise className="flex flex-wrap items-center gap-5 rounded-[22px] border border-koi-forest/10 bg-white p-5">
            {scored && (
              <div className="relative size-24 shrink-0">
                <svg viewBox="0 0 96 96" className="absolute inset-0 size-24 -rotate-90" aria-hidden="true">
                  <circle cx="48" cy="48" r="42" fill="none" stroke="rgba(8,61,45,.1)" strokeWidth="6" />
                  <circle data-ring cx="48" cy="48" r="42" fill="none" stroke={ringTone(score)} strokeWidth="6" strokeLinecap="round" strokeDasharray={`${(Math.max(0, Math.min(100, score)) / 100) * 263.9} 263.9`} />
                </svg>
                <span data-score className="absolute inset-0 grid place-items-center font-koi-num text-[32px] font-bold text-koi-forest">{Math.round(score)}</span>
              </div>
            )}
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="font-koi-mono text-[11px] font-medium uppercase tracking-[0.16em] text-koi-ink2">KOI score</span>
                <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${scored ? "border-koi-tint-border bg-koi-tint text-koi-primary" : "border-koi-amber-border bg-koi-amber-bg text-koi-amber-ink"}`}>
                  {scored ? `Screened${product.koiStatus ? ` · ${String(product.koiStatus).toLowerCase()}` : ""}` : "Listed · label review in progress"}
                </span>
              </div>
              {(product.trust?.attributes?.length > 0 || product.trust?.subs?.length > 0) && (
                <details className="group">
                  <summary className="flex cursor-pointer list-none items-center gap-1.5 text-sm font-semibold text-koi-forest [&::-webkit-details-marker]:hidden">
                    {scored ? "Why this score" : "What KOI has checked"}
                    <svg className="size-4 transition-transform group-open:rotate-180" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
                  </summary>
                  <ul className="m-0 mt-2.5 flex list-none flex-col gap-1.5 p-0 text-[13.5px] leading-snug text-koi-ink2">
                    {product.trust.attributes.map((a) => (
                      <li key={a.label} className="flex gap-2"><span aria-hidden="true" className="mt-[7px] size-[5px] shrink-0 rounded-full bg-koi-primary" />{a.label}</li>
                    ))}
                    {product.trust.subs.map((s) => (
                      <li key={s.label} className="flex gap-2"><span aria-hidden="true" className="mt-[7px] size-[5px] shrink-0 rounded-full bg-koi-primary" />{s.label}: <span className="font-koi-num font-semibold">{s.value}</span></li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          </div>

          {/* at a glance */}
          {glance.length > 0 && (
            <div className="flex flex-col gap-2.5">
              <span data-rise className="font-koi-mono text-[11px] font-medium uppercase tracking-[0.16em] text-koi-muted">At a glance · {per}</span>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                {glance.map((r) => (
                  <div key={r.key} data-fact={r.key} className="flex flex-col gap-1.5 rounded-2xl border border-koi-forest/10 bg-white px-3.5 py-3">
                    <span className="flex items-center gap-1.5 font-koi-mono text-[10px] font-medium uppercase tracking-[0.14em] text-koi-muted">
                      {r.key === "sugar" ? "Sugars" : r.label}
                      {r.badge && <span className="rounded-full bg-koi-lime px-1.5 py-px text-[9px] font-bold text-koi-forest">{r.badge}</span>}
                    </span>
                    <span className="flex items-baseline gap-1"><span className="font-koi-num text-[21px] font-semibold leading-none">{r.value}</span><span className="font-koi-mono text-[10.5px] text-koi-muted">{r.unit}</span></span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* the purchase */}
          <div data-rise className="flex flex-col gap-3">
            <StockLine product={product} />
            <div className="flex flex-wrap items-center gap-3">
              <QtyStepper value={qty} onChange={setQty} label={product.name} min={1} removable={false} size="lg" />
              <button
                type="button"
                onClick={onAdd}
                className="flex h-[58px] flex-[1_1_220px] items-center justify-center gap-2.5 rounded-full bg-koi-forest px-[26px] text-base font-bold text-koi-lime shadow-[0_18px_34px_-18px_rgba(8,61,45,.9)] transition-transform hover:-translate-y-0.5"
              >
                <svg className="size-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 7h12l-1 13H7L6 7z" /><path d="M9 7a3 3 0 0 1 6 0" /></svg>
                Add to cart{price > 0 && <> · <span className="font-koi-num">₹{(price * qty).toLocaleString("en-IN")}</span></>}
              </button>
              <button type="button" aria-pressed={saved} onClick={() => setSaved((s) => !s)} aria-label={saved ? `Remove ${product.name} from saved` : `Save ${product.name}`} className="grid size-[58px] place-items-center rounded-full border border-koi-forest/20 bg-white text-koi-forest transition-colors hover:border-koi-forest/40">
                <Heart className="size-5" fill={saved ? "#c2683a" : "none"} style={{ color: saved ? "#c2683a" : undefined }} />
              </button>
              <button type="button" onClick={() => shareProduct(product.name)} aria-label="Share" className="grid size-[58px] place-items-center rounded-full border border-koi-forest/20 bg-white text-koi-forest transition-colors hover:border-koi-forest/40">
                <Share2 className="size-5" />
              </button>
            </div>
            {inCart > 0 && (
              <div className="flex items-center gap-2.5 rounded-2xl border border-koi-tint-border bg-koi-tint px-3.5 py-2.5">
                <span className="flex-1 text-[13.5px] font-semibold text-koi-primary"><span className="font-koi-num">{inCart}</span> already in your cart</span>
                <button type="button" onClick={openSheet} className="text-[13px] font-semibold text-koi-primary hover:underline">View cart</button>
              </div>
            )}
            <p className="m-0 flex items-center gap-2 border-t border-koi-forest/10 pt-3 text-[12.5px] leading-normal text-koi-ink2">
              <ShieldCheck className="size-4 shrink-0 text-koi-green" />
              This product passed KOI’s label screen. Swiggy delivers; KOI never takes payment.
            </p>
          </div>
        </div>
      </div>

      {lightbox && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={product.name} onClick={() => setLightbox(false)}>
          <div className="absolute inset-0 bg-[rgba(8,29,22,0.75)] backdrop-blur-md" />
          <button type="button" aria-label="Close" className="absolute right-5 top-5 z-10 grid size-11 place-items-center rounded-full bg-white/10 text-white backdrop-blur-md"><X className="size-5" /></button>
          <div className="relative h-[85vh] w-[90vw]" onClick={(e) => e.stopPropagation()}>
            <Image src={product.image[view]} alt={product.name} fill sizes="90vw" className="rounded-2xl object-contain" style={{ background: isPhoto ? "transparent" : "#fff" }} />
          </div>
        </div>
      )}
    </section>
  );
}
