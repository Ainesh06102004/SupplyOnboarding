"use client";

// ============================================================================
// KOI EDITORIAL LANDING - Product sections
// FeaturedCollection (magazine spread) + BestRated (editorial grid).
// Reusable, cart-wired ProductPlate. No boring cards.
//
// Both sections take their products from the caller. They used to read a
// module-scope PRODUCTS.find("os-ca") and wrap it in copy written for that one
// product — "The snack that reads its own label", "Real chocolate", "no
// compound fat". Point that spread at a different product and every line of it
// becomes a claim about something else. So the copy is now derived from the
// product's own screening data, or it is absent.
// ============================================================================

import React, { useState } from "react";
import Link from "next/link";
import { Plus, Check, ArrowUpRight, ClipboardCheck } from "lucide-react";
import { useCartStore } from "@/store/cartStore";
import { C, HEADING, BODY } from "./tokens";
import { Reveal, ScoreRing, Meter, ArrowButton, Eyebrow, ProductImage } from "./primitives";

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
      href={`/store/product/${product.id}`}
      className={`group relative flex flex-col overflow-hidden rounded-3xl border border-[#083D2D]/8 bg-white transition-all duration-500 hover:-translate-y-1 hover:shadow-[0_30px_60px_rgba(8,61,45,0.12)] ${className}`}
    >
      {/* image tile */}
      <div className={`relative overflow-hidden ${tall ? "aspect-[4/5]" : "aspect-square"}`} style={{ background: C.cream }}>
        <ProductImage
          src={product.image}
          alt={`${product.brand ?? ""} - ${product.name}`.trim()}
          className="absolute inset-0 h-full w-full object-contain p-6 transition-transform duration-700 group-hover:scale-[1.06]"
        />
        {/* ScoreRing renders nothing for an unscored product, so the badge
            plate must not render either — an empty white disc reads as a
            missing image rather than as an absent score. */}
        {product.score !== null && (
          <div className="absolute left-4 top-4 rounded-full bg-white/70 p-1 backdrop-blur-sm">
            <ScoreRing score={product.score} size={46} stroke={3} />
          </div>
        )}
        {product.category && (
          <span className="absolute right-4 top-4 rounded-full bg-[#083D2D] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.1em] text-white">
            {product.category}
          </span>
        )}
        <span className="absolute bottom-4 right-4 grid h-9 w-9 translate-y-2 place-items-center rounded-full bg-[#083D2D] text-white opacity-0 transition-all duration-500 group-hover:translate-y-0 group-hover:opacity-100">
          <ArrowUpRight className="h-4 w-4" />
        </span>
      </div>

      {/* meta */}
      <div className="flex flex-1 flex-col p-5">
        {product.brand && (
          <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#16A06E]">{product.brand}</div>
        )}
        <h3 className="mt-1 text-[17px] font-bold leading-tight text-[#083D2D]" style={HEADING}>{product.name}</h3>
        {product.tagline && (
          <p className="mt-1.5 line-clamp-2 text-[12.5px] leading-snug text-[#101412]/55" style={BODY}>{product.tagline}</p>
        )}

        {product.claims.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {product.claims.slice(0, 3).map((c) => (
              <span key={c} className="rounded-md bg-[#EAF8F0] px-2 py-0.5 text-[10.5px] font-semibold text-[#0C6B4C]">
                {c}
              </span>
            ))}
          </div>
        )}

        <div className="mt-auto flex items-end justify-between pt-5">
          <div>
            {product.price !== null ? (
              <>
                <div className="text-[19px] font-extrabold leading-none text-[#083D2D]" style={HEADING}>₹{product.price}</div>
                {product.weight && <div className="mt-1 text-[11px] font-medium text-[#101412]/45">{product.weight}</div>}
              </>
            ) : (
              <div className="text-[12px] font-semibold text-[#101412]/45">Price on the product page</div>
            )}
          </div>
          <AddButton product={product} />
        </div>
      </div>
    </Link>
  );
}

// ── Section: Featured editorial collection ──────────────────────────────────
/**
 * @param {{ product?: object|null }} props
 */
export function FeaturedCollection({ product = null }) {
  if (!product) return <NoPick />;

  const { nutrition, basis } = product;
  // Up to three claims become the floating annotations. They are the product's
  // own screened claims, so an unscreened product simply gets no annotations
  // rather than borrowing the last product's.
  const annotations = product.claims.slice(0, 3);
  const positions = ["left-0 top-[18%]", "right-0 top-[42%]", "left-[6%] bottom-[12%]"];

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
              {/* The product's own name, set large. The previous headline was
                  one product's tagline hardcoded into the section. */}
              <h2 className="font-extrabold uppercase leading-[0.9] tracking-[-0.02em] text-[#083D2D]" style={{ ...HEADING, fontSize: "clamp(2.2rem, 5vw, 4.2rem)" }}>
                {product.name}
              </h2>
              {product.brand && (
                <div className="mt-4 text-[12px] font-bold uppercase tracking-[0.18em] text-[#083D2D]/60">
                  by {product.brand}
                </div>
              )}
            </Reveal>

            <Reveal delay={140}>
              <p className="mt-7 max-w-md text-[16px] leading-relaxed text-[#083D2D]/75" style={BODY}>
                {/* The reviewer's own note when there is one. Otherwise a line
                    about the process, which is true of every listed product,
                    rather than an invented line about this one. */}
                {product.tagline
                  ? product.tagline
                  : "Cleared KOI's ingredient and nutrition review. The full breakdown — every macro we could read off the label — is on the product page."}
              </p>
            </Reveal>

            {/* Meters render only the macros the label actually declared. */}
            <Reveal delay={220}>
              <div className="mt-9 grid max-w-sm grid-cols-1 gap-4 sm:grid-cols-2">
                <Meter label="Protein" value={nutrition.protein} max={25} suffix="g" color={C.forest} track="#083D2D1a" />
                <Meter label="Added sugar" value={nutrition.sugar} max={25} suffix="g" color={C.orange} track="#083D2D1a" />
                <Meter label="Fibre" value={nutrition.fibre} max={12} suffix="g" color={C.emerald} track="#083D2D1a" />
                <Meter label="Energy" value={nutrition.kcal} max={250} suffix=" kcal" color={C.green} track="#083D2D1a" />
              </div>
              {basis && (
                <div className="mt-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#083D2D]/45">
                  {basis}
                </div>
              )}
            </Reveal>

            <Reveal delay={300}>
              <div className="mt-10 flex flex-wrap items-center gap-4">
                <div className="inline-flex items-center gap-3">
                  <AddButton product={product} />
                  {product.price !== null && (
                    <div>
                      <div className="text-[20px] font-extrabold leading-none text-[#083D2D]" style={HEADING}>₹{product.price}</div>
                      {product.weight && <div className="text-[11px] font-medium text-[#083D2D]/60">{product.weight}</div>}
                    </div>
                  )}
                </div>
                <ArrowButton href={`/store/product/${product.id}`} variant="forest">See the breakdown</ArrowButton>
              </div>
            </Reveal>
          </div>

          {/* Product with floating annotations */}
          <Reveal delay={160} y={40}>
            <div className="relative mx-auto aspect-square w-full max-w-[520px]">
              <ProductImage
                src={product.image}
                alt={`${product.brand ?? ""} - ${product.name}`.trim()}
                className="absolute inset-0 h-full w-full object-contain drop-shadow-[0_24px_48px_rgba(8,61,45,0.18)]"
                style={{ animation: "koi-float 8s ease-in-out infinite" }}
              />

              {annotations.map((label, i) => (
                <Annotation
                  key={label}
                  className={positions[i]}
                  align={i === 1 ? "right" : "left"}
                  label={label}
                  sub="from the screening report"
                />
              ))}

              {/* Score seal, only where a score exists. */}
              {product.score !== null && (
                <div className="absolute right-2 top-2 flex items-center gap-2 rounded-2xl bg-white px-3 py-2 shadow-lg">
                  <ScoreRing score={product.score} size={44} stroke={3} />
                  <span className="text-[11px] font-bold uppercase leading-tight tracking-wide text-[#083D2D]">
                    KOI<br />Verified
                  </span>
                </div>
              )}
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

// Nothing has been screened yet, so there is no pick. Keeps the section's
// rhythm on the page without manufacturing a product to fill it.
function NoPick() {
  return (
    <section id="featured" className="relative overflow-hidden" style={{ background: C.lime }}>
      <div className="mx-auto max-w-[1400px] px-5 py-20 sm:px-8 lg:px-12 lg:py-24">
        <Reveal>
          <Eyebrow index="02" color={C.forest}>Editorial pick of the week</Eyebrow>
        </Reveal>
        <div className="mt-8 grid grid-cols-1 items-center gap-8 lg:grid-cols-[1.2fr_0.8fr]">
          <Reveal delay={60}>
            <h2 className="font-extrabold uppercase leading-[0.9] tracking-[-0.02em] text-[#083D2D]" style={{ ...HEADING, fontSize: "clamp(2.2rem, 5vw, 4rem)" }}>
              No pick<br />this week.
            </h2>
          </Reveal>
          <Reveal delay={140}>
            <div className="flex items-start gap-4">
              <ClipboardCheck className="mt-1 h-6 w-6 shrink-0" style={{ color: C.forest }} />
              <p className="max-w-md text-[15px] leading-relaxed text-[#083D2D]/75" style={BODY}>
                A pick means a product came through the screen and earned the space. When one has,
                it appears here — with the label reading that got it there.
              </p>
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
/**
 * @param {{ products?: Array }} props  already filtered to scored products
 */
export function BestRated({ products = [] }) {
  const [hero, ...grid] = products;

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

        {hero ? (
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
        ) : (
          <Reveal delay={60}>
            <div className="mt-12 rounded-3xl border border-dashed border-[#083D2D]/20 bg-white/60 px-8 py-16 text-center">
              <ClipboardCheck className="mx-auto h-8 w-8" style={{ color: C.forest, opacity: 0.35 }} />
              <p className="mx-auto mt-5 max-w-md text-[15px] leading-relaxed text-[#101412]/60" style={BODY}>
                The shortlist is empty. A product appears here once it has a KOI Score — which
                means a real label, read and scored, not an estimate.
              </p>
              <ArrowButton href="/onboarding" variant="outline" size="sm" className="mt-6">
                Submit a brand for review
              </ArrowButton>
            </div>
          </Reveal>
        )}
      </div>
    </section>
  );
}
