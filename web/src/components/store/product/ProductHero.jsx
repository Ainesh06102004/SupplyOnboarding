"use client";

// ============================================================================
// KOI PRODUCT - Cinematic hero
// Floating product viewer with cursor-loupe zoom, thumbnail rail, fullscreen
// lightbox, and an editorial info column with the sticky purchase panel.
// ============================================================================

import React, { useRef, useState } from "react";
import Image from "next/image";
import { Check, Maximize2, X, ShieldCheck } from "lucide-react";
import { C, HEADING, BODY } from "@/components/store/landing/tokens";
import { Reveal, ScoreRing } from "@/components/store/landing/primitives";
import BuyPanel from "./BuyPanel";

const LABELS = { hero: "Product", label: "Label", lifestyle: "In use" };

function Viewer({ product, active, isPhoto, onExpand }) {
  const [hovering, setHovering] = useState(false);
  const [origin, setOrigin] = useState({ x: 50, y: 50 });
  const ref = useRef(null);

  const onMove = (e) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    setOrigin({ x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 });
  };

  const src = product.image?.[active];

  return (
    <div
      ref={ref}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      onMouseMove={onMove}
      className="group relative aspect-square w-full overflow-hidden rounded-[28px] border border-[#083D2D]/8"
      style={{ background: isPhoto ? "#000" : `radial-gradient(120% 120% at 50% 20%, #FFFFFF 0%, ${C.cream} 100%)` }}
    >
      {src ? (
        <Image
          src={src}
          alt={`${product.name} - ${LABELS[active] || active}`}
          priority
          fill
          draggable="false"
          className={isPhoto ? "object-cover" : "object-contain p-10"}
          style={{
            mixBlendMode: isPhoto ? "normal" : "multiply",
            transformOrigin: `${origin.x}% ${origin.y}%`,
            transform: hovering ? "scale(1.7)" : "scale(1)",
            transition: "transform 0.5s cubic-bezier(0.16,1,0.3,1)",
            animation: hovering ? "none" : "koi-float 7s ease-in-out infinite",
          }}
        />
      ) : (
        <div className="grid h-full w-full place-items-center">
          <ShieldCheck className="h-24 w-24 text-[#083D2D]/10" />
        </div>
      )}

      {/* KOI verified chip */}
      <div className="absolute left-4 top-4 flex items-center gap-2 rounded-full border border-[#083D2D]/8 bg-white/85 py-1 pl-1 pr-3 backdrop-blur-sm">
        <ScoreRing score={product.score} size={34} stroke={3} label={null} />
        <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#083D2D]">KOI {product.koiStatus}</span>
      </div>

      {/* expand */}
      {src && (
        <button
          onClick={onExpand}
          aria-label="View fullscreen"
          className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-full border border-[#083D2D]/8 bg-white/85 text-[#083D2D] opacity-0 backdrop-blur-sm transition-opacity duration-300 group-hover:opacity-100"
        >
          <Maximize2 className="h-4 w-4" />
        </button>
      )}

      {!isPhoto && (
        <span className="pointer-events-none absolute bottom-4 right-4 rounded-full bg-white/70 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.1em] text-[#083D2D]/50 opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100">
          Hover to zoom
        </span>
      )}
    </div>
  );
}

export default function ProductHero({ product }) {
  const keys = ["hero", "label", "lifestyle"].filter((k) => product.image?.[k]);
  const [active, setActive] = useState(keys[0] || "hero");
  const [lightbox, setLightbox] = useState(false);
  const isPhoto = active === "lifestyle";

  return (
    <section className="relative" style={{ background: C.offwhite }}>
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-10">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2 lg:gap-12">
          {/* Gallery */}
          <Reveal className="lg:sticky lg:top-24 lg:self-start">
            <Viewer product={product} active={active} isPhoto={isPhoto} onExpand={() => setLightbox(true)} />
            {keys.length > 1 && (
              <div className="mt-4 flex gap-3">
                {keys.map((k) => {
                  const on = active === k;
                  const photo = k === "lifestyle";
                  return (
                    <button
                      key={k}
                      onClick={() => setActive(k)}
                      aria-label={`View ${LABELS[k] || k}`}
                      className="relative h-20 w-20 shrink-0 overflow-hidden rounded-2xl border-2 transition-all duration-200 sm:h-24 sm:w-24"
                      style={{ borderColor: on ? C.forest : "transparent", background: photo ? "#000" : C.cream, opacity: on ? 1 : 0.7 }}
                    >
                      <Image src={product.image[k]} alt="" fill className={photo ? "object-cover" : "object-contain p-2"} style={{ mixBlendMode: photo ? "normal" : "multiply" }} />
                      <span className="absolute inset-x-0 bottom-0 bg-black/30 py-0.5 text-center text-[8px] font-bold uppercase tracking-wide text-white">{LABELS[k]}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </Reveal>

          {/* Info */}
          <div className="flex flex-col">
            <Reveal delay={60}>
              <div className="flex items-center gap-2.5">
                <span className="text-[12px] font-bold uppercase tracking-[0.18em] text-[#16A06E]">{product.brand}</span>
                <span className="h-1 w-1 rounded-full bg-[#083D2D]/25" />
                <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#083D2D]/45">{product.category}</span>
              </div>
              <h1 className="mt-3 font-extrabold leading-[0.98] tracking-[-0.02em] text-[#083D2D]" style={{ ...HEADING, fontSize: "clamp(2rem, 4.5vw, 3.4rem)" }}>
                {product.name}
              </h1>
              <p className="mt-5 max-w-md text-[17px] leading-relaxed text-[#101412]/60" style={BODY}>
                {product.philosophy}
              </p>
            </Reveal>

            <Reveal delay={140}>
              <div className="mt-6 inline-flex items-center gap-2.5 self-start rounded-full border border-[#083D2D]/10 bg-white/60 py-1.5 pl-1.5 pr-4">
                <ScoreRing score={product.score} size={34} stroke={3} label={null} />
                <span className="text-[12px] font-bold text-[#083D2D]">KOI Verified · Grade {product.grade.g}</span>
              </div>
            </Reveal>

            <Reveal delay={200}>
              <div className="mt-7 flex items-baseline gap-3">
                <span className="text-[34px] font-extrabold leading-none text-[#083D2D]" style={HEADING}>₹{product.price}</span>
                <span className="text-[14px] font-medium text-[#101412]/50">{product.weight}</span>
              </div>
              {product.dietary?.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {product.dietary.map((d) => (
                    <span key={d} className="inline-flex items-center gap-1 rounded-full bg-[#EAF8F0] px-3 py-1 text-[11.5px] font-bold text-[#0C6B4C]">
                      <Check className="h-3 w-3" strokeWidth={3} /> {d}
                    </span>
                  ))}
                </div>
              )}
            </Reveal>

            <Reveal delay={260} className="mt-7">
              <BuyPanel product={product} />
            </Reveal>
          </div>
        </div>
      </div>

      {/* Lightbox */}
      {lightbox && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center p-4" onClick={() => setLightbox(false)}>
          <div className="absolute inset-0 animate-in fade-in duration-200" style={{ background: "rgba(8,29,22,0.75)", backdropFilter: "blur(12px)" }} />
          <button aria-label="Close" className="absolute right-5 top-5 z-10 grid h-11 w-11 place-items-center rounded-full bg-white/10 text-white backdrop-blur-md">
            <X className="h-5 w-5" />
          </button>
          <div className="relative h-[85vh] w-[90vw]" onClick={(e) => e.stopPropagation()}>
            <Image
              src={product.image?.[active]}
              alt={product.name}
              fill
              className="rounded-2xl object-contain animate-in zoom-in-95 duration-300"
              style={{ background: isPhoto ? "transparent" : "#fff" }}
            />
          </div>
        </div>
      )}
    </section>
  );
}
