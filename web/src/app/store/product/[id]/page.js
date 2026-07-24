"use client";

// ============================================================================
// KOI STORE - Product detail
// A health-journal reading experience: cinematic hero → trust module → the
// full editorial story (verdict, ingredients, nutrition, comparison, fit,
// usage, science, transparency, community, related).
//
// Business logic preserved: fetchAllProducts(), cart, routing. Adds a curated
// fallback so a product link never dead-loops on an empty DB, and finally
// wires Add-to-Cart (which the old page never did).
// ============================================================================

import React, { useEffect, useMemo, useRef, useState, use } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ShoppingBag, Leaf } from "lucide-react";
import { fetchAllProducts } from "@/lib/data/productFetcher";
import { FALLBACK_PRODUCTS } from "@/components/store/shop/shopData";
import { buildProductVM } from "@/components/store/product/productData";
import { useCartStore } from "@/store/cartStore";
import { C, HEADING } from "@/components/store/landing/tokens";
import ProductHero from "@/components/store/product/ProductHero";
import TrustBadge from "@/components/store/product/TrustBadge";
import { StickyBuyBar } from "@/components/store/product/BuyPanel";
import {
  WhyEarned, Verdict, IngredientIntelligence, NutritionExplained,
  HealthComparison, Personas, UsageTimeline, ScientificInsights,
  Transparency, Community, RelatedShelf,
} from "@/components/store/product/ProductStory";

function TopBar() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const items = useCartStore((s) => s.items);
  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 0);
    return () => clearTimeout(t);
  }, []);
  const count = mounted ? items.reduce((n, i) => n + i.quantity, 0) : 0;

  return (
    <header className="sticky top-0 z-50 border-b border-[#083D2D]/8 backdrop-blur-xl" style={{ background: "rgba(249,248,244,0.82)" }}>
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 sm:px-6">
        <button onClick={() => router.back()} aria-label="Go back" className="grid h-9 w-9 place-items-center rounded-full border border-[#083D2D]/10 bg-white/60 text-[#083D2D] transition-colors hover:bg-white">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <button onClick={() => router.push("/store/shop")} className="text-[15px] font-extrabold tracking-tight text-[#083D2D]" style={HEADING}>KOI</button>
        <button onClick={() => router.push("/store/cart")} aria-label="Cart" className="relative grid h-9 w-9 place-items-center rounded-full bg-[#083D2D] text-white transition-transform hover:-translate-y-0.5">
          <ShoppingBag className="h-4 w-4" />
          {count > 0 && (
            <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full px-1 text-[9px] font-extrabold text-[#083D2D]" style={{ background: C.lime }}>{count}</span>
          )}
        </button>
      </div>
    </header>
  );
}

export default function ProductDetailPage({ params }) {
  const { id } = use(params);
  const router = useRouter();
  const [pool, setPool] = useState(FALLBACK_PRODUCTS);
  const [loaded, setLoaded] = useState(false);
  const sentinel = useRef(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const data = await fetchAllProducts();
        if (alive && data && data.length) {
          setPool([...FALLBACK_PRODUCTS, ...data]);
        }
      } catch { /* keep fallback */ }
      finally { if (alive) setLoaded(true); }
    })();
    return () => { alive = false; };
  }, []);

  const base = useMemo(() => pool.find((x) => x.id === id), [pool, id]);
  const vm = useMemo(() => (base ? buildProductVM(base, pool) : null), [base, pool]);

  const related = useMemo(() => {
    if (!base) return [];
    const rel = pool.filter((x) => x.id !== id && (x.category === base.category || (x.goalTags || []).some((g) => (base.goalTags || []).includes(g))));
    const fill = pool.filter((x) => x.id !== id && !rel.includes(x));
    return [...rel, ...fill].slice(0, 6);
  }, [pool, base, id]);

  const selectProduct = (p) => router.push(`/store/product/${p.id}`);

  // Loading (only until fetch resolves and only if not already in fallback)
  if (!vm && !loaded) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center" style={{ background: C.offwhite }}>
        <Leaf className="mb-4 h-8 w-8 animate-bounce" style={{ color: C.forest }} />
        <p className="text-[15px] font-semibold text-[#083D2D]" style={{ fontFamily: "var(--font-koi-body)" }}>Loading product…</p>
      </div>
    );
  }

  // Not found
  if (!vm) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-6 text-center" style={{ background: C.offwhite }}>
        <h1 className="text-[28px] font-extrabold text-[#083D2D]" style={HEADING}>Product not found</h1>
        <p className="mt-2 text-[15px] text-[#083D2D]/55">This item may have been delisted or the link is out of date.</p>
        <button onClick={() => router.push("/store/shop")} className="mt-6 rounded-full px-6 py-3 text-[14px] font-bold text-white" style={{ background: C.forest }}>Back to shop</button>
      </div>
    );
  }

  return (
    <div className="koi-product relative w-full overflow-x-clip pb-28" style={{ background: C.offwhite }}>
      <TopBar />

      <main>
        <ProductHero product={vm} />
        <div ref={sentinel} aria-hidden="true" className="h-0" />

        <TrustBadge trust={vm.trust} />
        <WhyEarned reasons={vm.reasons} />
        <Verdict verdict={vm.verdict} />
        <IngredientIntelligence ingredients={vm.ingredients} timeline={vm.ingredientTimeline} />
        <NutritionExplained nutrition={vm.nutrition} />
        <HealthComparison comparison={vm.comparison} name={vm.name} />
        <Personas personas={vm.personas} />
        <UsageTimeline usage={vm.usage} pairings={vm.pairings} />
        <ScientificInsights science={vm.science} />
        <Transparency items={vm.transparency} />
        <Community community={vm.community} />
        <RelatedShelf products={related} onSelect={selectProduct} />
      </main>

      <StickyBuyBar product={vm} sentinelRef={sentinel} />

      <style jsx global>{`
        @keyframes koi-float {
          0%, 100% { transform: translate3d(0, 0, 0); }
          50% { transform: translate3d(0, -12px, 0); }
        }
        .hide-scrollbar::-webkit-scrollbar { display: none; }
        .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        @media (prefers-reduced-motion: reduce) {
          .koi-product *, .koi-product *::before, .koi-product *::after {
            animation-duration: 0.001ms !important;
            animation-iteration-count: 1 !important;
            transition-duration: 0.001ms !important;
          }
        }
      `}</style>
    </div>
  );
}
