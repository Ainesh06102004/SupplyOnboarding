"use client";

// ============================================================================
// KOI PRODUCT - Purchase panel + the sticky buy bar
// Adds to the store's ONE cart with a quantity, and confirms it the same way
// every add does (useAddToCart → AddedToast). Wishlist is local; share is the
// platform's.
//
// Says nothing about stock or delivery unless a supply source actually told us.
// Both claims used to be hardcoded here - a static "In stock" and an ETA
// computed as "two days from now" - which asserted facts KOI had no way to
// know. See lib/availability.js. It also used to say "every KOI order is
// verified against its label before it ships": KOI ships nothing (Swiggy
// does), so the line now says what KOI actually did — screen the product.
//
// The sticky bar sits under the store header on desktop (the agent dock owns
// the bottom centre) and on layer 2 of the phone's bottom stack, where the
// dock shrinks to a round K beside it.
// ============================================================================

import React, { useEffect, useState } from "react";
import { Heart, Share2, Truck, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { useCartStore } from "@/store/cartStore";
import { useCartUi } from "@/store/cartUiStore";
import { lineKey, packs } from "@/lib/cart/lines";
import { useAddToCart } from "@/components/store/cart/CartLayer";
import { availabilityOf, canClaimAvailability, AVAILABILITY } from "@/lib/availability";
import { C } from "@/components/store/system/tokens";
import { Button, Money, MonoLabel, ProductThumb, QtyStepper } from "@/components/store/system/primitives";

/** The catalogue product behind a product view model. */
const itemOf = (product) => product.raw || product;

/** How many of this product are already in the cart. */
function useInCart(product) {
  const item = itemOf(product);
  const key = lineKey({ skuId: item.skuId, productId: item.id });
  return useCartStore((s) => packs(s.items.find((i) => lineKey(i) === key)?.quantity));
}

/**
 * Stock line. Renders only when a supply source has actually answered — an
 * unchecked product says nothing rather than claiming to be in stock.
 * Delivery estimates return when a source can provide one.
 */
function StockLine({ product }) {
  if (!canClaimAvailability(product)) return null;
  const outOfStock = availabilityOf(product) === AVAILABILITY.UNAVAILABLE;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, font: "600 12.5px var(--koi-sans-stack)" }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: outOfStock ? C.warm : C.accent }} />
      <span style={{ color: outOfStock ? C.warm : C.primary }}>{outOfStock ? "Not available right now" : "In stock"}</span>
      {product.deliveryEta ? (
        <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 6, color: C.ink2 }}>
          <Truck style={{ width: 14, height: 14 }} /> {product.deliveryEta}
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
  const add = useAddToCart();
  const inCart = useInCart(product);
  const openSheet = useCartUi((s) => s.openSheet);
  const price = Number(product.price);

  return (
    <div className="ks-card" style={{ padding: 18, display: "flex", flexDirection: "column", gap: 14 }}>
      <StockLine product={product} />

      <div style={{ display: "flex", gap: 10 }}>
        <QtyStepper value={qty} onChange={setQty} label={product.name} min={1} removable={false} size="lg" />
        <Button size="lg" onClick={() => add(itemOf(product), qty)} style={{ flex: 1 }}>
          Add to cart{Number.isFinite(price) && price > 0 && <> · <Money value={price * qty} /></>}
        </Button>
      </div>

      {inCart > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, background: C.tint, border: `1px solid ${C.tintBorder}`, borderRadius: 14, padding: "10px 12px" }}>
          <span style={{ flex: 1, font: "600 13.5px var(--koi-sans-stack)", color: C.primary }}><span className="ks-num">{inCart}</span> already in your cart</span>
          <button type="button" onClick={openSheet} style={{ border: 0, background: "none", cursor: "pointer", font: "600 13px var(--koi-sans-stack)", color: C.primary }}>View cart</button>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
        <Button variant="secondary" size="sm" onClick={() => setSaved((s) => !s)} aria-pressed={saved}>
          <Heart style={{ width: 16, height: 16, color: saved ? C.warm : C.ink }} fill={saved ? C.warm : "none"} /> {saved ? "Saved" : "Save"}
        </Button>
        <Button variant="secondary" size="sm" onClick={() => shareProduct(product.name)}>
          <Share2 style={{ width: 16, height: 16 }} /> Share
        </Button>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, borderTop: `1px solid ${C.divider}`, paddingTop: 12, font: "400 12.5px/1.5 var(--koi-sans-stack)", color: C.ink2 }}>
        <ShieldCheck style={{ width: 16, height: 16, flex: "none", color: C.accent }} />
        This product passed KOI&apos;s label screen. Swiggy delivers; KOI never takes payment.
      </div>
    </div>
  );
}

// The slim purchase bar, once the hero has scrolled away.
export function StickyBuyBar({ product, sentinelRef }) {
  const [show, setShow] = useState(false);
  const add = useAddToCart();
  const setTotalBar = useCartUi((s) => s.setTotalBar);
  const inCart = useInCart(product);

  useEffect(() => {
    const el = sentinelRef?.current;
    if (!el) return undefined;
    // Only once the hero's own Add has scrolled away above. On a phone the
    // marker starts below the fold, so "not intersecting" put the bar over the
    // title on arrival; and an observer misses a jump from below to above, so
    // the position is read on scroll instead.
    const check = () => setShow(el.getBoundingClientRect().top < 80);
    check();
    window.addEventListener("scroll", check, { passive: true });
    window.addEventListener("resize", check);
    return () => {
      window.removeEventListener("scroll", check);
      window.removeEventListener("resize", check);
    };
  }, [sentinelRef]);

  // While it shows, it holds layer 2 of the phone's bottom stack.
  useEffect(() => {
    setTotalBar(show);
    return () => setTotalBar(false);
  }, [show, setTotalBar]);

  return (
    <div className="ks-buybar" data-show={show ? "true" : "false"} aria-hidden={!show}>
      <div className="ks-buybar-inner">
        <span className="ks-hide-phone"><ProductThumb src={product.image?.hero || null} size={44} radius={11} /></span>
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
          <span style={{ font: "700 14px var(--koi-sans-stack)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{product.name}</span>
          <MonoLabel style={{ letterSpacing: ".06em" }}>
            <Money value={product.price} />{product.weight && product.weight !== "N/A" ? ` · ${product.weight}` : ""}{inCart ? ` · ${inCart} in cart` : ""}
          </MonoLabel>
        </div>
        <Button size="sm" onClick={() => add(itemOf(product), 1)} tabIndex={show ? 0 : -1}>
          <span className="ks-hide-phone">Add to cart</span><span className="ks-show-phone">Add</span>
        </Button>
      </div>
    </div>
  );
}
