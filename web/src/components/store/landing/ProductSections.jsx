"use client";

// ============================================================================
// KOI EDITORIAL LANDING - Product sections
// FeaturedCollection (magazine spread) + BestRated (editorial grid).
// Reusable, cart-wired ProductPlate. No boring cards.
// ============================================================================

import React, { useState } from "react";
import Link from "next/link";
import { Plus, Check, ArrowUpRight } from "lucide-react";
import { useCartStore } from "@/store/cartStore";
import { C, HEADING, BODY, PRODUCTS } from "./tokens";
import { Reveal, ScoreRing, Meter, ArrowButton, Eyebrow, ProductImage } from "./primitives";

const FEATURED = PRODUCTS.find((p) => p.id === "os-ca") || PRODUCTS[0];

// Add-to-cart button with a brief confirmation state.
function AddButton({ product, dark = false }) {
  const addToCart = useCartStore((s) => s.addToCart);
  const [added, setAdded] = useState(false);
  const onAdd = (e) => {
    e.preventDefault();
    e.stopPropagation();
    addToCart(product);
    setAdded(true);
    setTimeout(() => setAdded(false), 1300);
  };
  return (
    <button
      onClick={onAdd}
      aria-label={`Add ${product.name} to cart`}
      className="grid h-11 w-11 shrink-0 place-items-center rounded-full transition-all duration-300 hover:scale-105"
      style={{ background: added ? C.lime : dark ? "#ffffff1a" : C.forest, color: added ? C.forest : "#fff" }}
    >
      {added ? <Check className="h-5 w-5" strokeWidth={3} /> : <Plus className="h-5 w-5" strokeWidth={2.6} />}
    </button>
  );
}

// ── Reusable editorial product plate ────────────────────────────────────────
export function ProductPlate({ product, className = "", tall = false }) {
  return (
    <Link
      href="/store/shop"
      className={`group relative flex flex-col overflow-hidden rounded-3xl border border-[#083D2D]/8 bg-white transition-all duration-500 hover:-translate-y-1 hover:shadow-[0_30px_60px_rgba(8,61,45,0.12)] ${className}`}
    >
      {/* image tile */}
      <div className={`relative overflow-hidden ${tall ? "aspect-[4/5]" : "aspect-square"}`} style={{ background: C.cream }}>
        <ProductImage
          src={product.image}
          alt={`${product.brand} - ${product.name}`}
          className="absolute inset-0 h-full w-full object-contain p-6 transition-transform duration-700 group-hover:scale-[1.06]"
        />
        <div className="absolute left-4 top-4 rounded-full bg-white/70 p-1 backdrop-blur-sm">
          <ScoreRing score={product.score} size={46} stroke={3} />
        </div>
        <span className="absolute right-4 top-4 rounded-full bg-[#083D2D] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.1em] text-white">
          {product.category}
        </span>
        <span className="absolute bottom-4 right-4 grid h-9 w-9 translate-y-2 place-items-center rounded-full bg-[#083D2D] text-white opacity-0 transition-all duration-500 group-hover:translate-y-0 group-hover:opacity-100">
          <ArrowUpRight className="h-4 w-4" />
        </span>
      </div>

      {/* meta */}
      <div className="flex flex-1 flex-col p-5">
        <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#16A06E]">{product.brand}</div>
        <h3 className="mt-1 text-[17px] font-bold leading-tight text-[#083D2D]" style={HEADING}>{product.name}</h3>
        <p className="mt-1.5 text-[12.5px] leading-snug text-[#101412]/55" style={BODY}>{product.tagline}</p>

        <div className="mt-4 flex flex-wrap gap-1.5">
          {product.claims.slice(0, 3).map((c) => (
            <span key={c} className="rounded-md bg-[#EAF8F0] px-2 py-0.5 text-[10.5px] font-semibold text-[#0C6B4C]">
              {c}
            </span>
          ))}
        </div>

        <div className="mt-auto flex items-end justify-between pt-5">
          <div>
            <div className="text-[19px] font-extrabold leading-none text-[#083D2D]" style={HEADING}>₹{product.price}</div>
            <div className="mt-1 text-[11px] font-medium text-[#101412]/45">{product.weight}</div>
          </div>
          <AddButton product={product} />
        </div>
      </div>
    </Link>
  );
}

// ── Section: Featured editorial collection ──────────────────────────────────
export function FeaturedCollection() {
  return (
    <section id="featured" className="relative overflow-hidden" style={{ background: C.lime }}>
      <div className="mx-auto max-w-[1400px] px-5 py-20 sm:px-8 lg:px-12 lg:py-28">
        <Reveal>
          <Eyebrow index="02" color={C.forest}>Editorial pick of the week</Eyebrow>
        </Reveal>

        <div className="mt-8 grid grid-cols-1 items-center gap-10 lg:grid-cols-2 lg:gap-16">
          {/* Copy */}
          <div>
            <Reveal delay={60}>
              <h2 className="font-extrabold uppercase leading-[0.9] tracking-[-0.02em] text-[#083D2D]" style={{ ...HEADING, fontSize: "clamp(2.6rem, 6vw, 5rem)" }}>
                The snack<br />that reads<br />its own label.
              </h2>
            </Reveal>
            <Reveal delay={140}>
              <p className="mt-7 max-w-md text-[16px] leading-relaxed text-[#083D2D]/75" style={BODY}>
                {FEATURED.brand}&apos;s {FEATURED.name.toLowerCase()} cleared every check on our list —
                real ingredients, honest macros and nothing hiding in the fine print.
              </p>
            </Reveal>

            <Reveal delay={220}>
              <div className="mt-9 grid max-w-sm grid-cols-1 gap-4 sm:grid-cols-2">
                <Meter label="Protein" value={FEATURED.nutrition.protein} max={25} suffix="g" color={C.forest} track="#083D2D1a" />
                <Meter label="Added sugar" value={FEATURED.nutrition.sugar} max={25} suffix="g" color={C.orange} track="#083D2D1a" />
                <Meter label="Fibre" value={FEATURED.nutrition.fibre} max={12} suffix="g" color={C.emerald} track="#083D2D1a" />
                <Meter label="Energy" value={FEATURED.nutrition.kcal} max={250} suffix=" kcal" color={C.green} track="#083D2D1a" />
              </div>
            </Reveal>

            <Reveal delay={300}>
              <div className="mt-10 flex flex-wrap items-center gap-4">
                <div className="inline-flex items-center gap-3">
                  <AddButton product={FEATURED} />
                  <div>
                    <div className="text-[20px] font-extrabold leading-none text-[#083D2D]" style={HEADING}>₹{FEATURED.price}</div>
                    <div className="text-[11px] font-medium text-[#083D2D]/60">{FEATURED.weight}</div>
                  </div>
                </div>
                <ArrowButton href="/store/shop" variant="forest">Explore the collection</ArrowButton>
              </div>
            </Reveal>
          </div>

          {/* Product with floating annotations */}
          <Reveal delay={160} y={40}>
            <div className="relative mx-auto aspect-square w-full max-w-[520px]">
              <ProductImage
                src={FEATURED.image}
                alt={`${FEATURED.brand} - ${FEATURED.name}`}
                priority
                className="absolute inset-0 h-full w-full object-contain drop-shadow-[0_24px_48px_rgba(8,61,45,0.18)]"
                style={{ animation: "koi-float 8s ease-in-out infinite" }}
              />

              {/* annotations */}
              <Annotation className="left-0 top-[18%]" label={`${FEATURED.nutrition.protein}g protein`} sub="per serving" />
              <Annotation className="right-0 top-[42%]" align="right" label="Real chocolate" sub="no compound fat" />
              <Annotation className="left-[6%] bottom-[12%]" label="No preservatives" sub="clean label verified" />

              {/* score seal */}
              <div className="absolute right-2 top-2 flex items-center gap-2 rounded-2xl bg-white px-3 py-2 shadow-lg">
                <ScoreRing score={FEATURED.score} size={44} stroke={3} />
                <span className="text-[11px] font-bold uppercase leading-tight tracking-wide text-[#083D2D]">
                  KOI<br />Verified
                </span>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

function Annotation({ className = "", label, sub, align = "left" }) {
  return (
    <div className={`absolute z-10 ${className}`}>
      <div className={`flex flex-col ${align === "right" ? "items-end text-right" : "items-start"}`}>
        <span className="rounded-full bg-[#083D2D] px-3 py-1.5 text-[12px] font-bold text-white shadow-md" style={HEADING}>
          {label}
        </span>
        <span className="mt-1 px-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#083D2D]/55">{sub}</span>
      </div>
    </div>
  );
}

// ── Section: Best rated products ────────────────────────────────────────────
export function BestRated() {
  const rest = PRODUCTS.filter((p) => p.id !== FEATURED.id).slice(0, 7);
  const [hero, ...grid] = rest;

  return (
    <section className="relative" style={{ background: C.offwhite }}>
      <div className="mx-auto max-w-[1400px] px-5 py-20 sm:px-8 lg:px-12 lg:py-28">
        <div className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-end">
          <Reveal>
            <Eyebrow index="04">Best rated this week</Eyebrow>
            <h2 className="mt-5 font-extrabold uppercase leading-[0.9] tracking-[-0.02em] text-[#083D2D]" style={{ ...HEADING, fontSize: "clamp(2.4rem, 5.5vw, 4.6rem)" }}>
              Earned its<br />place.
            </h2>
          </Reveal>
          <Reveal delay={120}>
            <div className="max-w-xs">
              <p className="text-[14px] leading-relaxed text-[#101412]/60" style={BODY}>
                A living shortlist - re-scored every week. Only products above the KOI standard make it here.
              </p>
              <ArrowButton href="/store/shop" variant="outline" size="sm" className="mt-4">View all products</ArrowButton>
            </div>
          </Reveal>
        </div>

        {/* editorial asymmetric grid */}
        <div className="mt-12 grid grid-cols-2 gap-4 sm:gap-5 lg:grid-cols-4">
          <Reveal className="col-span-2 row-span-2" y={30}>
            <ProductPlate product={hero} tall className="h-full" />
          </Reveal>
          {grid.map((p, i) => (
            <Reveal key={p.id} delay={60 + i * 50} y={30}>
              <ProductPlate product={p} className="h-full" />
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
