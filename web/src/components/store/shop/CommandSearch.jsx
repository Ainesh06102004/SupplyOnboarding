"use client";

// ============================================================================
// KOI SHOP - Universal Command Search
// Spotlight / Raycast / Arc-grade discovery across products, goals,
// ingredients, brands and editorial. Full keyboard nav. ⌘K / Ctrl+K.
// Purely a presentation layer over the shop's real product array + filters.
// ============================================================================

import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import {
  Search, X, CornerDownLeft, ArrowUp, ArrowDown, Sparkles,
  TrendingUp, Package, Leaf, Store, Clock, BookOpen, Dumbbell, ShieldCheck,
  Sprout, Zap, Activity, Baby, Heart, Flame,
} from "lucide-react";
import { C, HEADING, BODY } from "@/components/store/landing/tokens";
import { ScoreRing } from "@/components/store/landing/primitives";
import { GOALS, INGREDIENTS, EDITORIAL, TRENDING, PLACEHOLDERS } from "./shopData";
import Image from "next/image";

const GOAL_ICONS = { Dumbbell, ShieldCheck, Sprout, Zap, Activity, Baby, Heart, Flame };
const RECENT_KEY = "koi_recent_searches";

function readRecent() {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || "[]"); } catch { return []; }
}
function pushRecent(q) {
  if (!q?.trim()) return;
  try {
    const next = [q.trim(), ...readRecent().filter((x) => x.toLowerCase() !== q.trim().toLowerCase())].slice(0, 6);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {}
}

export default function CommandSearch({ open, onClose, products = [], onSelectProduct, onQuery }) {
  const [query, setQuery] = useState("");
  const [sel, setSel] = useState(0);
  const [prevQuery, setPrevQuery] = useState("");
  const [phIndex, setPhIndex] = useState(0);
  const [recent, setRecent] = useState([]);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  if (query !== prevQuery) {
    setPrevQuery(query);
    setSel(0);
  }
  const [prevOpen, setPrevOpen] = useState(false);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setQuery("");
      setSel(0);
      setRecent(readRecent());
    }
  }



  // open lifecycle: focus, lock scroll
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => inputRef.current?.focus(), 40);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { clearTimeout(t); document.body.style.overflow = prev; };
  }, [open]);

  // rotating placeholder (only while empty)
  useEffect(() => {
    if (!open || query) return;
    const id = setInterval(() => setPhIndex((i) => (i + 1) % PLACEHOLDERS.length), 3000);
    return () => clearInterval(id);
  }, [open, query]);

  const brands = useMemo(() => Array.from(new Set(products.map((p) => p.brand).filter(Boolean))), [products]);

  const submitQuery = useCallback((text) => { pushRecent(text); onQuery?.({ query: text }); onClose?.(); }, [onQuery, onClose]);
  const goProduct = useCallback((p) => { onSelectProduct?.(p); onClose?.(); }, [onSelectProduct, onClose]);
  const goGoal = useCallback((g) => { onQuery?.({ goal: g }); onClose?.(); }, [onQuery, onClose]);
  const goBrand = useCallback((b) => { onQuery?.({ brand: b }); onClose?.(); }, [onQuery, onClose]);

  // Build display sections + a flat, index-addressed nav list.
  const { sections, flat } = useMemo(() => {
    const q = query.trim().toLowerCase();
    const secs = [];

    if (!q) {
      if (recent.length) {
        secs.push({ id: "recent", title: "Recent", kind: "chips", items: recent.map((r) => ({ label: r, icon: Clock, run: () => submitQuery(r) })) });
      }
      secs.push({ id: "trending", title: "Trending", kind: "chips", items: TRENDING.map((t) => ({ label: t, icon: TrendingUp, run: () => submitQuery(t) })) });
      secs.push({ id: "goals", title: "Shop by goal", kind: "rows", items: GOALS.slice(0, 5).map((g) => ({ label: g.name, sub: g.blurb, icon: GOAL_ICONS[g.icon] || Sparkles, run: () => goGoal(g.name) })) });
      const picks = [...products].sort((a, b) => b.score - a.score).slice(0, 4);
      if (picks.length) secs.push({ id: "picks", title: "Verified picks", kind: "products", items: picks.map((p) => ({ product: p, run: () => goProduct(p) })) });
    } else {
      // top synthetic action: search the grid for the text
      secs.push({ id: "action", title: null, kind: "action", items: [{ label: `Search for “${query.trim()}”`, sub: "See every match in the shop", icon: Search, run: () => submitQuery(query) }] });

      const prod = products
        .filter((p) => [p.name, p.brand, p.category, ...(p.tags || []), ...(p.goalTags || [])].join(" ").toLowerCase().includes(q))
        .slice(0, 5);
      if (prod.length) secs.push({ id: "products", title: "Products", kind: "products", items: prod.map((p) => ({ product: p, run: () => goProduct(p) })) });

      const goals = GOALS.filter((g) => g.name.toLowerCase().includes(q)).slice(0, 4);
      if (goals.length) secs.push({ id: "goals", title: "Goals", kind: "rows", items: goals.map((g) => ({ label: g.name, sub: g.blurb, icon: GOAL_ICONS[g.icon] || Sparkles, run: () => goGoal(g.name) })) });

      const ings = INGREDIENTS.filter((i) => i.name.toLowerCase().includes(q)).slice(0, 4);
      if (ings.length) secs.push({ id: "ings", title: "Ingredients", kind: "rows", items: ings.map((i) => ({ label: i.name, sub: i.note, icon: Leaf, run: () => submitQuery(i.name) })) });

      const brs = brands.filter((b) => b.toLowerCase().includes(q)).slice(0, 4);
      if (brs.length) secs.push({ id: "brands", title: "Brands", kind: "rows", items: brs.map((b) => ({ label: b, sub: "View brand", icon: Store, run: () => goBrand(b) })) });

      const eds = EDITORIAL.filter((e) => e.title.toLowerCase().includes(q)).slice(0, 3);
      if (eds.length) secs.push({ id: "editorial", title: "Editorial", kind: "rows", items: eds.map((e) => ({ label: e.title, sub: e.tag, icon: BookOpen, run: () => submitQuery(e.title) })) });
    }

    // flatten in render order, tagging each with its global index
    const flatList = [];
    secs.forEach((s) => s.items.forEach((it) => { it._i = flatList.length; flatList.push(it); }));
    return { sections: secs, flat: flatList };
  }, [query, recent, products, brands, submitQuery, goProduct, goGoal, goBrand]);

  // derived state handles reset: setSel(0) when query changes

  // keyboard nav
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") { e.preventDefault(); onClose?.(); }
      else if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(flat.length - 1, s + 1)); }
      else if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(0, s - 1)); }
      else if (e.key === "Enter") {
        e.preventDefault();
        const item = flat[sel];
        if (item) item.run();
        else if (query.trim()) submitQuery(query);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, flat, sel, query, onClose, submitQuery]);

  // keep active row in view
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-i="${sel}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [sel]);

  if (!open) return null;

  const hasResults = flat.length > 0;

  return (
    <div className="fixed inset-0 z-[120] flex items-start justify-center p-0 sm:p-6 sm:pt-[10vh]">
      {/* backdrop */}
      <div
        className="absolute inset-0 animate-in fade-in duration-200"
        style={{ background: "rgba(8,29,22,0.55)", backdropFilter: "blur(32px) saturate(1.2)", WebkitBackdropFilter: "blur(32px) saturate(1.2)" }}
        onClick={onClose}
      />

      {/* panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search KOI"
        className="relative flex h-full w-full max-w-2xl flex-col overflow-hidden bg-white/85 shadow-[0_40px_120px_rgba(8,29,22,0.5)] duration-300 animate-in fade-in zoom-in-95 slide-in-from-top-4 sm:h-auto sm:max-h-[76vh] sm:rounded-[28px]"
        style={{ border: "1px solid rgba(255,255,255,0.5)", backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)" }}
      >
        {/* gradient hairline top */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px" style={{ background: `linear-gradient(90deg, transparent, ${C.emerald}, ${C.lime}, transparent)` }} />

        {/* input */}
        <div className="flex items-center gap-3 border-b border-[#083D2D]/10 px-5 py-4 sm:px-6">
          <Search className="h-5 w-5 shrink-0" style={{ color: C.emerald }} strokeWidth={2.4} />
          <div className="relative flex-1">
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search products, goals, ingredients and brands"
              className="w-full bg-transparent text-[18px] font-semibold text-[#083D2D] outline-none sm:text-[20px]"
              style={HEADING}
            />
            {!query && (
              <span key={phIndex} className="pointer-events-none absolute inset-0 flex items-center text-[18px] font-semibold text-[#083D2D]/35 duration-500 animate-in fade-in sm:text-[20px]" style={HEADING}>
                {PLACEHOLDERS[phIndex]}
              </span>
            )}
          </div>
          {query && (
            <button onClick={() => { setQuery(""); inputRef.current?.focus(); }} aria-label="Clear" className="grid h-7 w-7 place-items-center rounded-full bg-[#083D2D]/6 text-[#083D2D]/60 hover:bg-[#083D2D]/12">
              <X className="h-4 w-4" />
            </button>
          )}
          <button onClick={onClose} aria-label="Close search" className="hidden shrink-0 items-center gap-1 rounded-lg border border-[#083D2D]/12 px-2 py-1 text-[11px] font-bold text-[#083D2D]/50 sm:flex">
            ESC
          </button>
        </div>

        {/* results */}
        <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3 sm:px-4">
          {!hasResults ? (
            <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
              <span className="grid h-14 w-14 place-items-center rounded-2xl" style={{ background: C.mint }}>
                <Package className="h-6 w-6" style={{ color: C.emerald }} />
              </span>
              <p className="mt-4 text-[15px] font-bold text-[#083D2D]" style={HEADING}>No matches yet</p>
              <p className="mt-1 text-[13px] text-[#083D2D]/50" style={BODY}>Try a goal like “gut health” or a brand name.</p>
            </div>
          ) : (
            sections.map((section) => (
              <div key={section.id} className="mb-2">
                {section.title && (
                  <div className="px-2 pb-1.5 pt-3 text-[10.5px] font-bold uppercase tracking-[0.16em] text-[#083D2D]/40">{section.title}</div>
                )}

                {section.kind === "chips" ? (
                  <div className="flex flex-wrap gap-2 px-2 pb-1">
                    {section.items.map((it) => {
                      const Icon = it.icon;
                      const active = sel === it._i;
                      return (
                        <button
                          key={it._i}
                          data-i={it._i}
                          onMouseMove={() => setSel(it._i)}
                          onClick={it.run}
                          className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-semibold transition-colors"
                          style={{ borderColor: active ? C.forest : "rgba(8,61,45,0.14)", background: active ? C.forest : "rgba(255,255,255,0.6)", color: active ? "#fff" : C.forest }}
                        >
                          <Icon className="h-3.5 w-3.5" style={{ color: active ? C.lime : C.emerald }} />
                          {it.label}
                        </button>
                      );
                    })}
                  </div>
                ) : section.kind === "products" ? (
                  <div className="space-y-1">
                    {section.items.map((it) => {
                      const p = it.product;
                      const active = sel === it._i;
                      return (
                        <button
                          key={it._i}
                          data-i={it._i}
                          onMouseMove={() => setSel(it._i)}
                          onClick={it.run}
                          className="flex w-full items-center gap-3 rounded-2xl px-2.5 py-2 text-left transition-colors"
                          style={{ background: active ? "rgba(8,61,45,0.07)" : "transparent" }}
                        >
                          <span className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-xl" style={{ background: C.cream }}>
                            {p.image?.hero ? (
                              <Image src={p.image.hero} alt="" width={48} height={48} className="object-contain p-1" style={{ mixBlendMode: "multiply" }} />
                            ) : (
                              <Leaf className="h-5 w-5 text-[#083D2D]/30" />
                            )}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-[10px] font-bold uppercase tracking-[0.12em] text-[#16A06E]">{p.brand}</span>
                            <span className="block truncate text-[14px] font-bold text-[#083D2D]" style={HEADING}>{p.name}</span>
                          </span>
                          <span className="shrink-0"><ScoreRing score={p.score} size={38} stroke={3} label={null} /></span>
                          <span className="shrink-0 text-[14px] font-extrabold text-[#083D2D]" style={HEADING}>₹{p.price}</span>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="space-y-1">
                    {section.items.map((it) => {
                      const Icon = it.icon;
                      const active = sel === it._i;
                      const isAction = section.kind === "action";
                      return (
                        <button
                          key={it._i}
                          data-i={it._i}
                          onMouseMove={() => setSel(it._i)}
                          onClick={it.run}
                          className="flex w-full items-center gap-3 rounded-2xl px-2.5 py-2.5 text-left transition-colors"
                          style={{ background: active ? "rgba(8,61,45,0.07)" : "transparent" }}
                        >
                          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl" style={{ background: isAction ? C.forest : C.mint }}>
                            <Icon className="h-4 w-4" style={{ color: isAction ? C.lime : C.emerald }} strokeWidth={2.3} />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[14px] font-bold text-[#083D2D]" style={HEADING}>{it.label}</span>
                            {it.sub && <span className="block truncate text-[12px] text-[#083D2D]/45" style={BODY}>{it.sub}</span>}
                          </span>
                          {active && <CornerDownLeft className="h-4 w-4 shrink-0 text-[#083D2D]/40" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* footer hint bar */}
        <div className="hidden items-center justify-between border-t border-[#083D2D]/10 bg-white/40 px-5 py-3 sm:flex">
          <div className="flex items-center gap-4 text-[11px] font-semibold text-[#083D2D]/50">
            <span className="flex items-center gap-1.5"><Key><ArrowUp className="h-3 w-3" /></Key><Key><ArrowDown className="h-3 w-3" /></Key> navigate</span>
            <span className="flex items-center gap-1.5"><Key><CornerDownLeft className="h-3 w-3" /></Key> select</span>
            <span className="flex items-center gap-1.5"><Key>esc</Key> close</span>
          </div>
          <div className="flex items-center gap-1.5 text-[11px] font-bold text-[#16A06E]">
            <Sparkles className="h-3.5 w-3.5" /> KOI Universal Search
          </div>
        </div>
      </div>
    </div>
  );
}

function Key({ children }) {
  return (
    <kbd className="inline-grid min-h-5 min-w-5 place-items-center rounded-md border border-[#083D2D]/15 bg-white px-1.5 text-[10px] font-bold text-[#083D2D]/60">
      {children}
    </kbd>
  );
}
