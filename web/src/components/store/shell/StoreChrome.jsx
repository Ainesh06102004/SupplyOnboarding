"use client";

// ============================================================================
// KOI — the store's chrome, mounted once by app/store/layout.js
//
// Picks the header's mode from the route, puts the phone tab bar on every page
// but checkout, and mounts the cart's global layer (drawer, confirmations).
// It also keeps two jobs the old StoreNavigation did:
//
//   • ?login=required|failed (set by proxy.js when a gated page turned the
//     shopper away) opens the sign-in sheet here, then is wiped from the URL.
//   • The household's latest plan is read whenever the cart has a plan in it,
//     so every cart surface can OFFER an update when the plan has moved on.
//     The Plan page reports its own, fresher plan instead (usePlanSession).
// ============================================================================

import { Suspense, useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import LoginSheet from "@/components/auth/LoginSheet";
import { useAuth } from "@/contexts/AuthContext";
import { useCartStore } from "@/store/cartStore";
import { useCartUi } from "@/store/cartUiStore";
import { useLoginUi } from "@/store/loginUiStore";
import { fetchLatestPlan } from "@/lib/cart/client";
import StoreHeader from "./StoreHeader";
import MobileTabBar from "./MobileTabBar";
import { CartSheet, AddedToast, UpdatedToast } from "@/components/store/cart/CartLayer";

/**
 * Which header a route wears.
 * @param {string} pathname
 * @returns {"app"|"editorial-light"|"editorial-dark"|"focused"}
 */
export function headerModeFor(pathname) {
  // The shelf opens on paper now ("On the shelf"), not the old forest hero, so
  // it wears the app header; editorial-dark stays for any dark-headed page.
  if (pathname === "/store") return "editorial-light";
  if (pathname.startsWith("/store/checkout")) return "focused";
  return "app";
}

export default function StoreChrome() {
  return (
    <Suspense fallback={null}>
      <Chrome />
    </Suspense>
  );
}

function Chrome() {
  const pathname = usePathname() ?? "/store";
  const searchParams = useSearchParams();
  const router = useRouter();
  // The ONE sign-in sheet for the store (store/loginUiStore.js): every "Sign
  // in" anywhere opens this instance, so none can be trapped by its parent.
  const login = useLoginUi();
  const openLogin = login.openLogin;
  const mode = headerModeFor(pathname);

  useEffect(() => {
    const reason = searchParams.get("login");
    if (reason !== "required" && reason !== "failed") return undefined;
    const t = setTimeout(() => {
      // Where the shopper was heading when the gate stopped them — kept in the
      // sheet's state, because the URL params it came from are wiped below.
      openLogin({ required: reason === "required", next: searchParams.get("next") });
      // So a refresh or a shared link does not reopen the sheet.
      const params = new URLSearchParams(searchParams);
      params.delete("login");
      params.delete("next");
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    }, 0);
    return () => clearTimeout(t);
  }, [searchParams, pathname, router, openLogin]);

  useLatestPlan(pathname);

  // Checkout has no tab bar, so nothing floats at the bottom of the phone.
  useEffect(() => {
    const root = document.querySelector(".koi-store");
    if (!root) return undefined;
    root.dataset.chrome = mode === "focused" ? "focused" : "full";
    return () => { delete root.dataset.chrome; };
  }, [mode]);

  return (
    <>
      <StoreHeader pathname={pathname} mode={mode} />
      {mode !== "focused" && (
        // Chosen, not forced — the sheet keeps its guest option.
        <MobileTabBar pathname={pathname} onSignIn={() => openLogin()} />
      )}
      <CartSheet />
      <AddedToast />
      <UpdatedToast />
      <LoginSheet open={login.open} onOpenChange={login.setOpen} next={login.next} required={login.required} />
    </>
  );
}

/** Read the latest plan when the cart holds one, so a change can be offered. */
function useLatestPlan(pathname) {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const hasPlan = useCartStore((s) => Boolean(s.plan));
  const sheetOpen = useCartUi((s) => s.sheetOpen);
  const setLatestPlan = useCartUi((s) => s.setLatestPlan);
  const onPlanPage = pathname === "/store/plan";

  useEffect(() => {
    if (onPlanPage) return undefined;
    if (!uid || !hasPlan) {
      setLatestPlan(null);
      return undefined;
    }
    let alive = true;
    fetchLatestPlan()
      .then((p) => { if (alive) setLatestPlan(p); })
      .catch(() => { /* no offer is better than a wrong one */ });
    return () => { alive = false; };
  }, [uid, hasPlan, onPlanPage, pathname, sheetOpen, setLatestPlan]);
}
