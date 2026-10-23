"use client";

// ============================================================================
// Pantry · the shop below it (approved canvas, 23 Oct 2026)
//
// Below the week's own list, the whole shop, so the week's order is one order:
// search, the shelf's categories, and "Safe for everyone at home" (on by
// default), which hides what anyone here must never have. Each product says
// whether it is already in the plan, and who it is not for.
//
// What is added here goes in the same one cart as the plan's packs, marked
// "pantry" (lib/cart/lines.js addedFrom), and sits under "You added" there:
// it is the shopper's own, not planned around. The safety reading is the
// recommender's own (productFacts + eligibilityFilter), per person: a diet or
// a hard avoid makes a product "Not for <label>". Nothing is added unasked.
// ============================================================================

import { useMemo, useState } from "react";
import Link from "next/link";
import { useCatalogue } from "@/lib/data/useCatalogue";
import { getSeedCatalogue } from "@/components/store/shop/shopData";
import { extractFacts } from "@/lib/recommendation/productFacts";
import { filterEligible } from "@/lib/recommendation/eligibilityFilter";
import { FOODS_AVOID } from "@/lib/recommendation/config";
import { useCartStore } from "@/store/cartStore";
import { useAddToCart } from "@/components/store/cart/CartLayer";
import { lineKey, packs, ownPacks } from "@/lib/cart/lines";
import { Money, ProductThumb, ScoreBadge } from "@/components/store/system/primitives";

const PAGE = 24;
const mono = "font-koi-mono text-[11px] font-semibold uppercase tracking-[0.16em]";
const AVOID_LABEL = Object.fromEntries(FOODS_AVOID.map((a) => [a.flag ?? a.key, a.label]));

/** Who in the household a product is not for, and why: "Not for Kid: peanuts". */
function notFor(product, people) {
  const facts = extractFacts(product);
  const out = [];
  for (const p of people) {
    const { removed } = filterEligible([facts], { dietType: p.diet_type, foodsAvoid: (p.avoids ?? []).filter((a) => a.severity !== "dislike").map((a) => a.key) });
    if (!removed.length) continue;
    // "avoid:<flag>" or "diet:<diet>:<flag>" (eligibilityFilter.js).
    const parts = removed[0].reason.split(":");
    const flag = parts[0] === "avoid" ? parts[1] : parts[2];
    out.push({ label: p.label, why: String(AVOID_LABEL[flag] ?? flag ?? "").toLowerCase().replace(/_/g, " ") });
  }
  return out;
}

/**
 * @param {{ s: object }} props the plan session: its people (s.profiles) and the plan's lines (s.lines)
 */
export default function PantryShop({ s }) {
  const { products, status } = useCatalogue(getSeedCatalogue);
  const items = useCartStore((st) => st.items);
  const setQty = useCartStore((st) => st.setQty);
  const add = useAddToCart();
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState("All");
  const [safeOnly, setSafeOnly] = useState(true);
  const [shown, setShown] = useState(PAGE);

  const people = useMemo(() => (s.profiles ?? []).filter((p) => p.label), [s.profiles]);
  const inPlan = useMemo(() => new Set((s.lines ?? []).map((l) => String(l.skuId))), [s.lines]);
  const qtyOf = useMemo(() => new Map(items.map((i) => [lineKey(i), i])), [items]);

  const read = useMemo(() => products.map((p) => ({ p, not: notFor(p, people) })), [products, people]);
  const cats = useMemo(() => {
    const n = new Map();
    for (const { p } of read) if (p.category) n.set(p.category, (n.get(p.category) ?? 0) + 1);
    return ["All", ...[...n.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c)];
  }, [read]);
  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return read
      .filter(({ p, not }) => (cat === "All" || p.category === cat)
        && (!safeOnly || !not.length)
        && (!q || `${p.name} ${p.brand} ${p.category}`.toLowerCase().includes(q)))
      .sort((a, b) => (Number(b.p.score) || 0) - (Number(a.p.score) || 0));
  }, [read, cat, safeOnly, query]);
  const hidden = safeOnly ? read.filter(({ not }) => not.length).length : 0;

  const planCount = items.filter((i) => packs(i.fromPlan) > 0).length;
  const ownCount = items.filter((i) => ownPacks(i) > 0 && packs(i.fromPlan) === 0).length;

  return (
    <section id="pantry-shop" aria-labelledby="pantry-shop-title" className="mt-10 flex scroll-mt-[calc(var(--koi-header-h)+20px)] flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <span className="flex flex-col gap-1">
          <span className={`${mono} text-koi-muted`}>The shop{status === "ready" ? ` · ${products.length} screened` : ""}</span>
          <h2 id="pantry-shop-title" className="koi-condensed m-0 font-koi-display text-[clamp(32px,3.4vw,44px)] font-extrabold leading-none tracking-[-0.02em] text-koi-forest">Anything else for the week?</h2>
          <span className="text-[14px] text-koi-ink2">Added here, it goes in the same cart under <strong>You added</strong>. Not planned around.</span>
        </span>
        <Link href="/store/cart" className="flex h-11 items-center gap-2 rounded-full bg-koi-forest px-5 text-[13.5px] font-bold text-koi-lime no-underline">
          Cart · {planCount} from the plan · {ownCount} you added <span aria-hidden="true">→</span>
        </Link>
      </div>

      <div className="flex flex-col gap-2.5 rounded-[22px] border border-koi-forest/10 bg-white p-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <label className="flex h-11 min-w-[220px] flex-1 items-center gap-2 rounded-2xl bg-koi-bg px-3.5">
            <svg aria-hidden="true" className="size-4 text-koi-ink2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
            <span className="sr-only">Search the shop</span>
            <input type="search" value={query} onChange={(e) => { setQuery(e.target.value); setShown(PAGE); }} placeholder="Search the shop" autoComplete="off" className="h-full min-w-0 flex-1 border-0 bg-transparent text-[14.5px] font-medium outline-none placeholder:text-koi-muted" />
          </label>
          {people.length > 0 && (
            <label className="flex h-11 items-center gap-2 rounded-2xl px-2 text-[13.5px] font-semibold">
              <input type="checkbox" checked={safeOnly} onChange={(e) => setSafeOnly(e.target.checked)} className="size-[18px] accent-koi-forest" />
              Safe for everyone at home
            </label>
          )}
        </div>
        <div role="radiogroup" aria-label="Category" className="flex flex-wrap gap-1.5">
          {cats.map((c) => (
            <button key={c} type="button" role="radio" aria-checked={cat === c} onClick={() => { setCat(c); setShown(PAGE); }} className={`h-10 rounded-full px-3.5 text-[13px] font-semibold transition-colors ${cat === c ? "bg-koi-forest text-koi-lime" : "border border-koi-forest/15 bg-white text-koi-ink hover:border-koi-forest/40"}`}>{c}</button>
          ))}
        </div>
      </div>
      {hidden > 0 && <p className="m-0 text-[12.5px] text-koi-muted">{hidden} {hidden === 1 ? "product is" : "products are"} hidden because someone at home can&apos;t have {hidden === 1 ? "it" : "them"}.</p>}

      {status === "loading" && !products.length ? (
        <p role="status" className="m-0 text-sm text-koi-ink2">Loading the shop…</p>
      ) : !list.length ? (
        <p className="m-0 rounded-[22px] bg-white p-5 text-sm text-koi-ink2">Nothing matches that. Try another word or category.</p>
      ) : (
        <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(min(220px,100%),1fr))] gap-3.5 p-0">
          {list.slice(0, shown).map(({ p, not }) => {
            const key = lineKey({ skuId: p.skuId, productId: p.id });
            const line = qtyOf.get(key);
            const q = line ? packs(line.quantity) : 0;
            const planned = inPlan.has(String(p.skuId));
            return (
              <li key={p.id} data-shop-item className="flex flex-col gap-2.5 rounded-[22px] border border-koi-forest/10 bg-white p-3">
                <Link href={`/store/product/${p.id}`} className="relative grid h-[150px] place-items-center rounded-2xl bg-koi-paper no-underline">
                  <ProductThumb src={p.image?.hero || null} alt="" size={124} radius={14} />
                  <span className="absolute right-2 top-2"><ScoreBadge score={p.score} size={38} /></span>
                  {planned && <span className="absolute left-2 top-2 rounded-full bg-koi-lime px-2 py-0.5 font-koi-mono text-[9.5px] font-bold uppercase tracking-[0.06em] text-koi-forest">In your plan</span>}
                </Link>
                {p.brand && <span className="truncate font-koi-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-koi-muted">{p.brand}</span>}
                <Link href={`/store/product/${p.id}`} className="text-[14.5px] font-bold leading-snug text-koi-ink no-underline hover:underline">{p.name}</Link>
                {not.length > 0 && (
                  <span className="self-start rounded-full bg-koi-warm-bg px-2.5 py-1 text-[12px] font-semibold text-koi-warm-ink">
                    Not for {not.map((n) => n.label).join(", ")}{not[0].why ? `: ${not[0].why}` : ""}
                  </span>
                )}
                <div className="mt-auto flex items-center justify-between gap-2">
                  <span className="flex flex-col">
                    <span className="font-koi-num text-[16px] font-semibold">{Number(p.price) > 0 ? <Money value={p.price} /> : "No price"}</span>
                    {p.weight && p.weight !== "N/A" && <span className="text-[12px] text-koi-muted">{p.weight}</span>}
                  </span>
                  {q > 0 ? (
                    <span className="inline-flex h-11 items-center rounded-full bg-koi-tint">
                      <button type="button" aria-label={`One fewer ${p.name}`} onClick={() => setQty(key, q - 1)} className="grid size-11 place-items-center text-lg font-bold text-koi-forest">−</button>
                      <span className="min-w-5 text-center font-koi-num text-[15px] font-semibold text-koi-forest">{q}</span>
                      <button type="button" aria-label={`One more ${p.name}`} onClick={() => add(p, 1, "pantry")} className="grid size-11 place-items-center text-lg font-bold text-koi-forest">+</button>
                    </span>
                  ) : (
                    <button type="button" aria-label={`Add ${p.name}`} onClick={() => add(p, 1, "pantry")} className="h-11 rounded-full bg-koi-forest px-[18px] text-[14px] font-bold text-koi-lime">Add</button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {list.length > shown && (
        <button type="button" onClick={() => setShown((n) => n + PAGE)} className="h-12 self-center rounded-full border border-koi-forest/20 bg-white px-6 text-[14px] font-semibold text-koi-forest">
          Show {Math.min(PAGE, list.length - shown)} more
        </button>
      )}
    </section>
  );
}
