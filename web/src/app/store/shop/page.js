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

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { C } from "@/components/store/landing/tokens";
import { getSeedCatalogue, GOALS, INGREDIENTS, SORTS } from "@/components/store/shop/shopData";
import { useCatalogue } from "@/lib/data/useCatalogue";
import { averageScore } from "@/lib/score";
import CommandSearch from "@/components/store/shop/CommandSearch";
import { OPEN_SHOP_SEARCH } from "@/components/store/shell/StoreHeader";
import { demandTerms } from "@/lib/demand/terms";
import { reportDemand } from "@/lib/demand/report";
import { GoalSetupModal } from "@/components/store/shop/GoalSetup";
import PersonalShelves from "@/components/store/shop/PersonalShelves";
import IntentChips from "@/components/store/shop/IntentChips";
import {
  interpret, resolveIntent, describeIntent, removeFromIntent, suggestRelaxations, isEmptyIntent, adoptRefinement,
} from "@/lib/ai/intent";
import { CAUTIONS } from "@/lib/recommendation/reasons";
import ConnectSwiggy from "@/components/store/marketplace/ConnectSwiggy";
import { useLocation } from "@/contexts/LocationContext";
import { useCatalogueSupply } from "@/lib/marketplace/useCatalogueSupply";
import { attachSupply } from "@/lib/marketplace/browser";
import { useGoalStore } from "@/store/goalStore";
import {
  FeaturedEditorial, Shelf, GoalRail, IngredientStrip,
  FilterBar, FilterDrawer, ProductGrid,
} from "@/components/store/shop/ShopSections";
import { KoiScoreModal, CompareModal, WhyKoiDrawer } from "@/components/store/shop/ProductOverlays";
import ShelfHead from "@/components/store/shop/ShelfHead";
import { nutrientValue } from "@/components/store/shop/ShopProductCard";
import { useEmber } from "@/components/store/ember/Ember";
import { useKoiVoice } from "@/store/koiVoiceStore";
import { Flip } from "@/lib/motion/koiMotion";
import { useBarFacts } from "@/components/store/shell/useBarPrompt";

// The lenses: each is a sentence KOI reads with the intent engine, exactly as if
// the shopper had typed it. Kept to the ones the engine understands.
const LENSES = ["High Protein", "No Palm Oil", "Low Sugar", "Gut Health", "Kids Nutrition", "Post-Workout", "No Maida"];

// KOI's lines on the shelf. House rule: no numbers in KOI's mouth.
const LINES = {
  open: "Ask for what you need, or pick a lens. I’ll pull focus.",
  fit: "These fit what you asked. I’ve ringed where to start.",
  fitUnverified: "These fit. A few labels don’t say enough for me to vouch for them, so I’ve marked those.",
  none: "Nothing on the shelf fits that yet. Loosen one thing and I’ll look again.",
};


export default function ShopPage() {
  const router = useRouter();
  const ember = useEmber();
  const say = useKoiVoice((s) => s.say);

  // The camera: a Flip state captured just before focus changes, played by the
  // grid once React has committed the new shelf (ShopSections → ProductGrid).
  const flipState = useRef(null);
  const settleLine = useRef(null);
  const capture = () => {
    flipState.current = Flip.getState(document.querySelectorAll(".koi-shop [data-flip-id]"));
  };
  const takeFlip = () => {
    const s = flipState.current;
    flipState.current = null;
    return s;
  };
  const timers = useRef([]);
  const later = (fn, ms) => timers.current.push(setTimeout(fn, ms));
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const [activeLens, setActiveLens] = useState(null);

  // ── Data ──
  // Seed catalogue for an instant first paint (empty in production - see
  // getSeedCatalogue), then live products merged in, live winning on id. Same
  // hook the landing page uses, so both pages agree on what the catalogue is
  // and on the difference between "still loading" and "genuinely empty".
  const { products: screened } = useCatalogue(getSeedCatalogue);

  // Supply for the whole grid: ONE request for the zone, not one per card.
  // Bumping supplyKey re-asks after a connection changes, because the same
  // zone is then answered at the shopper's own address rather than KOI's.
  const { pincode } = useLocation();
  const [supplyKey, setSupplyKey] = useState(0);
  const supply = useCatalogueSupply(pincode, supplyKey);

  // Availability rides on top of the screened catalogue; it never filters it.
  // A product KOI screened is still a product KOI screened when nobody can say
  // whether it is in stock — see candidateGenerator, which excludes only
  // `unavailable` and keeps `unknown`.
  const products = useMemo(
    () => attachSupply(screened, supply.items),
    [screened, supply.items]
  );

  // ── Filter / sort state (preserved model + query/brand context) ──
  const [activeCategory, setActiveCategory] = useState("All");
  const [activeGoal, setActiveGoal] = useState(null);
  const [activeBrand, setActiveBrand] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  // The KOI bar builds on the search ("Like “oats”, but cheaper").
  useBarFacts({ query: searchQuery.trim().slice(0, 40) || null });
  const [activeSort, setActiveSort] = useState("Recommended");
  const [filterPrice, setFilterPrice] = useState("All");
  const [filterScore, setFilterScore] = useState("All");
  const [filterDietary, setFilterDietary] = useState([]);

  // What KOI understood the last typed query to mean. Null when the shopper has
  // not searched, or when nothing structured could be read out of the text — in
  // which case `searchQuery` carries the raw string and behaves as it always has.
  const [intent, setIntent] = useState(null);
  // The search's whole reading, before any chip was taken off (for "Put them back").
  const [asked, setAsked] = useState(null);

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

  // ⌘K / Ctrl+K, or the store header's search, summons the command search.
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    const onHeader = () => setSearchOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_SHOP_SEARCH, onHeader);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_SHOP_SEARCH, onHeader);
    };
  }, []);

  const categories = useMemo(() => {
    const set = Array.from(new Set(products.map((p) => p.category).filter(Boolean)));
    return ["All", ...set];
  }, [products]);

  // An interpreted query, resolved against the catalogue by the KRE's own
  // eligibility stage. `ids` is null when the intent constrains nothing, which
  // leaves the grid exactly as it was. Hard constraints — allergens, diet type —
  // are eliminated in there, never ranked down here.
  const resolved = useMemo(
    () => resolveIntent(products, intent, goalProfile),
    [products, intent, goalProfile]
  );

  const intentChips = useMemo(() => describeIntent(intent), [intent]);

  // ── Only what this shop can actually sell ─────────────────────────────────
  // The ingredient strip and the goal rail were written lists. Tapping one
  // searched for it, and a word the catalogue cannot answer left the grid
  // unfiltered — so "A2 Ghee" looked like a shelf and delivered everything.
  // Each is now kept only when it names something in stock, by the same reading
  // the tap itself does (interpret + resolveIntent for an ingredient, the
  // product's own goal tags for a goal).
  const ingredientsForSale = useMemo(
    () => INGREDIENTS.filter(({ name }) => {
      const ids = resolveIntent(products, interpret(name), goalProfile).ids;
      return ids instanceof Set && ids.size > 0;
    }),
    [products, goalProfile],
  );

  const goalsForSale = useMemo(
    () => GOALS.filter(({ name }) => products.some((p) => [...(p.goals || []), ...(p.goalTags || []), ...(p.tags || [])]
      .filter(Boolean)
      .some((tag) => String(tag).toLowerCase() === name.toLowerCase()))),
    [products],
  );

  // Preserved filter + sort logic (extended with query + brand + interpreted intent)
  const filteredProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const allowed = resolved.ids;
    return products
      .filter((p) => {
        if (allowed && !allowed.has(p.id)) return false;
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
  }, [products, resolved, activeCategory, activeGoal, activeBrand, searchQuery, filterPrice, filterScore, filterDietary, activeSort]);

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

  // KOI pulls focus: it starts reading, the grid moves, then it points (onSettled).
  const pullFocus = (reading = true) => {
    capture();
    ember.mark(null);
    if (reading) ember.status("Reading labels");
    settleLine.current = reading ? "focus" : "open";
    // A focus change that left the shelf exactly as it was never reaches the
    // grid; KOI still has to stop reading.
    later(() => {
      if (!settleLine.current) return;
      settleLine.current = null;
      flipState.current = null;
      ember.status(null);
      ember.home();
    }, 1800);
  };

  const clearEverything = () => {
    pullFocus(false);
    setActiveLens(null);
    setActiveCategory("All");
    setActiveGoal(null);
    setActiveBrand(null);
    setSearchQuery("");
    setIntent(null);
    clearDrawerFilters();
  };

  const contextLabel = activeGoal || activeBrand || (searchQuery ? `“${searchQuery}”` : null);
  const clearContext = () => { pullFocus(false); setActiveLens(null); setActiveGoal(null); setActiveBrand(null); setSearchQuery(""); setIntent(null); setAsked(null); };

  const selectProduct = (p) => router.push(`/store/product/${p.id}`);

  // Two frames, because an interpreted query scrolls to a row that does not
  // exist until React has committed the new intent.
  const scrollToId = (id) =>
    requestAnimationFrame(() =>
      requestAnimationFrame(() =>
        document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" })
      )
    );

  const scrollToGrid = () => scrollToId("grid");

  // One utterance can carry several constraints ("post workout, no dairy, under
  // ₹200"), so an interpreted query replaces the old single-slot handoff rather
  // than competing with it. `goal` and `brand` remain single-slot because a tile
  // tap really is one thing.
  const applyIntent = (next) => {
    const narrowing = next && !isEmptyIntent(next);
    // An intent that narrows nothing is still worth keeping if it recorded a
    // restriction KOI could not apply — that warning must reach the shopper.
    const meaningful = Boolean(next && (narrowing || next.unresolved.length));

    setIntent(meaningful ? next : null);
    // The whole reading, so chips taken off can be put back (States board).
    setAsked(meaningful ? next : null);
    // A sentence must never be used as a substring again — that is the bug this
    // replaces. When the intent narrows, resolveIntent has already applied any
    // residual word; otherwise that word is all there is to search on.
    setSearchQuery(narrowing ? "" : (next?.text || ""));
    if (narrowing && next.view.sort) setActiveSort(next.view.sort);
    setActiveGoal(null);
    setActiveBrand(null);
    return meaningful;
  };

  // A model's refinement of the reading already on screen (Phase 4.1). It can
  // only tighten it (adoptRefinement), and it is dropped if the shopper has
  // searched again meanwhile. With no model configured, or signed out, the
  // route answers "nothing to refine" and the grid does not move.
  const latestQuery = useRef(null);
  const refineSearch = async (query, local) => {
    latestQuery.current = query;
    try {
      const response = await fetch("/api/assistant/interpret", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: query }),
      });
      if (!response.ok) return;
      const body = await response.json();
      if (!body?.refined || latestQuery.current !== query) return;
      const merged = adoptRefinement(local, body.intent, query);
      const substance = ({ profile, view, text, unresolved }) => JSON.stringify({ profile, view, text, unresolved });
      if (substance(merged) !== substance(local)) applyIntent(merged);
    } catch {
      // The deterministic reading stands.
    }
  };

  const applyFromSearch = ({ query, goal, brand, intent: incoming, lens = null }) => {
    let readBack = false;
    pullFocus(true);
    setActiveLens(lens);
    if (goal !== undefined) { setActiveGoal(goal); setActiveBrand(null); setSearchQuery(""); setIntent(null); setAsked(null); }
    else if (brand !== undefined) { setActiveBrand(brand); setActiveGoal(null); setSearchQuery(""); setIntent(null); setAsked(null); }
    else if (incoming !== undefined || query !== undefined) {
      const next = incoming !== undefined ? incoming : interpret(query);
      readBack = applyIntent(next);
      if (query && query.length <= 200) refineSearch(query, next);
      // The words the catalogue could not answer, counted to decide what to
      // stock next. Never the sentence — see lib/demand/terms.js.
      reportDemand(demandTerms(next, products));
    }
    setActiveCategory("All");
    // Land on the chip row when there is one to read: it explains why the grid
    // below it changed. Otherwise the grid itself is the answer.
    scrollToId(readBack ? "intent" : "grid");
  };

  // Words typed into the header's search on another page arrive as ?q=. They
  // were dropped before — nothing here read them. Read once, after the
  // catalogue is in, so the demand count is taken against real products.
  const askedQuery = useRef(null);
  useEffect(() => {
    if (askedQuery.current !== null || !products.length) return undefined;
    const q = new URLSearchParams(window.location.search).get("q")?.trim() ?? "";
    askedQuery.current = q;
    if (!q) return undefined;
    const t = setTimeout(() => applyFromSearch({ query: q.slice(0, 200) }), 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on the first catalogue
  }, [products.length]);

  // Chips taken off come back in one tap, as the search first read them.
  const putBack = () => {
    if (!asked) return;
    pullFocus(true);
    applyIntent(asked);
    scrollToId("intent");
  };

  const removeChip = (chip) => {
    pullFocus(true);
    setActiveLens(null);
    const next = removeFromIntent(intent, chip);
    setIntent(!isEmptyIntent(next) || next.unresolved.length ? next : null);
  };

  // Only computed when the grid came back empty, so the extra passes never run
  // on the normal path.
  const relaxations = useMemo(
    () => (intent && resolved.ids && resolved.ids.size === 0
      ? suggestRelaxations(products, intent, goalProfile, intentChips, removeFromIntent)
      : []),
    [intent, resolved, products, goalProfile, intentChips]
  );

  // How many of the products on screen KOI could not check against the
  // shopper's allergens or diet. Counted over what is actually shown, after the
  // drawer filters, so the sentence matches the grid under it.
  const unverifiedNote = useMemo(() => {
    const { ids, allergens, diet } = resolved.unverified || {};
    if (!resolved.ids || !ids?.size || !filteredProducts.length) return null;
    const count = filteredProducts.filter((p) => ids.has(p.id)).length;
    return count ? CAUTIONS.unverifiedInResults(count, filteredProducts.length, allergens, diet) : null;
  }, [resolved, filteredProducts]);

  // ── KOI on the shelf ──
  const focused = Boolean(intent || activeGoal || activeBrand || searchQuery || activeCategory !== "All");
  // The grid has moved: KOI says what it found and rings where to start.
  const onSettled = (plate) => {
    const mode = settleLine.current;
    settleLine.current = null;
    if (!mode) return;
    if (mode === "open") { ember.status(null); ember.home(); say(LINES.open); return; }
    // The grid calls the onSettled of the render that committed this shelf, so
    // these are the figures it is showing.
    const count = filteredProducts.length;
    const unverified = Boolean(unverifiedNote);
    if (!count) { ember.status(null); ember.home(); say(LINES.none); return; }
    ember.status(count === 1 ? "1 match" : `${count} match`);
    say(unverified ? LINES.fitUnverified : LINES.fit);
    if (plate) later(() => ember.go(plate, ember.perch(plate, 8), () => ember.mark(plate, "ring", 8)), 650);
  };

  // KOI's opening line, and its dot let go of the shelf when the page leaves.
  useEffect(() => {
    say(LINES.open);
    return () => ember.rest();
  }, [say, ember]);

  // The KOI bar on this page asks the shelf directly (KoiBar dispatches koi:ask).
  const askRef = useRef(applyFromSearch);
  useEffect(() => { askRef.current = applyFromSearch; });
  useEffect(() => {
    const onAsk = (e) => { const q = String(e.detail ?? "").trim(); if (q) askRef.current({ query: q.slice(0, 200) }); };
    window.addEventListener("koi:ask", onAsk);
    return () => window.removeEventListener("koi:ask", onAsk);
  }, []);

  // Why a card is in focus: a figure off its own label, for the limit the
  // shopper asked about; or a warning when KOI could not check it. Never a claim
  // the data does not hold.
  const whyOf = (p) => {
    if (!resolved.ids) return null;
    if (resolved.unverified?.ids?.has(p.id)) {
      const what = [...(resolved.unverified.allergens || []), resolved.unverified.diet].filter(Boolean)[0];
      return { text: what ? `Not checked for ${String(what).toLowerCase()}` : "Not fully checked", tone: "warn" };
    }
    const v = intent?.view || {};
    if (v.minProtein != null || v.proteinClaim) { const x = nutrientValue(p, "Protein"); return x ? { text: `${x} protein / 100 g`, tone: "ok" } : null; }
    if (v.maxSugar != null || v.sugarClaim) { const x = nutrientValue(p, "Sugar"); return x ? { text: `${x} sugar / 100 g`, tone: "ok" } : null; }
    return null;
  };

  const focusName = activeLens || activeGoal || activeBrand || (intentChips[0]?.label) || (searchQuery ? `“${searchQuery}”` : null) || (activeCategory !== "All" ? activeCategory : "Your ask");
  const focusLabel = focused
    ? `${focusName} · ${filteredProducts.length} of ${products.length} in focus`
    : `Showing everything · ${products.length} products`;

  const cardHandlers = {
    onSelect: selectProduct,
    onOpenScore: setSelectedScoreProduct,
    onOpenCompare: setSelectedCompareProduct,
    onOpenInsight: setSelectedInsightProduct,
  };

  const gridTitle = contextLabel
    ? (activeGoal ? activeGoal : activeBrand ? activeBrand : "Search results")
    : intent
    ? "Search results"
    : activeCategory === "All"
    ? "All products"
    : activeCategory;

  return (
    <div className="koi-shop relative w-full overflow-x-clip" style={{ background: "var(--koi-bg)" }}>
      <main>
          {/* On the shelf: the title, the lenses, and what KOI is showing. */}
          <ShelfHead
            lenses={LENSES}
            activeLens={activeLens}
            onLens={(l) => (l ? applyFromSearch({ query: l, lens: l }) : clearContext())}
            onOpenSearch={() => setSearchOpen(true)}
            focusLabel={focusLabel}
            focused={focused}
            onClear={clearEverything}
            stats={stats}
          />

          {/* What KOI understood, as chips the shopper can take back off.
              Renders nothing until someone actually searches. */}
          <IntentChips
            chips={intentChips}
            onRemove={removeChip}
            onClearAll={clearContext}
            onPutBack={asked && intent !== asked ? putBack : null}
            cleared={Boolean(asked && !intent)}
            matchCount={resolved.ids ? filteredProducts.length : null}
            relaxations={relaxations}
            unverifiedNote={unverifiedNote}
          />

          {/* Whether KOI can answer "can I get this" at all. Renders nothing
              when signed out or when no supply source is configured, so the
              honest default state of the shop is unchanged. */}
          <div className="mx-auto w-full max-w-[1440px] px-[clamp(16px,4vw,52px)]">
            <ConnectSwiggy next="/store/shop" compact onChange={() => setSupplyKey((k) => k + 1)} />
            {/* A provider declining the area is a real answer and worth saying.
                Everything still renders — KOI screened these products either
                way, and not delivering here is not a fact about the food. */}
            {supply.serviceability === "not_serviceable" && (
              <p className="mt-3 text-[12px] font-semibold" style={{ color: "#9B3A25" }}>
                Swiggy doesn&apos;t deliver to {pincode} yet, so we can&apos;t show what&apos;s in
                stock near you. Everything below is still screened by KOI.
              </p>
            )}
          </div>

          {/* Sticky filters + the shelf itself */}
          <FilterBar
            categories={categories}
            activeCategory={activeCategory}
            setActiveCategory={(c) => { pullFocus(false); setActiveCategory(c); }}
            sorts={SORTS}
            activeSort={activeSort}
            setActiveSort={(s) => { capture(); setActiveSort(s); }}
            onOpenFilter={() => setIsFilterOpen(true)}
            activeFilterCount={activeFilterCount}
            count={filteredProducts.length}
            context={contextLabel}
            onClearContext={clearContext}
          />
          <ProductGrid
            title={gridTitle}
            products={filteredProducts}
            handlers={cardHandlers}
            onClear={clearEverything}
            catalogueEmpty={products.length === 0}
            whyOf={whyOf}
            takeFlip={takeFlip}
            onSettled={onSettled}
          />

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

          {ingredientsForSale.length > 0 && (
            <IngredientStrip ingredients={ingredientsForSale} onPick={(name) => applyFromSearch({ query: name })} />
          )}

          <Shelf
            eyebrow="Fresh from verification"
            title="Recently verified"
            subtitle="The latest to clear every KOI check."
            products={recentlyVerified}
            handlers={cardHandlers}
          />

          {/* Set a goal, KOI tunes the shelves to you; or browse by intention. */}
          <GoalRail goals={goalsForSale} activeGoal={activeGoal} onPick={(g) => { pullFocus(Boolean(g)); setActiveLens(null); setActiveGoal(g); if (g) scrollToGrid(); }} onOpenGoal={() => setGoalOpen(true)} />
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
