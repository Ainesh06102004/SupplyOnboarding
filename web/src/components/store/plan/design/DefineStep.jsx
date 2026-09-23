"use client";

// Step 1 · Define — the outcome, not a diet. The goal cards set the active
// person's goal (lib/plan/goalCards.js); favourites become the kinds of food
// KOI stocks that the planner leans towards (favourite_categories, 00066).

import { useState } from "react";
import { GOAL_CARDS, cardFor, applyCard } from "@/lib/plan/goalCards";
import { favouriteLabel, MAX_FAVOURITES } from "@/lib/plan/favourites";
import { goalsAllowed } from "@/lib/planner/goals";
import { C, font } from "./tokens";
import { Arrow, Sparkle, RemovableChip } from "./bits";

const ICONS = {
  lose: <path d="M12 3c1 3 5 4 5 9a5 5 0 0 1-10 0c0-2 1-3 2-4 .5 2 1.5 2.5 2 2 .5-1-1-3 1-7Z" stroke="#5a6e5e" strokeWidth="1.6" strokeLinejoin="round" />,
  muscle: <path d="M4 13c2-1 3-3 5-3s3 2 6 2c2 0 3-1 5-2v5c-2 1-3 2-5 2s-3-1-6-1-3 1-5 1V13Z" stroke="#5a6e5e" strokeWidth="1.6" strokeLinejoin="round" />,
  recomp: <path d="M12 20c0-6 3-11 8-12-1 7-4 10-8 10Zm0 0c0-4-2-7-6-8 .5 5 2.5 7 6 7Z" stroke="#2f8050" strokeWidth="1.6" strokeLinejoin="round" />,
  maintain: <path d="M12 4v15M6 19h12M5 8h14M5 8 3 13a3 3 0 0 0 4 0L5 8Zm14 0-2 5a3 3 0 0 0 4 0l-2-5Z" stroke="#5a6e5e" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />,
};

/** No one in the household yet: start with yourself, or describe everyone at once. */
function FirstRun({ s, onPlan }) {
  return (
    <div style={{ maxWidth: 760, margin: "0 auto 16px", background: "#fff", border: `1px solid ${C.line2}`, borderRadius: 18, padding: 20, animation: "koiUp .55s ease .1s both" }}>
      <div style={{ font: font(700, 16), color: C.ink, marginBottom: 6 }}>Who&apos;s eating?</div>
      <p style={{ font: font(400, 13), color: C.muted, margin: "0 0 14px" }}>Start with yourself — you can add everyone else from the header. Or tell KOI about the whole household in one sentence.</p>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button type="button" onClick={() => s.addMember("Me")} style={{ cursor: "pointer", background: C.primary, color: "#fff", border: "none", borderRadius: 12, padding: "12px 20px", font: font(600, 14) }}>Add yourself</button>
        <button type="button" onClick={onPlan} style={{ cursor: "pointer", background: C.tint, color: C.primary, border: `1px solid ${C.tintBorder}`, borderRadius: 12, padding: "12px 20px", font: font(600, 14) }}>Describe your household</button>
      </div>
    </div>
  );
}

export default function DefineStep({ s, onNext, onPlan }) {
  const person = s.active;
  const key = person ? s.keyOf(person) : null;
  const [words, setWords] = useState("");
  const adult = person ? goalsAllowed(person.age_band) : true;
  const { card: selected, extra } = person ? cardFor(person) : { card: null, extra: null };
  const favourites = person?.favourite_categories ?? [];
  const tries = s.categories.filter((c) => !favourites.includes(c.key)).slice(0, 8);

  const pick = (cardKey) => {
    if (!person) return;
    const patch = applyCard(person, cardKey);
    if (patch) s.editProfile(key, patch);
  };
  const add = () => {
    if (!words.trim()) return;
    s.addFavourites(words, key);
    setWords("");
  };

  return (
    <div>
      <div className="koi-hero">
        <div className="koi-hero-text" style={{ flex: 1, minWidth: 280, animation: "koiUp .55s ease both" }}>
          <div style={{ font: font(500, 14), color: C.muted, marginBottom: 8 }}>Let&apos;s build</div>
          <h1 style={{ font: font(700, 46, "sans", 1.04), letterSpacing: "-.025em", margin: "0 0 4px" }}>your outcome,</h1>
          <h1 style={{ font: font(700, 46, "sans", 1.04), letterSpacing: "-.025em", margin: "0 0 18px", width: "max-content", position: "relative" }}>
            not a diet.
            <span style={{ position: "absolute", left: -4, right: -4, top: "54%", height: 3, background: C.accent, borderRadius: 2, transformOrigin: "left", animation: "koiStrike .5s ease .55s both" }} />
          </h1>
          <p style={{ font: font(400, 17, "sans", 1.55), color: C.ink2, margin: 0, maxWidth: 330 }}>
            We plan what enters your home — and show you the arithmetic, down to the kilo.
          </p>
        </div>

        <div className="koi-goal-cards" style={{ animation: "koiUp .55s ease .15s both" }}>
          {GOAL_CARDS.map((card) => {
            const on = adult && selected?.key === card.key;
            return (
              <button
                key={card.key}
                type="button"
                onClick={() => pick(card.key)}
                disabled={!adult}
                style={{
                  position: "relative", cursor: adult ? "pointer" : "not-allowed", background: "#fff", borderRadius: 18, padding: "20px 18px", minHeight: 184, transition: "all .15s", textAlign: "left", opacity: adult ? 1 : 0.5,
                  border: on ? `2px solid ${C.accent}` : `1px solid ${C.line2}`, boxShadow: on ? "0 16px 30px -18px rgba(47,128,80,.5)" : "none",
                }}
              >
                {card.badge && <span style={{ position: "absolute", top: 12, right: 12, font: font(600, 9, "mono"), letterSpacing: ".06em", background: C.tint, color: C.primary, padding: "4px 8px", borderRadius: 999 }}>{card.badge}</span>}
                <div style={{ width: 46, height: 46, borderRadius: 13, display: "flex", alignItems: "center", justifyContent: "center", background: on ? C.tint : C.quiet }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">{ICONS[card.key]}</svg>
                </div>
                <div style={{ font: font(700, 16), marginTop: 16, color: C.ink }}>{card.title}</div>
                <div style={{ font: font(400, 12, "sans", 1.35), color: C.muted, marginTop: 5 }}>{card.sub}</div>
                {on && (card.note || extra) && <div style={{ font: font(500, 10, "mono"), color: C.accent, marginTop: 8 }}>{[card.note, extra].filter(Boolean).join(" · ")}</div>}
              </button>
            );
          })}
        </div>
      </div>

      {!person && <FirstRun s={s} onPlan={onPlan} />}

      {!adult && person && (
        <p style={{ maxWidth: 760, margin: "-12px auto 16px", font: font(500, 13), color: C.ink2, background: C.note, borderRadius: 12, padding: "10px 14px" }}>
          Goals are for adults. KOI plans {person.label}&apos;s week to ICMR-NIN&apos;s needs for their age instead.
        </p>
      )}

      <div style={{ maxWidth: 760, margin: "0 auto 16px", background: "#fff", border: `1px solid ${C.line2}`, borderRadius: 18, padding: 20, animation: "koiUp .55s ease .3s both" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 5, flexWrap: "wrap" }}>
          <Sparkle />
          <span style={{ font: font(700, 16), color: C.ink }}>What do you love to eat?</span>
          <span style={{ font: font(500, 11, "mono"), color: C.faint }}>KOI builds the plan around these</span>
        </div>
        <p style={{ font: font(400, 13), color: C.muted, margin: "0 0 13px" }}>
          Tell me your favourites in plain words — staples, comfort foods, that one snack you won&apos;t give up. KOI leans the plan towards the ones it stocks, and tells you which it doesn&apos;t yet.
        </p>
        <div style={{ display: "flex", gap: 10 }}>
          <input
            value={words}
            onChange={(e) => setWords(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") add(); }}
            placeholder="e.g. dry fruit, oats, namkeen, dates…"
            aria-label="Favourite foods"
            maxLength={200}
            disabled={!person}
            style={{ flex: 1, minWidth: 0, border: `1px solid ${C.inputBorder2}`, borderRadius: 12, padding: "13px 15px", font: font(500, 14), background: C.surface2, color: C.ink }}
          />
          <button type="button" onClick={add} disabled={!person} style={{ cursor: "pointer", background: C.primary, border: "none", borderRadius: 12, padding: "0 22px", font: font(600, 14), color: "#fff" }}>Add</button>
        </div>
        {tries.length > 0 && (
          <div style={{ display: "flex", gap: 7, marginTop: 12, flexWrap: "wrap" }}>
            <span style={{ font: font(500, 11), color: C.faint, alignSelf: "center" }}>Try:</span>
            {tries.map((c) => (
              <button
                key={c.key}
                type="button"
                disabled={!person || favourites.length >= MAX_FAVOURITES}
                onClick={() => s.editProfile(key, { favourite_categories: [...favourites, c.key] })}
                style={{ cursor: "pointer", background: C.quiet, border: `1px solid ${C.line}`, borderRadius: 999, padding: "6px 12px", font: font(500, 12), color: C.ink2 }}
              >
                + {c.label}
              </button>
            ))}
          </div>
        )}
        {favourites.length > 0 && (
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${C.divider}` }}>
            <div style={{ font: font(500, 10, "mono"), letterSpacing: ".1em", color: C.faint, textTransform: "uppercase", marginBottom: 9 }}>In your plan · {favourites.length} favourites</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {favourites.map((k) => <RemovableChip key={k} label={favouriteLabel(k)} onRemove={() => s.removeFavourite(k, key)} />)}
            </div>
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={onNext}
        style={{ cursor: "pointer", width: "100%", background: C.tint, border: `1px solid ${C.tintBorder}`, borderRadius: 14, height: 54, display: "flex", alignItems: "center", justifyContent: "center", gap: 12, maxWidth: 560, margin: "0 auto" }}
      >
        <span style={{ font: font(600, 16), color: C.primary }}>Continue</span>
        <Arrow color={C.primary} size={20} />
      </button>
      {person && (
        <p style={{ textAlign: "center", font: font(400, 13), color: C.faint, margin: "16px auto 0" }}>
          Planning for <strong style={{ color: C.primary }}>{person.label}</strong>
          {adult && selected && <> · goal: <strong style={{ color: C.primary }}>{selected.title}</strong></>}
        </p>
      )}
    </div>
  );
}
