"use client";

// ============================================================================
// KOI — the cart's global layer: the drawer, the add confirmation, the
// "cart updated" note, and the phone total bar.
//
// Mounted once in StoreChrome, so the header's cart button, the tab bar's Cart
// and every "Add" on every page reach the same drawer. Also exports
// useAddToCart, the one way a product enters the cart from a button: it adds
// the packs AND confirms it, so no surface can add silently.
// ============================================================================

import { useCallback, useEffect } from "react";
import Link from "next/link";
import { useCartStore } from "@/store/cartStore";
import { useCartUi } from "@/store/cartUiStore";
import { lineKey, packs } from "@/lib/cart/lines";
import Sheet from "@/components/store/system/Sheet";
import { Button, Money, MonoLabel, ProductThumb, Icon } from "@/components/store/system/primitives";
import { useCartGroups, PlanGroup, OwnGroup, PlanChangedBanner, CartEmpty, CartLoading, SWIGGY_NOTE } from "./CartView";
import { useEmber } from "@/components/store/ember/Ember";

/**
 * Add packs of a product to the one cart and say so.
 * @returns {(product: object, n?: number, from?: string|null) => void}
 */
export function useAddToCart() {
  const add = useCartStore((s) => s.add);
  const showAdded = useCartUi((s) => s.showAdded);
  const ember = useEmber();
  return useCallback((product, n = 1, from = null) => {
    if (!product) return;
    add(product, n, from);
    showAdded(lineKey({ skuId: product.skuId, productId: product.id }));
    // KOI carries it: the ember flies to whichever cart is on screen (the
    // header's, or the phone tab bar's), ticks, and goes home.
    const cart = [...document.querySelectorAll("[data-cart-target]")].find((el) => el.offsetParent !== null);
    if (cart) ember.go(cart, { ax: 1, ay: 0, x: -6, y: 6 }, () => ember.done(() => setTimeout(() => ember.home(), 450)));
  }, [add, showAdded, ember]);
}

/** The cart drawer: right on desktop, a bottom sheet on phones. */
export function CartSheet() {
  const open = useCartUi((s) => s.sheetOpen);
  const close = useCartUi((s) => s.closeSheet);
  const groups = useCartGroups();
  const { all } = groups;

  return (
    <Sheet open={open} onClose={close} label="Your cart">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 22px 14px", borderBottom: "1px solid var(--koi-line)" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <span style={{ font: "800 22px var(--koi-sans-stack)", letterSpacing: "-.02em" }}>Your cart</span>
          {all.products > 0 && <MonoLabel><span className="ks-num">{all.products}</span> {all.products === 1 ? "product" : "products"}</MonoLabel>}
        </div>
        <button type="button" onClick={close} aria-label="Close cart" style={{ width: 38, height: 38, borderRadius: "50%", background: "#fff", border: "1px solid var(--koi-line2)", display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "var(--koi-ink)" }}>
          <Icon.Close />
        </button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "16px 18px", display: "flex", flexDirection: "column", gap: 14 }}>
        {groups.loading ? <CartLoading /> : groups.empty || !groups.lines.length ? <CartEmpty onNavigate={close} /> : (
          <>
            <PlanChangedBanner groups={groups} compact />
            <PlanGroup groups={groups} collapsible />
            <OwnGroup groups={groups} compact />
          </>
        )}
      </div>

      {all.products > 0 && (
        <div style={{ borderTop: "1px solid var(--koi-line2)", padding: "16px 22px 22px", display: "flex", flexDirection: "column", gap: 12, background: "#fff" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <span style={{ font: "700 15px var(--koi-sans-stack)" }}>MRP total</span>
            <Money value={all.total} size={26} />
          </div>
          <span style={{ font: "400 12px/1.45 var(--koi-sans-stack)", color: "var(--koi-ink2)" }}>{SWIGGY_NOTE}</span>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr", gap: 10 }}>
            <Button href="/store/cart" variant="secondary" onClick={close}>View full cart</Button>
            <Button href="/store/checkout" onClick={close}>Checkout →</Button>
          </div>
        </div>
      )}
    </Sheet>
  );
}

/** "Added to cart": names the item, the pack and the new count; two next steps. */
export function AddedToast() {
  const added = useCartUi((s) => s.added);
  const dismiss = useCartUi((s) => s.dismissAdded);
  const openSheet = useCartUi((s) => s.openSheet);
  const sheetOpen = useCartUi((s) => s.sheetOpen);
  const line = useCartStore((s) => (added ? s.items.find((i) => lineKey(i) === added.key) : null));

  useEffect(() => {
    if (!added) return undefined;
    const t = setTimeout(dismiss, 4500);
    return () => clearTimeout(t);
  }, [added, dismiss]);

  if (!added || !line || sheetOpen) return null;
  const meta = [line.brand && line.brand !== "Unknown" ? line.brand : null, line.weight && line.weight !== "N/A" ? line.weight : null].filter(Boolean).join(" · ");
  return (
    <div role="status" aria-live="polite" className="ks-toast" key={added.at}>
      <div style={{ display: "flex", gap: 12, alignItems: "center", flex: 1, minWidth: 0 }}>
        <ProductThumb src={line.image?.hero || null} size={48} radius={12} />
        <div style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1, minWidth: 0 }}>
          <span style={{ display: "inline-flex", gap: 6, alignItems: "center", font: "700 12.5px var(--koi-sans-stack)", color: "var(--koi-primary)" }}><Icon.Check /> Added to cart</span>
          <span style={{ font: "700 14.5px var(--koi-sans-stack)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{line.name}</span>
          <MonoLabel style={{ letterSpacing: ".06em" }}>{meta ? `${meta} · ` : ""}<span className="ks-num">{packs(line.quantity)}</span> in cart</MonoLabel>
        </div>
        <button type="button" onClick={dismiss} aria-label="Dismiss" className="ks-hide-phone" style={{ alignSelf: "flex-start", width: 28, height: 28, border: 0, background: "transparent", color: "var(--koi-muted)", cursor: "pointer" }}><Icon.Close /></button>
      </div>
      <div className="ks-toast-actions" style={{ display: "flex", gap: 8 }}>
        <Button variant="secondary" size="sm" className="ks-hide-phone" style={{ flex: 1 }} onClick={openSheet}>View cart</Button>
        <Button href="/store/checkout" size="sm" className="ks-hide-phone" style={{ flex: 1 }} onClick={dismiss}>Checkout</Button>
        <Button size="sm" className="ks-show-phone" onClick={openSheet}>View cart</Button>
      </div>
    </div>
  );
}

/** "Cart updated to the new plan · Undo". */
export function UpdatedToast() {
  const updated = useCartUi((s) => s.updated);
  const setUpdated = useCartUi((s) => s.setUpdated);
  const undoPlan = useCartStore((s) => s.undoPlan);
  useEffect(() => {
    if (!updated) return undefined;
    const t = setTimeout(() => setUpdated(null), 7000);
    return () => clearTimeout(t);
  }, [updated, setUpdated]);
  if (!updated) return null;
  return (
    <div role="status" aria-live="polite" className="ks-toast" style={{ background: "var(--koi-ink)", color: "#fff", flexDirection: "row", alignItems: "center", padding: "12px 14px", width: "auto", minWidth: 320 }}>
      <Icon.Check style={{ color: "var(--koi-mint)" }} />
      <span style={{ flex: 1, font: "600 14px var(--koi-sans-stack)" }}>Cart updated to the new plan</span>
      <button type="button" onClick={() => { undoPlan(); setUpdated(null); }} style={{ border: 0, background: "none", color: "var(--koi-mint)", font: "700 13.5px var(--koi-sans-stack)", cursor: "pointer" }}>Undo</button>
    </div>
  );
}

/**
 * The phone total bar for cart surfaces. Registers itself so the agent dock
 * shrinks to a round K beside it instead of stacking on top.
 * @param {{ total: number, products: number, href?: string, label?: string }} props
 */
export function TotalBar({ total, products, href = "/store/checkout", label = "Checkout" }) {
  const setTotalBar = useCartUi((s) => s.setTotalBar);
  useEffect(() => {
    setTotalBar(true);
    return () => setTotalBar(false);
  }, [setTotalBar]);
  if (!products) return null;
  return (
    <Link href={href} className="ks-totalbar" aria-label={`${label}: ${products} products`}>
      <span style={{ display: "flex", flexDirection: "column" }}>
        <Money value={total} size={17} />
        <MonoLabel style={{ color: "var(--koi-mint)", fontSize: 9.5 }}><span className="ks-num">{products}</span> {products === 1 ? "product" : "products"} · MRP</MonoLabel>
      </span>
      <span style={{ flex: 1 }} />
      <span style={{ background: "var(--koi-mint)", color: "var(--koi-deep)", font: "700 14px var(--koi-sans-stack)", borderRadius: 12, padding: "10px 14px" }}>{label} →</span>
    </Link>
  );
}
