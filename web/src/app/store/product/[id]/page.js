"use client";

// ============================================================================
// KOI STORE - Product detail
// A health-journal reading experience: cinematic hero → trust module → the
// full editorial story (verdict, ingredients, nutrition, comparison, fit,
// usage, science, transparency, community, related).
//
// Business logic preserved: fetchAllProducts(), cart, routing. Adds a curated
// fallback so a product link never dead-loops on an empty DB, and finally
// wires Add-to-Cart (which the old page never did). The page wears the store's
// one header now (StoreChrome); its own back/KOI/cart top bar is gone.
// ============================================================================

import React, { useEffect, useMemo, useRef, useState, use } from "react";
import { useRouter } from "next/navigation";
import { Leaf } from "lucide-react";
import { getSeedCatalogue } from "@/components/store/shop/shopData";
import { useCatalogue } from "@/lib/data/useCatalogue";
import { buildProductVM } from "@/components/store/product/productData";
import { useGoalStore } from "@/store/goalStore";
import { useLocation } from "@/contexts/LocationContext";
import { useProductSupply } from "@/lib/marketplace/useProductSupply";
import SupplyPanel from "@/components/store/product/SupplyPanel";
import { C, HEADING } from "@/components/store/landing/tokens";
import CloseUp from "@/components/store/product/CloseUp";
import TrustBadge from "@/components/store/product/TrustBadge";
import { StickyBuyBar } from "@/components/store/product/BuyPanel";
import {
  WhyEarned, Verdict, IngredientIntelligence, NutritionExplained,
  HealthComparison, Personas, UsageTimeline, ScientificInsights,
  Transparency, Community, RelatedShelf, SwapShelf, InContext,
} from "@/components/store/product/ProductStory";
import { getSupabaseClient } from "@/lib/supabase/client";
import { isTestSku } from "@/lib/data/testCatalogue";
import { swapsFor } from "@/lib/food/swaps";

export default function ProductDetailPage({ params }) {
  const { id } = use(params);
  const router = useRouter();
  const sentinel = useRef(null);
  const { products: pool, status } = useCatalogue(getSeedCatalogue);
  const loaded = status !== "loading";

  const base = useMemo(() => pool.find((x) => x.id === id), [pool, id]);

  // Live supply, resolved because the shopper OPENED this product. A verify
  // costs one provider search per SKU, so nothing above this page may trigger
  // it — not a grid, not a hover, not a shelf render.
  const { pincode } = useLocation();
  const goalProfile = useGoalStore((s) => s.profile);
  const supply = useProductSupply(base, pincode, pool, goalProfile);
  // The shopper's goal decides which figures the serving panel leads with.
  const vm = useMemo(() => (base ? buildProductVM(base, pool, goalProfile) : null), [base, pool, goalProfile]);

  // Swaps with numbers (Phase 5.1): the recorded edges from this SKU. The
  // local test catalogue has no edges and its ids are not uuids, so it is skipped.
  const [edges, setEdges] = useState({ skuId: null, rows: [] });
  const skuId = base?.skuId ?? null;
  useEffect(() => {
    if (!skuId || isTestSku(skuId)) return undefined;
    let live = true;
    getSupabaseClient()
      .schema("food")
      .from("substitution_edge")
      .select("to_sku, reason, comparability, basis")
      .eq("from_sku", skuId)
      .then(({ data }) => { if (live) setEdges({ skuId, rows: data ?? [] }); });
    return () => { live = false; };
  }, [skuId]);
  // In context (plan §11.2): only when the route is switched on and has lines.
  const [context, setContext] = useState({ skuId: null, value: null });
  useEffect(() => {
    if (!skuId || isTestSku(skuId)) return undefined;
    let live = true;
    fetch(`/api/products/relative?skuId=${encodeURIComponent(skuId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => { if (live) setContext({ skuId, value: body?.enabled ? body.context : null }); })
      .catch(() => {});
    return () => { live = false; };
  }, [skuId]);
  const inContext = context.skuId === skuId ? context.value : null;

  const swaps = useMemo(
    () => (base && edges.skuId === base.skuId ? swapsFor({ product: base, edges: edges.rows, catalogue: pool }) : []),
    [base, edges, pool],
  );

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
      <div className="flex min-h-screen flex-col items-center justify-center" style={{ background: "var(--koi-bg)" }}>
        <Leaf className="mb-4 h-8 w-8 animate-bounce" style={{ color: C.forest }} />
        <p className="text-[15px] font-semibold text-[#083D2D]" style={{ fontFamily: "var(--font-koi-body)" }}>Loading product…</p>
      </div>
    );
  }

  // Not found
  if (!vm) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-6 text-center" style={{ background: "var(--koi-bg)" }}>
        <h1 className="text-[28px] font-extrabold text-[#083D2D]" style={HEADING}>Product not found</h1>
        <p className="mt-2 text-[15px] text-[#083D2D]/55">This item may have been delisted or the link is out of date.</p>
        <button onClick={() => router.push("/store/shop")} className="mt-6 rounded-full px-6 py-3 text-[14px] font-bold text-white" style={{ background: C.forest }}>Back to shop</button>
      </div>
    );
  }

  return (
    <div className="koi-product ks-page-pad relative w-full overflow-x-clip pb-16" style={{ background: "var(--koi-bg)" }}>
      <main>
        {/* The close-up: the pack, the label read, the score and the purchase. */}
        <CloseUp product={{ ...vm, availability: supply.availability, deliveryEta: supply.deliveryEta }} />
        <div ref={sentinel} aria-hidden="true" className="h-0" />

        {/* Availability sits directly under the hero, above every editorial
            section: a shopper deciding whether they can buy this should not
            have to read the ingredient breakdown first. */}
        <section className="mx-auto max-w-5xl px-4 pt-6 sm:px-6">
          <SupplyPanel supply={supply} pincode={pincode} />
        </section>

        {/* A section renders only when the product has something true to put
            in it. These used to render for every product, filled with
            category defaults, invented reviews and stamped copy — see
            productData.js. An absent section is the honest version. */}
        <TrustBadge trust={vm.trust} />
        {vm.reasons.length > 0 && <WhyEarned reasons={vm.reasons} />}
        {vm.verdict.quote && <Verdict verdict={vm.verdict} />}
        {vm.ingredients.length > 0 && (
          <IngredientIntelligence ingredients={vm.ingredients} timeline={vm.ingredientTimeline} evidence={vm.ingredientsEvidence} />
        )}
        <NutritionExplained nutrition={vm.nutrition} />
        {inContext && <InContext context={inContext} />}
        {swaps.length > 0 && <SwapShelf swaps={swaps} onSelect={selectProduct} />}
        {vm.comparison.length > 0 && <HealthComparison comparison={vm.comparison} name={vm.name} />}
        {(vm.personas.for.length > 0 || vm.personas.goodToKnow.length > 0) && <Personas personas={vm.personas} />}
        {vm.usage.length > 0 && <UsageTimeline usage={vm.usage} pairings={vm.pairings} />}
        {vm.science.length > 0 && <ScientificInsights science={vm.science} />}
        <Transparency items={vm.transparency} />
        {vm.community.notes.length > 0 && <Community community={vm.community} />}
        <RelatedShelf products={related} onSelect={selectProduct} />
      </main>

      <StickyBuyBar
        product={{ ...vm, availability: supply.availability, deliveryEta: supply.deliveryEta }}
        sentinelRef={sentinel}
      />

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
