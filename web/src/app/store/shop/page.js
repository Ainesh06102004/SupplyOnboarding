"use client";

// ============================================================================
// KOI STORE - Shop (editorial discovery experience)
// A trust-first, magazine-grade product discovery platform built around a
// Spotlight/Raycast-style universal command search.
//
// Business logic preserved: real product fetch (fetchAllProducts), cart,
// wishlist, routing to /store/product/[id], and the original filter/sort model
// (category · goal · price · score · dietary · sort) - now extended with a
// text query + brand context surfaced by the command search.
// ============================================================================

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import EditorialNav from "@/components/store/landing/EditorialNav";
import { C } from "@/components/store/landing/tokens";
import { getSeedCatalogue, GOALS, INGREDIENTS, SORTS } from "@/components/store/shop/shopData";
import { useCatalogue } from "@/lib/data/useCatalogue";
import { averageScore } from "@/lib/score";
import CommandSearch from "@/components/store/shop/CommandSearch";
import { GoalSetupModal } from "@/components/store/shop/GoalSetup";
import PersonalShelves from "@/components/store/shop/PersonalShelves";
import { useGoalStore } from "@/store/goalStore";
import {
  ShopHero, FeaturedEditorial, Shelf, GoalRail, IngredientStrip,
  FilterBar, FilterDrawer, ProductGrid, MiniCart,
} from "@/components/store/shop/ShopSections";
import { KoiScoreModal, CompareModal, WhyKoiDrawer } from "@/components/store/shop/ProductOverlays";

const SHOP_LINKS = [
  { label: "Collections", href: "#collections" },
  { label: "Goals", href: "#goals" },
  { label: "Ingredients", href: "#ingredients" },
  { label: "Shop all", href: "#grid" },
];

export default function ShopPage() {
  const router = useRouter();

  // ── Data ──
  // Seed catalogue for an instant first paint (empty in production - see
  // getSeedCatalogue), then live products merged in, live winning on id. Same
  // hook the landing page uses, so both pages agree on what the catalogue is
  // and on the difference between "still loading" and "genuinely empty".
  const { products } = useCatalogue(getSeedCatalogue);

  // ── Filter / sort state (preserved model + query/brand context) ──
  const [activeCategory, setActiveCategory] = useState("All");
  const [activeGoal, setActiveGoal] = useState(null);
  const [activeBrand, setActiveBrand] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeSort, setActiveSort] = useState("Recommended");
  const [filterPrice, setFilterPrice] = useState("All");
  const [filterScore, setFilterScore] = useState("All");
  const [filterDietary, setFilterDietary] = useState([]);

  // ── UI state ──
  const [searchOpen, setSearchOpen] = useState(false);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [goalOpen, setGoalOpen] = useState(false);

  // Goal profile drives KRE-personalised shelves (hydrated client-side).
  const goalProfile = useGoalStore((s) => s.profile);
  const hydrateGoal = useGoalStore((s) => s.hydrate);
  const [goalMounted, setGoalMounted] = useState(false);
  useEffect(() => { 
    const t = setTimeout(() => {
      hydrateGoal(); 
      setGoalMounted(true); 
    }, 0);
    return () => clearTimeout(t);
  }, [hydrateGoal]);
  const hasGoalProfile = goalMounted && !!goalProfile;
  const [selectedScoreProduct, setSelectedScoreProduct] = useState(null);
  const [selectedCompareProduct, setSelectedCompareProduct] = useState(null);
  const [selectedInsightProduct, setSelectedInsightProduct] = useState(null);

  // ⌘K / Ctrl+K to summon the command search
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const categories = useMemo(() => {
    const set = Array.from(new Set(products.map((p) => p.category).filter(Boolean)));
    return ["All", ...set];
  }, [products]);

  // Preserved filter + sort logic (extended with query + brand)
  const filteredProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return products
      .filter((p) => {
        if (activeCategory !== "All" && p.category !== activeCategory) return false;
        if (activeGoal) {
          const allTags = [...(p.goals || []), ...(p.goalTags || []), ...(p.tags || [])]
            .filter(Boolean)
            .map((t) => t.toLowerCase());
          if (!allTags.includes(activeGoal.toLowerCase())) return false;
        }
        if (activeBrand && p.brand !== activeBrand) return false;
        if (q) {
          const hay = [p.name, p.brand, p.category, ...(p.tags || []), ...(p.goals || []), ...(p.goalTags || [])].join(" ").toLowerCase();
          if (!hay.includes(q)) return false;
        }
        if (filterPrice !== "All") {
          if (filterPrice === "Under ₹200" && p.price >= 200) return false;
          if (filterPrice === "₹200–500" && (p.price < 200 || p.price > 500)) return false;
          if (filterPrice === "₹500+" && p.price <= 500) return false;
        }
        if (filterScore !== "All") {
          const minScore = parseInt(filterScore.replace("+", ""), 10);
          if (p.score < minScore) return false;
        }
        if (filterDietary.length > 0) {
          const ok = filterDietary.every((d) => (p.dietary || []).includes(d));
          if (!ok) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (activeSort === "Highest KOI Score") return b.score - a.score;
        if (activeSort === "Price Low to High") return a.price - b.price;
        if (activeSort === "Newest") return String(b.id).localeCompare(String(a.id));
        if (activeSort === "Recommended") return (b.recommended ? 1 : 0) - (a.recommended ? 1 : 0);
        return 0;
      });
  }, [products, activeCategory, activeGoal, activeBrand, searchQuery, filterPrice, filterScore, filterDietary, activeSort]);

  // Editorial shelves
  const recommended = useMemo(() => products.filter((p) => p.recommended), [products]);
  const topRated = useMemo(() => [...products].filter((p) => p.score >= 90).sort((a, b) => b.score - a.score), [products]);
  const recentlyVerified = useMemo(() => [...products].reverse().slice(0, 8), [products]);
  const featured = topRated[0] || products[0] || null;

  const stats = useMemo(() => {
    // Average only over products that actually carry a score — an unscored
    // product must not drag the average down as though it scored zero. The
    // previous guard here said exactly that and then did the opposite, because
    // Number(null) is 0 and Number.isFinite(0) is true. See lib/score.js.
    return {
      count: products.length,
      avg: averageScore(products),
      brands: new Set(products.map((p) => p.brand).filter(Boolean)).size,
    };
  }, [products]);

  const toggleDietary = (item) =>
    setFilterDietary((prev) => (prev.includes(item) ? prev.filter((d) => d !== item) : [...prev, item]));

  const activeFilterCount = (filterPrice !== "All" ? 1 : 0) + (filterScore !== "All" ? 1 : 0) + filterDietary.length;

  const clearDrawerFilters = () => {
    setFilterPrice("All");
    setFilterScore("All");
    setFilterDietary([]);
    setIsFilterOpen(false);
  };

  const clearEverything = () => {
    setActiveCategory("All");
    setActiveGoal(null);
    setActiveBrand(null);
    setSearchQuery("");
    clearDrawerFilters();
  };

  const contextLabel = activeGoal || activeBrand || (searchQuery ? `“${searchQuery}”` : null);
  const clearContext = () => { setActiveGoal(null); setActiveBrand(null); setSearchQuery(""); };

  const selectProduct = (p) => router.push(`/store/product/${p.id}`);

  const scrollToGrid = () =>
    requestAnimationFrame(() => document.getElementById("grid")?.scrollIntoView({ behavior: "smooth", block: "start" }));

  const applyFromSearch = ({ query, goal, brand }) => {
    if (goal !== undefined) { setActiveGoal(goal); setActiveBrand(null); setSearchQuery(""); }
    else if (brand !== undefined) { setActiveBrand(brand); setActiveGoal(null); setSearchQuery(""); }
    else if (query !== undefined) { setSearchQuery(query); setActiveGoal(null); setActiveBrand(null); }
    setActiveCategory("All");
    scrollToGrid();
  };

  const cardHandlers = {
    onSelect: selectProduct,
    onOpenScore: setSelectedScoreProduct,
    onOpenCompare: setSelectedCompareProduct,
    onOpenInsight: setSelectedInsightProduct,
  };

  const gridTitle = contextLabel
    ? (activeGoal ? activeGoal : activeBrand ? activeBrand : "Search results")
    : activeCategory === "All"
    ? "All products"
    : activeCategory;

  return (
    <div className="koi-shop relative w-full overflow-x-clip" style={{ background: C.offwhite }}>
      <EditorialNav links={SHOP_LINKS} onSearchClick={() => setSearchOpen(true)} />

      <main>
          <ShopHero
            onOpenSearch={() => setSearchOpen(true)}
            onSuggest={(text) => applyFromSearch({ query: text })}
            stats={stats}
          />

          {/* Start the journey: set a goal, KOI tunes to you, then keep scrolling */}
          <GoalRail goals={GOALS} activeGoal={activeGoal} onPick={(g) => { setActiveGoal(g); if (g) scrollToGrid(); }} onOpenGoal={() => setGoalOpen(true)} />

          {/* KRE-personalised shelves (renders only when a goal profile exists) */}
          <PersonalShelves products={products} />

          {/* Generic shortlist for shoppers who haven't set a goal yet */}
          {!hasGoalProfile && (
            <Shelf
              id="collections-picks"
              eyebrow="Picked for you"
              title="Based on your goals"
              subtitle="A handcrafted shortlist, re-scored every week."
              products={recommended.length ? recommended : topRated}
              handlers={cardHandlers}
            />
          )}

          <FeaturedEditorial product={featured} onSelect={selectProduct} />

          <Shelf
            eyebrow="Top of the standard"
            title="Earned its place this week"
            subtitle="Only products above a 90 KOI score."
            products={topRated}
            handlers={cardHandlers}
            background={C.mint}
          />

          <IngredientStrip ingredients={INGREDIENTS} onPick={(name) => applyFromSearch({ query: name })} />

          <Shelf
            eyebrow="Fresh from verification"
            title="Recently verified"
            subtitle="The latest to clear every KOI check."
            products={recentlyVerified}
            handlers={cardHandlers}
          />

          {/* Sticky filters + full catalogue */}
          <FilterBar
            categories={categories}
            activeCategory={activeCategory}
            setActiveCategory={setActiveCategory}
            sorts={SORTS}
            activeSort={activeSort}
            setActiveSort={setActiveSort}
            onOpenFilter={() => setIsFilterOpen(true)}
            activeFilterCount={activeFilterCount}
            count={filteredProducts.length}
            context={contextLabel}
            onClearContext={clearContext}
          />
          <ProductGrid title={gridTitle} products={filteredProducts} handlers={cardHandlers} onClear={clearEverything} catalogueEmpty={products.length === 0} />
      </main>

      {/* Universal command search */}
      <CommandSearch
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        products={products}
        onSelectProduct={selectProduct}
        onQuery={applyFromSearch}
      />

      {/* Goal personalisation */}
      <GoalSetupModal open={goalOpen} onClose={() => setGoalOpen(false)} />

      {/* Filter drawer */}
      <FilterDrawer
        open={isFilterOpen}
        onClose={() => setIsFilterOpen(false)}
        filterPrice={filterPrice}
        setFilterPrice={setFilterPrice}
        filterScore={filterScore}
        setFilterScore={setFilterScore}
        filterDietary={filterDietary}
        toggleDietary={toggleDietary}
        onClear={clearDrawerFilters}
      />

      {/* Intelligence overlays */}
      <KoiScoreModal product={selectedScoreProduct} onClose={() => setSelectedScoreProduct(null)} />
      <CompareModal product={selectedCompareProduct} onClose={() => setSelectedCompareProduct(null)} />
      <WhyKoiDrawer product={selectedInsightProduct} onClose={() => setSelectedInsightProduct(null)} />

      <MiniCart />

      {/* Shared keyframes + utilities (GPU-accelerated, motion-aware) */}
      <style jsx global>{`
        @keyframes koi-marquee {
          from { transform: translate3d(0, 0, 0); }
          to { transform: translate3d(-50%, 0, 0); }
        }
        @keyframes koi-float {
          0%, 100% { transform: translate3d(0, 0, 0); }
          50% { transform: translate3d(0, -14px, 0); }
        }
        @keyframes koi-spin-slow {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes koi-caret {
          0%, 49% { opacity: 1; }
          50%, 100% { opacity: 0; }
        }
        .hide-scrollbar::-webkit-scrollbar { display: none; }
        .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        .koi-shop [data-pause="1"]:hover { animation-play-state: paused; }
        @media (prefers-reduced-motion: reduce) {
          .koi-shop *, .koi-shop *::before, .koi-shop *::after {
            animation-duration: 0.001ms !important;
            animation-iteration-count: 1 !important;
            transition-duration: 0.001ms !important;
          }
        }
      `}</style>
    </div>
  );
}
