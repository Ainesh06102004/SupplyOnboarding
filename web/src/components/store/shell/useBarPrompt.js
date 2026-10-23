"use client";
// ============================================================================
// KOI — the bar's own words, live
//
//   useBarFacts({ product: "Kabuli Chana" })   a page says what it knows
//   useBarPrompt({ agent })                     the bar's placeholder, turning
//   useWorkingWord(tool, startedAt)            "Tempering… 12s" while KOI works
//
// The words themselves are lib/koi/barWords.js (pure, tested); this file only
// gathers what they need: the route, the page's facts, the cart and the clock.
// ============================================================================

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { useKoiBar } from "@/store/koiBarStore";
import { useCartStore } from "@/store/cartStore";
import { packs, totals } from "@/lib/cart/lines";
import { promptsFor, workingWords, elapsed } from "@/lib/koi/barWords";

/**
 * Tell the bar what this page knows. Pass a stable value (primitives, or a
 * memoised object): it is compared as JSON, and cleared when the page goes.
 * @param {object|null} facts
 */
export function useBarFacts(facts) {
  const setFacts = useKoiBar((b) => b.setFacts);
  const json = JSON.stringify(facts ?? {});
  useEffect(() => {
    setFacts(JSON.parse(json));
    return () => setFacts({});
  }, [json, setFacts]);
}

/**
 * The placeholder: a suggestion for this page that turns over every few
 * seconds while the bar is idle and empty.
 * @param {{ agent?: boolean, paused?: boolean }} opts paused while typing or working
 * @returns {string}
 */
export function useBarPrompt({ agent = false, paused = false } = {}) {
  const path = usePathname() ?? "/store";
  const facts = useKoiBar((b) => b.facts);
  const items = useCartStore((s) => s.items);
  const plan = useCartStore((s) => s.plan);
  const [hour, setHour] = useState(12);
  const [pos, setPos] = useState({ key: "", i: 0 });
  // The hour is read after mount (the server's clock is not the shopper's).
  useEffect(() => {
    const read = () => setHour(new Date().getHours());
    read();
    const t = setInterval(read, 10 * 60 * 1000);
    return () => clearInterval(t);
  }, []);
  const cart = useMemo(() => ({
    members: plan?.members ?? null,
    total: totals(items.filter((l) => l.name)).total,
    own: items.filter((l) => packs(l.fromPlan) === 0).length,
    plan: Boolean(plan),
  }), [items, plan]);
  const lines = useMemo(() => promptsFor({ path, hour, facts, cart, agent }), [path, hour, facts, cart, agent]);
  const key = lines.join("|");
  // A new page or new facts start from their best line: the position belongs to the lines it counted.
  const i = pos.key === key ? pos.i : 0;
  useEffect(() => {
    if (paused || lines.length < 2) return undefined;
    const t = setInterval(() => setPos((p) => ({ key, i: ((p.key === key ? p.i : 0) + 1) % lines.length })), 4200);
    return () => clearInterval(t);
  }, [paused, lines.length, key]);
  return `${lines[i % lines.length]}…`;
}

/**
 * While KOI works: a kitchen verb for the tool it is running, turning over,
 * and how long it has been at it.
 * @param {string|null} tool
 * @param {number|null} startedAt ms
 * @param {boolean} running
 * @returns {{ word: string, time: string }|null}
 */
export function useWorkingWord(tool, startedAt, running) {
  const words = useMemo(() => workingWords(tool), [tool]);
  // The clock, read by the interval (never during render).
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (!running) return undefined;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running]);
  if (!running) return null;
  const ms = startedAt && now > startedAt ? now - startedAt : 0;
  // A new word every two seconds, starting from a different one each run.
  const seed = startedAt ? Math.floor(startedAt / 1000) : 0;
  return { word: words[(seed + Math.floor(ms / 2000)) % words.length], time: elapsed(ms) };
}
