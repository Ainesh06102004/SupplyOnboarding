"use client";

// ============================================================================
// KOI — the one store header
//
// Replaces five: StoreNavigation's desktop bar, EditorialNav, the product
// page's TopBar, checkout's breadcrumb header and the Plan's own top row. One
// component, three modes, chosen by the route in StoreChrome:
//
//   app        off-white glass, every in-app page.
//   editorial  transparent at the top of the landing (dark ink) and over the
//              shop's forest hero (white ink, lime cart); turns `app` once the
//              page scrolls.
//   focused    checkout: the wordmark, Cart › Checkout › Hand-off, and the way
//              back. No nav, no search — the page stops competing for attention.
//
// The cart button opens the cart drawer rather than leaving the page. Search
// hands off to the shop's own command search when on the shop, and otherwise
// sends the words to /store/shop?q=, which the shop now reads.
// ============================================================================

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AccountButton from "@/components/auth/AccountButton";
import LocationModal from "@/components/store/LocationModal";
import { useLocation } from "@/contexts/LocationContext";
import { useCartStore, selectLineCount } from "@/store/cartStore";
import { useCartUi } from "@/store/cartUiStore";
import { Wordmark, Icon } from "@/components/store/system/primitives";
import CheckoutRail from "./CheckoutRail";

const NAV = [
  { label: "Shop", href: "/store/shop", match: (p) => p === "/store/shop" || p.startsWith("/store/product") },
  { label: "Plan", href: "/store/plan", match: (p) => p === "/store/plan" || p === "/store/household" },
  { label: "Track", href: "/store/track", match: (p) => p === "/store/track" },
  { label: "Orders", href: "/store/orders", match: (p) => p === "/store/orders" },
];

/** The event the shop page listens for to open its command search. */
export const OPEN_SHOP_SEARCH = "koi:open-shop-search";

/**
 * @param {object} props
 * @param {string} props.pathname
 * @param {"app"|"editorial-light"|"editorial-dark"|"focused"} props.mode
 */
export default function StoreHeader({ pathname, mode }) {
  const router = useRouter();
  const [scrolled, setScrolled] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [locOpen, setLocOpen] = useState(false);
  const [query, setQuery] = useState("");
  const { location, setLocation } = useLocation();
  const count = useCartStore(selectLineCount);
  const hydrated = useCartStore((s) => s.hydrated);
  const openSheet = useCartUi((s) => s.openSheet);
  const editorial = mode === "editorial-light" || mode === "editorial-dark";
  const onShop = pathname === "/store/shop";

  useEffect(() => {
    if (!editorial) return undefined;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setScrolled(window.scrollY > 24));
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, [editorial]);

  // ⌘K anywhere but the shop, which has its own command search.
  useEffect(() => {
    if (onShop || mode === "focused") return undefined;
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onShop, mode]);

  const openSearch = () => {
    if (onShop) window.dispatchEvent(new CustomEvent(OPEN_SHOP_SEARCH));
    else setSearchOpen(true);
  };
  const submitSearch = (e) => {
    e.preventDefault();
    setSearchOpen(false);
    const q = query.trim();
    router.push(q ? `/store/shop?q=${encodeURIComponent(q)}` : "/store/shop");
  };

  if (mode === "focused") {
    return (
      <header className="ks-header">
        <div className="ks-header-inner">
          <Wordmark />
          <div className="flex flex-1 justify-center"><CheckoutRail /></div>
          <span className="hidden items-center gap-2 font-koi-mono text-[11px] font-medium uppercase tracking-[0.14em] text-koi-muted md:flex">
            <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>
            KOI never takes payment
          </span>
        </div>
      </header>
    );
  }

  const clear = editorial && !scrolled;
  const lightInk = mode === "editorial-dark" && !scrolled;

  return (
    <>
      <header
        className="ks-header"
        data-clear={clear ? "true" : undefined}
        data-ink={lightInk ? "light" : undefined}
        data-overlay={mode === "editorial-dark" ? "true" : undefined}
      >
        <div className="ks-header-inner">
          <Wordmark ink={lightInk ? "light" : "dark"} />
          <nav className="ks-nav" aria-label="Store">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className="ks-navlink" aria-current={n.match(pathname) ? "page" : undefined}>
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="ks-spacer" />
          <div className="ks-actions">
            <button type="button" className="ks-search" onClick={openSearch} aria-label="Search or ask KOI">
              <Icon.Search />
              <span>Search or ask KOI</span>
              <kbd>⌘K</kbd>
            </button>
            <button type="button" className="ks-chip-btn" onClick={() => setLocOpen(true)} aria-label={`Delivery location: ${location?.city || "not set"}`}>
              <Icon.Pin style={{ color: lightInk ? "#fff" : "var(--koi-primary)" }} />
              <span style={{ maxWidth: 110, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{location?.city || "Location"}</span>
              {location?.pincode && <span className="ks-num ks-hide-phone" style={{ fontWeight: 500, opacity: 0.7 }}>{location.pincode}</span>}
            </button>
            <AccountButton className="ks-hide-phone" />
            <button type="button" data-cart-target className="ks-cart-btn ks-hide-phone" onClick={openSheet} aria-label={`Open cart, ${hydrated ? count : 0} products`}>
              <Icon.Bag />
              Cart
              {hydrated && count > 0 && <span className="ks-count">{count}</span>}
            </button>
          </div>
        </div>
      </header>

      {searchOpen && (
        <div className="fixed inset-0 z-[95] flex items-start justify-center p-4 pt-24 sm:pt-32">
          <button type="button" aria-label="Close search" className="absolute inset-0 bg-[rgba(15,30,22,.38)] backdrop-blur-sm" onClick={() => setSearchOpen(false)} />
          <form onSubmit={submitSearch} role="search" className="relative w-full max-w-2xl" style={{ animation: "koiDrop .2s ease" }}>
            <div className="flex items-center gap-3 rounded-[20px] bg-white p-2 pl-5 shadow-[0_30px_80px_rgba(15,61,46,0.25)]">
              <Icon.Search style={{ color: "var(--koi-accent)", width: 20, height: 20 }} />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Escape") setSearchOpen(false); }}
                placeholder="Search products, brands, or describe what you're after…"
                aria-label="Search KOI"
                className="flex-1 bg-transparent py-3 text-[16px] font-medium text-[#1c1e17] outline-none placeholder:text-[#8c8c84]"
              />
              <button type="submit" className="ks-btn" data-variant="primary" data-size="sm">Search</button>
            </div>
          </form>
        </div>
      )}

      <LocationModal mode="store" open={locOpen} onOpenChange={setLocOpen} onComplete={(loc) => setLocation(loc)} />
    </>
  );
}
