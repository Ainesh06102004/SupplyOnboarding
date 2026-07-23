"use client";

import React, { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import { Home, Store, ShoppingCart, Package, User } from "lucide-react";
import { useCartStore } from "@/store/cartStore";
import OTPLoginModal from "@/components/auth/OTPLoginModal";

function NavigationContent() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const items = useCartStore(state => state.items);
  const [isLoginOpen, setIsLoginOpen] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (searchParams.get("login") === "required") {
      setIsLoginOpen(true);
      // Clean up the URL parameter
      const params = new URLSearchParams(searchParams);
      params.delete("login");
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    }
  }, [searchParams, pathname, router]);

  useEffect(() => setMounted(true), []);

  // Hide global navigation entirely on checkout and product-detail pages
  // (those provide their own bespoke chrome / sticky purchase bar).
  if (pathname === "/store/checkout" || pathname.startsWith("/store/product/")) return null;

  // The editorial landing (/store) and shop (/store/shop) ship their own
  // bespoke top nav (EditorialNav). Suppress the shared desktop navbar there to
  // avoid a duplicate header; the mobile bottom tab bar still renders.
  const isHome = pathname === "/store" || pathname === "/store/shop";

  const totalItems = mounted ? items.reduce((sum, i) => sum + i.quantity, 0) : 0;
  const hasActiveOrder = true; // Mock logic to display dot

  const NAV_ITEMS = [
    { label: "Home", href: "/store", icon: Home },
    { label: "Store", href: "/store/shop", icon: Store },
    { label: "Cart", href: "/store/cart", icon: ShoppingCart },
    { label: "Orders", href: "/store/orders", icon: Package },
    { label: "Profile", href: "/store/profile", icon: User },
  ];

  return (
    <>
      {/* ─── DESKTOP TOP NAVBAR ─── */}
      {!isHome && (
      <nav className="hidden md:block sticky top-0 z-50 backdrop-blur-xl bg-[#F2F6EC]/85 border-b border-[#E2E8D8]/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between">
          <div className="flex items-center gap-8">
             <Link href="/store" className="text-3xl font-bold tracking-tighter text-[#0E4032]" style={{ fontFamily: "var(--font-koi-heading)" }}>
               KOI
             </Link>
             <div className="flex items-center gap-6 mt-1">
                <Link href="/store/shop" className={`text-[13px] font-bold transition-colors uppercase tracking-wider ${pathname === "/store/shop" ? "text-[#0E4032]" : "text-[#5A6B5A] hover:text-[#0E4032]"}`}>Store</Link>
                <Link href="/store/orders" className={`text-[13px] font-bold transition-colors uppercase tracking-wider flex items-center gap-1.5 ${pathname === "/store/orders" ? "text-[#0E4032]" : "text-[#5A6B5A] hover:text-[#0E4032]"}`}>
                  Orders
                  {hasActiveOrder && <span className="w-1.5 h-1.5 rounded-full bg-[#C8F23E] shadow-[0_0_8px_rgba(200,242,62,0.8)]" />}
                </Link>
                <Link href="/store/profile" className={`text-[13px] font-bold transition-colors uppercase tracking-wider ${pathname === "/store/profile" ? "text-[#0E4032]" : "text-[#5A6B5A] hover:text-[#0E4032]"}`}>Profile</Link>
             </div>
          </div>
          
          <Link href="/store/cart" className="flex items-center gap-2.5 px-5 py-2.5 bg-white border border-[#E2E8D8] rounded-full shadow-[0_2px_10px_rgba(14,64,50,0.02)] hover:border-[#0E4032]/30 hover:bg-[#F2F6EC] transition-all relative">
             <ShoppingCart className="w-4 h-4 text-[#0E4032]" />
             <span className="text-[13px] font-bold text-[#0E4032] uppercase tracking-wider">{totalItems > 0 ? `${totalItems} items` : "Cart"}</span>
          </Link>
        </div>
      </nav>
      )}

      {/* ─── MOBILE BOTTOM NAVBAR ─── */}
      <nav className="md:hidden fixed bottom-4 left-4 right-4 z-[60] animate-in slide-in-from-bottom duration-500 pb-safe">
        <div className="bg-white/95 backdrop-blur-xl border border-[#E2E8D8]/80 shadow-[0_8px_30px_rgba(14,64,50,0.15)] rounded-2xl flex items-center justify-between px-2 py-1.5">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href || (pathname === "/store" && item.href === "/store/shop");
            
            return (
              <Link 
                key={item.label}
                href={item.href}
                className="relative flex-1 flex flex-col items-center justify-center py-2 group"
              >
                <div className={`relative flex items-center justify-center transition-all duration-300 ${isActive ? "text-[#0E4032]" : "text-[#5A6B5A]/50 group-hover:text-[#5A6B5A]"}`}>
                  <Icon className={`w-[22px] h-[22px] transition-transform duration-300 ${isActive ? "scale-110" : "scale-100"}`} />
                  
                  {/* Badge for Cart */}
                  {item.label === "Cart" && totalItems > 0 && (
                    <span className="absolute -top-1.5 -right-2 bg-[#C8F23E] text-[#0E4032] text-[10px] font-bold px-1.5 min-w-[16px] h-[16px] rounded-full flex items-center justify-center shadow-sm">
                      {totalItems}
                    </span>
                  )}

                  {/* Pulsing Dot for Orders */}
                  {item.label === "Orders" && hasActiveOrder && (
                    <span className="absolute top-0 -right-0.5 w-2.5 h-2.5 bg-[#C8F23E] border-2 border-white rounded-full shadow-[0_0_8px_rgba(200,242,62,0.8)]" />
                  )}
                </div>
                {isActive && (
                  <span className="text-[8px] font-bold uppercase tracking-wider mt-1 text-[#0E4032] animate-in fade-in slide-in-from-bottom-1 duration-300">
                    {item.label}
                  </span>
                )}
              </Link>
            )
          })}
        </div>
      </nav>

      <style jsx global>{`
        .pb-safe {
          padding-bottom: env(safe-area-inset-bottom);
        }
      `}</style>
      
      <OTPLoginModal 
        open={isLoginOpen} 
        onOpenChange={setIsLoginOpen}
        onComplete={() => {
          // If they wanted to go to profile, let them, or just stay here
        }}
      />
    </>
  );
}

export default function StoreNavigation() {
  return (
    <Suspense fallback={null}>
      <NavigationContent />
    </Suspense>
  );
}
