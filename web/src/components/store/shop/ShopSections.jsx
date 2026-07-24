"use client";

// ============================================================================
// KOI SHOP - Editorial sections & interactive shell
// Hero (search trigger) · FeaturedEditorial · Shelf · GoalRail ·
// IngredientStrip · FilterBar · FilterDrawer · ProductGrid · MiniCart
// ============================================================================

import React, { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Search, Target, TrendingUp, Sparkles, Plus,
  ArrowUpRight, Leaf, ShieldCheck, Dumbbell, Activity, CheckCircle2, ChevronRight,
  X, Check, SlidersHorizontal, ChevronDown, Filter, Baby, Heart, Flame, Command, ShoppingBag, ArrowRight
} from "lucide-react";
import Image from "next/image";
import { useCartStore } from "@/store/cartStore";
import { C, HEADING, BODY } from "@/components/store/landing/tokens";
import { Reveal, Eyebrow, Marquee, ScoreRing, ArrowButton, Grain } from "@/components/store/landing/primitives";
import { PRICE_OPTIONS, SCORE_OPTIONS, DIETARY_OPTIONS } from "./shopData";
import ShopProductCard from "./ShopProductCard";
import { GoalCard } from "./GoalSetup";

const GOAL_ICONS = { Dumbbell, ShieldCheck, Sprout, Zap, Activity, Baby, Heart, Flame };
const GOAL_TONES = ["forest", "emerald", "lime", "butter", "cream", "orange", "mint", "forest"];
const TONE_STYLE = {
  forest: { bg: C.forest, fg: "#fff", sub: "rgba(255,255,255,0.6)", ic: C.lime },
  emerald: { bg: C.emerald, fg: "#fff", sub: "rgba(255,255,255,0.75)", ic: "#fff" },
  lime: { bg: C.lime, fg: C.forest, sub: "rgba(8,61,45,0.6)", ic: C.forest },
  butter: { bg: C.butter, fg: C.forest, sub: "rgba(8,61,45,0.6)", ic: C.forest },
  cream: { bg: C.cream, fg: C.forest, sub: "rgba(8,61,45,0.55)", ic: C.emerald },
  orange: { bg: C.orange, fg: "#fff", sub: "rgba(255,255,255,0.8)", ic: "#fff" },
  mint: { bg: C.mint, fg: C.forest, sub: "rgba(8,61,45,0.55)", ic: C.emerald },
};

// ── Hero: the KOI search console ────────────────────────────────────────────
const HERO_QUERIES = [
  "high protein snacks",
  "no palm oil peanut butter",
  "best products for gut health",
  "snacks under ₹300",
  "what to eat after a workout",
  "zero refined sugar cookies",
];
const HERO_CHIPS = ["High Protein", "No Palm Oil", "Gut Health", "Low Sugar", "Kids Nutrition", "Post-Workout", "No Maida"];

function useReducedMotion() {
  const [r, setR] = useState(false);
  useEffect(() => {
    const m = window.matchMedia("(prefers-reduced-motion: reduce)");
    const on = () => setR(m.matches);
    on();
    m.addEventListener?.("change", on);
    return () => m.removeEventListener?.("change", on);
  }, []);
  return r;
}

// Typewriter that types, pauses, deletes and cycles.
function useTypewriter(words) {
  const reduced = useReducedMotion();
  const [text, setText] = useState("");
  const [i, setI] = useState(0);
  const [del, setDel] = useState(false);
  useEffect(() => {
    if (reduced) {
      const t1 = setTimeout(() => setText(words[i % words.length]), 0);
      const t2 = setTimeout(() => setI((v) => v + 1), 2600);
      return () => { clearTimeout(t1); clearTimeout(t2); };
    }
    const word = words[i % words.length];
    let t;
    if (!del) {
      if (text.length < word.length) t = setTimeout(() => setText(word.slice(0, text.length + 1)), 55);
      else t = setTimeout(() => setDel(true), 1700);
    } else {
      if (text.length > 0) t = setTimeout(() => setText(word.slice(0, text.length - 1)), 26);
      else { 
        t = setTimeout(() => {
          setDel(false);
          setI((v) => v + 1);
        }, 0);
      }
    }
    return () => clearTimeout(t);
  }, [text, del, i, reduced]); // eslint-disable-line react-hooks/exhaustive-deps
  return text;
}

export function ShopHero({ onOpenSearch, onSuggest, stats }) {
  const typed = useTypewriter(HERO_QUERIES);

  return (
    <section
      className="relative flex min-h-[90vh] items-center overflow-hidden"
      style={{ background: `linear-gradient(180deg, ${C.green} 0%, ${C.forest} 55%, ${C.forest} 100%)` }}
    >
      <Grain opacity={0.06} />
      {/* single soft glow kept high, clear of the bottom transition */}
      <div className="pointer-events-none absolute -right-24 top-0 h-[34rem] w-[34rem] rounded-full" style={{ background: C.emerald, opacity: 0.22, filter: "blur(130px)" }} />
      {/* concentric guide rings behind the console */}
      <div className="pointer-events-none absolute left-1/2 top-1/2 hidden h-[130vh] w-[130vh] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/[0.05] lg:block" />
      <div className="pointer-events-none absolute left-1/2 top-1/2 hidden h-[95vh] w-[95vh] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/[0.06] lg:block" />

      {/* center console */}
      <div className="relative z-10 mx-auto w-full max-w-3xl px-5 pt-24 pb-44 text-center sm:px-8 sm:pb-56">
        <Reveal>
          <div className="mb-7 flex items-center justify-center gap-2.5">
            <span className="inline-flex items-center gap-1 rounded-md border border-white/15 bg-white/5 px-1.5 py-1 text-[11px] font-bold text-[#DDF247]">
              <Command className="h-3 w-3" /> K
            </span>
            <span className="text-[11px] font-bold uppercase tracking-[0.24em] text-white/55">KOI Universal Search</span>
          </div>
        </Reveal>

        <Reveal delay={60}>
          <h1 className="font-extrabold uppercase leading-[0.9] tracking-[-0.02em] text-white" style={{ ...HEADING, fontSize: "clamp(2.4rem, 6vw, 4.8rem)" }}>
            Shop like you have<br /><span style={{ color: C.lime }}>a nutritionist.</span>
          </h1>
        </Reveal>

        <Reveal delay={130}>
          <p className="mx-auto mt-6 max-w-xl text-[15px] leading-relaxed text-white/60 sm:text-[16px]" style={BODY}>
            Search across products, goals, ingredients and brands - or just describe what you&apos;re
            trying to eat better. Every result is already KOI-verified.
          </p>
        </Reveal>

        {/* THE console */}
        <Reveal delay={200}>
          <div className="group relative mx-auto mt-10 w-full max-w-2xl">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -inset-3 rounded-[30px] opacity-50 blur-2xl transition-opacity duration-500 group-hover:opacity-90"
              style={{ background: `radial-gradient(60% 130% at 50% 0%, ${C.emerald}77, transparent 70%)` }}
            />
            <div className="relative rounded-[22px] p-[1.5px]" style={{ background: `linear-gradient(120deg, ${C.emerald}, ${C.lime}, rgba(255,255,255,0.08) 65%)` }}>
              <button
                onClick={onOpenSearch}
                aria-label="Open universal search"
                className="flex w-full items-center gap-4 rounded-[21px] px-4 py-4 text-left transition-transform duration-300 hover:-translate-y-0.5 sm:px-5 sm:py-5"
                style={{ background: "#082C1E" }}
              >
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl" style={{ background: C.lime }}>
                  <Search className="h-5 w-5" style={{ color: C.forest }} strokeWidth={2.6} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="mb-0.5 block text-[10px] font-bold uppercase tracking-[0.16em] text-white/40">Ask KOI</span>
                  <span className="flex items-center text-[16px] font-semibold text-white sm:text-[19px]" style={HEADING}>
                    <span className="truncate">{typed}</span>
                    <span className="ml-0.5 inline-block h-[1.05em] w-[2px] shrink-0" style={{ background: C.lime, animation: "koi-caret 1s steps(1) infinite" }} />
                  </span>
                </span>
                <span className="hidden shrink-0 items-center gap-1 rounded-lg border border-white/12 bg-white/5 px-2 py-1.5 text-[11px] font-bold text-white/55 sm:flex">
                  <Command className="h-3 w-3" /> K
                </span>
              </button>
            </div>
          </div>
        </Reveal>

        {/* suggestion chips */}
        <Reveal delay={280}>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
            {HERO_CHIPS.map((c) => (
              <button
                key={c}
                onClick={() => onSuggest?.(c)}
                className="rounded-full border border-white/15 bg-white/5 px-4 py-2 text-[13px] font-semibold text-white/85 transition-all duration-200 hover:-translate-y-0.5 hover:border-[#DDF247]/50 hover:bg-white/10 hover:text-white"
              >
                {c}
              </button>
            ))}
          </div>
        </Reveal>

        {/* stats */}
        <Reveal delay={360}>
          <div className="mt-11 flex flex-wrap items-center justify-center">
            {[
              [`${stats.count}`, "Verified products"],
              [`${stats.avg}`, "Avg KOI score"],
              [`${stats.brands}`, "Curated brands"],
            ].map(([v, l], idx) => (
              <div key={l} className={`px-6 py-1 ${idx > 0 ? "border-l border-white/10" : ""}`}>
                <div className="text-[24px] font-extrabold leading-none text-white" style={HEADING}>{v}</div>
                <div className="mt-1.5 text-[10.5px] font-bold uppercase tracking-[0.1em] text-white/45">{l}</div>
              </div>
            ))}
          </div>
        </Reveal>
      </div>

      {/* clean, opaque blend from the hero base colour into the next section */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-44 sm:h-56"
        style={{ background: `linear-gradient(180deg, ${C.forest} 0%, ${C.offwhite} 100%)` }}
      />
    </section>
  );
}

// ── Featured editorial spotlight ────────────────────────────────────────────
export function FeaturedEditorial({ product, onSelect }) {
  const addToCart = useCartStore((s) => s.addToCart);
  if (!product) return null;
  return (
    <section id="collections" className="relative scroll-mt-24" style={{ background: C.offwhite }}>
      <div className="mx-auto max-w-[1400px] px-5 pb-16 pt-8 sm:px-8 lg:px-12 lg:pt-14">
        <Reveal>
          <div className="relative grid grid-cols-1 items-center gap-8 overflow-hidden rounded-[32px] p-8 sm:p-10 lg:grid-cols-2 lg:gap-4 lg:p-14" style={{ background: C.forest }}>
            <div className="pointer-events-none absolute -left-24 bottom-0 h-72 w-72 rounded-full" style={{ background: C.emerald, opacity: 0.25, filter: "blur(80px)" }} />
            {/* copy */}
            <div className="relative z-10">
              <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#DDF247]">This week&apos;s standout</span>
              <h2 className="mt-4 font-extrabold uppercase leading-[0.9] tracking-[-0.02em] text-white" style={{ ...HEADING, fontSize: "clamp(2.4rem, 5vw, 4.4rem)" }}>
                The one<br />to beat.
              </h2>
              <p className="mt-5 max-w-md text-[15px] leading-relaxed text-white/70" style={BODY}>
                {product.brand} - {product.insight}
              </p>
              <div className="mt-7 flex flex-wrap gap-2">
                {(product.tags || []).slice(0, 3).map((t) => (
                  <span key={t} className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.06em] text-white/85">{t}</span>
                ))}
              </div>
              <div className="mt-8 flex items-center gap-4">
                <button onClick={() => addToCart(product)} className="grid h-12 w-12 place-items-center rounded-full text-[#083D2D] transition-transform hover:scale-105" style={{ background: C.lime }} aria-label={`Add ${product.name}`}>
                  <Plus className="h-5 w-5" strokeWidth={2.6} />
                </button>
                <div>
                  <div className="text-[22px] font-extrabold leading-none text-white" style={HEADING}>₹{product.price}</div>
                  <div className="text-[11px] font-medium text-white/50">{product.weight}</div>
                </div>
                <button onClick={() => onSelect?.(product)} className="ml-2 inline-flex items-center gap-1.5 text-[13px] font-bold text-white underline decoration-white/30 underline-offset-4 hover:decoration-white">
                  View product <ArrowUpRight className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* product */}
            <div className="relative z-10 mx-auto aspect-square w-full max-w-[420px]">
              <button onClick={() => onSelect?.(product)} className="block relative h-full w-full" aria-label={`Open ${product.name}`}>
                <Image
                  src={product.image?.hero}
                  alt={`${product.brand} - ${product.name}`}
                  fill
                  className="object-contain drop-shadow-[0_30px_60px_rgba(0,0,0,0.4)] transition-transform duration-500 hover:scale-[1.04]"
                  style={{ animation: "koi-float 8s ease-in-out infinite" }}
                />
              </button>
              <div className="absolute right-2 top-2 flex items-center gap-2 rounded-2xl bg-white/10 p-2 pr-3 backdrop-blur-md">
                <ScoreRing score={product.score} size={46} stroke={3} label={null} track="#ffffff22" />
                <span className="text-[11px] font-bold uppercase leading-tight tracking-wide text-white">KOI<br />Verified</span>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

// ── Reusable horizontal shelf ───────────────────────────────────────────────
export function Shelf({ id, eyebrow, title, subtitle, products, handlers, background = C.offwhite }) {
  if (!products?.length) return null;
  return (
    <section id={id} className="relative scroll-mt-24" style={{ background }}>
      <div className="mx-auto max-w-[1400px] px-5 py-14 sm:px-8 lg:px-12 lg:py-16">
        <Reveal>
          <div className="flex items-end justify-between gap-4">
            <div>
              {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
              <h2 className="mt-4 font-extrabold uppercase leading-[0.92] tracking-[-0.02em] text-[#083D2D]" style={{ ...HEADING, fontSize: "clamp(1.9rem, 4vw, 3.2rem)" }}>{title}</h2>
              {subtitle && <p className="mt-2 text-[14px] font-medium text-[#101412]/55" style={BODY}>{subtitle}</p>}
            </div>
          </div>
        </Reveal>

        <div className="hide-scrollbar -mx-5 mt-8 flex gap-4 overflow-x-auto px-5 pb-4 sm:mx-0 sm:px-0">
          {products.map((p) => (
            <div key={p.id} className="w-[240px] shrink-0 sm:w-[280px]">
              <ShopProductCard product={p} className="h-full" {...handlers} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Explore by goal ─────────────────────────────────────────────────────────
export function GoalRail({ goals, activeGoal, onPick, onOpenGoal }) {
  return (
    <section id="goals" className="relative scroll-mt-24" style={{ background: C.cream }}>
      <div className="mx-auto max-w-[1400px] px-5 py-16 sm:px-8 lg:px-12 lg:py-20">
        <Reveal>
          <Eyebrow>Explore by intention</Eyebrow>
          <h2 className="mt-4 font-extrabold uppercase leading-[0.92] tracking-[-0.02em] text-[#083D2D]" style={{ ...HEADING, fontSize: "clamp(1.9rem, 4.5vw, 3.4rem)" }}>
            What are you<br />optimising for?
          </h2>
        </Reveal>

        {/* Personalised goal setup */}
        <Reveal delay={60}>
          <GoalCard onOpen={onOpenGoal} />
        </Reveal>

        <div className="mt-12 mb-3 text-[11px] font-bold uppercase tracking-[0.16em] text-[#083D2D]/40">Or browse by intention</div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {goals.map((g, i) => {
            const t = TONE_STYLE[GOAL_TONES[i % GOAL_TONES.length]];
            const Icon = GOAL_ICONS[g.icon] || Sparkles;
            const active = activeGoal === g.name;
            return (
              <Reveal key={g.name} delay={i * 40}>
                <button
                  onClick={() => onPick(active ? null : g.name)}
                  className="group relative flex h-full min-h-[150px] w-full flex-col justify-between overflow-hidden rounded-[22px] p-5 text-left transition-transform duration-300 hover:-translate-y-1"
                  style={{ background: t.bg, outline: active ? `3px solid ${C.forest}` : "none", outlineOffset: 2 }}
                >
                  <div className="flex items-start justify-between">
                    <span className="grid h-10 w-10 place-items-center rounded-xl" style={{ background: "rgba(255,255,255,0.14)" }}>
                      <Icon className="h-5 w-5" style={{ color: t.ic }} strokeWidth={2.2} />
                    </span>
                    <span className="grid h-8 w-8 place-items-center rounded-full opacity-0 transition-all duration-300 group-hover:opacity-100" style={{ background: "rgba(255,255,255,0.14)" }}>
                      <ArrowUpRight className="h-4 w-4" style={{ color: t.fg }} />
                    </span>
                  </div>
                  <div>
                    <h3 className="text-[clamp(1.1rem,2vw,1.5rem)] font-extrabold uppercase leading-[0.98]" style={{ ...HEADING, color: t.fg }}>{g.name}</h3>
                    <p className="mt-1 text-[12px] font-semibold" style={{ color: t.sub }}>{g.blurb}</p>
                  </div>
                </button>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ── Trending ingredients ────────────────────────────────────────────────────
export function IngredientStrip({ ingredients, onPick }) {
  return (
    <section id="ingredients" className="relative scroll-mt-24 overflow-hidden py-16" style={{ background: C.forest }}>
      <div className="mx-auto max-w-[1400px] px-5 sm:px-8 lg:px-12">
        <Reveal>
          <Eyebrow color={C.lime}><span className="text-white/70">Trending ingredients</span></Eyebrow>
          <h2 className="mt-4 max-w-2xl font-extrabold uppercase leading-[0.92] tracking-[-0.02em] text-white" style={{ ...HEADING, fontSize: "clamp(1.9rem, 4.5vw, 3.4rem)" }}>
            Discover by<br />what&apos;s inside.
          </h2>
        </Reveal>
      </div>
      <div className="mt-10">
        <Marquee speed={40}>
          {ingredients.concat(ingredients).map((ing, i) => (
            <button
              key={i}
              onClick={() => onPick(ing.name)}
              className="mx-2 inline-flex items-center gap-3 rounded-full border border-white/15 bg-white/5 px-6 py-3 text-left transition-colors hover:bg-white/10"
            >
              <Leaf className="h-4 w-4" style={{ color: C.lime }} />
              <span>
                <span className="block text-[17px] font-bold text-white" style={HEADING}>{ing.name}</span>
                <span className="block text-[11px] font-medium text-white/50">{ing.note}</span>
              </span>
            </button>
          ))}
        </Marquee>
      </div>
    </section>
  );
}

// ── Sticky floating filter bar ──────────────────────────────────────────────
export function FilterBar({
  categories, activeCategory, setActiveCategory,
  sorts, activeSort, setActiveSort,
  onOpenFilter, activeFilterCount, count, context, onClearContext,
}) {
  const [sortOpen, setSortOpen] = useState(false);
  return (
    <div id="grid" className="sticky top-[64px] z-40 scroll-mt-24 border-y border-[#083D2D]/8 backdrop-blur-xl" style={{ background: "rgba(249,248,244,0.85)" }}>
      <div className="mx-auto flex max-w-[1400px] items-center gap-3 px-5 py-3 sm:px-8 lg:px-12">
        {/* category chips */}
        <div className="hide-scrollbar flex flex-1 items-center gap-2 overflow-x-auto">
          {categories.map((cat) => {
            const active = activeCategory === cat;
            return (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className="shrink-0 rounded-full border px-4 py-1.5 text-[13px] font-bold transition-all"
                style={{
                  background: active ? C.forest : "#fff",
                  color: active ? "#fff" : C.forest,
                  borderColor: active ? C.forest : "rgba(8,61,45,0.14)",
                }}
              >
                {cat}
              </button>
            );
          })}
          {context && (
            <button onClick={onClearContext} className="flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-bold" style={{ background: `${C.lime}`, color: C.forest }}>
              {context} <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* sort + filter */}
        <div className="flex shrink-0 items-center gap-2">
          <span className="hidden text-[12px] font-semibold text-[#083D2D]/45 md:block">{count} results</span>
          <div className="relative">
            <button
              onClick={() => setSortOpen((s) => !s)}
              className="flex items-center gap-2 rounded-full border border-[#083D2D]/12 bg-white px-3 py-2 text-[13px] font-bold text-[#083D2D] transition-colors hover:bg-[#F2F6EC]"
            >
              <SlidersHorizontal className="h-4 w-4 md:hidden" />
              <span className="hidden md:inline">Sort: {activeSort}</span>
              <ChevronDown className="h-4 w-4" />
            </button>
            {sortOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setSortOpen(false)} />
                <div className="absolute right-0 top-full z-50 mt-2 w-52 overflow-hidden rounded-2xl border border-[#083D2D]/10 bg-white py-1 shadow-[0_20px_50px_rgba(8,61,45,0.18)]">
                  {sorts.map((s) => (
                    <button
                      key={s}
                      onClick={() => { setActiveSort(s); setSortOpen(false); }}
                      className="flex w-full items-center justify-between px-4 py-2.5 text-left text-[13px] font-semibold transition-colors hover:bg-[#F2F6EC]"
                      style={{ color: activeSort === s ? C.forest : "rgba(8,61,45,0.6)" }}
                    >
                      {s} {activeSort === s && <Check className="h-4 w-4" />}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          <button
            onClick={onOpenFilter}
            className="relative flex items-center gap-2 rounded-full border border-[#083D2D]/12 bg-white px-3 py-2 text-[13px] font-bold text-[#083D2D] transition-colors hover:bg-[#F2F6EC]"
          >
            <Filter className="h-4 w-4" />
            <span className="hidden md:inline">Filter</span>
            {activeFilterCount > 0 && (
              <span className="absolute -right-1.5 -top-1.5 grid h-4 w-4 place-items-center rounded-full text-[10px] font-extrabold text-[#083D2D]" style={{ background: C.lime }}>
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Filter drawer ───────────────────────────────────────────────────────────
export function FilterDrawer({
  open, onClose,
  filterPrice, setFilterPrice, filterScore, setFilterScore, filterDietary, toggleDietary,
  onClear,
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[105] flex justify-end">
      <div className="absolute inset-0 animate-in fade-in duration-200" style={{ background: "rgba(8,29,22,0.4)", backdropFilter: "blur(8px)" }} onClick={onClose} />
      <div className="relative flex h-full w-full max-w-sm flex-col bg-white shadow-2xl duration-300 animate-in slide-in-from-right">
        <div className="flex items-center justify-between border-b border-[#083D2D]/10 p-5">
          <h3 className="text-[18px] font-extrabold text-[#083D2D]" style={HEADING}>Refine</h3>
          <button onClick={onClose} aria-label="Close" className="grid h-8 w-8 place-items-center rounded-full bg-[#083D2D]/6 hover:bg-[#083D2D]/12">
            <X className="h-4 w-4 text-[#083D2D]/60" />
          </button>
        </div>

        <div className="flex-1 space-y-8 overflow-y-auto p-5">
          <div>
            <h4 className="mb-3 text-[11px] font-bold uppercase tracking-[0.16em] text-[#083D2D]/50">Price</h4>
            <div className="flex flex-col gap-2">
              {PRICE_OPTIONS.map((price) => (
                <label key={price} className="group flex cursor-pointer items-center gap-3">
                  <span className="grid h-4 w-4 place-items-center rounded-full border" style={{ borderColor: filterPrice === price ? C.forest : "rgba(8,61,45,0.2)" }}>
                    {filterPrice === price && <span className="h-2 w-2 rounded-full" style={{ background: C.forest }} />}
                  </span>
                  <input type="radio" name="price" className="sr-only" checked={filterPrice === price} onChange={() => setFilterPrice(price)} />
                  <span className="text-[14px] font-medium text-[#083D2D]">{price}</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <h4 className="mb-3 text-[11px] font-bold uppercase tracking-[0.16em] text-[#083D2D]/50">KOI Score</h4>
            <div className="flex gap-2">
              {SCORE_OPTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => setFilterScore(s)}
                  className="flex-1 rounded-xl border py-2 text-[13px] font-bold transition-all"
                  style={{
                    background: filterScore === s ? C.forest : "#fff",
                    color: filterScore === s ? "#fff" : C.forest,
                    borderColor: filterScore === s ? C.forest : "rgba(8,61,45,0.14)",
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div>
            <h4 className="mb-3 text-[11px] font-bold uppercase tracking-[0.16em] text-[#083D2D]/50">Dietary</h4>
            <div className="flex flex-wrap gap-2">
              {DIETARY_OPTIONS.map((d) => {
                const on = filterDietary.includes(d);
                return (
                  <button
                    key={d}
                    onClick={() => toggleDietary(d)}
                    className="rounded-full border px-3.5 py-1.5 text-[13px] font-semibold transition-all"
                    style={{
                      background: on ? C.lime : "#fff",
                      color: C.forest,
                      borderColor: on ? C.lime : "rgba(8,61,45,0.14)",
                    }}
                  >
                    {d}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="flex gap-3 border-t border-[#083D2D]/10 bg-[#F9F8F4] p-5">
          <button onClick={onClear} className="flex-1 rounded-full border border-[#083D2D]/14 bg-white py-3 text-[14px] font-bold text-[#083D2D] transition-colors hover:bg-[#F2F6EC]">Clear</button>
          <button onClick={onClose} className="flex-[2] rounded-full py-3 text-[14px] font-bold text-white transition-colors" style={{ background: C.forest }}>Show results</button>
        </div>
      </div>
    </div>
  );
}

// ── Main product grid ───────────────────────────────────────────────────────
export function ProductGrid({ title, products, handlers, onClear }) {
  return (
    <section className="relative" style={{ background: C.offwhite }}>
      <div className="mx-auto max-w-[1400px] px-5 py-14 sm:px-8 lg:px-12 lg:py-20">
        <div className="mb-8 flex items-end justify-between">
          <h2 className="font-extrabold uppercase leading-[0.92] tracking-[-0.02em] text-[#083D2D]" style={{ ...HEADING, fontSize: "clamp(1.9rem, 4vw, 3rem)" }}>{title}</h2>
          <span className="text-[13px] font-semibold text-[#101412]/50">{products.length} products</span>
        </div>

        {products.length > 0 ? (
          <div className="grid grid-cols-2 gap-3 sm:gap-5 md:grid-cols-3 xl:grid-cols-4">
            {products.map((p, i) => (
              <Reveal key={p.id} delay={Math.min(i, 8) * 40} y={24}>
                <ShopProductCard product={p} className="h-full" {...handlers} />
              </Reveal>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <span className="grid h-16 w-16 place-items-center rounded-2xl" style={{ background: "#fff", border: `1px solid ${C.forest}14` }}>
              <Search className="h-6 w-6 text-[#083D2D]/40" />
            </span>
            <h3 className="mt-5 text-[20px] font-extrabold text-[#083D2D]" style={HEADING}>Nothing matches - yet</h3>
            <p className="mt-1.5 text-[14px] text-[#101412]/55" style={BODY}>Try clearing a filter or widening your search.</p>
            <ArrowButton onClick={onClear} variant="outline" size="sm" className="mt-6">Clear all filters</ArrowButton>
          </div>
        )}
      </div>
    </section>
  );
}

// ── Sticky mini cart ────────────────────────────────────────────────────────
export function MiniCart() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const items = useCartStore((s) => s.items);
  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 0);
    return () => clearTimeout(t);
  }, []);
  if (!mounted) return null;
  const totalItems = items.reduce((n, i) => n + i.quantity, 0);
  const subtotal = items.reduce((n, i) => n + i.price * i.quantity, 0);
  if (totalItems === 0) return null;

  return (
    <div className="fixed inset-x-0 bottom-24 z-[80] px-4 duration-300 animate-in slide-in-from-bottom-6 md:bottom-6 md:left-auto md:right-8 md:w-[360px] md:px-0">
      <div className="flex items-center justify-between rounded-2xl border border-[#083D2D]/10 bg-white p-4 shadow-[0_18px_50px_rgba(8,61,45,0.2)]">
        <div>
          <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.1em] text-[#083D2D]/50">
            <ShoppingBag className="h-3 w-3" /> {totalItems} item{totalItems > 1 ? "s" : ""}
          </span>
          <span className="text-[19px] font-extrabold leading-none text-[#083D2D]" style={HEADING}>₹{subtotal.toLocaleString()}</span>
        </div>
        <button
          onClick={() => router.push("/store/cart")}
          className="group flex items-center gap-2 rounded-xl px-5 py-3 text-[13px] font-bold text-white transition-transform hover:-translate-y-0.5"
          style={{ background: C.forest }}
        >
          View cart <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
        </button>
      </div>
    </div>
  );
}
