"use client";

// Step 3 · Plan — tell KOI, and watch it work.
//
// The command box routes by what there is: a household in words when there is
// no one yet, a plan when there are people, a change when there is a plan.
// While KOI works, the run streams in beneath it (/api/plan/run): what it read,
// what it checked, each rung of the ladder solving, the basket as a draft. A
// change applies at once and sits in "your requests", where the latest can be
// taken back.
//
// Cinematic storefront (Oct 2026): the canvas's storyboard. The week of dishes
// is a board of panels (WeekGrid); the swaps the substitution graph can show a
// figure for are KOI's "second takes", on a clapperboard, offered and never
// applied unasked; the ember carries the run ("Planning", then a tick). Every
// part of the old step is here: the brief, the requests and their undo, the
// per-person basket board, the gaps and what would fix them.

import { useEffect, useMemo, useRef, useState } from "react";
import { followUpExamples, MAX_FOLLOWUP_CHARS, productWordFor } from "@/lib/planner/followup";
import { MAX_BRIEF_CHARS, AGE_BANDS } from "@/lib/planner/brief";
import { DIET_TYPES, FOODS_AVOID } from "@/lib/recommendation/config";
import { swapsFor } from "@/lib/food/swaps";
import { goalShortLabel } from "@/lib/plan/goalCards";
import { weekBoard, peopleOf, noteLines, rupees, totalsOf } from "@/lib/plan/planView";
import ThisWeekChips from "@/components/store/plan/ThisWeekChips";
import { initialsOf, inr } from "./tokens";
import { StepHead, Footer, Unverified } from "./bits";
import WeekGrid from "./WeekGrid";
import { useAgent } from "@/components/agent/AgentProvider";
import { setupMotion, prefersReducedMotion, useGSAP, E } from "@/lib/motion/koiMotion";
import { useEmber } from "@/components/store/ember/Ember";
import { useKoiVoice } from "@/store/koiVoiceStore";
import { ProductThumb } from "@/components/store/system/primitives";

const labelOf = (list, key) => list.find((x) => x.key === key)?.label ?? key;
const amountOf = (perDay, unit) => (perDay === null || perDay === undefined ? null : unit ? `${perDay} ${unit}` : `${perDay}`);
const card = "rounded-[28px] border border-koi-forest/10 bg-white p-6";
const monoHead = "font-koi-mono text-[11px] font-semibold uppercase tracking-[0.16em]";

function StateMark({ state }) {
  if (state === "running") return <span aria-hidden="true" className="mt-[5px] size-[9px] shrink-0 animate-pulse rounded-full bg-koi-mint" />;
  if (state === "warn") return <span aria-hidden="true" className="mt-[5px] size-[9px] shrink-0 rounded-full bg-[#f2c46b]" />;
  return <span aria-hidden="true" className="mt-px w-[9px] shrink-0 text-[11px] font-bold text-koi-mint">✓</span>;
}

/** KOI working: the streamed run, line by line. */
function AgentRun({ run, onUndoRun }) {
  const ref = useRef(null);
  const count = run?.lines?.length ?? 0;
  useGSAP(() => {
    const last = ref.current?.querySelector("li:last-child");
    if (!last || prefersReducedMotion()) return;
    setupMotion().from(last, { autoAlpha: 0, y: 8, duration: 0.3, ease: E.reveal });
  }, { scope: ref, dependencies: [count] });
  if (!run) return null;
  const seconds = run.finishedAt ? ((run.finishedAt - run.startedAt) / 1000).toFixed(1) : null;
  return (
    <div ref={ref} className="mt-4 border-t border-koi-bg/15 pt-4" aria-live="polite">
      <div className="mb-2.5 flex items-center justify-between gap-2.5">
        <span className={`${monoHead} text-koi-bg/55`}>{run.undone ? "Taken back · your plan is as it was" : run.done ? (run.error ? "KOI stopped" : `KOI finished${seconds ? ` · ${seconds} s` : ""}`) : "KOI is working"}</span>
        {!run.done && <span aria-hidden="true" className="size-3 animate-spin rounded-full border-2 border-koi-bg/25 border-t-koi-mint" />}
        {onUndoRun && (
          <button type="button" onClick={onUndoRun} className="whitespace-nowrap rounded-full border border-koi-bg/25 bg-koi-bg/10 px-3 py-1 text-[11px] font-semibold text-koi-bg">↶ Undo all of this</button>
        )}
      </div>
      <ol className={`m-0 flex list-none flex-col gap-2 p-0 ${run.undone ? "line-through opacity-45" : ""}`}>
        {run.lines.map((line) => (
          <li key={line.id} className={`flex items-start gap-2.5 ${line.nested ? "ml-[18px]" : ""} ${line.tool ? "mt-1" : ""}`}>
            <StateMark state={line.state} />
            <div className="min-w-0">
              <div className={`${line.nested ? "text-xs font-medium text-koi-mint/90" : `text-[13px] text-koi-bg ${line.tool ? "font-bold" : "font-semibold"}`}`}>{line.title}</div>
              {line.detail && <div className="mt-px font-koi-mono text-[11px] text-koi-mint/70">{line.detail}</div>}
            </div>
          </li>
        ))}
      </ol>
      {run.explain?.length > 0 && (
        <div className="mt-2.5 rounded-xl bg-koi-bg/10 px-3 py-2.5">
          {run.explain.map((n, i) => <p key={i} className={`m-0 text-xs ${i ? "mt-1" : ""} ${n.warn ? "font-semibold text-[#f5d7a1]" : "font-medium text-koi-mint/90"}`}>{n.text}</p>)}
        </div>
      )}
      {run.source && run.done && <div className="mt-2 font-koi-mono text-[10px] text-koi-bg/40">{run.source === "model" ? "Read by KOI's model, done by KOI's planner" : "Read by KOI's rules, done by KOI's planner"}</div>}
      {run.draft && !run.done && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {run.draft.basket.slice(0, 10).map((l) => (
            <span key={l.skuId} className="rounded-full border border-koi-bg/20 bg-koi-bg/10 px-2.5 py-1 text-[11px] font-medium text-koi-mint/90">{l.packs} × {l.name}</span>
          ))}
        </div>
      )}
      {run.error && <p className="m-0 mt-2.5 text-xs font-medium text-[#f5b8ae]">{run.error}</p>}
    </div>
  );
}

/** A household in words, drafted and waiting to be kept. */
const PROFILE_DIETS = DIET_TYPES.filter((d) => !d.forOnePlanOnly);
const hasBand = (m) => AGE_BANDS.some((b) => b.key === m.age_band);
const hasDiet = (m) => PROFILE_DIETS.some((d) => d.key === m.diet_type);

function BriefDraft({ brief, onKeep, onDrop, onEdit }) {
  // Nobody is kept without an age group and a diet: KOI never guesses either,
  // because both decide what is safe to plan for them.
  const ready = brief.members.length > 0 && brief.members.every((m) => hasBand(m) && hasDiet(m));
  const pick = "ml-1.5 rounded-lg border border-koi-amber-border bg-koi-amber-bg px-1.5 py-0.5 text-xs font-medium text-koi-ink";
  return (
    <div className="mt-4 rounded-2xl bg-white p-4 text-koi-ink">
      <span className={`${monoHead} text-koi-muted`}>Drafted · check, then keep</span>
      {brief.members.map((m, i) => (
        <div key={i} className="border-b border-koi-forest/10 py-1.5 text-[13px] font-medium">
          <strong>{m.label}</strong>
          {" · "}
          {hasBand(m) ? labelOf(AGE_BANDS, m.age_band) : (
            <select aria-label={`Age group for ${m.label}`} value="" onChange={(e) => onEdit?.(i, { age_band: e.target.value })} className={pick}>
              <option value="" disabled>Age group?</option>
              {AGE_BANDS.map((b) => <option key={b.key} value={b.key}>{b.label}</option>)}
            </select>
          )}
          {" · "}
          {hasDiet(m) ? labelOf(DIET_TYPES, m.diet_type) : (
            <select aria-label={`Diet for ${m.label}`} value="" onChange={(e) => onEdit?.(i, { diet_type: e.target.value })} className={pick}>
              <option value="" disabled>Diet?</option>
              {PROFILE_DIETS.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
            </select>
          )}
          {m.target_protein_g ? ` · ${m.target_protein_g} g protein` : ""}
          {m.target_kcal ? ` · ${m.target_kcal} kcal` : ""}
          {(m.avoidKeys ?? []).length ? ` · avoids ${m.avoidKeys.map((k) => labelOf(FOODS_AVOID, k)).join(", ")}` : ""}
        </div>
      ))}
      {[...(brief.notes ?? []), ...(brief.unresolved?.length ? [`Not applied: ${brief.unresolved.join(", ")}.`] : [])].map((n, i) => (
        <p key={i} className="m-0 mt-1.5 text-xs text-koi-muted">{n}</p>
      ))}
      <div className="mt-3 flex gap-2">
        <button type="button" onClick={onKeep} disabled={!ready} title={ready ? undefined : "Choose an age group and a diet for everyone first"} className="h-10 rounded-full bg-koi-forest px-4 text-[13px] font-bold text-koi-lime disabled:cursor-not-allowed disabled:opacity-50">Keep these people</button>
        <button type="button" onClick={onDrop} className="h-10 rounded-full px-3 text-[13px] font-semibold text-koi-muted">Start again</button>
      </div>
    </div>
  );
}

function CommandBox({ s }) {
  const [text, setText] = useState("");
  // KOI Agent Mode: the dock is the one conversation. This box keeps what it
  // shows about the plan (requests, undo, the draft) and hands its
  // suggestions to the dock instead of running its own.
  const agent = useAgent();
  const docked = Boolean(agent);
  const busy = docked ? agent.state.status === "running" : Boolean(s.run && !s.run.done);
  const max = s.mode === "setup" ? MAX_BRIEF_CHARS : MAX_FOLLOWUP_CHARS;
  const placeholder = {
    setup: "e.g. four of us — me, my wife and two kids; she's vegetarian, the little one is allergic to peanuts",
    ready: "e.g. plan 7 days for everyone on ₹4,000, 150 g protein for me",
    plan: "e.g. cheaper, no biscuits, add oats, swap the rice for atta…",
  }[s.mode];
  const quick = s.mode === "plan"
    ? followUpExamples({ basket: s.plan?.report?.basket ?? [], days: s.plan?.days ?? 7 }).slice(0, 4)
    : s.mode === "ready" ? [`plan ${s.days} days`, "on ₹3,000", "high protein for me", "no budget"] : [];
  const send = (value = text) => {
    if (!value.trim() || busy) return;
    if (docked) agent.send(value.slice(0, 600));
    else s.command(value.slice(0, max));
    setText("");
  };
  const open = s.requests.filter((r) => !r.undone);
  const latest = open.at(-1);

  return (
    <section data-card aria-label="Tell KOI" className="mb-5 rounded-[28px] bg-koi-forest p-6 text-koi-bg">
      <div className="mb-3.5 flex flex-wrap items-center gap-2.5">
        <span aria-hidden="true" className="size-2 rounded-full bg-koi-ember" />
        <span className="text-[15px] font-bold">{docked ? "KOI works from the KOI bar" : "Tell KOI what you want"}</span>
        <span className="font-koi-mono text-[11px] text-koi-bg/55">{docked ? "type at the bottom of the screen, or tap one of these" : s.mode === "setup" ? "it drafts your household" : "it re-solves the plan and the cart"}</span>
      </div>
      {!docked && (
        <form onSubmit={(e) => { e.preventDefault(); send(); }} className="flex gap-2.5">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={placeholder}
            maxLength={max}
            aria-label="Tell KOI what you want"
            disabled={busy}
            className="h-14 min-w-0 flex-1 rounded-2xl border-0 bg-white px-4 text-[15px] font-medium text-koi-ink outline-none placeholder:text-koi-muted"
          />
          <button type="submit" disabled={busy || !text.trim()} className="h-14 shrink-0 rounded-2xl bg-koi-lime px-6 text-[15px] font-bold text-koi-forest disabled:opacity-60">
            {s.mode === "setup" ? "Read" : s.mode === "ready" ? "Plan it" : "Apply"}
          </button>
        </form>
      )}
      {quick.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {quick.map((q) => (
            <button key={q} type="button" disabled={busy} onClick={() => send(q)} className="h-9 rounded-full border border-koi-bg/20 bg-koi-bg/10 px-3.5 text-[12.5px] font-medium text-koi-mint transition-colors hover:bg-koi-bg/15 disabled:opacity-60">+ {q}</button>
          ))}
        </div>
      )}

      {!docked && <AgentRun run={s.run} onUndoRun={s.canUndoRun ? s.undoRun : null} />}
      {docked && s.canUndoRun && (
        <button type="button" onClick={s.undoRun} className="mt-3 rounded-full border border-koi-bg/20 bg-koi-bg/10 px-3.5 py-1.5 text-xs font-semibold text-koi-bg">{"↶ Undo all of KOI's last run"}</button>
      )}
      {!s.run && s.plan?.restored && s.plan.createdAt && (
        <div className="mt-3 font-koi-mono text-[11px] text-koi-bg/55">
          Reopened your plan from {new Date(s.plan.createdAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
        </div>
      )}
      {s.brief && <BriefDraft brief={s.brief} onKeep={s.keepBrief} onEdit={s.editBrief} onDrop={() => s.setBrief(null)} />}

      {open.length > 0 && (
        <div className="mt-4 border-t border-koi-bg/15 pt-4">
          <span className={`${monoHead} text-koi-bg/55`}>Your requests · applied</span>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {open.map((r) => {
              const before = r.basketChange?.costBefore;
              const cost = Number.isFinite(Number(before)) && Number.isFinite(Number(r.costAfter)) ? `${rupees(before)} → ${rupees(r.costAfter)}` : null;
              return (
                <div key={r.id} className="flex items-center gap-2 rounded-full bg-white py-1.5 pl-3.5 pr-2 text-koi-ink">
                  <span className="text-xs font-semibold">{r.applied.length ? r.applied.slice(0, 2).join(" · ") : `Tried: ${r.text}`}</span>
                  {cost && <span className="font-koi-mono text-[11px] text-koi-green">{cost}</span>}
                  {r.householdChanges?.length > 0 && !r.savedToHousehold && (
                    <button type="button" onClick={() => s.saveHouseholdChanges(r.id)} className="rounded-full bg-koi-tint px-2 py-0.5 text-[11px] font-semibold text-koi-primary">Save to household</button>
                  )}
                  {latest?.id === r.id && (
                    <button type="button" aria-label="Undo this change" title="Undo" onClick={() => s.undo(r.id)} disabled={busy} className="grid size-5 place-items-center rounded-full bg-koi-track text-xs font-semibold text-koi-muted">×</button>
                  )}
                </div>
              );
            })}
          </div>
          {latest?.notApplied?.length > 0 && <p className="m-0 mt-2.5 text-xs font-medium text-koi-mint/90">Not applied: {latest.notApplied.join(" · ")}</p>}
        </div>
      )}
    </section>
  );
}

/** Who is eating, how many days, the budget, and what each person wants or skips this week. */
function ThisWeek({ s }) {
  const [open, setOpen] = useState(!s.plan);
  const busy = Boolean(s.run && !s.run.done);
  const toggle = (id) => s.setPicked((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  return (
    <section data-card className={`${card} mb-5`}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center justify-between gap-3 text-left">
        <span className="font-koi-display text-[22px] font-extrabold text-koi-forest">This week’s brief</span>
        <span className="text-xs font-semibold text-koi-green"><span className="font-koi-num">{s.picked.length}</span> eating · <span className="font-koi-num">{s.days}</span> {Number(s.days) === 1 ? "day" : "days"} · {s.budget ? `₹${inr(s.budget)}` : "no budget"} {open ? "▴" : "▾"}</span>
      </button>
      {open && (
        <div className="mt-4 flex flex-col gap-4">
          <div>
            <div className="mb-2 text-[13px] font-medium text-koi-ink2">Who’s eating</div>
            <div className="flex flex-wrap gap-1.5">
              {s.saved.map((p) => {
                const on = s.picked.includes(p.memberId);
                return (
                  <button key={p.memberId} type="button" aria-pressed={on} onClick={() => toggle(p.memberId)} className={`h-9 rounded-full border px-3.5 text-[13px] font-semibold transition-colors ${on ? "border-koi-forest bg-koi-forest text-koi-lime" : "border-koi-forest/15 bg-white text-koi-muted hover:text-koi-forest"}`}>
                    {on ? "✓ " : ""}{p.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex flex-wrap gap-5">
            <label className="flex items-center gap-2 text-[13px] font-medium text-koi-ink2">
              Days
              <input type="number" min={1} max={14} value={s.days} onChange={(e) => s.setDays(Math.max(1, Math.min(14, Number(e.target.value) || 1)))} className="h-9 w-16 rounded-lg border border-koi-forest/15 bg-koi-paper px-2 font-koi-num text-[15px] font-semibold outline-none focus:border-koi-forest" />
            </label>
            <label className="flex items-center gap-2 text-[13px] font-medium text-koi-ink2">
              Budget ₹
              <input type="number" min={1} value={s.budget} placeholder="none" onChange={(e) => s.setBudget(e.target.value)} className="h-9 w-24 rounded-lg border border-koi-forest/15 bg-koi-paper px-2 font-koi-num text-[15px] font-semibold outline-none focus:border-koi-forest" />
            </label>
          </div>
          {s.active?.memberId && s.categories.length > 0 && (
            <div>
              <div className="mb-2 text-[13px] font-medium text-koi-ink2">{s.active.label} this week <span className="text-koi-muted">— tap: want, skip, or leave it to KOI</span></div>
              <ThisWeekChips
                categories={s.categories}
                prefer={s.choiceFor(s.active.memberId).prefer}
                skip={s.choiceFor(s.active.memberId).skip}
                onChange={(key, state) => {
                  const c = s.choiceFor(s.active.memberId);
                  s.setChoice(s.active.memberId, {
                    prefer: state === "want" ? [...new Set([...c.prefer, key])] : c.prefer.filter((k) => k !== key),
                    skip: state === "skip" ? [...new Set([...c.skip, key])] : c.skip.filter((k) => k !== key),
                  });
                }}
              />
            </div>
          )}
          <div>
            <button type="button" disabled={busy || !s.picked.length} onClick={() => s.makePlan().catch((e) => s.setError(e?.message))} className="h-12 rounded-2xl bg-koi-forest px-5 text-[15px] font-bold text-koi-lime disabled:opacity-60">
              {s.plan ? "Plan again" : `Plan for ${s.picked.length} ${s.picked.length === 1 ? "person" : "people"}`}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

/** The clapperboard: KOI's second take, snapping shut as it arrives. */
function Clapper() {
  const ref = useRef(null);
  useGSAP(() => {
    if (prefersReducedMotion()) return;
    const top = ref.current.querySelector("[data-clap-top]");
    setupMotion().timeline({ delay: 0.3 })
      .fromTo(top, { rotation: -24, transformOrigin: "4px 13px" }, { rotation: 0, duration: 0.28, ease: "power3.in" })
      .to(top, { rotation: -4, duration: 0.08, yoyo: true, repeat: 1 });
  }, { scope: ref });
  return (
    <svg ref={ref} width="48" height="44" viewBox="0 0 48 44" aria-hidden="true" className="shrink-0 overflow-visible">
      <g data-clap-top>
        <rect x="2" y="4" width="44" height="9" rx="1.5" fill="#f6f5f1" />
        <path d="M9 4l6 9M20 4l6 9M31 4l6 9" stroke="#083d2d" strokeWidth="3.2" />
      </g>
      <rect x="2" y="15" width="44" height="27" rx="2.5" fill="#f6f5f1" />
      <rect x="2" y="15" width="44" height="7" fill="#ddf247" />
      <path d="M8 29h18M8 35h12" stroke="#083d2d" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Swaps the substitution graph can show a figure for, one per basket line:
 * KOI's second takes. Nothing changes until the shopper uses one.
 */
function Takes({ s }) {
  const busy = Boolean(s.run && !s.run.done);
  const [kept, setKept] = useState([]);
  // A swap is only offered into a product this plan could actually use: not
  // one it kept out of the house, one no one here can eat, one it cannot
  // measure or price, or one it left out for its size or price. Offering one
  // of those took the old product out and put nothing in.
  const barred = useMemo(() => {
    const e = s.plan?.explanation ?? {};
    return new Set([
      ...(e.products_kept_out ?? []), ...(e.products_refused ?? []), ...(e.products_not_plannable ?? []),
      ...(e.products_too_big ?? []), ...(e.products_priced_out ?? []),
    ].map((x) => String(x.skuId)));
  }, [s.plan?.explanation]);
  const cards = useMemo(() => {
    const out = [];
    for (const line of s.lines) {
      if (!line.product) continue;
      const edges = s.edges.filter((e) => String(e.from_sku) === String(line.skuId) && !barred.has(String(e.to_sku)));
      const [top] = swapsFor({ product: line.product, edges, catalogue: s.products, max: 1 });
      if (top && !s.lines.some((l) => String(l.skuId) === String(top.skuId))) out.push({ line, swap: top });
      if (out.length >= 4) break;
    }
    return out;
  }, [s.lines, s.edges, s.products, barred]);
  const offered = cards.filter((c) => !kept.includes(String(c.line.skuId)));
  const swappedIn = s.requests.filter((r) => !r.undone && r.kind === "upgrade").length;
  const totals = totalsOf(s.plan);
  const protein = s.lines.reduce((sum, l) => sum + (Number(l.supplies?.protein) || 0), 0);

  return (
    <section data-card aria-label="KOI's second takes" className="mb-5 flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-koi-display text-[22px] font-extrabold text-koi-forest">KOI’s second takes</span>
        <span className="font-koi-mono text-[11px] font-medium uppercase tracking-[0.14em] text-koi-muted">swaps with a label figure{cards.length ? ` · ${cards.length} on file` : ""}{swappedIn ? ` · ${swappedIn} used` : ""}</span>
      </div>
      {offered.length === 0 ? (
        <p className="m-0 rounded-2xl border border-koi-forest/10 bg-white px-4 py-3 text-[13.5px] text-koi-muted">
          {cards.length ? "You’ve kept take one on everything. KOI won’t ask again for these." : "No swaps on file for this basket yet. KOI only offers one it can show a label figure for."}
        </p>
      ) : offered.map(({ line, swap }) => (
        <aside key={line.skuId} className="relative flex flex-wrap items-center gap-x-[22px] gap-y-4 overflow-hidden rounded-[22px] bg-koi-forest px-5 py-4 text-koi-bg">
          <Clapper />
          <div className="flex min-w-0 flex-[1_1_280px] flex-col gap-1">
            <span className="font-koi-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-koi-lime">Take 2 · {line.aisle ?? swap.shelf}</span>
            <span className="text-lg font-bold leading-snug">{swap.name}, instead of {line.name}</span>
            <span className="text-sm leading-normal text-koi-bg/80">
              On the label: {swap.facts.join(" · ")}{swap.price ? ` · ${swap.price}` : ""}. Nothing changes until you choose.
            </span>
          </div>
          <div className="flex flex-wrap gap-2.5">
            <button
              type="button"
              disabled={busy}
              onClick={() => s.followUp(`Swap ${line.name} for ${swap.name}`, { reading: { swaps: [{ fromSku: line.skuId, toSku: swap.skuId, from: line.name, to: swap.name }] } }).catch((e) => s.setError(e?.message))}
              className="h-[46px] rounded-full bg-koi-lime px-5 text-sm font-bold text-koi-forest disabled:opacity-60"
            >
              Use take 2
            </button>
            <button type="button" onClick={() => setKept((k) => [...k, String(line.skuId)])} className="h-[46px] rounded-full border border-koi-bg/30 px-5 text-sm font-semibold text-koi-bg transition-colors hover:bg-koi-bg/10">Keep take 1</button>
          </div>
        </aside>
      ))}
      <div className="flex flex-wrap gap-3.5 rounded-[22px] border border-koi-forest/10 bg-white p-4">
        <div className="flex min-w-[180px] flex-1 items-center gap-3">
          <span aria-hidden="true" className="grid size-11 place-items-center rounded-xl bg-koi-tint text-koi-green">
            <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M4 19V9M10 19V5M16 19v-6M22 19h-20" /></svg>
          </span>
          <div>
            <div className="font-koi-mono text-[10.5px] uppercase tracking-[0.14em] text-koi-muted">Protein in this plan</div>
            <div className="font-koi-num text-[17px] font-semibold">{protein ? `${inr(protein)} g` : "—"} <span className="font-koi-sans text-[13px] font-medium text-koi-ink2">from label figures, {totals.days ?? s.days} days</span></div>
          </div>
        </div>
        <div className="flex min-w-[180px] flex-1 items-center gap-3">
          <span aria-hidden="true" className="grid size-11 place-items-center rounded-xl bg-koi-tint text-koi-green">
            <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="5" width="16" height="16" rx="2" /><path d="M4 9h16M9 3v4M15 3v4M9 14l2 2 4-4" /></svg>
          </span>
          <div>
            <div className="font-koi-mono text-[10.5px] uppercase tracking-[0.14em] text-koi-muted">Plan cost</div>
            <div className="font-koi-num text-[17px] font-semibold">{rupees(totals.cost)} <span className="font-koi-sans text-[13px] font-medium text-koi-ink2">{totals.budget ? (totals.withinBudget ? `within ${rupees(totals.budget)}` : `over ${rupees(totals.budget)}`) : "no budget set"}</span></div>
          </div>
        </div>
      </div>
    </section>
  );
}

const TONE = {
  mine: "bg-koi-lime-soft text-koi-forest",
  shared: "bg-koi-tint text-koi-primary",
};

/**
 * What each person eats from the basket, per slot, per day. With the week of
 * dishes on screen it folds away under the grid ("compact"): it is still where
 * a product can be left out, asked for more of, or checked for "can't get it".
 */
function WeekBoard({ s, compact = false }) {
  const [menu, setMenu] = useState(null);
  const [open, setOpen] = useState(!compact);
  const busy = Boolean(s.run && !s.run.done);
  const board = useMemo(() => (s.plan ? weekBoard(s.plan.report, s.lines, s.plan.days) : null), [s.plan, s.lines]);
  const people = board ? [...board.people].sort((a, b) => s.orderOf(a.id) - s.orderOf(b.id)) : [];
  const shared = (skuId) => people.filter((p) => board.rows.some((r) => (r.cells[p.id] ?? []).some((i) => i.skuId === skuId))).length;
  const tray = s.categories.filter((c) => !s.lines.some((l) => l.categoryKey === c.key)).slice(0, 7);
  const cols = { gridTemplateColumns: `96px repeat(${people.length}, minmax(150px, 1fr))`, minWidth: 96 + people.length * 157 };

  if (compact && !open) {
    return (
      <section data-card className={`${card} mb-5`}>
        <button type="button" onClick={() => setOpen(true)} aria-expanded="false" className="flex w-full items-center justify-between gap-3 text-left">
          <span className="font-koi-display text-[22px] font-extrabold text-koi-forest">From the basket, per person</span>
          <span className="text-xs font-semibold text-koi-green">each product, a day · change one ▾</span>
        </button>
      </section>
    );
  }

  return (
    <section data-card className={`${card} mb-5 ${busy ? "opacity-70" : ""}`}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        {compact ? (
          <button type="button" onClick={() => setOpen(false)} aria-expanded="true" className="flex flex-1 items-center justify-between gap-3 text-left">
            <span className="font-koi-display text-[22px] font-extrabold text-koi-forest">From the basket, per person</span>
            <span className="text-xs font-semibold text-koi-green">▴</span>
          </button>
        ) : (
          <>
            <span className="font-koi-display text-[22px] font-extrabold text-koi-forest">This week</span>
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={busy || !s.picked.length} onClick={() => s.makePlan().catch((e) => s.setError(e?.message))} className="h-10 rounded-full border border-koi-forest/15 bg-white px-4 text-[13px] font-semibold text-koi-ink2 disabled:opacity-60">{s.plan ? "Re-plan week" : "Auto-fill week"}</button>
              {s.plan && <button type="button" disabled={busy} onClick={() => s.command("cheaper")} className="h-10 rounded-full bg-koi-tint px-4 text-[13px] font-semibold text-koi-primary disabled:opacity-60">Make it cheaper</button>}
            </div>
          </>
        )}
      </div>

      {!board ? (
        <div className="rounded-2xl border border-dashed border-koi-forest/25 bg-koi-paper p-6 text-center">
          <p className="m-0 text-sm font-semibold text-koi-ink2">{s.mode === "setup" ? "Tell KOI who's eating, above, to start." : "Nothing planned yet."}</p>
          <p className="m-0 mt-1.5 text-xs text-koi-muted">{s.mode === "setup" ? "Or add people with “Add member…” in the household panel." : "Tap Auto-fill week, or tell KOI what you want."}</p>
        </div>
      ) : (
        <>
          <div className="mb-3.5 flex flex-wrap items-center gap-4 rounded-xl bg-koi-paper px-3.5 py-2.5 text-[11px] font-medium text-koi-ink2">
            <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-[3px] bg-koi-tint ring-1 ring-koi-tint-border" />Shared <span className="text-koi-muted">— bought once, eaten by more than one</span></span>
            <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-[3px] bg-koi-lime-soft ring-1 ring-koi-lime" />Just theirs <span className="text-koi-muted">— on one plate only</span></span>
            <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-[3px] bg-koi-red-bg ring-1 ring-koi-red/20" />Not for them</span>
          </div>
          <div className="koi-plan-grid-wrap">
            <div className="mb-2 grid gap-2" style={cols}>
              <div />
              {people.map((p) => (
                <div key={p.id} className="flex items-center justify-center gap-2 py-1.5 text-xs font-semibold text-koi-ink2">
                  <span className="grid size-5 place-items-center rounded-full font-koi-num text-[8px] font-bold text-white" style={{ background: s.colourFor(p.id) }}>{initialsOf(p.label)}</span>
                  {p.label} <span className="font-koi-mono text-[10px] text-koi-muted">/ day</span>
                </div>
              ))}
            </div>
            {board.rows.map((row) => (
              <div key={row.key} className="mb-2 grid items-stretch gap-2" style={cols}>
                <div className="flex items-center font-koi-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-koi-ink2">{row.label}</div>
                {people.map((p) => {
                  const items = row.cells[p.id] ?? [];
                  return (
                    <div key={p.id} className={`relative flex min-h-[58px] flex-col gap-1 rounded-2xl border border-koi-forest/10 p-2 ${items.length ? "bg-white" : "bg-koi-paper"}`}>
                      {items.length === 0 && <span className="text-[11px] text-koi-muted/70">—</span>}
                      {items.map((item) => {
                        const mine = shared(item.skuId) <= 1;
                        const cellKey = `${row.key}:${p.id}:${item.skuId}`;
                        return (
                          <div key={item.skuId} className="relative">
                            <button type="button" onClick={() => setMenu((m) => (m === cellKey ? null : cellKey))} className={`block w-full rounded-lg px-2 py-1 text-left ${mine ? TONE.mine : TONE.shared}`}>
                              <span className="block text-[11.5px] font-semibold leading-tight">{item.name}</span>
                              <span className="block font-koi-mono text-[10px] opacity-85">
                                {amountOf(item.perDay, item.unit) ?? `${item.packs} ${Number(item.packs) === 1 ? "pack" : "packs"} this week`}
                                {item.also?.length ? ` · or ${item.also.join(", ")}` : ""}
                              </span>
                            </button>
                            <Unverified allergens={item.notVerifiedFor} />
                            {menu === cellKey && (
                              <div role="menu" className="absolute left-0 top-full z-30 mt-1 w-48 rounded-xl border border-koi-forest/10 bg-white p-1 shadow-[0_18px_34px_-10px_rgba(0,0,0,.28)]">
                                <span className={`${monoHead} block px-2.5 pb-0.5 pt-1.5 text-koi-muted`}>Change it</span>
                                <button type="button" role="menuitem" disabled={busy} onClick={() => { setMenu(null); s.seeWithout(item.skuId); }} className="block w-full rounded-lg px-2.5 py-1.5 text-left text-xs font-medium text-koi-ink hover:bg-koi-paper">Can’t get this?</button>
                                <button type="button" role="menuitem" disabled={busy} onClick={() => { setMenu(null); s.command(`no ${productWordFor(item.name) ?? item.name}`); }} className="block w-full rounded-lg px-2.5 py-1.5 text-left text-xs font-medium text-koi-red hover:bg-koi-paper">Leave it out</button>
                                <button type="button" role="menuitem" disabled={busy} onClick={() => { setMenu(null); s.command(`more ${productWordFor(item.name) ?? item.name}`); }} className="block w-full rounded-lg px-2.5 py-1.5 text-left text-xs font-medium text-koi-primary hover:bg-koi-paper">More of this</button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            ))}
            {(s.plan.report.whoEatsWhat ?? []).some((w) => (w.notForThem ?? []).length) && (
              <div className="grid gap-2" style={cols}>
                <div className="flex items-center font-koi-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-koi-ink2">Not for them</div>
                {people.map((p) => {
                  const w = s.plan.report.whoEatsWhat.find((x) => String(x.member) === String(p.id));
                  return (
                    <div key={p.id} className="flex flex-col gap-0.5 rounded-2xl border border-koi-red/15 bg-koi-red-bg p-2">
                      {(w?.notForThem ?? []).length === 0 ? <span className="text-[11px] text-koi-muted/70">—</span> : w.notForThem.slice(0, 4).map((n) => (
                        <span key={n.skuId} className="text-[10.5px] font-semibold text-koi-red">−{n.name} <span className="font-medium opacity-80">({n.because})</span></span>
                      ))}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <p className="m-0 mt-2.5 text-[11.5px] text-koi-muted">Each person’s daily share of the basket, in the slot its shelf serves.</p>
        </>
      )}

      {tray.length > 0 && s.plan && (
        <div className="mt-4 rounded-2xl bg-koi-paper p-4">
          <div className="mb-2.5 text-xs font-semibold text-koi-ink2">Quick add to your plan <span className="font-normal text-koi-muted">— tap to ask KOI to fit it in</span></div>
          <div className="flex flex-wrap gap-2">
            {tray.map((c) => (
              <button key={c.key} type="button" disabled={busy} onClick={() => s.command(`add ${c.label.toLowerCase()}`)} className="flex h-10 items-center gap-2 rounded-xl border border-koi-forest/10 bg-white px-3.5 text-xs font-semibold text-koi-ink disabled:opacity-60">
                <span aria-hidden="true" className="size-2 rounded-full bg-koi-green" />{c.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {Object.entries(s.without).map(([skuId, w]) => {
        const name = s.lines.find((l) => String(l.skuId) === String(skuId))?.name ?? "that";
        const d = w.result?.diff;
        return (
          <div key={skuId} className="mt-3 rounded-2xl bg-koi-amber-bg px-4 py-3 text-xs font-medium text-koi-ink2">
            <strong className="text-koi-ink">If you can’t get {name}: </strong>
            {w.busy ? "re-planning without it…" : w.error ? w.error : d?.substitutes?.length
              ? d.substitutes.map((x) => `${x.packs} × ${x.name}${x.why?.length ? ` (${x.why.join(", ")})` : ""}`).join(" · ")
              : (d?.added ?? []).length ? `KOI would add ${d.added.map((x) => `${x.packs} × ${x.name}`).join(", ")}` : "the rest of the plan covers it."}
          </div>
        );
      })}

      {board && !compact && <Plates s={s} board={board} />}
    </section>
  );
}

function Plates({ s, board }) {
  const people = peopleOf(s.plan.report, s.plan.days).sort((a, b) => s.orderOf(a.id) - s.orderOf(b.id));
  const activeId = s.active?.memberId;
  const me = people.find((p) => String(p.id) === String(activeId)) ?? people[0];
  const favCount = (s.active?.favourite_categories ?? []).length;
  return (
    <>
      <div className="mt-4 rounded-2xl bg-koi-paper p-4">
        <span className={`${monoHead} text-koi-muted`}>Each person’s plate · a day</span>
        {people.map((p) => {
          const profile = s.saved.find((x) => String(x.memberId) === String(p.id));
          const items = board.rows.flatMap((row) => (row.cells[p.id] ?? []).map((item) => ({ slot: row.label, name: item.name, amount: amountOf(item.perDay, item.unit) })));
          return (
            <div key={p.id} className="flex items-start gap-2.5 border-b border-koi-forest/10 py-2 last:border-b-0">
              <span className="grid size-7 shrink-0 place-items-center rounded-full font-koi-num text-[10px] font-bold text-white" style={{ background: s.colourFor(p.id) }}>{initialsOf(p.label)}</span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2"><span className="text-xs font-semibold">{p.label}</span><span className="font-koi-mono text-[10px] text-koi-muted">{profile ? goalShortLabel(profile) : ""}</span></div>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {items.slice(0, 6).map((it, k) => <span key={k} className="rounded-md border border-koi-forest/10 bg-white px-2 py-0.5 text-[10.5px]">{it.slot}: {it.name}{it.amount ? ` ${it.amount}` : ""}</span>)}
                  <span className={`rounded-md px-2 py-0.5 text-[10.5px] font-semibold ${p.met ? "bg-koi-tint text-koi-primary" : "bg-koi-amber-bg text-koi-amber-ink"}`}>
                    {p.met ? "Every target met" : `Short ${p.short.map((x) => `${x.perDay}${x.nutrient === "kcal" ? " kcal" : " g"} ${x.nutrient === "kcal" ? "" : x.nutrient}`.trim()).join(", ")} a day`}
                  </span>
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="font-koi-num text-[13px] font-semibold">{p.perDay.kcal !== null ? inr(p.perDay.kcal) : "—"}</div>
                <div className="font-koi-mono text-[9.5px] text-koi-muted">{p.target.kcal ? `kcal / ${inr(p.target.kcal)}` : "kcal a day"}</div>
              </div>
            </div>
          );
        })}
      </div>
      {me && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2.5 border-t border-koi-forest/10 pt-3.5">
          <div className="text-xs font-medium text-koi-muted">{me.label} · a day · <span className="font-koi-num">{favCount}</span> favourites leaning the plan</div>
          <div className="flex items-center gap-2">
            <span className="font-koi-mono text-[11px] text-koi-muted">{s.active ? goalShortLabel(s.active) : ""}</span>
            <span className="font-koi-num text-sm font-semibold text-koi-primary">{me.perDay.kcal !== null ? inr(me.perDay.kcal) : "—"} kcal · {me.perDay.protein !== null ? me.perDay.protein : "—"}g protein</span>
          </div>
        </div>
      )}
    </>
  );
}

/** What the plan could not do, what would fix it, and what it covers of a plate. */
function Gaps({ s }) {
  const [open, setOpen] = useState(false);
  if (!s.plan) return null;
  const e = s.plan.explanation ?? {};
  const notes = noteLines(s.plan);
  const warn = notes.filter((n) => n.warn);
  const fixes = e.conflicts?.fixes ?? [];
  const groups = e.food_groups;
  return (
    <section data-card className={`${card} mb-5`}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center justify-between gap-3 text-left">
        <span className="font-koi-display text-[22px] font-extrabold text-koi-forest">How KOI made this plan</span>
        <span className={`text-xs font-semibold ${warn.length ? "text-koi-warm" : "text-koi-green"}`}>{warn.length ? `${warn.length} to know` : "nothing given up"} {open ? "▴" : "▾"}</span>
      </button>
      {fixes.length > 0 && (
        <div className="mt-3.5 rounded-2xl bg-koi-amber-bg px-4 py-3">
          <span className={`${monoHead} text-koi-amber-ink`}>What would fix it</span>
          {fixes.map((f) => <p key={f.key} className="m-0 mt-1 text-[13px] font-medium text-koi-amber-ink">{f.says}</p>)}
        </div>
      )}
      {open && (
        <div className="mt-3.5 flex flex-col gap-2">
          {groups && (
            <p className="m-0 text-[13px] font-medium text-koi-ink2">
              Covers {groups.covered?.length ?? 0} of {groups.of} food groups{groups.missing?.length ? ` · missing ${groups.missing.map((g) => g.label).join(", ")}` : ""}{groups.cannotSupply?.length ? ` · KOI has no aisle yet for ${groups.cannotSupply.map((g) => g.label).join(", ")}` : ""}.
            </p>
          )}
          {notes.map((n, i) => <p key={i} className={`m-0 text-[13px] ${n.warn ? "font-semibold text-koi-warm" : "text-koi-ink2"}`}>{n.text}</p>)}
        </div>
      )}
    </section>
  );
}

/** The storyboard's foot: this week's cart, and on to the Pantry. */
function WeekCart({ s, onNext }) {
  const totals = totalsOf(s.plan);
  const lines = s.lines ?? [];
  return (
    <div className="mt-2 flex flex-wrap items-center justify-between gap-3.5 rounded-[22px] border border-koi-forest/10 bg-white px-5 py-3.5">
      <div className="flex items-center gap-3">
        <span className="flex">
          {lines.slice(0, 3).map((l, i) => (
            <span key={l.skuId} className={`overflow-hidden rounded-xl border-2 border-white shadow-[0_4px_10px_-6px_rgba(15,61,46,.5)] ${i ? "-ml-2.5" : ""}`}>
              <ProductThumb src={l.product?.image?.hero || null} alt="" size={44} radius={10} />
            </span>
          ))}
        </span>
        <div className="flex flex-col gap-0.5">
          <span className="font-koi-mono text-[10.5px] font-medium uppercase tracking-[0.14em] text-koi-muted">This week’s cart · <span className="font-koi-num">{lines.length}</span> {lines.length === 1 ? "product" : "products"}</span>
          <span className="font-koi-num text-xl font-semibold">{rupees(totals.cost)} <span className="font-koi-mono text-[11px] font-medium tracking-[0.12em] text-koi-muted">MRP</span></span>
        </div>
      </div>
      <button type="button" onClick={onNext} className="flex h-[46px] items-center gap-2 rounded-full bg-koi-forest px-5 text-sm font-bold text-koi-lime">
        Next: Pantry
        <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></svg>
      </button>
    </div>
  );
}

export default function PlanStep({ s, onBack, onNext }) {
  const root = useRef(null);
  const ember = useEmber();
  const say = useKoiVoice((v) => v.say);
  const running = Boolean(s.run && !s.run.done);

  useGSAP(() => {
    if (prefersReducedMotion()) return;
    setupMotion().from(root.current.querySelectorAll("[data-card]"), { autoAlpha: 0, y: 30, duration: 0.85, stagger: 0.08, ease: E.dolly, delay: 0.2, clearProps: "opacity,visibility,transform" });
  }, { scope: root });

  // KOI carries the run: a capsule while it plans, a tick when it is done.
  const was = useRef(running);
  useEffect(() => {
    if (running && !was.current) { ember.status("Planning"); say("On it. I’m re-solving the week; watch it work."); }
    if (!running && was.current) {
      ember.status(null);
      if (s.run?.error) say("I stopped. Nothing in your plan changed.");
      else { ember.done(); say(s.run?.undone ? "Taken back. Your plan is as it was." : "Done. Every change is in your requests, and the latest can be undone."); }
    }
    was.current = running;
  }, [running, s.run, ember, say]);

  useEffect(() => {
    if (!s.plan) say(s.mode === "setup" ? "Tell me who’s eating, in your own words. I’ll draft the household." : "Plan the week for everyone, or tell me what to change.");
    else say("Here’s the week. Ask for a change, or take one of my second takes.");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on arrival
  }, []);
  useEffect(() => () => ember.rest(), [ember]);

  return (
    <div ref={root} className="font-koi-sans text-koi-ink">
      <StepHead eyebrow="Plan · step 3 of 5" title="A week of groceries, planned around everyone at home" sub="Tell KOI in plain words, or take a swap. Every change re-solves the plan — watch it work." />
      <CommandBox s={s} />
      {s.saved.length > 0 && <ThisWeek s={s} />}
      {s.week && <WeekGrid s={s} />}
      {s.plan && <Takes s={s} />}
      <WeekBoard s={s} compact={Boolean(s.week)} />
      <Gaps s={s} />
      {s.plan ? <WeekCart s={s} onNext={onNext} /> : null}
      <Footer onBack={onBack} next={s.plan ? null : { label: "Build my pantry & cart", onClick: onNext, disabled: true }} />
    </div>
  );
}
