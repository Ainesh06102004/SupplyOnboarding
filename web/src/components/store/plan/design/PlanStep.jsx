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
// The design's 7-day grid of dishes needs dishes, which KOI does not have yet
// (plan doc, Phase 2). The board below keeps the design's frame — the five
// slots of a day — and fills it with what the planner did decide: each
// person's daily share of the basket, per slot its shelf serves.

import { useMemo, useState } from "react";
import { followUpExamples, MAX_FOLLOWUP_CHARS, productWordFor } from "@/lib/planner/followup";
import { MAX_BRIEF_CHARS, AGE_BANDS } from "@/lib/planner/brief";
import { DIET_TYPES, FOODS_AVOID } from "@/lib/recommendation/config";
import { swapsFor } from "@/lib/food/swaps";
import { goalShortLabel } from "@/lib/plan/goalCards";
import { weekBoard, peopleOf, noteLines, rupees, totalsOf } from "@/lib/plan/planView";
import ThisWeekChips from "@/components/store/plan/ThisWeekChips";
import { C, font, cardStyle, initialsOf, inr } from "./tokens";
import { StepHead, Footer, MonoLabel, Unverified } from "./bits";
import WeekGrid from "./WeekGrid";

const labelOf = (list, key) => list.find((x) => x.key === key)?.label ?? key;
const amountOf = (perDay, unit) => (perDay === null || perDay === undefined ? null : unit ? `${perDay} ${unit}` : `${perDay}`);

function StateMark({ state }) {
  if (state === "running") return <span aria-hidden="true" style={{ width: 9, height: 9, borderRadius: "50%", background: C.mint, flex: "none", marginTop: 5, animation: "koiPulse 1.1s ease-in-out infinite" }} />;
  if (state === "warn") return <span aria-hidden="true" style={{ width: 9, height: 9, borderRadius: "50%", background: "#f2c46b", flex: "none", marginTop: 5 }} />;
  return <span aria-hidden="true" style={{ font: font(700, 11), color: C.mint, width: 9, flex: "none", marginTop: 1 }}>✓</span>;
}

/** KOI working: the streamed run, line by line. */
function AgentRun({ run, onUndoRun }) {
  if (!run) return null;
  const seconds = run.finishedAt ? ((run.finishedAt - run.startedAt) / 1000).toFixed(1) : null;
  return (
    <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid rgba(255,255,255,.13)", animation: "koiFade .3s ease both" }} aria-live="polite">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 9, gap: 10 }}>
        <MonoLabel color="rgba(255,255,255,.5)">{run.undone ? "Taken back · your plan is as it was" : run.done ? (run.error ? "KOI stopped" : `KOI finished${seconds ? ` · ${seconds} s` : ""}`) : "KOI is working"}</MonoLabel>
        {!run.done && <span aria-hidden="true" style={{ width: 12, height: 12, border: "2px solid rgba(255,255,255,.25)", borderTopColor: C.mint, borderRadius: "50%", animation: "koiSpin .8s linear infinite" }} />}
        {onUndoRun && (
          <button type="button" onClick={onUndoRun} style={{ cursor: "pointer", background: "rgba(255,255,255,.1)", border: "1px solid rgba(255,255,255,.22)", borderRadius: 999, padding: "4px 11px", font: font(600, 11), color: "#fff", whiteSpace: "nowrap" }}>
            ↶ Undo all of this
          </button>
        )}
      </div>
      <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 7, opacity: run.undone ? 0.45 : 1, textDecoration: run.undone ? "line-through" : "none" }}>
        {run.lines.map((line) => (
          <li key={line.id} style={{ display: "flex", gap: 9, alignItems: "flex-start", animation: "koiUp .3s ease both", marginLeft: line.nested ? 18 : 0, marginTop: line.tool ? 4 : 0 }}>
            <StateMark state={line.state} />
            <div style={{ minWidth: 0 }}>
              <div style={{ font: font(line.tool ? 700 : line.nested ? 500 : 600, line.nested ? 12 : 13), color: line.nested ? C.mintChip : "#fff" }}>{line.title}</div>
              {line.detail && <div style={{ font: font(500, 11, "mono"), color: C.mintMuted, marginTop: 1 }}>{line.detail}</div>}
            </div>
          </li>
        ))}
      </ol>
      {run.explain?.length > 0 && (
        <div style={{ marginTop: 10, background: "rgba(255,255,255,.08)", borderRadius: 12, padding: "10px 12px" }}>
          {run.explain.map((n, i) => <p key={i} style={{ font: font(n.warn ? 600 : 500, 12), color: n.warn ? "#f5d7a1" : C.mintChip, margin: i ? "4px 0 0" : 0 }}>{n.text}</p>)}
        </div>
      )}
      {run.source && run.done && <div style={{ font: font(500, 10, "mono"), color: "rgba(255,255,255,.35)", marginTop: 8 }}>{run.source === "model" ? "Read by KOI's model, done by KOI's planner" : "Read by KOI's rules, done by KOI's planner"}</div>}
      {run.draft && !run.done && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
          {run.draft.basket.slice(0, 10).map((l) => (
            <span key={l.skuId} style={{ font: font(500, 11), color: C.mintChip, background: "rgba(255,255,255,.1)", border: "1px solid rgba(255,255,255,.18)", borderRadius: 999, padding: "4px 10px", animation: "koiPop .35s ease both" }}>
              {l.packs} × {l.name}
            </span>
          ))}
        </div>
      )}
      {run.error && <p style={{ font: font(500, 12), color: "#f5b8ae", margin: "10px 0 0" }}>{run.error}</p>}
    </div>
  );
}

/** A household in words, drafted and waiting to be kept. */
function BriefDraft({ brief, onKeep, onDrop }) {
  return (
    <div style={{ marginTop: 14, background: "#fff", borderRadius: 16, padding: 16 }}>
      <MonoLabel color={C.muted} style={{ marginBottom: 8 }}>Drafted · check, then keep</MonoLabel>
      {brief.members.map((m, i) => (
        <div key={i} style={{ font: font(500, 13), color: C.ink, padding: "6px 0", borderBottom: `1px solid ${C.divider}` }}>
          <strong>{m.label}</strong> · {labelOf(AGE_BANDS, m.age_band)} · {labelOf(DIET_TYPES, m.diet_type)}
          {m.target_protein_g ? ` · ${m.target_protein_g} g protein` : ""}
          {m.target_kcal ? ` · ${m.target_kcal} kcal` : ""}
          {(m.avoidKeys ?? []).length ? ` · avoids ${m.avoidKeys.map((k) => labelOf(FOODS_AVOID, k)).join(", ")}` : ""}
        </div>
      ))}
      {[...(brief.notes ?? []), ...(brief.unresolved?.length ? [`Not applied: ${brief.unresolved.join(", ")}.`] : [])].map((n, i) => (
        <p key={i} style={{ font: font(400, 12), color: C.muted, margin: "6px 0 0" }}>{n}</p>
      ))}
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <button type="button" onClick={onKeep} disabled={!brief.members.length} style={{ cursor: "pointer", background: C.primary, color: "#fff", border: "none", borderRadius: 10, padding: "9px 16px", font: font(600, 13) }}>Keep these people</button>
        <button type="button" onClick={onDrop} style={{ cursor: "pointer", background: "none", color: C.muted, border: "none", font: font(600, 13) }}>Start again</button>
      </div>
    </div>
  );
}

function CommandBox({ s }) {
  const [text, setText] = useState("");
  const busy = Boolean(s.run && !s.run.done);
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
    s.command(value.slice(0, max));
    setText("");
  };
  const open = s.requests.filter((r) => !r.undone);
  const latest = open.at(-1);

  return (
    <div style={{ background: C.primary, borderRadius: 22, padding: 22, marginBottom: 18 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 13, flexWrap: "wrap" }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3v3M12 18v3M3 12h3M18 12h3M6 6l2 2M16 16l2 2M18 6l-2 2M8 16l-2 2" stroke={C.mint} strokeWidth="1.7" strokeLinecap="round" /></svg>
        <span style={{ font: font(700, 15), color: "#fff" }}>Tell KOI what you want</span>
        <span style={{ font: font(500, 11, "mono"), color: "rgba(255,255,255,.5)" }}>
          {s.mode === "setup" ? "it drafts your household" : "it re-solves the plan and the cart"}
        </span>
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") send(); }}
          placeholder={placeholder}
          maxLength={max}
          aria-label="Tell KOI what you want"
          disabled={busy}
          style={{ flex: 1, minWidth: 0, border: "none", borderRadius: 12, padding: "14px 16px", font: font(500, 14), background: "#fff", color: C.ink }}
        />
        <button type="button" onClick={() => send()} disabled={busy || !text.trim()} style={{ cursor: busy ? "wait" : "pointer", background: C.accent, border: "none", borderRadius: 12, padding: "0 22px", font: font(600, 14), color: "#fff", opacity: busy || !text.trim() ? 0.7 : 1 }}>
          {s.mode === "setup" ? "Read" : s.mode === "ready" ? "Plan it" : "Apply"}
        </button>
      </div>
      {quick.length > 0 && (
        <div style={{ display: "flex", gap: 7, marginTop: 12, flexWrap: "wrap" }}>
          {quick.map((q) => (
            <button key={q} type="button" disabled={busy} onClick={() => send(q)} style={{ cursor: "pointer", background: "rgba(255,255,255,.1)", border: "1px solid rgba(255,255,255,.18)", borderRadius: 999, padding: "6px 12px", font: font(500, 12), color: C.mintChip }}>
              + {q}
            </button>
          ))}
        </div>
      )}

      <AgentRun run={s.run} onUndoRun={s.canUndoRun ? s.undoRun : null} />
      {s.brief && <BriefDraft brief={s.brief} onKeep={s.keepBrief} onDrop={() => s.setBrief(null)} />}

      {open.length > 0 && (
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid rgba(255,255,255,.13)" }}>
          <MonoLabel color="rgba(255,255,255,.5)" style={{ marginBottom: 9 }}>Your requests · applied</MonoLabel>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {open.map((r) => {
              const before = r.basketChange?.costBefore;
              const cost = Number.isFinite(Number(before)) && Number.isFinite(Number(r.costAfter)) ? `${rupees(before)} → ${rupees(r.costAfter)}` : null;
              return (
                <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 8, background: "#fff", borderRadius: 999, padding: "7px 9px 7px 13px" }}>
                  <span style={{ font: font(600, 12), color: C.ink }}>{r.applied.length ? r.applied.slice(0, 2).join(" · ") : `Tried: ${r.text}`}</span>
                  {cost && <span style={{ font: font(500, 11, "mono"), color: C.accent }}>{cost}</span>}
                  {r.householdChanges?.length > 0 && !r.savedToHousehold && (
                    <button type="button" onClick={() => s.saveHouseholdChanges(r.id)} style={{ cursor: "pointer", border: "none", background: C.tint, color: C.primary, borderRadius: 999, padding: "2px 8px", font: font(600, 11) }}>Save to household</button>
                  )}
                  {latest?.id === r.id && (
                    <button type="button" aria-label="Undo this change" title="Undo" onClick={() => s.undo(r.id)} disabled={busy} style={{ cursor: "pointer", width: 18, height: 18, borderRadius: "50%", background: C.divider, border: "none", display: "flex", alignItems: "center", justifyContent: "center", font: font(600, 12), color: C.muted, padding: 0 }}>×</button>
                  )}
                </div>
              );
            })}
          </div>
          {latest?.notApplied?.length > 0 && <p style={{ font: font(500, 12), color: C.mintChip, margin: "10px 0 0" }}>Not applied: {latest.notApplied.join(" · ")}</p>}
        </div>
      )}
    </div>
  );
}

/** Who is eating, how many days, the budget, and what each person wants or skips this week. */
function ThisWeek({ s }) {
  const [open, setOpen] = useState(!s.plan);
  const busy = Boolean(s.run && !s.run.done);
  const toggle = (id) => s.setPicked((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  return (
    <div style={{ ...cardStyle, marginBottom: 18 }}>
      <button type="button" onClick={() => setOpen((o) => !o)} style={{ all: "unset", cursor: "pointer", display: "flex", width: "100%", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ font: font(700, 17) }}>This week&apos;s brief</span>
        <span style={{ font: font(600, 12), color: C.accent }}>{s.picked.length} eating · {s.days} {Number(s.days) === 1 ? "day" : "days"} · {s.budget ? `₹${inr(s.budget)}` : "no budget"} {open ? "▴" : "▾"}</span>
      </button>
      {open && (
        <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <div style={{ font: font(500, 13), color: C.ink2, marginBottom: 8 }}>Who&apos;s eating</div>
            <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
              {s.saved.map((p) => {
                const on = s.picked.includes(p.memberId);
                return (
                  <button key={p.memberId} type="button" onClick={() => toggle(p.memberId)} style={{ cursor: "pointer", font: font(600, 12), padding: "6px 11px", borderRadius: 999, border: `1px solid ${on ? C.accent : "rgba(20,22,15,.12)"}`, background: on ? C.tint2 : "#fff", color: on ? C.primary : C.muted }}>
                    {on ? "✓ " : ""}{p.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
            <label style={{ font: font(500, 13), color: C.ink2, display: "flex", alignItems: "center", gap: 8 }}>
              Days
              <input type="number" min={1} max={14} value={s.days} onChange={(e) => s.setDays(Math.max(1, Math.min(14, Number(e.target.value) || 1)))} style={{ width: 56, border: `1px solid ${C.inputBorder}`, borderRadius: 7, background: C.surface2, font: font(600, 14), padding: "4px 6px" }} />
            </label>
            <label style={{ font: font(500, 13), color: C.ink2, display: "flex", alignItems: "center", gap: 8 }}>
              Budget ₹
              <input type="number" min={1} value={s.budget} placeholder="none" onChange={(e) => s.setBudget(e.target.value)} style={{ width: 96, border: `1px solid ${C.inputBorder}`, borderRadius: 7, background: C.surface2, font: font(600, 14), padding: "4px 6px" }} />
            </label>
          </div>
          {s.active?.memberId && s.categories.length > 0 && (
            <div>
              <div style={{ font: font(500, 13), color: C.ink2, marginBottom: 8 }}>{s.active.label} this week <span style={{ color: C.faint }}>— tap: want, skip, or leave it to KOI</span></div>
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
            <button type="button" disabled={busy || !s.picked.length} onClick={() => s.makePlan().catch((e) => s.setError(e?.message))} style={{ cursor: busy ? "wait" : "pointer", background: C.primary, color: "#fff", border: "none", borderRadius: 12, padding: "12px 20px", font: font(600, 14), opacity: busy || !s.picked.length ? 0.6 : 1 }}>
              {s.plan ? "Plan again" : `Plan for ${s.picked.length} ${s.picked.length === 1 ? "person" : "people"}`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Swaps the substitution graph can show a figure for, one per basket line. */
function Upgrades({ s }) {
  const busy = Boolean(s.run && !s.run.done);
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
  const swappedIn = s.requests.filter((r) => !r.undone && r.kind === "upgrade").length;
  const totals = totalsOf(s.plan);
  const protein = s.lines.reduce((sum, l) => sum + (Number(l.supplies?.protein) || 0), 0);

  return (
    <div style={{ ...cardStyle, marginBottom: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, gap: 10, flexWrap: "wrap" }}>
        <span style={{ font: font(700, 17) }}>Ingredient upgrades, with the figures</span>
        <span style={{ font: font(600, 12), color: C.accent }}>{cards.length ? `${cards.length} on file` : ""}{swappedIn ? ` · ${swappedIn} applied` : ""}</span>
      </div>
      {cards.length === 0 ? (
        <p style={{ font: font(400, 13), color: C.muted, margin: 0 }}>No swaps on file for this basket yet. KOI only suggests a swap it can show a label figure for.</p>
      ) : (
        <div className="koi-two">
          {cards.map(({ line, swap }) => (
            <div key={line.skuId} style={{ background: C.surface2, border: `1px solid ${C.line2}`, borderRadius: 16, padding: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, gap: 8 }}>
                <span style={{ font: font(600, 10, "mono"), letterSpacing: ".06em", color: C.muted, textTransform: "uppercase" }}>{line.aisle} · {swap.shelf}</span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => s.followUp(`Swap ${line.name} for ${swap.name}`, { reading: { swaps: [{ fromSku: line.skuId, toSku: swap.skuId, from: line.name, to: swap.name }] } }).catch((e) => s.setError(e?.message))}
                  style={{ cursor: busy ? "wait" : "pointer", background: "#fff", border: `1px solid ${C.tintBorder}`, color: C.primary, borderRadius: 8, padding: "5px 11px", font: font(600, 12) }}
                >
                  Swap
                </button>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ font: font(600, 14), color: C.muted, textDecoration: "line-through" }}>{line.name}</div>
                  <div style={{ font: font(400, 11, "mono"), color: C.fainter, marginTop: 2 }}>{line.packs} × {line.weight ?? "pack"}</div>
                </div>
                <span style={{ font: font(600, 17), color: C.accent }}>→</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ font: font(600, 14), color: C.primary }}>{swap.name}</div>
                  <div style={{ font: font(400, 11, "mono"), color: C.accent, marginTop: 2 }}>{swap.brand ?? ""}</div>
                </div>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginTop: 13, paddingTop: 12, borderTop: `1px solid ${C.divider}`, gap: 10 }}>
                <div>
                  <div style={{ font: font(500, 10, "mono"), color: C.muted }}>ON THE LABEL</div>
                  <div style={{ font: font(700, 14, "num"), color: C.accent }}>{swap.facts.join(" · ")}</div>
                </div>
                {swap.price && (
                  <div style={{ textAlign: "right" }}>
                    <div style={{ font: font(500, 10, "mono"), color: C.muted }}>PRICE</div>
                    <div style={{ font: font(700, 14, "num"), color: /more/.test(swap.price) ? C.warm : C.accent }}>{swap.price}</div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      <div style={{ display: "flex", gap: 14, marginTop: 14, background: C.panel, borderRadius: 16, padding: 16, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 180, display: "flex", alignItems: "center", gap: 13 }}>
          <div style={{ width: 42, height: 42, borderRadius: 12, background: C.tint, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 19V9M10 19V5M16 19v-6M22 19h-20" stroke={C.accent} strokeWidth="1.8" strokeLinecap="round" /></svg>
          </div>
          <div>
            <div style={{ font: font(500, 11, "mono"), color: C.muted }}>PROTEIN IN THIS PLAN</div>
            <div style={{ font: font(700, 17, "num"), color: C.ink }}>{protein ? `${inr(protein)} g` : "—"} <span style={{ font: font(500, 13), color: C.ink2 }}>from label figures, {totals.days ?? s.days} days</span></div>
          </div>
        </div>
        <div style={{ width: 1, background: C.line2 }} />
        <div style={{ flex: 1, minWidth: 180, display: "flex", alignItems: "center", gap: 13 }}>
          <div style={{ width: 42, height: 42, borderRadius: 12, background: C.tint, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="4" y="5" width="16" height="16" rx="2" stroke={C.accent} strokeWidth="1.7" /><path d="M4 9h16M9 3v4M15 3v4M9 14l2 2 4-4" stroke={C.accent} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </div>
          <div>
            <div style={{ font: font(500, 11, "mono"), color: C.muted }}>PLAN COST</div>
            <div style={{ font: font(700, 17, "num"), color: C.ink }}>{rupees(totals.cost)} <span style={{ font: font(500, 13), color: C.ink2 }}>{totals.budget ? (totals.withinBudget ? `within ${rupees(totals.budget)}` : `over ${rupees(totals.budget)}`) : "no budget set"}</span></div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** The week board: slots of a day × the people eating, from the basket. */
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
  const start = new Date();
  const end = new Date(start.getTime() + ((s.plan?.days ?? s.days) - 1) * 86400000);
  const range = `${start.toLocaleDateString("en-IN", { day: "numeric", month: "short" })} – ${end.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`;
  const shared = (skuId) => people.filter((p) => board.rows.some((r) => (r.cells[p.id] ?? []).some((i) => i.skuId === skuId))).length;
  const tray = s.categories.filter((c) => !s.lines.some((l) => l.categoryKey === c.key)).slice(0, 7);

  if (compact && !open) {
    return (
      <div style={{ ...cardStyle, marginBottom: 18 }}>
        <button type="button" onClick={() => setOpen(true)} style={{ all: "unset", cursor: "pointer", display: "flex", width: "100%", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
          <span style={{ font: font(700, 17) }}>From the basket, per person</span>
          <span style={{ font: font(600, 12), color: C.accent }}>each product, a day · change one ▾</span>
        </button>
      </div>
    );
  }

  return (
    <div style={{ ...cardStyle, marginBottom: 18, opacity: busy ? 0.72 : 1, transition: "opacity .2s" }}>
      {compact && (
        <button type="button" onClick={() => setOpen(false)} style={{ all: "unset", cursor: "pointer", display: "flex", width: "100%", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <span style={{ font: font(700, 17) }}>From the basket, per person</span>
          <span style={{ font: font(600, 12), color: C.accent }}>▴</span>
        </button>
      )}
      <div style={{ display: compact ? "none" : "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, gap: 10, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ font: font(700, 17) }}>This week</span>
          <span style={{ font: font(500, 12), color: C.faint }}>{range}</span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" disabled={busy || !s.picked.length} onClick={() => s.makePlan().catch((e) => s.setError(e?.message))} style={{ display: "flex", alignItems: "center", gap: 6, background: C.surface2, border: `1px solid ${C.line2}`, borderRadius: 10, padding: "8px 12px", font: font(600, 12), color: C.ink2, cursor: busy ? "wait" : "pointer" }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 4v16M4 12h16" stroke={C.ink2} strokeWidth="2" strokeLinecap="round" /></svg>
            {s.plan ? "Re-plan week" : "Auto-fill week"}
          </button>
          {s.plan && (
            <button type="button" disabled={busy} onClick={() => s.command("cheaper")} style={{ display: "flex", alignItems: "center", gap: 6, background: C.tint2, border: `1px solid ${C.tintBorder}`, borderRadius: 10, padding: "8px 12px", font: font(600, 12), color: C.primary, cursor: busy ? "wait" : "pointer" }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 8h13l-3-3M20 16H7l3 3" stroke={C.primary} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
              Make it cheaper
            </button>
          )}
        </div>
      </div>

      {!board ? (
        <div style={{ background: C.surface2, border: `1px dashed ${C.dashed}`, borderRadius: 14, padding: 22, textAlign: "center" }}>
          <p style={{ font: font(600, 14), color: C.ink2, margin: 0 }}>{s.mode === "setup" ? "Tell KOI who's eating, above, to start." : "Nothing planned yet."}</p>
          <p style={{ font: font(400, 12), color: C.muted, margin: "6px 0 0" }}>{s.mode === "setup" ? "Or add people with “Add member…” in the header." : "Tap Auto-fill week, or tell KOI what you want."}</p>
        </div>
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 14, padding: "10px 14px", background: C.surface2, border: `1px solid ${C.line}`, borderRadius: 12, flexWrap: "wrap" }}>
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: C.tint, border: "1px solid #b6d9c3" }} /><span style={{ font: font(500, 11), color: C.ink2 }}>Shared <span style={{ color: C.faint }}>— bought once, eaten by more than one</span></span></span>
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: C.blueBg, border: `1px solid ${C.blueBorder}` }} /><span style={{ font: font(500, 11), color: C.ink2 }}>Just theirs <span style={{ color: C.faint }}>— on one plate only</span></span></span>
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: C.redBg, border: "1px solid #e8bfb8" }} /><span style={{ font: font(500, 11), color: C.ink2 }}>Not for them</span></span>
          </div>
          <div className="koi-plan-grid-wrap">
            <div style={{ display: "grid", gridTemplateColumns: `96px repeat(${people.length}, minmax(150px, 1fr))`, gap: 7, minWidth: 96 + people.length * 157, marginBottom: 7 }}>
              <div />
              {people.map((p, i) => (
                <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 7, justifyContent: "center", font: font(600, 12), color: C.ink2, padding: "6px 0" }}>
                  <span style={{ width: 20, height: 20, borderRadius: "50%", background: s.colourFor(p.id), color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", font: font(700, 8, "num") }}>{initialsOf(p.label)}</span>
                  {p.label} <span style={{ font: font(500, 10, "mono"), color: C.faint }}>/ day</span>
                </div>
              ))}
            </div>
            {board.rows.map((row) => (
              <div key={row.key} style={{ display: "grid", gridTemplateColumns: `96px repeat(${people.length}, minmax(150px, 1fr))`, gap: 7, minWidth: 96 + people.length * 157, marginBottom: 7, alignItems: "stretch" }}>
                <div style={{ display: "flex", alignItems: "center", font: font(600, 12), color: C.ink2 }}>{row.label}</div>
                {people.map((p) => {
                  const items = row.cells[p.id] ?? [];
                  return (
                    <div key={p.id} style={{ position: "relative", background: items.length ? "#fff" : C.surface2, border: `1px solid ${C.line2}`, borderRadius: 11, padding: 9, minHeight: 58, display: "flex", flexDirection: "column", gap: 4 }}>
                      {items.length === 0 && <span style={{ font: font(500, 11), color: C.fainter }}>—</span>}
                      {items.map((item) => {
                        const mine = shared(item.skuId) <= 1;
                        const cellKey = `${row.key}:${p.id}:${item.skuId}`;
                        return (
                          <div key={item.skuId} style={{ position: "relative" }}>
                            <button
                              type="button"
                              onClick={() => setMenu((m) => (m === cellKey ? null : cellKey))}
                              style={{ all: "unset", cursor: "pointer", display: "block", width: "100%", borderRadius: 7, padding: "4px 6px", background: mine ? C.blueBg : C.tint, color: mine ? C.blue : C.primary }}
                            >
                              <span style={{ display: "block", font: font(600, 11, "sans", 1.3) }}>{item.name}</span>
                              <span style={{ display: "block", font: font(500, 10, "mono"), opacity: 0.85 }}>
                                {amountOf(item.perDay, item.unit) ?? `${item.packs} ${Number(item.packs) === 1 ? "pack" : "packs"} this week`}
                                {item.also?.length ? ` · or ${item.also.join(", ")}` : ""}
                              </span>
                            </button>
                            <Unverified allergens={item.notVerifiedFor} />
                            {menu === cellKey && (
                              <div style={{ position: "absolute", zIndex: 30, top: "100%", left: 0, marginTop: 4, width: 190, background: "#fff", border: `1px solid ${C.line2}`, borderRadius: 12, boxShadow: "0 18px 34px -10px rgba(0,0,0,.28)", padding: 4 }}>
                                <MonoLabel style={{ padding: "6px 10px 2px" }}>Change it</MonoLabel>
                                <button type="button" disabled={busy} onClick={() => { setMenu(null); s.seeWithout(item.skuId); }} style={{ all: "unset", cursor: "pointer", display: "block", padding: "7px 10px", font: font(500, 12), color: C.ink, borderRadius: 8 }}>Can&apos;t get this?</button>
                                <button type="button" disabled={busy} onClick={() => { setMenu(null); s.command(`no ${productWordFor(item.name) ?? item.name}`); }} style={{ all: "unset", cursor: "pointer", display: "block", padding: "7px 10px", font: font(500, 12), color: C.redText, borderRadius: 8 }}>Leave it out</button>
                                <button type="button" disabled={busy} onClick={() => { setMenu(null); s.command(`more ${productWordFor(item.name) ?? item.name}`); }} style={{ all: "unset", cursor: "pointer", display: "block", padding: "7px 10px", font: font(500, 12), color: C.primary, borderRadius: 8 }}>More of this</button>
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
              <div style={{ display: "grid", gridTemplateColumns: `96px repeat(${people.length}, minmax(150px, 1fr))`, gap: 7, minWidth: 96 + people.length * 157 }}>
                <div style={{ display: "flex", alignItems: "center", font: font(600, 12), color: C.ink2 }}>Not for them</div>
                {people.map((p) => {
                  const w = s.plan.report.whoEatsWhat.find((x) => String(x.member) === String(p.id));
                  return (
                    <div key={p.id} style={{ background: C.redBg, border: "1px solid #e8bfb8", borderRadius: 11, padding: 9, display: "flex", flexDirection: "column", gap: 3 }}>
                      {(w?.notForThem ?? []).length === 0 ? <span style={{ font: font(500, 11), color: C.fainter }}>—</span> : w.notForThem.slice(0, 4).map((n) => (
                        <span key={n.skuId} style={{ font: font(600, 10), color: C.redText }}>−{n.name} <span style={{ fontWeight: 500, opacity: 0.8 }}>({n.because})</span></span>
                      ))}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <p style={{ font: font(400, 11), color: C.faint, margin: "10px 0 0" }}>KOI plans the week&apos;s food, not dishes yet: each person&apos;s daily share of the basket, in the slot its shelf serves. Dishes come next.</p>
        </>
      )}

      {tray.length > 0 && s.plan && (
        <div style={{ marginTop: 16, background: C.surface2, border: "1px solid rgba(20,22,15,.06)", borderRadius: 16, padding: 15 }}>
          <div style={{ font: font(600, 12), color: C.ink2, marginBottom: 11 }}>Quick add to your plan <span style={{ fontWeight: 400, color: C.faint }}>— tap to ask KOI to fit it in</span></div>
          <div style={{ display: "flex", gap: 9, flexWrap: "wrap" }}>
            {tray.map((c) => (
              <button key={c.key} type="button" disabled={busy} onClick={() => s.command(`add ${c.label.toLowerCase()}`)} style={{ cursor: busy ? "wait" : "pointer", display: "flex", alignItems: "center", gap: 8, background: "#fff", border: `1px solid ${C.line2}`, borderRadius: 12, padding: "9px 13px" }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: C.accent }} />
                <span style={{ font: font(600, 12), color: C.ink }}>{c.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {Object.entries(s.without).map(([skuId, w]) => {
        const name = s.lines.find((l) => String(l.skuId) === String(skuId))?.name ?? "that";
        const d = w.result?.diff;
        return (
          <div key={skuId} style={{ marginTop: 12, background: C.note, borderRadius: 14, padding: "12px 14px", font: font(500, 12), color: C.ink2 }}>
            <strong style={{ color: C.ink }}>If you can&apos;t get {name}: </strong>
            {w.busy ? "re-planning without it…" : w.error ? w.error : d?.substitutes?.length
              ? d.substitutes.map((x) => `${x.packs} × ${x.name}${x.why?.length ? ` (${x.why.join(", ")})` : ""}`).join(" · ")
              : (d?.added ?? []).length ? `KOI would add ${d.added.map((x) => `${x.packs} × ${x.name}`).join(", ")}` : "the rest of the plan covers it."}
          </div>
        );
      })}

      {board && !compact && <Plates s={s} board={board} />}
    </div>
  );
}

function Plates({ s, board }) {
  const people = peopleOf(s.plan.report, s.plan.days).sort((a, b) => s.orderOf(a.id) - s.orderOf(b.id));
  const activeId = s.active?.memberId;
  const me = people.find((p) => String(p.id) === String(activeId)) ?? people[0];
  const favCount = (s.active?.favourite_categories ?? []).length;
  return (
    <>
      <div style={{ marginTop: 14, padding: "13px 14px", background: C.surface2, border: `1px solid ${C.line}`, borderRadius: 14 }}>
        <div style={{ font: font(600, 11, "mono"), letterSpacing: ".1em", textTransform: "uppercase", color: C.muted, marginBottom: 10 }}>Each person&apos;s plate · a day</div>
        {people.map((p, i) => {
          const profile = s.saved.find((x) => String(x.memberId) === String(p.id));
          const items = board.rows.flatMap((row) => (row.cells[p.id] ?? []).map((item) => ({ slot: row.label, name: item.name, amount: amountOf(item.perDay, item.unit) })));
          return (
            <div key={p.id} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "8px 0", borderBottom: `1px solid ${C.divider}` }}>
              <span style={{ width: 28, height: 28, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", font: font(700, 10, "num"), color: "#fff", flex: "none", background: s.colourFor(p.id) }}>{initialsOf(p.label)}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ font: font(600, 12), color: C.ink }}>{p.label}</span>
                  <span style={{ font: font(500, 10, "mono"), color: C.muted }}>{profile ? goalShortLabel(profile) : ""}</span>
                </div>
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 5 }}>
                  {items.slice(0, 6).map((it, k) => (
                    <span key={k} style={{ font: font(500, 10), background: "#fff", border: `1px solid ${C.line2}`, borderRadius: 6, padding: "3px 7px", color: C.ink }}>{it.slot}: {it.name}{it.amount ? ` ${it.amount}` : ""}</span>
                  ))}
                  <span style={{ font: font(600, 10), background: p.met ? C.tint : C.warnBg, borderRadius: 6, padding: "3px 7px", color: p.met ? C.primary : C.warnText }}>
                    {p.met ? "Every target met" : `Short ${p.short.map((x) => `${x.perDay}${x.nutrient === "kcal" ? " kcal" : " g"} ${x.nutrient === "kcal" ? "" : x.nutrient}`.trim()).join(", ")} a day`}
                  </span>
                </div>
              </div>
              <div style={{ textAlign: "right", flex: "none" }}>
                <div style={{ font: font(700, 13, "num"), color: C.ink }}>{p.perDay.kcal !== null ? inr(p.perDay.kcal) : "—"}</div>
                <div style={{ font: font(500, 9, "mono"), color: C.muted }}>{p.target.kcal ? `kcal / ${inr(p.target.kcal)}` : "kcal a day"}</div>
              </div>
            </div>
          );
        })}
      </div>
      {me && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 16, paddingTop: 14, borderTop: `1px solid ${C.divider}`, gap: 10, flexWrap: "wrap" }}>
          <div style={{ font: font(500, 12), color: C.muted }}>{me.label} · a day · {favCount} favourites leaning the plan</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ font: font(500, 11, "mono"), color: C.faint }}>{s.active ? goalShortLabel(s.active) : ""}</span>
            <div style={{ font: font(600, 14, "num"), color: C.primary }}>{me.perDay.kcal !== null ? inr(me.perDay.kcal) : "—"} kcal · {me.perDay.protein !== null ? me.perDay.protein : "—"}g protein</div>
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
    <div style={{ ...cardStyle, marginBottom: 18 }}>
      <button type="button" onClick={() => setOpen((o) => !o)} style={{ all: "unset", cursor: "pointer", display: "flex", width: "100%", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
        <span style={{ font: font(700, 17) }}>How KOI made this plan</span>
        <span style={{ font: font(600, 12), color: warn.length ? C.warm : C.accent }}>{warn.length ? `${warn.length} to know` : "nothing given up"} {open ? "▴" : "▾"}</span>
      </button>
      {fixes.length > 0 && (
        <div style={{ marginTop: 14, background: C.warnBg, borderRadius: 12, padding: "12px 14px" }}>
          <MonoLabel color={C.warnText} style={{ marginBottom: 6 }}>What would fix it</MonoLabel>
          {fixes.map((f) => <p key={f.key} style={{ font: font(500, 13), color: C.warnText, margin: "4px 0 0" }}>{f.says}</p>)}
        </div>
      )}
      {open && (
        <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 8 }}>
          {groups && (
            <p style={{ font: font(500, 13), color: C.ink2, margin: 0 }}>
              Covers {groups.covered?.length ?? 0} of {groups.of} food groups{groups.missing?.length ? ` · missing ${groups.missing.map((g) => g.label).join(", ")}` : ""}{groups.cannotSupply?.length ? ` · KOI has no aisle yet for ${groups.cannotSupply.map((g) => g.label).join(", ")}` : ""}.
            </p>
          )}
          {notes.map((n, i) => <p key={i} style={{ font: font(n.warn ? 600 : 400, 13), color: n.warn ? C.warm : C.ink2, margin: 0 }}>{n.text}</p>)}
        </div>
      )}
    </div>
  );
}

export default function PlanStep({ s, onBack, onNext }) {
  return (
    <div>
      <StepHead title="Tune the plan to your taste" sub="Tell KOI in plain words, or take a swap. Every change re-solves the plan — watch it work." />
      <CommandBox s={s} />
      {s.saved.length > 0 && <ThisWeek s={s} />}
      {s.plan && <Upgrades s={s} />}
      {s.week && <WeekGrid s={s} />}
      <WeekBoard s={s} compact={Boolean(s.week)} />
      <Gaps s={s} />
      <Footer onBack={onBack} next={{ label: "Build my pantry & cart", onClick: onNext, disabled: !s.plan }} />
    </div>
  );
}
