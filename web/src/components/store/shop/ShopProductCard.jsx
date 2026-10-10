"use client";

// ============================================================================
// KOI SHOP - product card
// In the store's one in-app language (components/store/system/tokens): a white
// hairline card, the pack on a cream plate, the KOI score as a ring, ₹ in
// Space Grotesk. The whole card routes to the product; the score opens its
// breakdown; Add puts it in the ONE cart and says so (useAddToCart), and turns
// into a stepper once it is there. A product the week's plan buys is marked
// "In your plan".
// ============================================================================

import React, { useState } from "react";
import { Heart, Scale, Info, Check } from "lucide-react";
import { useCartStore } from "@/store/cartStore";
import { lineKey, packs } from "@/lib/cart/lines";
import { useAddToCart } from "@/components/store/cart/CartLayer";
import { ProductImage } from "@/components/store/landing/primitives";
import { C } from "@/components/store/system/tokens";
import { Money, MonoLabel, QtyStepper, ScoreBadge } from "@/components/store/system/primitives";
import { availabilityOf, canClaimAvailability, AVAILABILITY } from "@/lib/availability";

/**
 * Stock chip. Renders ONLY when a supply source actually answered.
 *
 * `unknown` deliberately renders nothing rather than a grey "stock unknown"
 * chip on every card: with no source connected that is every product in the
 * store, and a wall of hedges reads as broken rather than as honest. The
 * connect card above the grid carries that message once, where it belongs.
 */
function StockChip({ product }) {
  if (!canClaimAvailability(product)) return null;
  const out = availabilityOf(product) === AVAILABILITY.UNAVAILABLE;
  return (
    <span className="rounded-md px-2 py-0.5 text-[10.5px] font-bold" style={out ? { background: C.redBg, color: C.redText } : { background: C.tint, color: C.primary }}>
      {out ? "Not available nearby" : "In stock nearby"}
    </span>
  );
}

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
  const key = lineKey({ skuId: product.skuId, productId: product.id });
  const qty = useCartStore((s) => packs(s.items.find((i) => lineKey(i) === key)?.quantity));
  const inPlan = useCartStore((s) => Boolean(product.skuId && s.plan?.basket?.some((b) => String(b.skuId) === String(product.skuId))));
  const setQty = useCartStore((s) => s.setQty);
  const add = useAddToCart();
  const [saved, setSaved] = useState(false);

  const protein = nutrientValue(product, "Protein");
  const sugar = nutrientValue(product, "Sugar");

  const stop = (fn) => (e) => { e.preventDefault(); e.stopPropagation(); fn?.(); };

  return (
    <div
      onClick={() => onSelect?.(product)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && e.target === e.currentTarget && (e.preventDefault(), onSelect?.(product))}
      className={`group relative flex h-full cursor-pointer flex-col overflow-hidden rounded-[22px] border border-[rgba(20,22,15,.07)] bg-white p-3 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_24px_48px_-24px_rgba(15,61,46,0.35)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2f8050] ${className}`}
    >
      {/* image plate */}
      <div className="relative aspect-square overflow-hidden rounded-[16px]" style={{ background: C.plate }}>
        <ProductImage
          src={product.image?.hero}
          alt={`${product.brand} - ${product.name}`}
          className="absolute inset-0 h-full w-full object-contain p-6 transition-transform duration-500 ease-out group-hover:scale-[1.05]"
        />

        {/* score - opens breakdown */}
        <button
          type="button"
          onClick={stop(() => onOpenScore?.(product))}
          aria-label={`KOI score ${product.score}. View breakdown`}
          className="absolute left-2.5 top-2.5 rounded-full transition-transform hover:scale-105"
        >
          <ScoreBadge score={product.score} size={40} />
        </button>

        {inPlan ? (
          <span className="ks-mono absolute right-2.5 top-3 rounded-full px-2.5 py-1" style={{ background: C.deep, color: C.mint, letterSpacing: ".08em" }}>In your plan</span>
        ) : (
          <button
            type="button"
            onClick={stop(() => setSaved((s) => !s))}
            aria-label={saved ? "Remove from saved" : "Save product"}
            aria-pressed={saved}
            className="absolute right-2.5 top-2.5 grid h-9 w-9 place-items-center rounded-full border border-[rgba(20,22,15,.08)] bg-white/85 backdrop-blur-sm transition-colors hover:bg-white"
          >
            <Heart className="h-4 w-4 transition-colors" fill={saved ? C.warm : "none"} style={{ color: saved ? C.warm : C.ink }} />
          </button>
        )}

        {/* hover quick actions */}
        <div className="absolute inset-x-2.5 bottom-2.5 flex translate-y-3 items-center gap-2 opacity-0 transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:translate-y-0 group-focus-within:opacity-100">
          <button type="button" onClick={stop(() => onOpenCompare?.(product))} className="flex items-center gap-1.5 rounded-full bg-white/95 px-3 py-1.5 text-[11.5px] font-bold text-[#1c1e17] shadow-sm transition-colors hover:bg-white">
            <Scale className="h-3.5 w-3.5" /> Compare
          </button>
          <button type="button" onClick={stop(() => onOpenInsight?.(product))} className="flex items-center gap-1.5 rounded-full bg-white/95 px-3 py-1.5 text-[11.5px] font-bold text-[#1c1e17] shadow-sm transition-colors hover:bg-white">
            <Info className="h-3.5 w-3.5" /> Why KOI
          </button>
        </div>
      </div>

      {/* meta */}
      <div className="flex flex-1 flex-col px-1.5 pt-3">
        <MonoLabel style={{ letterSpacing: ".08em" }}>{product.brand}</MonoLabel>
        <h3 className="mt-1 line-clamp-2 text-[15px] font-bold leading-snug text-[#1c1e17]">{product.name}</h3>

        {/* insight - clickable */}
        {product.insight && (
          <button
            type="button"
            onClick={stop(() => onOpenInsight?.(product))}
            className="mt-1.5 flex items-start gap-1.5 text-left text-[12px] font-semibold text-[#2f8050] transition-colors hover:text-[#1f5c3a]"
          >
            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={3} />
            <span className="line-clamp-1">{product.insight}</span>
          </button>
        )}

        {/* trust chips */}
        {(protein || sugar || canClaimAvailability(product)) && (
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            <StockChip product={product} />
            {protein && <span className="rounded-md px-2 py-0.5 text-[10.5px] font-bold" style={{ background: C.tint, color: C.primary }}>{protein} protein</span>}
            {sugar && <span className="rounded-md px-2 py-0.5 text-[10.5px] font-bold" style={{ background: C.quiet, color: C.ink2 }}>{sugar} sugar</span>}
          </div>
        )}

        {/* footer */}
        <div className="mt-auto flex items-end justify-between gap-2 pt-4 pb-1">
          <div className="flex flex-col">
            <Money value={product.price} size={18} />
            {product.weight && product.weight !== "N/A" && <MonoLabel style={{ letterSpacing: ".06em" }}>{product.weight}</MonoLabel>}
          </div>

          {qty > 0 ? (
            <span onClick={(e) => e.stopPropagation()}>
              <QtyStepper value={qty} onChange={(n) => setQty(key, n)} label={product.name} tone="solid" />
            </span>
          ) : (
            <button
              type="button"
              onClick={stop(() => add(product))}
              aria-label={`Add ${product.name} to cart`}
              className="inline-flex h-10 items-center gap-1.5 rounded-[12px] border px-4 text-[13.5px] font-bold transition-colors hover:bg-[#1f5c3a] hover:text-white"
              style={{ borderColor: C.tintBorder, color: C.primary, background: "#fff" }}
            >
              <span aria-hidden="true" className="text-[16px] leading-none">+</span> Add
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
