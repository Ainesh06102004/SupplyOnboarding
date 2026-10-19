"use client";

// Step 1 · Define — the outcome, not a diet. The goal cards set the active
// person's goal (lib/plan/goalCards.js); favourites become the kinds of food
// KOI stocks that the planner leans towards (favourite_categories, 00067).
//
// Cinematic storefront (Oct 2026): KOI arrives as the full stop of the
// headline; picking a goal sends it to the card (a tick), then back to its
// place in the sentence.

import { useEffect, useRef, useState } from "react";
import { GOAL_CARDS, cardFor, applyCard } from "@/lib/plan/goalCards";
import { favouriteLabel, MAX_FAVOURITES } from "@/lib/plan/favourites";
import { goalsAllowed } from "@/lib/planner/goals";
import { Arrow, Sparkle, RemovableChip } from "./bits";
import { setupMotion, prefersReducedMotion, useGSAP, E } from "@/lib/motion/koiMotion";
import { useEmber } from "@/components/store/ember/Ember";
import { useKoiVoice } from "@/store/koiVoiceStore";
import { MEMBER_COLORS, initialsOf } from "./tokens";

const ICONS = {
  lose: "M12 3c1 3 5 4 5 9a5 5 0 0 1-10 0c0-2 1-3 2-4 .5 2 1.5 2.5 2 2 .5-1-1-3 1-7Z",
  muscle: "M4 13c2-1 3-3 5-3s3 2 6 2c2 0 3-1 5-2v5c-2 1-3 2-5 2s-3-1-6-1-3 1-5 1V13Z",
  recomp: "M12 20c0-6 3-11 8-12-1 7-4 10-8 10Zm0 0c0-4-2-7-6-8 .5 5 2.5 7 6 7Z",
  maintain: "M12 4v15M6 19h12M5 8h14M5 8 3 13a3 3 0 0 0 4 0L5 8Zm14 0-2 5a3 3 0 0 0 4 0l-2-5Z",
};

const OPEN = "Pick the outcome you want. I’ll do the arithmetic on the next step.";

/** No one in the household yet: start with yourself, or describe everyone at once. */
function FirstRun({ s, onPlan }) {
  return (
    <section data-rise className="mt-8 flex flex-col gap-3 rounded-[28px] border border-koi-forest/10 bg-white p-6">
      <span className="font-koi-display text-[24px] font-extrabold text-koi-forest">Who’s eating?</span>
      <p className="m-0 text-[15px] leading-relaxed text-koi-ink2">Start with yourself — you can add everyone else from the household button above. Or tell KOI about the whole household in one sentence.</p>
      <div className="flex flex-wrap gap-2.5">
        <button type="button" onClick={() => s.addMember("Me")} className="h-12 rounded-2xl bg-koi-forest px-5 text-[15px] font-bold text-koi-lime">Add yourself</button>
        <button type="button" onClick={onPlan} className="h-12 rounded-2xl border border-koi-forest/20 bg-white px-5 text-[15px] font-semibold text-koi-forest">Describe your household</button>
      </div>
    </section>
  );
}

export default function DefineStep({ s, onNext, onPlan }) {
  const root = useRef(null);
  const ember = useEmber();
  const say = useKoiVoice((v) => v.say);
  const person = s.active;
  const key = person ? s.keyOf(person) : null;
  const [words, setWords] = useState("");
  const adult = person ? goalsAllowed(person.age_band) : true;
  const { card: selected, extra } = person ? cardFor(person) : { card: null, extra: null };
  const favourites = person?.favourite_categories ?? [];
  const tries = s.categories.filter((c) => !favourites.includes(c.key)).slice(0, 8);

  // The opening: titles rise, the cards deal in, and KOI lands as the full stop.
  useGSAP(() => {
    const gsap = setupMotion();
    const q = (sel) => root.current.querySelector(sel);
    const qa = (sel) => root.current.querySelectorAll(sel);
    const dot = q("[data-mslot]");
    const land = () => { if (dot) ember.at(dot, { ax: 0.5, ay: 0.5 }); say(OPEN); };
    if (prefersReducedMotion()) { land(); return; }
    const tl = gsap.timeline({ defaults: { ease: E.reveal } });
    tl.from(qa("[data-line]"), { yPercent: 115, duration: 1.05, stagger: 0.1 }, 0.1);
    tl.from(qa("[data-rise]"), { autoAlpha: 0, y: 14, duration: 0.7, stagger: 0.07 }, 0.15);
    tl.from(qa("[data-goal]"), { autoAlpha: 0, y: 30, rotation: (i) => (i % 2 ? 1.5 : -1.5), duration: 0.9, stagger: 0.08, ease: E.dolly }, 0.3);
    tl.add(land, 1.0);
  }, { scope: root });

  useEffect(() => () => ember.rest(), [ember]);

  const backToDot = (ms = 250) => setTimeout(() => {
    const dot = root.current?.querySelector("[data-mslot]");
    if (dot) ember.go(dot, { ax: 0.5, ay: 0.5 });
  }, ms);

  const pick = (cardKey, el) => {
    if (!person) return;
    const patch = applyCard(person, cardKey);
    if (!patch) return;
    s.editProfile(key, patch);
    const card = GOAL_CARDS.find((c) => c.key === cardKey);
    say(cardKey === "recomp" ? "Lose fat and build muscle: maintenance calories, more protein. The numbers come next." : `${card?.title ?? "That"} it is. I’ll work out what that means on the next step.`);
    if (el) ember.go(el, ember.perch(el, 6), () => ember.done(() => backToDot()));
  };
  const add = () => {
    if (!words.trim()) return;
    s.addFavourites(words, key);
    setWords("");
    say("Noted. I’ll lean the plan towards the ones I stock, and tell you about the rest.");
  };

  const people = s.profiles ?? [];

  return (
    <div ref={root} className="font-koi-sans text-koi-ink">
      <section className="grid grid-cols-1 gap-10 pt-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className="flex flex-col gap-4">
          <span data-rise className="font-koi-mono text-xs font-medium uppercase tracking-[0.18em] text-koi-muted">Plan · step 1 of 6</span>
          <span data-rise className="font-koi-mono text-[13px] font-semibold uppercase tracking-[0.2em] text-koi-green">Let’s build</span>
          <h1 className="koi-condensed m-0 font-koi-display text-[clamp(52px,6.4vw,96px)] font-extrabold leading-[0.88] tracking-[-0.035em] text-koi-forest">
            <span className="-mb-[0.06em] block overflow-hidden pb-[0.06em]"><span data-line className="block">your outcome,</span></span>
            <span className="-mb-[0.06em] block overflow-hidden pb-[0.06em]"><span data-line className="block">not a diet<span data-mslot aria-hidden="true" className="ml-[0.04em] inline-block size-[0.16em] rounded-full" /></span></span>
          </h1>
          <p data-rise className="m-0 max-w-[440px] text-lg leading-relaxed text-koi-ink2">We plan what enters your home — and show you the arithmetic, down to the kilo.</p>
          {people.length > 0 && (
            <div data-rise className="mt-3 flex flex-wrap items-center gap-3">
              <span className="flex -space-x-2">
                {people.slice(0, 5).map((p, i) => (
                  <span key={s.keyOf(p)} className="grid size-9 place-items-center rounded-full border-2 border-koi-bg font-koi-num text-[11px] font-bold text-white" style={{ background: MEMBER_COLORS[i % MEMBER_COLORS.length] }}>{initialsOf(p.label)}</span>
                ))}
              </span>
              <span className="text-sm font-semibold text-koi-forest">Household · <span className="font-koi-num">{people.length}</span> {people.length === 1 ? "person" : "people"}</span>
            </div>
          )}
        </div>

        <div role="radiogroup" aria-label="Your goal" className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {GOAL_CARDS.map((card) => {
            const on = adult && selected?.key === card.key;
            return (
              <button
                key={card.key}
                data-goal={card.key}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={(e) => pick(card.key, e.currentTarget)}
                disabled={!adult || !person}
                className={`relative flex min-h-[184px] flex-col gap-2 rounded-[26px] border-2 p-5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${on ? "border-koi-forest bg-koi-forest text-koi-bg shadow-[0_24px_40px_-26px_rgba(8,61,45,.55)]" : "border-koi-forest/10 bg-white text-koi-forest hover:border-koi-forest/30"}`}
              >
                {card.badge && <span className="absolute right-4 top-4 rounded-full bg-koi-ember px-2.5 py-1 font-koi-mono text-[10px] font-bold uppercase tracking-[0.12em] text-white">{card.badge}</span>}
                <span aria-hidden="true" className={`grid size-12 place-items-center rounded-2xl ${on ? "bg-koi-lime/15 text-koi-lime" : "bg-koi-tint text-koi-forest"}`}>
                  <svg className="size-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d={ICONS[card.key]} /></svg>
                </span>
                <span className="mt-auto font-koi-display text-[23px] font-extrabold leading-[1.05] tracking-[-0.01em]">{card.title}</span>
                <span className="text-sm opacity-80">{card.sub}</span>
                {on && (card.note || extra) && <span className="rounded-xl bg-koi-lime/15 px-2.5 py-1.5 font-koi-mono text-[10.5px] font-semibold uppercase tracking-[0.1em] text-koi-lime">{[card.note, extra].filter(Boolean).join(" · ")}</span>}
              </button>
            );
          })}
        </div>
      </section>

      {!person && <FirstRun s={s} onPlan={onPlan} />}

      {!adult && person && (
        <p className="m-0 mt-6 rounded-2xl bg-koi-amber-bg px-4 py-3 text-[13.5px] font-medium text-koi-amber-ink">
          Goals are for adults. KOI plans {person.label}’s week to ICMR-NIN’s needs for their age instead.
        </p>
      )}

      <section data-rise aria-label="What do you love to eat?" className="mt-8 flex flex-col gap-4 rounded-[28px] border border-koi-forest/10 bg-white p-6 lg:p-8">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <span className="flex items-center gap-2.5"><Sparkle size={20} /><span className="font-koi-display text-[26px] font-extrabold tracking-[-0.01em] text-koi-forest">What do you love to eat?</span></span>
          <span className="font-koi-mono text-[11px] font-medium uppercase tracking-[0.14em] text-koi-muted">KOI builds the plan around these</span>
        </div>
        <p className="m-0 max-w-[760px] text-[15px] leading-relaxed text-koi-ink2">Tell me your favourites in plain words — staples, comfort foods, that one snack you won’t give up. KOI leans the plan towards the ones it stocks, and tells you which it doesn’t yet.</p>
        <form onSubmit={(e) => { e.preventDefault(); add(); }} className="flex gap-2">
          <label htmlFor="fav-words" className="sr-only">Favourite foods</label>
          <input
            id="fav-words"
            value={words}
            onChange={(e) => setWords(e.target.value)}
            placeholder="e.g. dry fruit, oats, namkeen, dates…"
            maxLength={200}
            disabled={!person}
            autoComplete="off"
            className="h-14 min-w-0 flex-1 rounded-2xl border border-koi-forest/15 bg-koi-paper px-5 text-base font-medium outline-none transition-colors placeholder:text-koi-muted focus:border-koi-forest focus:bg-white"
          />
          <button type="submit" disabled={!person} className="h-14 shrink-0 rounded-2xl bg-koi-forest px-6 text-[15px] font-bold text-koi-lime disabled:opacity-50">Add</button>
        </form>
        {tries.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-[13px] font-semibold text-koi-muted">Try:</span>
            {tries.map((c) => (
              <button
                key={c.key}
                type="button"
                disabled={!person || favourites.length >= MAX_FAVOURITES}
                onClick={() => s.editProfile(key, { favourite_categories: [...favourites, c.key] })}
                className="h-9 rounded-full border border-koi-forest/10 bg-koi-paper px-3.5 text-[13px] font-medium text-koi-ink2 transition-colors hover:border-koi-forest/30 hover:text-koi-forest disabled:opacity-40"
              >
                + {c.label}
              </button>
            ))}
          </div>
        )}
        <div className="border-t border-koi-forest/10 pt-4">
          <span className="font-koi-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-koi-muted">In your plan · <span className="font-koi-num">{favourites.length}</span></span>
          <div className="mt-2.5 flex min-h-9 flex-wrap gap-1.5">
            {favourites.map((k) => <RemovableChip key={k} label={favouriteLabel(k)} onRemove={() => s.removeFavourite(k, key)} />)}
          </div>
        </div>
      </section>

      <nav aria-label="Step" className="flex flex-wrap items-center justify-between gap-3 pb-4 pt-6">
        <p className="m-0 text-sm text-koi-ink2">
          {person ? <>Planning for <strong className="text-koi-forest">{person.label}</strong>{adult && selected && <> · goal: <strong className="text-koi-forest">{selected.title}</strong></>}</> : "Add someone to start"}
        </p>
        <button type="button" onClick={onNext} className="flex h-14 items-center gap-2.5 rounded-2xl bg-koi-forest px-8 text-base font-bold text-koi-lime transition-transform hover:-translate-y-0.5">
          Continue <Arrow size={20} />
        </button>
      </nav>
    </div>
  );
}
