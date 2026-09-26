"use client";
// ============================================================================
// KOI Agent Mode: the cards in the dock's conversation
// (docs/agent-mode/claude-design-brief.md §8). Every figure on them is the
// planner's or the catalogue's; KOI's own words are templates.
// ============================================================================

import { useId, useMemo, useState } from "react";
import Link from "next/link";
import { MEMBER_COLORS, initialsOf, inr } from "@/components/store/plan/design/tokens";

const MARK = { running: "•", done: "✓", warn: "!", failed: "×", skipped: "–", stopped: "■" };

export function TaskChecklist({ tasks }) {
  if (!tasks?.length) return null;
  const done = tasks.filter((t) => t.state === "done").length;
  return (
    <div className="ka-tasks" aria-label={`KOI's plan: ${done} of ${tasks.length} done`}>
      {tasks.map((t) => (
        <div key={t.key} className="ka-task" data-state={t.state}>
          <span aria-hidden="true" style={{ width: 14, textAlign: "center" }}>{t.state === "done" ? "✓" : t.state === "needs_you" ? "●" : t.state === "running" ? "◐" : "○"}</span>
          <span>{t.label}{t.state === "needs_you" ? " · needs you" : ""}</span>
        </div>
      ))}
    </div>
  );
}

export function ToolCard({ entry }) {
  const [open, setOpen] = useState(false);
  const showLines = entry.state === "running" || open;
  return (
    <div className="ka-card" style={{ padding: "10px 14px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span className="ka-line-mark" aria-hidden="true" style={{ color: entry.state === "failed" ? "#b84535" : entry.state === "running" ? "#2f8050" : entry.state === "done" ? "#2f8050" : "#8c8c84" }}>
          {entry.state === "running" ? <span style={{ animation: "kaPulse 1.2s ease-in-out infinite" }}>●</span> : MARK[entry.state] ?? "•"}
        </span>
        <span style={{ flex: 1, fontSize: 13, fontWeight: 700 }}>{entry.state === "running" ? entry.label : entry.summary ?? entry.label}</span>
        {entry.lines.length > 0 && entry.state !== "running" && (
          <button type="button" className="ka-icon-btn" onClick={() => setOpen((v) => !v)} aria-expanded={open}>{open ? "Hide" : "Details"}</button>
        )}
      </div>
      {showLines && entry.lines.length > 0 && (
        <div style={{ marginTop: 6, paddingLeft: 22 }}>
          {entry.lines.map((l) => (
            <div key={l.id} className="ka-line" data-state={l.state}>
              <span className="ka-line-mark" aria-hidden="true">{l.state === "running" ? "●" : l.state === "warn" ? "!" : "✓"}</span>
              <span>{l.title}{l.detail ? <span className="ka-detail"> · {l.detail}</span> : null}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** A question KOI asked: chips, one recommended, "Other" to type. A fieldset per question. */
export function AskCard({ entry, active, onAnswer }) {
  const card = entry.card;
  const [picked, setPicked] = useState({});
  const [other, setOther] = useState({});
  const base = useId();
  const inRange = (q) => {
    const n = Number(other[q.id]);
    return (other[q.id] ?? "") !== "" && Number.isFinite(n) && n >= q.min && n <= q.max;
  };
  const answered = (q) => (q.kind === "number" ? inRange(q) : q.kind === "text" ? (other[q.id] ?? "").trim() : picked[q.id]?.length || (other[q.id] ?? "").trim());
  // An optional card (a person's details) goes with whatever was answered; a required one needs every answer.
  const complete = card.optional ? card.questions.some(answered) && card.questions.every((q) => q.kind !== "number" || (other[q.id] ?? "") === "" || inRange(q)) : card.questions.every(answered);
  const submit = () => {
    const answers = {};
    const summary = [];
    for (const q of card.questions) {
      if (q.kind === "number") {
        if (inRange(q)) { answers[q.id] = { value: Number(other[q.id]) }; summary.push(`${q.header} ${other[q.id]} ${q.unit}`); }
        continue;
      }
      const typed = (other[q.id] ?? "").trim();
      if (typed) { answers[q.id] = { other: typed }; summary.push(`${q.person ?? q.header}: ${typed}`); continue; }
      const keys = picked[q.id] ?? [];
      if (!keys.length) continue;
      answers[q.id] = q.kind === "multi" ? { options: keys } : { option: keys[0] };
      summary.push(`${q.person ?? q.header}: ${q.options.filter((o) => keys.includes(o.key)).map((o) => o.label).join(", ")}`);
    }
    onAnswer(answers, summary.join(" · "));
  };
  if (entry.answered) {
    return <div className="ka-card" style={{ fontSize: 13, color: "#6b6f63" }}><span className="ka-mono">You answered</span><div style={{ marginTop: 4 }}>{entry.answered}</div></div>;
  }
  return (
    <form className="ka-card ka-card-warm" onSubmit={(e) => { e.preventDefault(); if (complete && active) submit(); }}>
      <div className="ka-mono" style={{ color: "#c2683a", marginBottom: 10 }}>{card.title ?? "One quick thing"}</div>
      {card.questions.map((q) => (
        <fieldset key={q.id} className="ka-q" disabled={!active}>
          <legend>{q.question}</legend>
          {q.kind === "number" ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                className="ka-other"
                style={{ maxWidth: 140 }}
                type="number"
                inputMode="decimal"
                min={q.min}
                max={q.max}
                step={q.step ?? 1}
                value={other[q.id] ?? ""}
                onChange={(e) => setOther((o) => ({ ...o, [q.id]: e.target.value.slice(0, 6) }))}
                aria-label={`${q.question} (${q.unit})`}
                aria-invalid={(other[q.id] ?? "") !== "" && !inRange(q)}
              />
              <span style={{ fontSize: 13, color: "#6b6f63" }}>{q.unit}</span>
              {(other[q.id] ?? "") !== "" && !inRange(q) && <span style={{ fontSize: 12, color: "#b84535" }}>{q.min}–{q.max}</span>}
            </div>
          ) : q.kind === "text" ? (
            <textarea className="ka-other" rows={2} placeholder={q.placeholder ?? ""} value={other[q.id] ?? ""} onChange={(e) => setOther((o) => ({ ...o, [q.id]: e.target.value.slice(0, 200) }))} aria-label={q.question} />
          ) : (
            <>
              <div className="ka-chips" role={q.kind === "multi" ? "group" : "radiogroup"}>
                {q.options.map((o) => {
                  const on = (picked[q.id] ?? []).includes(o.key);
                  const inputId = `${base}-${q.id}-${o.key}`;
                  return (
                    <label key={o.key} htmlFor={inputId} className="ka-chip" data-on={on}>
                      <input
                        id={inputId}
                        type={q.kind === "multi" ? "checkbox" : "radio"}
                        name={`${base}-${q.id}`}
                        checked={on}
                        onChange={() => {
                          setOther((x) => ({ ...x, [q.id]: "" }));
                          setPicked((p) => {
                            const cur = p[q.id] ?? [];
                            if (q.kind !== "multi") return { ...p, [q.id]: [o.key] };
                            // "Everyone" and named people don't mix.
                            if (o.key === "everyone") return { ...p, [q.id]: cur.includes("everyone") ? [] : ["everyone"] };
                            const rest = cur.filter((k) => k !== "everyone");
                            return { ...p, [q.id]: rest.includes(o.key) ? rest.filter((k) => k !== o.key) : [...rest, o.key] };
                          });
                        }}
                      />
                      {o.label}
                      {o.recommended ? <span className="ka-rec">Recommended</span> : null}
                    </label>
                  );
                })}
              </div>
              {q.allowOther && (
                <input className="ka-other" placeholder={q.otherHint ?? "Other…"} value={other[q.id] ?? ""} aria-label={`${q.question} — other`} onChange={(e) => { const v = e.target.value.slice(0, 200); setOther((x) => ({ ...x, [q.id]: v })); if (v) setPicked((p) => ({ ...p, [q.id]: [] })); }} />
              )}
            </>
          )}
        </fieldset>
      ))}
      {card.note && <p style={{ margin: "10px 0 0", fontSize: 12, color: "#6b6f63" }}>{card.note}</p>}
      <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
        <button type="submit" className="ka-primary" disabled={!complete || !active}>Continue</button>
        {card.optional && <button type="button" className="ka-secondary" disabled={!active} onClick={() => onAnswer({}, "Skipped")}>Skip</button>}
      </div>
    </form>
  );
}

function Person({ person, index }) {
  return (
    <div className="ka-person">
      <span className="ka-avatar" style={{ background: MEMBER_COLORS[index % MEMBER_COLORS.length] }} aria-hidden="true">{initialsOf(person.label)}</span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 700 }}>{person.label} {person.isNew ? <span style={{ color: "#2f8050", fontWeight: 600 }}>· new</span> : null}</div>
        <div>
          {(person.rows ?? []).map((r, i) => <span key={`r${i}`} className="ka-tag" data-tone={r.tone}>{r.text}</span>)}
          {(person.avoids ?? []).map((a, i) => <span key={`a${i}`} className="ka-tag" data-tone={a.tone}>{a.tone === "allergy" ? `${a.text} · never, for safety` : a.text}</span>)}
        </div>
      </div>
    </div>
  );
}

/** Allow / Not now: saving people, or filling the cart. */
export function ApprovalCard({ entry, active, onDecide }) {
  const card = entry.card;
  const packs = useMemo(() => (card.lines ?? []).reduce((s, l) => s + l.packs, 0), [card]);
  if (entry.decided) {
    return (
      <div className="ka-card" style={{ fontSize: 13, color: "#6b6f63" }}>
        {entry.decided === "allow"
          ? card.kind === "cart" ? `Added ${packs} ${packs === 1 ? "pack" : "packs"} to your cart.` : card.kind === "cart_edit" ? "Cart changed." : card.kind === "rules" ? "Saved." : `Saved ${card.people?.map((p) => p.label).join(", ")}.`
          : card.kind === "cart" || card.kind === "cart_edit" ? "Cart left as it was." : card.kind === "rules" ? "Not saved." : "Not saved. KOI keeps it to this week's plan."}
      </div>
    );
  }
  return (
    <div className="ka-card ka-card-warm" role="group" aria-label={card.title}>
      <div className="ka-mono" style={{ color: "#c2683a", marginBottom: 6 }}>KOI needs your OK</div>
      <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 6 }}>{card.title}</div>
      {card.kind === "save_people" && card.people.map((p, i) => <Person key={p.label} person={p} index={i} />)}
      {(card.kind === "rules" || card.kind === "cart_edit") && (
        <div style={{ margin: "2px 0 4px" }}>{card.rows.map((r, i) => <span key={i} className="ka-tag" data-tone={r.tone}>{r.text}</span>)}</div>
      )}
      {(card.kind === "save_people" || card.kind === "rules") && card.weakens && (
        <p style={{ margin: "6px 0 0", fontSize: 12.5, color: "#c2683a", fontWeight: 600 }}>This takes a protection away. Check it before you allow.</p>
      )}
      {card.kind === "cart" && (
        <div style={{ maxHeight: 220, overflowY: "auto", margin: "4px 0" }}>
          {card.lines.map((l) => (
            <div key={l.skuId} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 13, padding: "4px 0", borderBottom: "1px solid rgba(20,22,15,.06)" }}>
              <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.name}</span>
              <span style={{ fontFamily: "var(--ka-num)", fontWeight: 600, flex: "none" }}>× {l.packs}</span>
            </div>
          ))}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 8 }}>
            <span className="ka-mono">Plan cost</span>
            <span className="ka-figure">₹{inr(card.cost)}</span>
          </div>
        </div>
      )}
      {card.note && <p style={{ margin: "8px 0 0", fontSize: 12, color: "#6b6f63" }}>{card.note}</p>}
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <button type="button" className="ka-primary" style={{ flex: 1 }} disabled={!active} onClick={() => onDecide(true)}>
          {card.kind === "cart" ? `Add ${packs} ${packs === 1 ? "pack" : "packs"} to cart` : "Allow"}
        </button>
        <button type="button" className="ka-secondary" disabled={!active} onClick={() => onDecide(false)}>Not now</button>
      </div>
    </div>
  );
}

function coverage(member) {
  const asked = Number(member?.asked?.protein);
  const got = Number(member?.achieved?.protein);
  if (!Number.isFinite(asked) || asked <= 0 || !Number.isFinite(got)) return null;
  return Math.max(0, Math.min(100, Math.round((got / asked) * 100)));
}

function Ring({ pct, color }) {
  const r = 15;
  const c = 2 * Math.PI * r;
  return (
    <svg width="38" height="38" viewBox="0 0 38 38" aria-hidden="true">
      <circle cx="19" cy="19" r={r} fill="none" stroke="#eceae3" strokeWidth="4" />
      <circle cx="19" cy="19" r={r} fill="none" stroke={color} strokeWidth="4" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - (pct ?? 0) / 100)} transform="rotate(-90 19 19)" />
    </svg>
  );
}

/** What a tool produced, as a card: a plan, a change, a product check, swaps, products, an explanation. */
export function ResultCard({ data, onUndoRun, canUndoRun }) {
  if (data.kind === "plan" || data.kind === "change") {
    const p = data.payload ?? {};
    const report = p.report ?? {};
    const people = report.perMember ?? [];
    return (
      <div className="ka-card">
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
          <span className="ka-mono">{data.kind === "plan" ? `Your plan · ${p.days ?? "–"} days` : "Plan changed"}</span>
          {Number.isFinite(Number(report.cost)) && <span className="ka-figure">₹{inr(report.cost)}</span>}
        </div>
        {data.kind === "change" && (p.applied ?? []).length > 0 && (
          <ul style={{ margin: "6px 0 0", paddingLeft: 18, fontSize: 13 }}>{p.applied.map((a) => <li key={a}>{a}</li>)}</ul>
        )}
        {data.kind === "change" && (p.notApplied ?? []).length > 0 && (
          <p style={{ margin: "6px 0 0", fontSize: 12.5, color: "#c2683a" }}>{p.notApplied.join(" · ")}</p>
        )}
        {report.withinBudget === false && <p style={{ margin: "6px 0 0", fontSize: 12.5, color: "#c2683a", fontWeight: 600 }}>Over the budget. The plan page says what it would take.</p>}
        {people.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 10 }}>
            {people.map((m, i) => {
              const pct = coverage(m);
              return (
                <div key={m.id ?? m.label} style={{ display: "flex", alignItems: "center", gap: 6 }} title={pct === null ? `${m.label}: no protein target` : `${m.label}: ${pct}% of their protein target`}>
                  <Ring pct={pct} color={MEMBER_COLORS[i % MEMBER_COLORS.length]} />
                  <div style={{ fontSize: 12 }}>
                    <div style={{ fontWeight: 700 }}>{m.label}</div>
                    <div style={{ fontFamily: "var(--ka-num)", color: "#6b6f63" }}>{pct === null ? "—" : `${pct}% protein`}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
          <Link href="/store/plan?step=plan" className="ka-icon-btn" style={{ textDecoration: "none", color: "#1f5c3a", fontWeight: 700 }}>Open plan</Link>
          <Link href="/store/plan?step=shop" className="ka-icon-btn" style={{ textDecoration: "none", color: "#1f5c3a", fontWeight: 700 }}>See the groceries</Link>
          {canUndoRun && <button type="button" className="ka-icon-btn" onClick={onUndoRun}>↶ Undo all of this</button>}
        </div>
      </div>
    );
  }
  if (data.kind === "check") {
    return (
      <div className="ka-card">
        <div className="ka-mono" style={{ marginBottom: 6 }}>{data.product?.name}</div>
        {data.verdicts.map((v) => (
          <div key={v.label} className="ka-verdict">
            <b style={{ color: v.fits ? "#2f8050" : "#b84535" }} aria-hidden="true">{v.fits ? "✓" : "×"}</b>
            <span>
              <strong>{v.fits ? `Fits ${v.label}` : `Not for ${v.label}`}</strong>
              {v.why ? `: ${v.why}` : ""}
              {v.notVerified?.length ? <span style={{ color: "#c2683a" }}> · Not verified for {v.notVerified.join(", ").toLowerCase()}</span> : null}
              {v.dietUnverified ? <span style={{ color: "#c2683a" }}> · {v.dietUnverified} not verified on the label</span> : null}
            </span>
          </div>
        ))}
      </div>
    );
  }
  if (data.kind === "swaps") {
    return (
      <div className="ka-card">
        <div className="ka-mono" style={{ marginBottom: 6 }}>Swaps for {data.from}</div>
        {data.items.map((s) => (
          <div key={s.skuId ?? s.name} style={{ fontSize: 13, padding: "4px 0" }}>
            <strong>{s.name}</strong>
            <span style={{ color: "#6b6f63" }}>{s.facts?.length ? ` · ${s.facts.join(" · ")}` : ""}{s.price ? ` · ${s.price}` : ""}</span>
          </div>
        ))}
      </div>
    );
  }
  if (data.kind === "products") {
    return (
      <div className="ka-card">
        <div className="ka-mono" style={{ marginBottom: 6 }}>{"On KOI's shelves"}</div>
        {data.items.map((p) => (
          <Link key={p.id} href={`/store/product/${p.id}`} style={{ display: "block", fontSize: 13, padding: "4px 0", color: "#1f5c3a", fontWeight: 600, textDecoration: "none" }}>{p.name}</Link>
        ))}
      </div>
    );
  }
  if (data.kind === "without") {
    return (
      <div className="ka-card">
        <div className="ka-mono" style={{ marginBottom: 6 }}>{`If you can't get ${data.name}`}</div>
        <p style={{ margin: 0, fontSize: 13 }}>KOI worked out what it would do instead. <Link href="/store/plan?step=plan" style={{ color: "#1f5c3a", fontWeight: 700 }}>See it on the plan</Link></p>
      </div>
    );
  }
  if (data.kind === "per_day") {
    const UNIT = { kcal: "kcal", protein: "g protein", carbs: "g carbs", fat: "g fat" };
    return (
      <div className="ka-card">
        <div className="ka-mono" style={{ marginBottom: 4 }}>A day of this plan, per person</div>
        <p style={{ margin: "0 0 8px", fontSize: 12, color: "#6b6f63" }}>{`KOI plans ${data.days} days of food as a whole, so every day is the plan's daily average. Figures are from the labels.`}</p>
        {data.people.map((p, i) => (
          <div key={p.label} style={{ padding: "6px 0", borderTop: i ? "1px solid rgba(20,22,15,.06)" : "none" }}>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>{p.label}</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 14px" }}>
              {p.rows.map((r) => (
                <span key={r.nutrient} style={{ fontSize: 12.5 }}>
                  <span style={{ fontFamily: "var(--ka-num)", fontWeight: 700 }}>{r.planned === null ? "—" : inr(r.planned)}</span>
                  {r.asked !== null ? <span style={{ color: "#8c8c84" }}>{` / ${inr(r.asked)}`}</span> : null}
                  {` ${UNIT[r.nutrient] ?? r.nutrient}`}
                </span>
              ))}
            </div>
          </div>
        ))}
        <p style={{ margin: "6px 0 0", fontSize: 11.5, color: "#8c8c84" }}>Planned / their target, a day.</p>
      </div>
    );
  }
  if (data.kind === "menu") {
    const SLOT = { breakfast: "Breakfast", lunch: "Lunch", snack: "Snack", dinner: "Dinner", drinks: "Drinks" };
    return (
      <div className="ka-card">
        <div className="ka-mono" style={{ marginBottom: 6 }}>{"The week's dishes"}</div>
        {data.days.map((d) => (
          <div key={`${d.day}${d.date}`} style={{ padding: "5px 0", borderTop: "1px solid rgba(20,22,15,.06)", fontSize: 12.5 }}>
            <strong>{d.day}</strong>
            {Object.entries(d.slots).map(([s, v]) => <div key={s} style={{ color: "#6b6f63" }}>{`${SLOT[s] ?? s}: ${v}`}</div>)}
          </div>
        ))}
      </div>
    );
  }
  if (data.kind === "basket") {
    return (
      <div className="ka-card">
        <div className="ka-mono" style={{ marginBottom: 6 }}>{"What's in the plan"}</div>
        {data.lines.map((l) => (
          <div key={l.skuId} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 13, padding: "3px 0" }}>
            <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.name}</span>
            <span style={{ fontFamily: "var(--ka-num)", fontWeight: 600, flex: "none" }}>{`× ${l.packs}`}</span>
          </div>
        ))}
        <Link href="/store/plan?step=shop" className="ka-icon-btn" style={{ textDecoration: "none", color: "#1f5c3a", fontWeight: 700, display: "inline-block", marginTop: 6 }}>See the groceries</Link>
      </div>
    );
  }
  if (data.kind === "explain") {
    return (
      <div className="ka-card">
        <div className="ka-mono" style={{ marginBottom: 6 }}>How KOI made this plan</div>
        {(data.lines ?? []).map((l, i) => <p key={i} style={{ margin: "4px 0", fontSize: 13 }}>{l.text}</p>)}
      </div>
    );
  }
  return null;
}
