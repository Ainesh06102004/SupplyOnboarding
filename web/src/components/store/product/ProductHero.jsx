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
          preload
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

      {/* Screening chip — only when there is a verdict to report. */}
      {product.koiStatus && (
        <div className="absolute left-4 top-4 flex items-center gap-2 rounded-full border border-[#083D2D]/8 bg-white/85 py-1 pl-1 pr-3 backdrop-blur-sm">
          <ScoreRing score={product.score} size={34} stroke={3} label={null} />
          <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#083D2D]">KOI {product.koiStatus}</span>
        </div>
      )}

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
    <section className="relative" style={{ background: "var(--koi-bg)" }}>
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-10">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2 lg:gap-12">
          {/* Gallery */}
          <Reveal className="lg:sticky lg:top-[calc(var(--koi-header-h)+24px)] lg:self-start">
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
                      style={{ borderColor: on ? "#1f5c3a" : "transparent", background: photo ? "#000" : "#f4f1e9", opacity: on ? 1 : 0.7 }}
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
                <span className="ks-mono" style={{ color: "#1f5c3a" }}>{product.brand}</span>
                <span className="h-1 w-1 rounded-full bg-[rgba(20,22,15,.25)]" />
                <span className="ks-mono">{product.subcategory || product.category}</span>
              </div>
              <h1 className="mt-3 text-[#1c1e17]" style={{ font: "800 clamp(2rem, 4vw, 2.75rem)/1.05 var(--koi-sans-stack)", letterSpacing: "-.03em" }}>
                {product.name}
              </h1>
              <p className="mt-4 max-w-md text-[16px] leading-relaxed text-[#6b6f63]">
                {product.philosophy}
              </p>
            </Reveal>

            {/* The verification chip belongs to a product that has actually
                been scored. It used to render "KOI Verified · Grade {…}"
                unconditionally, reading .g off a grade that is null for the
                11 of 18 listed products with no screening report. */}
            <Reveal delay={140}>
              <div className="mt-5 inline-flex items-center gap-2.5 self-start rounded-full border border-[rgba(20,22,15,.1)] bg-white py-1.5 pl-1.5 pr-4">
                {product.trust?.scored ? (
                  <>
                    <ScoreRing score={product.score} size={34} stroke={3} label={null} />
                    <span className="text-[12.5px] font-bold text-[#1c1e17]">
                      KOI score <span className="ks-num">{product.score}</span> out of 100
                    </span>
                  </>
                ) : (
                  <span className="px-2 text-[12.5px] font-bold text-[#6b6f63]">
                    Listed · label review in progress
                  </span>
                )}
              </div>
            </Reveal>

            <Reveal delay={200}>
              <div className="mt-6 flex items-baseline gap-3">
                {Number(product.price) > 0 && <span className="ks-num text-[34px] leading-none text-[#1c1e17]">₹{Number(product.price).toLocaleString("en-IN")}</span>}
                <span className="ks-mono">MRP{product.weight && product.weight !== "N/A" ? ` · ${product.weight}` : ""}</span>
              </div>
              {product.dietary?.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {product.dietary.map((d) => (
                    <span key={d} className="inline-flex items-center gap-1 rounded-full bg-[#e8f1ea] px-3 py-1 text-[11.5px] font-bold text-[#1f5c3a]">
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
