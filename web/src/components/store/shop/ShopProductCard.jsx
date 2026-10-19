"use client";

// ============================================================================
// KOI SHOP - product card (cinematic storefront, Oct 2026)
// The pack on a white plate, the KOI score as a ring in its corner, the brand
// and size in mono, ₹ in Space Grotesk. The whole card routes to the product;
// the score opens its breakdown; the round + puts it in the ONE cart
// (useAddToCart, which also sends KOI's dot to the cart) and turns into a
// stepper once it is there. A product the week's plan buys is marked "In your
// plan". When KOI has pulled focus (a lens or an ask), the plate carries the
// one line that says why this product is in focus — `why`, from the page.
// ============================================================================

import React, { useState } from "react";
import { Heart, Scale, Info, Check } from "lucide-react";
import { useCartStore } from "@/store/cartStore";
import { lineKey, packs } from "@/lib/cart/lines";
import { useAddToCart } from "@/components/store/cart/CartLayer";
import { ProductImage } from "@/components/store/landing/primitives";
import { Money, QtyStepper, ScoreBadge } from "@/components/store/system/primitives";
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
    <span className={`rounded-full border px-2 py-0.5 font-koi-mono text-[10.5px] font-semibold ${out ? "border-koi-red/20 bg-koi-red-bg text-koi-red" : "border-koi-tint-border bg-koi-tint text-koi-primary"}`}>
      {out ? "Not available nearby" : "In stock nearby"}
    </span>
  );
}

export function nutrientValue(product, label) {
  const n = (product.nutrition || []).find((x) => x.label === label);
  return n ? `${n.value}${n.unit || ""}` : null;
}

const WHY_TONE = {
  ok: "border-koi-tint-border bg-koi-tint text-koi-primary",
  warn: "border-koi-warm-border bg-koi-warm-bg text-koi-warm-ink",
};

export default function ShopProductCard({
  product,
  onSelect,
  onOpenScore,
  onOpenCompare,
  onOpenInsight,
  why = null,
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
  const size = product.weight && product.weight !== "N/A" ? product.weight : null;

  const stop = (fn) => (e) => { e.preventDefault(); e.stopPropagation(); fn?.(); };

  return (
    <div
      onClick={() => onSelect?.(product)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && e.target === e.currentTarget && (e.preventDefault(), onSelect?.(product))}
      className={`group relative flex h-full min-w-0 cursor-pointer flex-col gap-3.5 rounded-[24px] text-koi-ink outline-none focus-visible:ring-2 focus-visible:ring-koi-green focus-visible:ring-offset-4 focus-visible:ring-offset-koi-bg ${className}`}
    >
      {/* the plate */}
      <div
        data-plate
        className="relative aspect-[1/1.02] overflow-hidden rounded-[22px] bg-white shadow-[0_1px_0_rgba(20,22,15,.06),0_26px_44px_-32px_rgba(15,61,46,.45)] transition-transform duration-500 ease-[cubic-bezier(.16,1,.3,1)] group-hover:-translate-y-1.5"
      >
        <ProductImage
          src={product.image?.hero}
          alt={`${product.brand} - ${product.name}`}
          className="absolute left-[12%] top-[11%] h-[70%] w-[76%] object-contain transition-transform duration-700 ease-[cubic-bezier(.16,1,.3,1)] group-hover:scale-[1.04]"
        />

        {/* score - opens breakdown */}
        <button
          type="button"
          onClick={stop(() => onOpenScore?.(product))}
          aria-label={product.score == null ? "Not scored yet" : `KOI score ${product.score}. View breakdown`}
          className="absolute left-3 top-3 rounded-full transition-transform hover:scale-105"
        >
          <ScoreBadge score={product.score} size={44} />
        </button>

        {inPlan ? (
          <span className="absolute right-3 top-3.5 rounded-full bg-koi-forest px-2.5 py-1 font-koi-mono text-[10.5px] font-semibold uppercase tracking-[0.08em] text-koi-mint">In your plan</span>
        ) : (
          <button
            type="button"
            onClick={stop(() => setSaved((s) => !s))}
            aria-label={saved ? "Remove from saved" : "Save product"}
            aria-pressed={saved}
            className="absolute right-3 top-3 grid size-10 place-items-center rounded-full border border-koi-ink/10 bg-white/85 backdrop-blur-sm transition-colors hover:bg-white"
          >
            <Heart className="size-4 transition-colors" fill={saved ? "#c2683a" : "none"} style={{ color: saved ? "#c2683a" : "#1c1e17" }} />
          </button>
        )}

        {/* why it is in focus, while KOI is pulling focus */}
        {why && (
          <span data-why className={`absolute bottom-3 left-3 max-w-[calc(100%-76px)] truncate rounded-full border px-2.5 py-1 font-koi-mono text-[11px] font-semibold transition-opacity group-hover:opacity-0 group-focus-within:opacity-0 ${WHY_TONE[why.tone] ?? WHY_TONE.ok}`}>
            {why.text}
          </span>
        )}

        {/* hover quick actions */}
        <div className="absolute bottom-3 left-3 flex translate-y-2 items-center gap-1.5 opacity-0 transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:translate-y-0 group-focus-within:opacity-100">
          <button type="button" onClick={stop(() => onOpenCompare?.(product))} className="flex h-9 items-center gap-1.5 rounded-full bg-white/95 px-3 text-[11.5px] font-bold text-koi-ink shadow-sm transition-colors hover:bg-white">
            <Scale className="size-3.5" /> Compare
          </button>
          <button type="button" onClick={stop(() => onOpenInsight?.(product))} className="flex h-9 items-center gap-1.5 rounded-full bg-white/95 px-3 text-[11.5px] font-bold text-koi-ink shadow-sm transition-colors hover:bg-white">
            <Info className="size-3.5" /> Why KOI
          </button>
        </div>

        {/* add, or the stepper once it is in the cart */}
        <div className="absolute bottom-3 right-3" onClick={(e) => e.stopPropagation()}>
          {qty > 0 ? (
            <QtyStepper value={qty} onChange={(n) => setQty(key, n)} label={product.name} tone="solid" />
          ) : (
            <button
              type="button"
              onClick={stop(() => add(product))}
              aria-label={`Add ${product.name} to cart`}
              className="grid size-11 place-items-center rounded-full bg-koi-forest text-koi-lime shadow-[0_10px_20px_-10px_rgba(8,61,45,.8)] transition-transform hover:scale-105"
            >
              <svg className="size-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14" /><path d="M5 12h14" /></svg>
            </button>
          )}
        </div>
      </div>

      {/* meta */}
      <div className="flex flex-1 flex-col gap-2 px-1">
        <div className="flex flex-col gap-1 md:flex-row md:items-start md:justify-between md:gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <span className="truncate font-koi-mono text-[10.5px] font-medium uppercase tracking-[0.13em] text-koi-muted">
              {product.brand}{size ? ` · ${size}` : ""}
            </span>
            <h3 className="m-0 line-clamp-2 text-[15.5px] font-bold leading-snug md:text-[16.5px]">{product.name}</h3>
          </div>
          <span className="shrink-0 md:pt-4"><Money value={product.price} size={17} /></span>
        </div>

        {product.insight && (
          <button
            type="button"
            onClick={stop(() => onOpenInsight?.(product))}
            className="flex items-start gap-1.5 text-left text-[12px] font-semibold text-koi-green transition-colors hover:text-koi-primary"
          >
            <Check className="mt-0.5 size-3.5 shrink-0" strokeWidth={3} />
            <span className="line-clamp-1">{product.insight}</span>
          </button>
        )}

        {(protein || sugar || canClaimAvailability(product)) && (
          <div className="flex flex-wrap gap-1.5">
            <StockChip product={product} />
            {protein && <span className="rounded-full border border-koi-tint-border bg-koi-tint px-2 py-0.5 font-koi-mono text-[10.5px] font-semibold text-koi-primary">{protein} protein</span>}
            {sugar && <span className="rounded-full border border-koi-ink/10 bg-koi-paper px-2 py-0.5 font-koi-mono text-[10.5px] font-semibold text-koi-ink2">{sugar} sugar</span>}
          </div>
        )}
      </div>
    </div>
  );
}
