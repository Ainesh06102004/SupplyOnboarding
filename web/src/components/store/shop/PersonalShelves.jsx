"use client";

// ============================================================================
// KOI SHOP — Personalised shelves (KRE-powered)
// Runs the deterministic KOI Recommendation Engine on the loaded catalogue for
// the shopper's saved profile and renders explainable, named shelves.
// Renders nothing until a goal profile exists.
// ============================================================================

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Check, Sparkles } from "lucide-react";
import { useCartStore } from "@/store/cartStore";
import { useGoalStore } from "@/store/goalStore";
import { recommend } from "@/lib/recommendation";
import { C, HEADING, BODY } from "@/components/store/landing/tokens";
import { Reveal, Eyebrow, ScoreRing, ProductImage } from "@/components/store/landing/primitives";

function RecoCard({ dto, onSelect }) {
  const { product, score, reasons } = dto;
  const items = useCartStore((s) => s.items);
  const addToCart = useCartStore((s) => s.addToCart);
  const inCart = items.some((i) => i.id === product.id);

  return (
    <div
      onClick={() => onSelect(product)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onSelect(product))}
      className="group flex h-full cursor-pointer flex-col overflow-hidden rounded-[24px] border border-[#083D2D]/8 bg-white transition-all duration-300 hover:-translate-y-1.5 hover:shadow-[0_28px_56px_rgba(8,61,45,0.13)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0C6B4C]"
    >
      <div className="relative aspect-square overflow-hidden" style={{ background: C.cream }}>
        <ProductImage src={product.image?.hero} alt={`${product.brand} — ${product.name}`} className="absolute inset-0 h-full w-full object-contain p-6 transition-transform duration-500 group-hover:scale-[1.06]" />
        <div className="absolute left-3.5 top-3.5 rounded-full bg-white/70 p-1 backdrop-blur-sm">
          <ScoreRing score={product.score} size={40} stroke={3} label={null} />
        </div>
        {/* KRE match score */}
        <div className="absolute right-3.5 top-3.5 flex items-center gap-1 rounded-full bg-[#083D2D] px-2.5 py-1 text-[11px] font-extrabold text-[#DDF247]" style={HEADING}>
          <Sparkles className="h-3 w-3" /> {score}% match
        </div>
      </div>

      <div className="flex flex-1 flex-col p-4">
        <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#16A06E]">{product.brand}</div>
        <h3 className="mt-1 line-clamp-2 text-[15px] font-bold leading-tight text-[#083D2D]" style={HEADING}>{product.name}</h3>

        {/* explainability */}
        <ul className="mt-3 space-y-1.5">
          {reasons.slice(0, 3).map((r) => (
            <li key={r} className="flex items-start gap-1.5 text-[11.5px] font-semibold text-[#0C6B4C]">
              <Check className="mt-[1px] h-3 w-3 shrink-0" strokeWidth={3} />
              <span className="leading-snug">{r}</span>
            </li>
          ))}
        </ul>

        <div className="mt-auto flex items-end justify-between pt-4">
          <div>
            <div className="text-[18px] font-extrabold leading-none text-[#083D2D]" style={HEADING}>₹{product.price}</div>
            <div className="mt-1 text-[11px] font-medium text-[#101412]/45">{product.weight}</div>
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); addToCart(product); }}
            aria-label={`Add ${product.name} to cart`}
            className="grid h-10 w-10 place-items-center rounded-full transition-all duration-300 hover:scale-105"
            style={{ background: inCart ? C.lime : "rgba(8,61,45,0.06)", color: C.forest }}
          >
            {inCart ? <Check className="h-4.5 w-4.5" strokeWidth={3} /> : <Plus className="h-5 w-5" strokeWidth={2.6} />}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function PersonalShelves({ products = [] }) {
  const router = useRouter();
  const profile = useGoalStore((s) => s.profile);
  const hydrate = useGoalStore((s) => s.hydrate);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    hydrate();
    const t = setTimeout(() => setMounted(true), 0);
    return () => clearTimeout(t);
  }, [hydrate]);

  const result = useMemo(() => {
    if (!mounted || !profile) return null;
    return recommend(products, profile);
  }, [mounted, profile, products]);

  if (!result || !result.shelves.length) return null;
  const selectProduct = (p) => router.push(`/store/product/${p.id}`);

  return (
    <section className="relative" style={{ background: C.offwhite }}>
      <div className="mx-auto max-w-[1400px] px-5 pt-16 sm:px-8 lg:px-12 lg:pt-20">
        <Reveal>
          <Eyebrow>Tuned to your goal</Eyebrow>
          <h2 className="mt-4 font-extrabold uppercase leading-[0.92] tracking-[-0.02em] text-[#083D2D]" style={{ ...HEADING, fontSize: "clamp(1.9rem, 4.5vw, 3.4rem)" }}>
            Made for you.
          </h2>
          <p className="mt-2 max-w-lg text-[14px] font-medium text-[#101412]/55" style={BODY}>
            Ranked deterministically from your goal, macros and food preferences — every pick explains itself.
          </p>
        </Reveal>
      </div>

      {result.shelves.map((shelf, idx) => (
        <div key={shelf.id} className="mx-auto max-w-[1400px] px-5 py-8 sm:px-8 lg:px-12">
          <Reveal>
            <div className="flex items-end justify-between gap-4">
              <div>
                <h3 className="font-extrabold uppercase leading-[0.95] tracking-[-0.01em] text-[#083D2D]" style={{ ...HEADING, fontSize: "clamp(1.4rem, 3vw, 2.2rem)" }}>{shelf.title}</h3>
                <p className="mt-1.5 text-[13px] font-semibold text-[#16A06E]">{shelf.subtitle}</p>
              </div>
              <span className="hidden shrink-0 text-[12px] font-bold text-[#083D2D]/40 sm:block">{shelf.items.length} picks</span>
            </div>
          </Reveal>

          <div className="hide-scrollbar -mx-5 mt-6 flex gap-4 overflow-x-auto px-5 pb-4 sm:mx-0 sm:px-0">
            {shelf.items.map((dto) => (
              <Reveal key={dto.id} className="w-[240px] shrink-0 sm:w-[268px]">
                <RecoCard dto={dto} onSelect={selectProduct} />
              </Reveal>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}
