"use client";

// ============================================================================
// KOI PRODUCT - Purchase panel + always-visible sticky buy bar
// Wires the real cart (add with quantity), wishlist (local), share.
//
// Says nothing about stock or delivery unless a supply source actually told us.
// Both claims used to be hardcoded here - a static "In stock" and an ETA
// computed as "two days from now" - which asserted facts KOI had no way to
// know. See lib/availability.js.
// ============================================================================

import React, { useEffect, useState } from "react";
import { ShoppingBag, Plus, Minus, Heart, Share2, Truck, Check, ShieldCheck } from "lucide-react";
import Image from "next/image";
import { toast } from "sonner";
import { useCartStore } from "@/store/cartStore";
import { availabilityOf, canClaimAvailability, AVAILABILITY } from "@/lib/availability";
import { C, HEADING, BODY } from "@/components/store/landing/tokens";

function useAddToCart(product) {
  const addToCart = useCartStore((s) => s.addToCart);
  const increaseQty = useCartStore((s) => s.increaseQty);
  return (qty = 1) => {
    const item = product.raw || product;
    addToCart(item);
    for (let i = 1; i < qty; i++) increaseQty(item.id);
    toast.success(`Added ${qty > 1 ? `${qty} × ` : ""}${product.name} to cart`);
  };
}

/**
 * Stock line. Renders only when a supply source has actually answered — an
 * unchecked product says nothing rather than claiming to be in stock.
 * Delivery estimates return when a source can provide one.
 */
function StockLine({ product }) {
  if (!canClaimAvailability(product)) return null;

  const state = availabilityOf(product);
  const outOfStock = state === AVAILABILITY.UNAVAILABLE;

  return (
    <div className="mb-4 flex items-center gap-1.5 text-[12.5px] font-semibold">
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ background: outOfStock ? C.orange : C.emerald }}
      />
      <span style={{ color: outOfStock ? C.orange : C.green }}>
        {outOfStock ? "Not available right now" : "In stock"}
      </span>
      {product.deliveryEta ? (
        <span className="ml-auto inline-flex items-center gap-1.5 text-[#083D2D]/55">
          <Truck className="h-3.5 w-3.5" /> {product.deliveryEta}
        </span>
      ) : null}
    </div>
  );
}

async function shareProduct(name) {
  try {
    const url = typeof window !== "undefined" ? window.location.href : "";
    if (navigator.share) await navigator.share({ title: `${name} - KOI`, url });
    else { await navigator.clipboard.writeText(url); toast.success("Link copied to clipboard"); }
  } catch { /* dismissed */ }
}

export default function BuyPanel({ product }) {
  const [qty, setQty] = useState(1);
  const [saved, setSaved] = useState(false);
  const add = useAddToCart(product);

  return (
    <div className="rounded-[24px] border border-[#083D2D]/10 bg-white/70 p-5 backdrop-blur-md shadow-[0_10px_40px_rgba(8,61,45,0.06)]">
      <StockLine product={product} />

      <div className="flex items-center gap-3">
        {/* qty */}
        <div className="flex items-center rounded-full border border-[#083D2D]/12 bg-white">
          <button onClick={() => setQty((q) => Math.max(1, q - 1))} aria-label="Decrease quantity" className="grid h-11 w-11 place-items-center rounded-full text-[#083D2D] transition-colors hover:bg-[#F2F6EC]">
            <Minus className="h-4 w-4" />
          </button>
          <span className="w-6 text-center text-[15px] font-bold text-[#083D2D]" style={HEADING}>{qty}</span>
          <button onClick={() => setQty((q) => q + 1)} aria-label="Increase quantity" className="grid h-11 w-11 place-items-center rounded-full text-[#083D2D] transition-colors hover:bg-[#F2F6EC]">
            <Plus className="h-4 w-4" />
          </button>
        </div>

        {/* add */}
        <button
          onClick={() => add(qty)}
          className="group flex flex-1 items-center justify-center gap-2 rounded-full py-3.5 text-[15px] font-bold text-white transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_12px_30px_rgba(8,61,45,0.28)]"
          style={{ background: C.forest }}
        >
          <ShoppingBag className="h-4 w-4" />
          Add to cart · ₹{product.price * qty}
        </button>
      </div>

      {/* secondary actions */}
      <div className="mt-3 grid grid-cols-2 gap-3">
        <button
          onClick={() => setSaved((s) => !s)}
          className="flex items-center justify-center gap-2 rounded-full border border-[#083D2D]/12 py-2.5 text-[13px] font-bold text-[#083D2D] transition-colors hover:bg-[#F2F6EC]"
        >
          <Heart className="h-4 w-4" fill={saved ? C.orange : "none"} style={{ color: saved ? C.orange : C.forest }} />
          {saved ? "Saved" : "Save"}
        </button>
        <button
          onClick={() => shareProduct(product.name)}
          className="flex items-center justify-center gap-2 rounded-full border border-[#083D2D]/12 py-2.5 text-[13px] font-bold text-[#083D2D] transition-colors hover:bg-[#F2F6EC]"
        >
          <Share2 className="h-4 w-4" /> Share
        </button>
      </div>

      <div className="mt-4 flex items-center gap-2 border-t border-[#083D2D]/8 pt-4 text-[12px] font-medium text-[#083D2D]/55" style={BODY}>
        <ShieldCheck className="h-4 w-4 shrink-0" style={{ color: C.emerald }} />
        Every KOI order is verified against its label before it ships.
      </div>
    </div>
  );
}

// Always-visible slim purchase bar (appears after the hero scrolls away).
export function StickyBuyBar({ product, sentinelRef }) {
  const [show, setShow] = useState(false);
  const add = useAddToCart(product);

  useEffect(() => {
    const el = sentinelRef?.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setShow(!e.isIntersecting), { rootMargin: "-80px 0px 0px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [sentinelRef]);

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-[70] transition-all duration-300"
      style={{ transform: show ? "translateY(0)" : "translateY(110%)", opacity: show ? 1 : 0 }}
    >
      <div className="mx-auto max-w-5xl px-3 pb-3 sm:px-6 sm:pb-4">
        <div className="flex items-center gap-3 rounded-2xl border border-[#083D2D]/10 bg-white/90 p-2.5 pl-3 shadow-[0_18px_50px_rgba(8,61,45,0.18)] backdrop-blur-xl sm:p-3 sm:pl-4">
          <span className="hidden h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-xl sm:grid" style={{ background: C.cream }}>
            {product.image?.hero ? (
              <Image src={product.image.hero} alt="" width={48} height={48} className="object-contain p-1" style={{ mixBlendMode: "multiply" }} />
            ) : null}
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-bold text-[#083D2D]" style={HEADING}>{product.name}</div>
            <div className="text-[12px] font-semibold text-[#083D2D]/55">₹{product.price} · {product.weight}</div>
          </div>
          <button
            onClick={() => add(1)}
            className="flex shrink-0 items-center gap-2 rounded-full px-5 py-3 text-[14px] font-bold text-white transition-transform hover:-translate-y-0.5"
            style={{ background: C.forest }}
          >
            <ShoppingBag className="h-4 w-4" />
            <span className="hidden sm:inline">Add to cart</span>
            <span className="sm:hidden">Add</span>
          </button>
        </div>
      </div>
    </div>
  );
}
