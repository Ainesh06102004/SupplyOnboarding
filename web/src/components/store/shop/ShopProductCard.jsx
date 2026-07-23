"use client";

// ============================================================================
// KOI SHOP - Premium product block
// Editorial composition, integrated trust score, hover quick-actions.
// Cart + wishlist wired to real state; whole block routes to product detail.
// ============================================================================

import React, { useState } from "react";
import { Plus, Minus, Heart, Scale, Info, Check } from "lucide-react";
import { useCartStore } from "@/store/cartStore";
import { C, HEADING, BODY } from "@/components/store/landing/tokens";
import { ScoreRing, ProductImage } from "@/components/store/landing/primitives";

function nutrientValue(product, label) {
  const n = (product.nutrition || []).find((x) => x.label === label);
  return n ? `${n.value}${n.unit || ""}` : null;
}

export default function ShopProductCard({
  product,
  onSelect,
  onOpenScore,
  onOpenCompare,
  onOpenInsight,
  className = "",
}) {
  const items = useCartStore((s) => s.items);
  const addToCart = useCartStore((s) => s.addToCart);
  const increaseQty = useCartStore((s) => s.increaseQty);
  const decreaseQty = useCartStore((s) => s.decreaseQty);
  const [saved, setSaved] = useState(false);

  const cartItem = items.find((i) => i.id === product.id);
  const qty = cartItem ? cartItem.quantity : 0;

  const protein = nutrientValue(product, "Protein");
  const sugar = nutrientValue(product, "Sugar");

  const stop = (fn) => (e) => { e.preventDefault(); e.stopPropagation(); fn?.(); };

  return (
    <div
      onClick={() => onSelect?.(product)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onSelect?.(product))}
      className={`group relative flex h-full cursor-pointer flex-col overflow-hidden rounded-[26px] border border-[#083D2D]/8 bg-white transition-all duration-300 hover:-translate-y-1.5 hover:shadow-[0_30px_60px_rgba(8,61,45,0.14)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0C6B4C] ${className}`}
    >
      {/* image plate */}
      <div className="relative aspect-square overflow-hidden" style={{ background: C.cream }}>
        <ProductImage
          src={product.image?.hero}
          alt={`${product.brand} - ${product.name}`}
          className="absolute inset-0 h-full w-full object-contain p-7 transition-transform duration-500 ease-out group-hover:scale-[1.07]"
        />

        {/* score - opens breakdown */}
        <button
          onClick={stop(() => onOpenScore?.(product))}
          aria-label={`KOI score ${product.score}. View breakdown`}
          className="absolute left-3.5 top-3.5 rounded-full bg-white/70 p-1 backdrop-blur-sm transition-transform hover:scale-105"
        >
          <ScoreRing score={product.score} size={44} stroke={3} label={null} />
        </button>

        {/* save */}
        <button
          onClick={stop(() => setSaved((s) => !s))}
          aria-label={saved ? "Remove from saved" : "Save product"}
          className="absolute right-3.5 top-3.5 grid h-9 w-9 place-items-center rounded-full border border-[#083D2D]/8 bg-white/80 backdrop-blur-sm transition-colors hover:bg-white"
        >
          <Heart className="h-4 w-4 transition-colors" fill={saved ? C.orange : "none"} style={{ color: saved ? C.orange : C.forest }} />
        </button>

        {/* hover quick actions */}
        <div className="absolute inset-x-3.5 bottom-3.5 flex translate-y-3 items-center gap-2 opacity-0 transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100">
          <button onClick={stop(() => onOpenCompare?.(product))} className="flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1.5 text-[11px] font-bold text-[#083D2D] shadow-sm backdrop-blur-sm transition-colors hover:bg-white">
            <Scale className="h-3.5 w-3.5" /> Compare
          </button>
          <button onClick={stop(() => onOpenInsight?.(product))} className="flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1.5 text-[11px] font-bold text-[#083D2D] shadow-sm backdrop-blur-sm transition-colors hover:bg-white">
            <Info className="h-3.5 w-3.5" /> Why KOI
          </button>
        </div>
      </div>

      {/* meta */}
      <div className="flex flex-1 flex-col p-5">
        <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#16A06E]">{product.brand}</div>
        <h3 className="mt-1 line-clamp-2 text-[16px] font-bold leading-tight text-[#083D2D]" style={HEADING}>{product.name}</h3>

        {/* insight - clickable */}
        {product.insight && (
          <button
            onClick={stop(() => onOpenInsight?.(product))}
            className="mt-2 flex items-start gap-1.5 text-left text-[12px] font-semibold text-[#2D7A5E] transition-colors hover:text-[#083D2D]"
          >
            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={3} />
            <span className="line-clamp-1 underline decoration-[#2D7A5E]/25 underline-offset-4">{product.insight}</span>
          </button>
        )}

        {/* trust chips */}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {protein && (
            <span className="rounded-md bg-[#EAF8F0] px-2 py-0.5 text-[10.5px] font-bold text-[#0C6B4C]">{protein} protein</span>
          )}
          {sugar && (
            <span className="rounded-md bg-[#F5F1E8] px-2 py-0.5 text-[10.5px] font-bold text-[#083D2D]/70">{sugar} sugar</span>
          )}
        </div>

        {/* footer */}
        <div className="mt-auto flex items-end justify-between pt-5">
          <div>
            <div className="text-[19px] font-extrabold leading-none text-[#083D2D]" style={HEADING}>₹{product.price}</div>
            <div className="mt-1 text-[11px] font-medium text-[#101412]/45">{product.weight}</div>
          </div>

          {qty > 0 ? (
            <div onClick={(e) => e.stopPropagation()} className="flex items-center gap-2.5 rounded-full bg-[#083D2D] px-1.5 py-1 text-white">
              <button onClick={stop(() => decreaseQty(product.id))} aria-label="Decrease quantity" className="grid h-7 w-7 place-items-center rounded-full bg-white/20 transition-colors hover:bg-white/30">
                <Minus className="h-3.5 w-3.5" />
              </button>
              <span className="w-4 text-center text-[13px] font-bold">{qty}</span>
              <button onClick={stop(() => increaseQty(product.id))} aria-label="Increase quantity" className="grid h-7 w-7 place-items-center rounded-full bg-white/20 transition-colors hover:bg-white/30">
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <button
              onClick={stop(() => addToCart(product))}
              aria-label={`Add ${product.name} to cart`}
              className="grid h-11 w-11 place-items-center rounded-full bg-[#083D2D]/6 text-[#083D2D] transition-all duration-300 hover:scale-105 hover:bg-[#083D2D] hover:text-white"
            >
              <Plus className="h-5 w-5" strokeWidth={2.6} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
