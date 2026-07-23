"use client";

// ============================================================================
// KOI SHOP - Intelligence overlays (restyled, same data contracts)
// KoiScoreModal · CompareModal · WhyKoiDrawer
// ============================================================================

import React from "react";
import { X, TrendingUp, Scale, Info, Check } from "lucide-react";
import { C, HEADING, BODY, scoreColor } from "@/components/store/landing/tokens";

function Backdrop({ onClose }) {
  return (
    <div
      className="absolute inset-0 animate-in fade-in duration-200"
      style={{ background: "rgba(8,29,22,0.4)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)" }}
      onClick={onClose}
    />
  );
}

// ── KOI Score breakdown ─────────────────────────────────────────────────────
export function KoiScoreModal({ product, onClose }) {
  if (!product) return null;
  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <Backdrop onClose={onClose} />
      <div className="relative w-full max-w-sm overflow-hidden rounded-[26px] bg-white p-6 shadow-[0_30px_80px_rgba(8,61,45,0.25)] duration-200 animate-in zoom-in-95 fade-in">
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h3 className="flex items-baseline gap-1.5 text-[22px] font-extrabold text-[#083D2D]" style={HEADING}>
              KOI Score {product.score}
              <span className="text-[15px] font-semibold text-[#083D2D]/40">/100</span>
            </h3>
            <p className="mt-1 text-[12.5px] font-medium text-[#083D2D]/55" style={BODY}>Independent nutrition analysis</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="grid h-8 w-8 place-items-center rounded-full bg-[#083D2D]/6 hover:bg-[#083D2D]/12">
            <X className="h-4 w-4 text-[#083D2D]/60" />
          </button>
        </div>

        <div className="mb-6 space-y-4">
          {Object.entries(product.scoreBreakdown || {}).map(([key, val]) => (
            <div key={key}>
              <div className="mb-1.5 flex justify-between text-[12.5px] font-bold text-[#083D2D]">
                <span>{key}</span>
                <span>{val}/100</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#083D2D]/8">
                <div className="h-full rounded-full transition-all duration-700" style={{ width: `${val}%`, background: scoreColor(val) }} />
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-3 border-t border-[#083D2D]/10 pt-4">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full" style={{ background: `${C.lime}33` }}>
            <TrendingUp className="h-5 w-5" style={{ color: C.forest }} />
          </span>
          <p className="text-[13.5px] font-bold leading-snug text-[#083D2D]">
            Better than {product.betterThanPercentage}% of similar products
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Quick compare ───────────────────────────────────────────────────────────
export function CompareModal({ product, onClose }) {
  if (!product) return null;

  const pTag = product.tags?.find((t) => t.toLowerCase().includes("protein")) || "12g";
  const sTag = product.tags?.find((t) => t.toLowerCase().includes("sugar")) || "2g";
  const metrics = [
    { label: "Protein", prod: pTag.split(" ")[0], avg: product.categoryAverage?.Protein },
    { label: "Sugar", prod: sTag.includes("0") || sTag.includes("No") ? "0g" : "4g", avg: product.categoryAverage?.Sugar },
    { label: "Fibre", prod: product.categoryAverage?.Fibre === "0g" ? "0g" : "3g", avg: product.categoryAverage?.Fibre },
    { label: "Additives", prod: (product.scoreBreakdown?.Additives ?? 0) >= 90 ? "Low" : "Med", avg: product.categoryAverage?.Additives },
  ];

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <Backdrop onClose={onClose} />
      <div className="relative w-full max-w-sm overflow-hidden rounded-[26px] bg-white shadow-[0_30px_80px_rgba(8,61,45,0.25)] duration-200 animate-in zoom-in-95 fade-in">
        <div className="flex items-center justify-between border-b border-[#083D2D]/10 bg-[#EAF8F0]/50 p-5">
          <h3 className="flex items-center gap-2 text-[18px] font-extrabold text-[#083D2D]" style={HEADING}>
            <Scale className="h-5 w-5" /> Quick compare
          </h3>
          <button onClick={onClose} aria-label="Close" className="grid h-8 w-8 place-items-center rounded-full bg-white hover:bg-[#083D2D]/6">
            <X className="h-4 w-4 text-[#083D2D]/60" />
          </button>
        </div>

        <div className="p-6">
          <div className="mb-4 flex justify-between px-2 text-[11px] font-bold uppercase tracking-[0.08em] text-[#083D2D]/50">
            <span className="w-1/3">Metric</span>
            <span className="w-1/3 truncate text-center text-[#083D2D]">{product.brand}</span>
            <span className="w-1/3 text-right">Category avg</span>
          </div>
          <div className="mb-6 space-y-2">
            {metrics.map((m) => (
              <div key={m.label} className="flex items-center justify-between rounded-xl border border-[#083D2D]/8 bg-[#F9F8F4] px-3 py-2.5">
                <span className="w-1/3 text-[12.5px] font-bold text-[#083D2D]/60">{m.label}</span>
                <span className="w-1/3 text-center text-[14px] font-extrabold text-[#083D2D]" style={HEADING}>{m.prod}</span>
                <span className="w-1/3 text-right text-[12.5px] font-semibold text-[#083D2D]/50">{m.avg}</span>
              </div>
            ))}
          </div>
          <div className="flex items-start gap-3 rounded-xl border border-[#083D2D]/10 bg-[#EAF8F0] p-4">
            <Info className="mt-0.5 h-5 w-5 shrink-0" style={{ color: C.forest }} />
            <p className="text-[13px] font-medium leading-relaxed text-[#083D2D]" style={BODY}>{product.compareInsight}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Why KOI likes this ──────────────────────────────────────────────────────
export function WhyKoiDrawer({ product, onClose }) {
  if (!product) return null;
  return (
    <div className="fixed inset-0 z-[110] flex justify-end">
      <Backdrop onClose={onClose} />
      <div className="relative flex h-full w-full max-w-sm flex-col bg-white shadow-[0_0_80px_rgba(8,61,45,0.25)] duration-300 animate-in slide-in-from-right">
        <div className="flex items-center justify-between border-b border-[#083D2D]/10 bg-[#EAF8F0]/50 p-6">
          <div>
            <h3 className="text-[20px] font-extrabold text-[#083D2D]" style={HEADING}>Why KOI likes this</h3>
            <p className="mt-1 text-[11px] font-bold uppercase tracking-[0.12em] text-[#16A06E]">{product.brand}</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="grid h-9 w-9 place-items-center rounded-full bg-white hover:bg-[#083D2D]/6">
            <X className="h-4 w-4 text-[#083D2D]/60" />
          </button>
        </div>

        <div className="flex-1 space-y-8 overflow-y-auto p-6">
          <div>
            <h4 className="mb-4 flex items-center gap-2 text-[14px] font-bold text-[#083D2D]">
              <span className="grid h-7 w-7 place-items-center rounded-full" style={{ background: `${C.lime}44` }}>
                <Check className="h-4 w-4" style={{ color: C.forest }} strokeWidth={3} />
              </span>
              Strengths
            </h4>
            <ul className="space-y-3.5">
              {(product.strengths || []).map((s, i) => (
                <li key={i} className="flex items-start gap-3 text-[14px] font-medium leading-relaxed text-[#083D2D]/80" style={BODY}>
                  <span className="mt-1.5 text-[9px]" style={{ color: C.emerald }}>●</span>
                  {s}
                </li>
              ))}
            </ul>
          </div>

          <div className="h-px w-full bg-[#083D2D]/10" />

          <div>
            <h4 className="mb-4 flex items-center gap-2 text-[14px] font-bold text-[#B8860B]">
              <span className="grid h-7 w-7 place-items-center rounded-full" style={{ background: "rgba(243,106,29,0.12)" }}>
                <Info className="h-4 w-4" style={{ color: C.orange }} />
              </span>
              Watch-outs
            </h4>
            <ul className="space-y-3.5">
              {(product.watchouts || []).map((w, i) => (
                <li key={i} className="flex items-start gap-3 text-[14px] font-medium leading-relaxed text-[#083D2D]/80" style={BODY}>
                  <span className="mt-1.5 text-[9px]" style={{ color: C.orange }}>●</span>
                  {w}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="border-t border-[#083D2D]/10 bg-[#F9F8F4] p-6 text-center">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#083D2D]/45">Verified by KOI Intelligence</p>
        </div>
      </div>
    </div>
  );
}
