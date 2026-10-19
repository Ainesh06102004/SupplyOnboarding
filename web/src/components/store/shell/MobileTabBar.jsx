"use client";

// ============================================================================
// KOI — the phone tab bar: Home · Shop · Plan · Cart · You
//
// One bar on every store page except checkout. It is layer 1 of the single
// bottom stack (--koi-bottom-chrome in app/store/koi.css); the agent dock or a
// page's total bar sits on top of it, never beside it at the same height.
// Cart opens the cart drawer. You opens sign-in when signed out (a sheet right
// here, not a round trip through the route gate), and the profile otherwise —
// where Orders lives on a phone.
// ============================================================================

import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { useCartStore, selectLineCount } from "@/store/cartStore";
import { useCartUi } from "@/store/cartUiStore";
import { Icon } from "@/components/store/system/primitives";

/**
 * @param {{ pathname: string, onSignIn: () => void }} props
 */
export default function MobileTabBar({ pathname, onSignIn }) {
  const { user } = useAuth();
  const count = useCartStore(selectLineCount);
  const hydrated = useCartStore((s) => s.hydrated);
  const openSheet = useCartUi((s) => s.openSheet);
  const at = (match) => (match ? "page" : undefined);

  return (
    <nav className="ks-tabbar" aria-label="Store">
      <Link href="/store" className="ks-tab" aria-current={at(pathname === "/store")}>
        <span className="ks-tab-icon"><Icon.Home /></span>Home
      </Link>
      <Link href="/store/shop" className="ks-tab" aria-current={at(pathname === "/store/shop" || pathname.startsWith("/store/product"))}>
        <span className="ks-tab-icon"><Icon.Shop /></span>Shop
      </Link>
      <Link href="/store/plan" className="ks-tab" aria-current={at(pathname === "/store/plan" || pathname === "/store/household")}>
        <span className="ks-tab-icon"><Icon.Calendar style={{ width: 18, height: 18 }} /></span>Plan
      </Link>
      <button type="button" data-cart-target className="ks-tab" onClick={openSheet} aria-current={at(pathname === "/store/cart")} aria-label={`Cart, ${hydrated ? count : 0} products`}>
        <span className="ks-tab-icon"><Icon.Bag style={{ width: 18, height: 18 }} /></span>Cart
        {hydrated && count > 0 && <span className="ks-tab-badge">{count}</span>}
      </button>
      {user ? (
        <Link href="/store/profile" className="ks-tab" aria-current={at(pathname.startsWith("/store/profile") || pathname === "/store/orders")}>
          <span className="ks-tab-icon"><Icon.You /></span>You
        </Link>
      ) : (
        <button type="button" className="ks-tab" onClick={onSignIn} aria-label="Sign in to KOI">
          <span className="ks-tab-icon"><Icon.You /></span>You
        </button>
      )}
    </nav>
  );
}
