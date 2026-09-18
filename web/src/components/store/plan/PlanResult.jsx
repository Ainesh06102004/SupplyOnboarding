"use client";

// ============================================================================
// The plan, once there is one
//
// The old page put four walls of text in a row — the basket, the targets, who
// eats what, and everything the plan could not do — each in a bordered card of
// exactly the same weight, so nothing led and the page just kept going.
//
// A shopper opens this to answer one question: is this week sorted? So that is
// the first line, in the largest type on the page, and the basket is directly
// under it. Everything that explains the basket rather than being the basket is
// behind a tab, because it is read once a week at most and never at the same
// time as the shopping.
//
// Colour is kept for meaning: green when every target is met, amber when the
// plan had to give something up, red for something a person must not eat.
// Nothing else is coloured, which is what lets those three read.
// ============================================================================

import { useState } from "react";
import Link from "next/link";
import { Loader2, ShoppingBasket, TriangleAlert } from "lucide-react";
import { isTestSku } from "@/lib/data/testCatalogue";
import { nodeInfo } from "@/lib/food/taxonomy";

const CARD = "rounded-3xl bg-white/70 ring-1 ring-inset ring-[#083D2D]/8";
const EYEBROW = "text-[10.5px] font-semibold uppercase tracking-[0.09em] text-[#5A6B5A]";
const TABS = [
  { key: "targets", label: "Per person" },
  { key: "shares", label: "Who eats what" },
  { key: "notes", label: "What it could not do" },
];

/** A person's share of a product: "1.4 kg", "350 g", or packs when the pack cannot be measured. */
const shareOf = ({ amount, unit, packs }) => {
  if (amount === null || amount === undefined || !unit) return `${packs} ${packs === 1 ? "pack" : "packs"}`;
  const big = { g: "kg", ml: "L" }[unit];
  return big && amount >= 1000 ? `${Math.round(amount / 100) / 10} ${big}` : `${amount} ${unit}`;
};

const describeLimit = (limit) =>
  `${limit.name ?? "A product"} (${limit.members.map((m) => `${m.label ?? "someone"} ${m.perDay ?? "?"} ${m.unit ?? ""}`.trim()).join(", ")})`;

const dayCount = (days) => `${days} ${Number(days) === 1 ? "day" : "days"}`;

export default function PlanResult({ plan, without, onSeeWithout, onAddToCart, cartResult }) {
  const [tab, setTab] = useState("targets");
  const report = plan.report;
  const conflicts = plan.explanation?.conflicts ?? null;
  const met = report.unmet.length === 0;
  const notes = noteLines(plan);

  return (
    <div className="space-y-4">
      {/* The answer, before the evidence. */}
      <header className={`${CARD} p-6`}>
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <div>
            <p className={EYEBROW}>{report.summary.products > 0 ? "This week" : "No basket KOI can stand behind"}</p>
            <p className="mt-1 text-[34px] font-bold leading-none tracking-tight text-[#0E4032]" style={{ fontFamily: "var(--font-koi-heading)" }}>
              ₹{Number(report.cost).toLocaleString("en-IN")}
            </p>
            <p className="mt-1.5 text-[12.5px] text-[#5A6B5A]">
              {report.summary.packs} packs · {report.summary.products} products · {dayCount(plan.days)}
              {report.withinBudget === false && <span className="text-[#B4453C]"> · over your budget</span>}
            </p>
          </div>
          <div className="text-right">
            <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-semibold ${met ? "bg-[#16A06E]/10 text-[#0E7A52]" : "bg-[#B8860B]/12 text-[#8A6508]"}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${met ? "bg-[#16A06E]" : "bg-[#B8860B]"}`} />
              {met ? "Every target met" : "Some targets short"}
            </span>
            {!met && (
              <p className="mt-1.5 max-w-[16rem] text-[11.5px] leading-snug text-[#5A6B5A]">
                {report.unmet.map((u) => `${u.label} ${u.short} ${u.nutrient}`).join(", ")}
              </p>
            )}
          </div>
        </div>
      </header>

      {/* When a target is missed, the next thing a shopper needs is not the
          shortfall again — it is which of their own asks to change (C7). */}
      {conflicts && (conflicts.fixes.length > 0 || conflicts.safety) && (
        <section className="rounded-3xl bg-[#B8860B]/[0.07] p-6 ring-1 ring-inset ring-[#B8860B]/20">
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.09em] text-[#8A6508]">
            {conflicts.fixes.length > 0 ? "What would fix it" : "Why it is short"}
          </p>
          {conflicts.fixes.length > 0 && (
            <ul className="mt-2 space-y-1.5">
              {conflicts.fixes.map((fix) => (
                <li key={fix.key} className="text-[13.5px] leading-snug text-[#0E4032]">
                  {fix.says}
                  {/* The budget fix already says the figure; saying it twice reads as a stutter. */}
                  <span className="text-[#8A6508]">
                    {" — every target met"}
                    {fix.says.includes(`₹${Number(fix.cost).toLocaleString("en-IN")}`) ? "" : `, at ₹${Number(fix.cost).toLocaleString("en-IN")}`}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {conflicts.safety && (
            <p className="mt-2 text-[12.5px] leading-snug text-[#5A6B5A]">
              {conflicts.safety.says}. KOI will not plan around that — it needs a wider shelf, not a smaller rule.
            </p>
          )}
          <p className="mt-2 text-[11px] text-[#8A6508]/80">
            Each one was checked by planning again without it.
          </p>
        </section>
      )}

      {/* The basket: the thing the shopper came for. */}
      <section className={`${CARD} p-6`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className={EYEBROW}>The basket</span>
          {report.basket.length > 0 && (
            <button type="button" onClick={onAddToCart}
                    disabled={cartResult?.planId === plan.planId && (cartResult.busy || cartResult.packs > 0)}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-[#0E4032] px-3 py-1.5 text-[12px] font-bold text-white disabled:opacity-40">
              {cartResult?.planId === plan.planId && cartResult.busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShoppingBasket className="h-3.5 w-3.5" />}
              Add all to cart
            </button>
          )}
        </div>

        {cartResult?.planId === plan.planId && (cartResult.packs > 0 || cartResult.missing?.length > 0 || cartResult.error) && (
          <p className="mt-2 text-[12px]">
            {cartResult.packs > 0 && (
              <span className="text-[#0E7A52]">
                Added {cartResult.packs} packs of {cartResult.products} products. What was already in your cart stays.{" "}
                <Link href="/store/cart" className="font-semibold underline">Go to cart</Link>
              </span>
            )}
            {cartResult.missing?.length > 0 && <span className="text-[#8A6508]"> Not in the store right now: {cartResult.missing.join(", ")}.</span>}
            {cartResult.error && <span className="text-[#B4453C]">{cartResult.error}</span>}
          </p>
        )}

        <ul className="mt-3 divide-y divide-[#083D2D]/[0.07]">
          {report.basket.map((line) => {
            const w = without[line.skuId];
            const d = w?.result?.diff;
            return (
              <li key={line.skuId} className="group py-2.5">
                <div className="flex items-baseline justify-between gap-4">
                  <span className="text-[13.5px] text-[#0E4032]">
                    <span className="tabular-nums text-[#5A6B5A]">{line.packs}×</span> {line.name}
                    <span className="text-[#8A9A8A]"> {line.packSize}</span>
                    {isTestSku(line.skuId) && (
                      <span className="ml-1.5 align-middle text-[10px] font-semibold uppercase tracking-wide text-[#B8860B]"
                            title="From the local Open Food Facts test catalogue; the price is an estimate">
                        test
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-[13.5px] font-semibold tabular-nums text-[#0E4032]">₹{line.cost}</span>
                </div>
                {!w && (
                  <button type="button" onClick={() => onSeeWithout(line.skuId)}
                          className="text-[11px] text-[#8A9A8A] opacity-0 transition-opacity hover:text-[#16A06E] focus:opacity-100 group-hover:opacity-100">
                    Can&apos;t get this?
                  </button>
                )}
                {w?.busy && <p className="text-[11.5px] text-[#5A6B5A]">Re-planning without it…</p>}
                {w?.error && <p className="text-[11.5px] text-[#B4453C]">{w.error}</p>}
                {d && (
                  <div className="mt-1.5 rounded-xl bg-[#083D2D]/[0.04] px-3 py-2 text-[12px] text-[#5A6B5A]">
                    {w.result.status !== "solved" && <p>No plan fits without it.</p>}
                    {d.substitutes.map((s) => (
                      <p key={s.skuId}><span className="font-semibold text-[#0E4032]">Instead: {s.packs} × {s.name}</span> — {s.why.join(" · ")}</p>
                    ))}
                    {d.added.map((s) => <p key={s.skuId}>Adds {s.packs} × {s.name}</p>)}
                    {d.changed.map((c) => <p key={c.skuId}>{c.name}: {c.from} → {c.to} packs</p>)}
                    {d.dropped.map((s) => <p key={s.skuId}>No longer needs {s.name}</p>)}
                    <p>
                      New total ₹{w.result.report.cost}
                      {w.result.report.unmet.length > 0
                        ? ` · short: ${w.result.report.unmet.map((u) => `${u.label} ${u.short} ${u.nutrient}`).join(", ")}`
                        : " · every target still met"}
                    </p>
                    {w.result.budget_blocked && (
                      <p>Meeting the targets without it would take about ₹{w.result.budget_blocked.cost} (₹{w.result.budget_blocked.extra} over budget).</p>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        <p className="mt-3 text-[11px] text-[#8A9A8A]">Solved in {plan.solver.ms} ms by {plan.solver.name} {plan.solver.version}</p>
      </section>

      {/* Everything that explains the basket rather than being it. */}
      <section className={CARD}>
        <div role="tablist" aria-label="About this plan" className="flex gap-1 border-b border-[#083D2D]/[0.07] px-3 pt-3">
          {TABS.map((t) => {
            const on = tab === t.key;
            const flag = t.key === "notes" && notes.some((n) => n.warn);
            return (
              <button key={t.key} type="button" role="tab" aria-selected={on} onClick={() => setTab(t.key)}
                      className={`relative rounded-t-lg px-3 py-2 text-[12.5px] transition-colors ${on ? "font-semibold text-[#0E4032]" : "text-[#5A6B5A] hover:text-[#0E4032]"}`}>
                {t.label}
                {flag && <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-[#B8860B] align-middle" />}
                {on && <span className="absolute inset-x-2 -bottom-px h-[2px] rounded-full bg-[#0E4032]" />}
              </button>
            );
          })}
        </div>

        <div className="p-6">
          {tab === "targets" && (
            <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
              {report.perMember.map((m) => (
                <div key={m.id}>
                  <p className="text-[12.5px] font-semibold text-[#0E4032]">{m.label}</p>
                  {Object.keys(m.asked).length === 0 && <p className="mt-1 text-[12px] text-[#8A9A8A]">No target set.</p>}
                  <dl className="mt-1 space-y-1">
                    {Object.entries(m.asked).map(([nutrient, asked]) => {
                      const short = m.shortfall[nutrient];
                      return (
                        <div key={nutrient} className="flex items-baseline justify-between gap-3 text-[12.5px]">
                          <dt className="text-[#5A6B5A]">{nutrient}</dt>
                          <dd className={`tabular-nums ${short ? "text-[#8A6508]" : "text-[#0E4032]"}`}>
                            {m.achieved[nutrient] ?? 0} <span className="text-[#8A9A8A]">of {asked}</span>
                            {short ? ` · ${short} short` : ""}
                          </dd>
                        </div>
                      );
                    })}
                    {m.carbsLimit && (
                      <div className="flex items-baseline justify-between gap-3 text-[12.5px]">
                        <dt className="text-[#5A6B5A]">carbs</dt>
                        <dd className="tabular-nums text-[#0E4032]">{m.achieved.carbs ?? 0} <span className="text-[#8A9A8A]">of at most {m.carbsLimit}</span></dd>
                      </div>
                    )}
                  </dl>
                </div>
              ))}
            </div>
          )}

          {tab === "shares" && (
            <>
              <p className="text-[12px] text-[#5A6B5A]">
                Each person&apos;s share over {dayCount(plan.days)}. Something one person cannot eat is still bought for the
                others, so it is listed as not for them.
              </p>
              <div className="mt-3 grid gap-x-8 gap-y-5 sm:grid-cols-2">
                {(report.whoEatsWhat ?? []).map((person) => {
                  const planned = person.allowed.filter((a) => a.packs > 0);
                  const alsoFine = person.allowed.filter((a) => !(a.packs > 0));
                  return (
                    <div key={person.member}>
                      <p className="text-[12.5px] font-semibold text-[#0E4032]">{person.label}</p>
                      {planned.length === 0 && <p className="mt-1 text-[12px] text-[#8A9A8A]">Nothing here is planned for them.</p>}
                      <ul className="mt-1 space-y-1">
                        {planned.map((a) => (
                          <li key={a.skuId} className="text-[12.5px]">
                            <div className="flex items-baseline justify-between gap-3">
                              <span className="text-[#0E4032]">{a.name}</span>
                              <span className="shrink-0 tabular-nums text-[#5A6B5A]">{shareOf(a)}</span>
                            </div>
                            {a.notVerifiedFor?.length > 0 && (
                              <p className="text-[11px] text-[#8A6508]">Not verified for {a.notVerifiedFor.join(", ")}: check the pack</p>
                            )}
                          </li>
                        ))}
                      </ul>
                      {alsoFine.length > 0 && (
                        <p className="mt-1.5 text-[11.5px] text-[#8A9A8A]">
                          Also fine: {alsoFine.map((a) => (a.notVerifiedFor?.length ? `${a.name} (not verified for ${a.notVerifiedFor.join(", ")})` : a.name)).join(", ")}
                        </p>
                      )}
                      {person.notForThem.length > 0 && (
                        <p className="mt-1.5 text-[11.5px] font-semibold text-[#B4453C]">
                          Not for {person.label}: {person.notForThem.map((n) => `${n.name} (${n.because})`).join(", ")}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {tab === "notes" && (
            <ul className="space-y-1.5 text-[12.5px] text-[#5A6B5A]">
              {notes.map((note, i) => (
                <li key={i} className={note.warn ? "flex items-start gap-1.5 text-[#8A6508]" : undefined}>
                  {note.warn && <TriangleAlert className="mt-[3px] h-3.5 w-3.5 shrink-0" />}
                  <span>{note.text}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}

/**
 * What the plan gave up, as lines. `warn` is for the ones that cost the shopper
 * something — a shortfall, a budget in the way, money spent over what was said
 * — so the tab can show a dot when there is something worth opening it for.
 */
function noteLines(plan) {
  const e = plan.explanation;
  const days = dayCount(plan.days);
  const notes = [
    { text: `Reached: ${e.reached.replace(/_/g, " ")}${e.gave_up ? ` — gave up ${e.gave_up}` : " — nothing was given up"}`, warn: Boolean(e.gave_up) },
    { text: `Never relaxed: ${e.never_relaxed.join(" and ")}` },
  ];
  if (e.budget_raised_for_targets) {
    notes.push({
      warn: true,
      text: `Spent ₹${Math.round(e.budget_raised_for_targets.extra).toLocaleString("en-IN")} over the ₹${Number(e.budget_raised_for_targets.from).toLocaleString("en-IN")} asked for, because this household put its targets above its budget`,
    });
  }
  if (e.priority_held) {
    notes.push({ text: `Solved for ${e.priority_held.priority.replace(/_/g, " ")} first, then everything else within ${Math.round(e.priority_held.tolerance * 100)}% of it` });
  }
  for (const c of e.carb_ceilings ?? []) {
    notes.push({
      text: `${c.label} is on ${c.pattern === "keto" ? "keto" : "low carb"}: at most ${c.perDay} g of carbohydrate a day`
        + (c.undeclared > 0 ? `, and ${c.undeclared} ${c.undeclared === 1 ? "product was" : "products were"} left out for them because their carbohydrate isn't declared` : ""),
    });
  }
  for (const s of e.skipped_this_week ?? []) {
    notes.push({ text: `${s.label} asked to skip ${s.categories.map((key) => nodeInfo(key)?.subcategory ?? nodeInfo(key)?.label ?? key).join(", ")} this week` });
  }
  if (e.products_refused.length > 0) notes.push({ text: `${e.products_refused.length} products left out because no one in the household can eat them` });
  if ((e.products_kept_out ?? []).length > 0) {
    notes.push({ text: `Kept out of the house: ${e.products_kept_out.map((p) => `${p.name ?? "a product"} (${p.because})`).join(", ")}` });
  }
  if (e.products_not_plannable.length > 0) notes.push({ text: `${e.products_not_plannable.length} products KOI cannot plan with yet (no price, or a pack it cannot measure)` });
  if ((e.products_priced_out ?? []).length > 0) {
    notes.push({ text: `Left out because their nutrition costs far more than the rest of the catalogue: ${e.products_priced_out.map((p) => p.name ?? "a product").join(", ")}` });
  }
  if ((e.products_too_big ?? []).length > 0) {
    notes.push({ text: `Packs too big to finish in ${days}: ${e.products_too_big.map((p) => p.name ?? "a product").join(", ")}` });
  }
  if ((e.portion_limited ?? []).length > 0) {
    notes.push({ text: `Held to a day's portions: ${e.portion_limited.map(describeLimit).join("; ")}` });
  }
  if (e.unmet.length > 0) {
    notes.push({ warn: true, text: `Short: ${e.unmet.map((u) => `${u.label} ${u.short} ${u.nutrient}`).join(", ")}` });
  }
  if (e.budget_blocked) {
    notes.push({
      warn: true,
      text: `Your budget is what stands in the way: meeting the targets would take about ₹${e.budget_blocked.cost} (₹${e.budget_blocked.extra} more)`
        + (e.budget_blocked.unmet.length > 0 ? ", and even then some targets stay short" : ""),
    });
  }
  return notes;
}
