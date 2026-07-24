"use client";

// ============================================================================
// KOI EDITORIAL LANDING - Navigation
// Preserves: routing, cart, location selector, search (routes to /store/shop).
// ============================================================================

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, MapPin, ShoppingBag, X, ArrowRight, Menu } from "lucide-react";
import { useCartStore } from "@/store/cartStore";
import { useLocation } from "@/contexts/LocationContext";
import LocationModal from "@/components/store/LocationModal";
import { C, HEADING } from "./tokens";

const LINKS = [
  { label: "Store", href: "/store/shop" },
  { label: "Editorial", href: "#featured" },
  { label: "Trust", href: "#trust" },
  { label: "For Brands", href: "/onboarding" },
];

function NavLink({ href, children, onClick }) {
  const isAnchor = href.startsWith("#");
  const cls =
    "group relative text-[13px] font-semibold uppercase tracking-[0.12em] text-[#083D2D] transition-opacity hover:opacity-100 opacity-70";
  const underline = (
    <span className="absolute -bottom-1 left-0 h-[2px] w-full origin-left scale-x-0 bg-[#083D2D] transition-transform duration-300 group-hover:scale-x-100" />
  );
  if (isAnchor) {
    return (
      <a href={href} onClick={onClick} className={cls}>
        {children}
        {underline}
      </a>
    );
  }
  return (
    <Link href={href} onClick={onClick} className={cls}>
      {children}
      {underline}
    </Link>
  );
}

export default function EditorialNav({ links = LINKS, onSearchClick }) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [locOpen, setLocOpen] = useState(false);
  const [query, setQuery] = useState("");

  const items = useCartStore((s) => s.items);
  const { location, setLocation } = useLocation();
  const count = mounted ? items.reduce((n, i) => n + i.quantity, 0) : 0;

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 0);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
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
  }, []);

  const submitSearch = (e) => {
    e.preventDefault();
    setSearchOpen(false);
    router.push(query.trim() ? `/store/shop?q=${encodeURIComponent(query.trim())}` : "/store/shop");
  };

  return (
    <>
      <header
        className="sticky top-0 z-50 transition-all duration-500"
        style={{
          background: scrolled ? "rgba(249,248,244,0.82)" : "transparent",
          backdropFilter: scrolled ? "blur(16px)" : "none",
          borderBottom: `1px solid ${scrolled ? "rgba(8,61,45,0.10)" : "transparent"}`,
        }}
      >
        <nav className="mx-auto flex max-w-[1400px] items-center justify-between gap-4 px-5 sm:px-8 lg:px-12" style={{ height: scrolled ? 68 : 84 }}>
          {/* Wordmark */}
          <Link href="/store" className="flex items-baseline gap-1.5 shrink-0" aria-label="KOI home">
            <span className="text-[26px] font-extrabold leading-none tracking-tight text-[#083D2D]" style={HEADING}>
              KOI
            </span>
            <span className="hidden sm:block text-[10px] font-bold uppercase tracking-[0.2em] text-[#16A06E]">
              ®
            </span>
          </Link>

          {/* Center links */}
          <div className="hidden md:flex items-center gap-8">
            {links.map((l) => (
              <NavLink key={l.label} href={l.href}>
                {l.label}
              </NavLink>
            ))}
          </div>

          {/* Right cluster */}
          <div className="flex items-center gap-1.5 sm:gap-2.5">
            <button
              onClick={() => (onSearchClick ? onSearchClick() : setSearchOpen(true))}
              aria-label="Search products"
              className="grid h-10 w-10 place-items-center rounded-full border border-[#083D2D]/12 bg-white/60 text-[#083D2D] transition-colors hover:bg-white"
            >
              <Search className="h-[18px] w-[18px]" strokeWidth={2.2} />
            </button>

            <button
              onClick={() => setLocOpen(true)}
              aria-label="Choose delivery location"
              className="hidden sm:flex items-center gap-2 rounded-full border border-[#083D2D]/12 bg-white/60 px-3.5 py-2 text-[#083D2D] transition-colors hover:bg-white"
            >
              <MapPin className="h-4 w-4" strokeWidth={2.2} />
              <span className="max-w-[92px] truncate text-[12px] font-bold">
                {location?.city || "Location"}
              </span>
            </button>

            <Link
              href="/store/cart"
              aria-label={`Cart, ${count} items`}
              className="relative grid h-10 w-10 place-items-center rounded-full bg-[#083D2D] text-white transition-transform hover:-translate-y-0.5"
            >
              <ShoppingBag className="h-[18px] w-[18px]" strokeWidth={2.2} />
              {count > 0 && (
                <span
                  className="absolute -right-1 -top-1 grid h-5 min-w-[20px] place-items-center rounded-full px-1 text-[10px] font-extrabold text-[#083D2D]"
                  style={{ background: C.lime }}
                >
                  {count}
                </span>
              )}
            </Link>

            <button
              onClick={() => setMenuOpen(true)}
              aria-label="Open menu"
              className="md:hidden grid h-10 w-10 place-items-center rounded-full border border-[#083D2D]/12 bg-white/60 text-[#083D2D]"
            >
              <Menu className="h-[18px] w-[18px]" strokeWidth={2.2} />
            </button>
          </div>
        </nav>
      </header>

      {/* Search overlay */}
      {searchOpen && (
        <div className="fixed inset-0 z-[70] flex items-start justify-center p-4 pt-24 sm:pt-32">
          <div className="absolute inset-0 bg-[#083D2D]/30 backdrop-blur-md" onClick={() => setSearchOpen(false)} />
          <form
            onSubmit={submitSearch}
            className="relative w-full max-w-2xl animate-in fade-in slide-in-from-top-4 duration-300"
          >
            <div className="flex items-center gap-3 rounded-2xl bg-white p-2 pl-6 shadow-[0_30px_80px_rgba(8,61,45,0.25)]">
              <Search className="h-5 w-5 shrink-0 text-[#16A06E]" strokeWidth={2.4} />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search products, brands or goals…"
                aria-label="Search"
                className="flex-1 bg-transparent py-3 text-[17px] font-medium text-[#083D2D] outline-none placeholder:text-[#083D2D]/40"
                style={HEADING}
              />
              <button
                type="submit"
                className="grid h-12 w-12 place-items-center rounded-xl bg-[#083D2D] text-white transition-transform hover:scale-105"
                aria-label="Search"
              >
                <ArrowRight className="h-5 w-5" />
              </button>
            </div>
            <button
              type="button"
              onClick={() => setSearchOpen(false)}
              className="mt-4 flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-[0.16em] text-white/80"
            >
              <X className="h-3.5 w-3.5" /> Close
            </button>
          </form>
        </div>
      )}

      {/* Mobile menu overlay */}
      {menuOpen && (
        <div className="fixed inset-0 z-[70] md:hidden">
          <div className="absolute inset-0 animate-in fade-in duration-300" style={{ background: C.forest }} />
          <div className="relative flex h-full flex-col p-6 animate-in slide-in-from-bottom-6 duration-300">
            <div className="flex items-center justify-between">
              <span className="text-[24px] font-extrabold text-white" style={HEADING}>KOI</span>
              <button onClick={() => setMenuOpen(false)} aria-label="Close menu" className="grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="mt-auto mb-6 flex flex-col gap-3">
              {links.map((l, i) =>
                l.href.startsWith("#") ? (
                  <a
                    key={l.label}
                    href={l.href}
                    onClick={() => setMenuOpen(false)}
                    className="text-[13vw] font-extrabold leading-[0.98] text-white"
                    style={HEADING}
                  >
                    {l.label}.
                  </a>
                ) : (
                  <Link
                    key={l.label}
                    href={l.href}
                    onClick={() => setMenuOpen(false)}
                    className="text-[13vw] font-extrabold leading-[0.98] text-white"
                    style={HEADING}
                  >
                    {l.label}.
                  </Link>
                )
              )}
            </div>
            <button
              onClick={() => { setMenuOpen(false); setLocOpen(true); }}
              className="flex items-center gap-2 rounded-full border border-white/20 px-4 py-3 text-white"
            >
              <MapPin className="h-4 w-4" />
              <span className="text-[13px] font-bold">Delivering to {location?.city || "—"}</span>
            </button>
          </div>
        </div>
      )}

      <LocationModal mode="store" open={locOpen} onOpenChange={setLocOpen} onComplete={(loc) => setLocation(loc)} />
    </>
  );
}
