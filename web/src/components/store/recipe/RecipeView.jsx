"use client";

// ============================================================================
// A recipe, written for whoever is standing at the stove.
//
// One plain page: what it makes and how long it takes, what to get out (ticked
// off as you go, grouped by where it comes from), the method one action at a
// time with the amounts that step uses, and — for a batch or a table of
// people — how to split it, which is the only weighing anyone does. Amounts
// read as a kitchen measures them, with grams one tap away.
//
// Every figure here is the cook plan's (lib/food/cookPlan.js): the pot is the
// sum of the plates, and a plate sized to someone's own numbers says so.
// ============================================================================

import { useRef, useState } from "react";
import Link from "next/link";
import { lineText, renderText } from "@/lib/food/recipes";
import { gramsText } from "@/lib/food/measures";
import { inr } from "@/components/store/plan/design/tokens";
import { setupMotion, prefersReducedMotion, useGSAP, E } from "@/lib/motion/koiMotion";
import { useBarFacts } from "@/components/store/shell/useBarPrompt";

const SUPPLY = [
  { key: "shelf", title: "From your KOI order", tone: "text-koi-green" },
  { key: "fresh", title: "Fresh, wherever you usually buy it", tone: "text-koi-amber-ink" },
  { key: "kitchen", title: "From your kitchen", tone: "text-koi-muted" },
];
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function Segmented({ label, options, value, onChange }) {
  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <span className="text-[15px] font-bold">{label}</span>
      <div role="radiogroup" aria-label={label} className="flex gap-1 rounded-full bg-koi-track p-1">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            onClick={() => onChange(o.value)}
            className={`h-10 rounded-full px-4 text-sm font-bold transition-colors ${value === o.value ? "bg-white text-koi-forest shadow-[0_1px_3px_rgba(20,22,15,.12)]" : "text-koi-ink2 hover:text-koi-forest"}`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function Fact({ value, label, dark = false }) {
  return (
    <div className={`flex flex-col gap-0.5 rounded-[20px] p-4 ${dark ? "bg-koi-forest text-koi-bg" : "border border-koi-forest/10 bg-white"}`}>
      <span className={`font-koi-num text-[20px] font-semibold ${dark ? "" : "text-koi-forest"}`}>{value}</span>
      <span className={`text-[13px] ${dark ? "text-koi-bg/75" : "text-koi-ink2"}`}>{label}</span>
    </div>
  );
}

/**
 * @param {{ plan: object, context: { eyebrow: string, back: string, dayLabels?: Object<string,string> }, unit: "kitchen"|"grams",
 *   onUnit: Function, servings: number, onServings: Function|null, onCook: Function }} props
 */
export default function RecipeView({ plan, context, unit, onUnit, servings, onServings, onCook }) {
  const root = useRef(null);
  const { recipe } = plan;
  useBarFacts({ dish: recipe.name });
  useGSAP(() => {
    if (prefersReducedMotion()) return;
    const gsap = setupMotion();
    gsap.from(root.current.querySelectorAll("[data-line]"), { yPercent: 110, duration: 1, ease: E.reveal });
    gsap.from(root.current.querySelectorAll("[data-rise]"), { autoAlpha: 0, y: 14, duration: 0.7, stagger: 0.06, ease: E.reveal, clearProps: "opacity,visibility,transform" });
  }, { scope: root, dependencies: [recipe.key] });

  const opts = { scale: plan.scale, unit, gramsOf: plan.gramsOf };
  const multi = plan.servings > 1;
  // What's been got out, line by line; "Tick all" for a cook who has it all on the counter.
  const [ticked, setTicked] = useState(() => new Set());
  const listed = recipe.lines.filter((l) => SUPPLY.some((g) => g.key === l.supply)).map((l) => l.index);
  const allTicked = listed.length > 0 && listed.every((i) => ticked.has(i));
  const tick = (i) => setTicked((s) => { const next = new Set(s); if (next.has(i)) next.delete(i); else next.add(i); return next; });
  const sizedBox = plan.boxes.find((b) => b.sized) ?? null;
  const shown = sizedBox ?? plan.boxes[0];
  const dayOf = (cellKey) => (cellKey ? context.dayLabels?.[cellKey.split(":")[0]] ?? null : null);
  const keeps = recipe.keepsDays > 0 ? `${recipe.keepsDays} ${recipe.keepsDays === 1 ? "day" : "days"}` : "Eat it fresh";

  return (
    <main ref={root} className="mx-auto flex w-full max-w-[1180px] flex-col gap-6 px-[clamp(16px,4vw,40px)] pb-28 pt-6 font-koi-sans text-koi-ink">
      <Link href={context.back} className="flex min-h-11 items-center gap-1.5 self-start text-sm font-semibold text-koi-primary no-underline hover:underline">
        <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M19 12H5M11 18l-6-6 6-6" /></svg>
        This week
      </Link>

      <header className="flex max-w-[820px] flex-col gap-2.5">
        <span data-rise className="font-koi-mono text-xs font-semibold uppercase tracking-[0.18em] text-koi-green">{context.eyebrow}</span>
        <h1 className="koi-condensed m-0 font-koi-display text-[clamp(44px,6vw,80px)] font-extrabold leading-[0.9] tracking-[-0.035em] text-koi-forest">
          <span className="-mb-[0.06em] block overflow-hidden pb-[0.06em]"><span data-line className="block">{recipe.name}</span></span>
        </h1>
        <p data-rise className="m-0 text-lg leading-relaxed text-koi-ink2">
          A typical home recipe, sized {sizedBox ? "to your own numbers" : multi ? `for ${plan.servings} servings` : "for one"}. Cook it your way; the amounts are what the plan counts.
        </p>
      </header>

      <div data-rise className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Fact value={recipe.prepMinutes ? `${recipe.prepMinutes} min` : "—"} label="to make" />
        <Fact value={plan.mode === "batch" ? `${plan.servings} boxes` : `${plan.servings} ${plan.servings === 1 ? "plate" : "plates"}`} label={plan.mode === "batch" ? "cooked once, boxed" : "from this pot"} />
        <Fact value={keeps} label={recipe.keepsDays > 0 ? "in the fridge, lids on" : "it doesn't keep well"} />
        <Fact dark value={`${inr(shown.nutrition.kcal)} kcal`} label={`each ${sizedBox ? `of ${sizedBox.label === "Me" ? "your" : `${sizedBox.label}'s`} plates` : "plate"}, ${Math.round(shown.nutrition.protein)} g protein`} />
      </div>

      <div data-rise className="flex flex-wrap items-center justify-between gap-4 rounded-[22px] border border-koi-forest/10 bg-white px-4 py-3.5">
        {onServings ? (
          <Segmented label="Make" value={servings} onChange={onServings} options={[1, 2, 4].map((n) => ({ value: n, label: n === 1 ? "1 serving" : `${n} servings` }))} />
        ) : (
          <span className="text-[15px] font-bold">{plan.mode === "batch" ? `Batch for ${plan.boxes.map((b) => b.label).filter(Boolean).join(" and ")}` : `For ${plan.boxes.map((b) => b.label).filter(Boolean).join(" and ")}`}</span>
        )}
        <Segmented label="Show amounts in" value={unit} onChange={onUnit} options={[{ value: "kitchen", label: "Cups & spoons" }, { value: "grams", label: "Grams" }]} />
      </div>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[400px_minmax(0,1fr)]">
        <section data-rise aria-labelledby="need-h" className="flex flex-col gap-1.5 rounded-[28px] border border-koi-forest/10 bg-white p-6 lg:sticky lg:top-[calc(var(--koi-header-h)+20px)]">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="need-h" className="m-0 font-koi-display text-[26px] font-extrabold text-koi-forest">What you need</h2>
            <span className="font-koi-mono text-[11px] font-medium uppercase tracking-[0.12em] text-koi-muted">{plan.servings} {plan.mode === "batch" ? "boxes" : plan.servings === 1 ? "serving" : "servings"}</span>
          </div>
          <div className="mb-1 flex items-center justify-between gap-3">
            <p className="m-0 text-[13px] text-koi-muted">Tick things off as you get them out.</p>
            <button type="button" onClick={() => setTicked(allTicked ? new Set() : new Set(listed))} aria-pressed={allTicked} className="h-9 shrink-0 rounded-full border border-koi-forest/15 px-3.5 text-[12.5px] font-semibold text-koi-forest transition-colors hover:border-koi-forest/40">
              {allTicked ? "Untick all" : "Tick all"}
            </button>
          </div>
          {SUPPLY.map((group) => {
            const lines = recipe.lines.filter((l) => l.supply === group.key);
            if (!lines.length) return null;
            return (
              <div key={group.key} className="flex flex-col">
                <span className={`pb-1 pt-3 font-koi-mono text-[11px] font-semibold uppercase tracking-[0.16em] ${group.tone}`}>{group.title}</span>
                {lines.map((l) => {
                  const t = lineText(l, opts);
                  const id = `ing-${recipe.key}-${l.index}`;
                  return (
                    <label key={l.index} htmlFor={id} className="flex cursor-pointer items-center gap-3.5 border-t border-koi-forest/10 py-3">
                      <input id={id} type="checkbox" checked={ticked.has(l.index)} onChange={() => tick(l.index)} className="peer size-5 shrink-0 cursor-pointer accent-koi-forest" />
                      <span className="min-w-0 flex-1 text-base leading-snug peer-checked:text-koi-muted peer-checked:line-through">
                        <strong className="font-bold">{t.amount}</strong>{t.name ? ` ${t.name}` : ""}
                        {l.optional && <span className="text-[13px] text-koi-muted"> (optional)</span>}
                      </span>
                      {unit === "kitchen" && t.grams >= 20 && !/\d (g|kg)$/.test(t.amount) && <span className="shrink-0 font-koi-num text-[12px] text-koi-muted">{t.grams} g</span>}
                    </label>
                  );
                })}
              </div>
            );
          })}
        </section>

        <div className="flex min-w-0 flex-col gap-6">
          <section data-rise aria-labelledby="how-h" className="flex flex-col rounded-[28px] border border-koi-forest/10 bg-white p-6">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-2">
              <h2 id="how-h" className="m-0 font-koi-display text-[26px] font-extrabold text-koi-forest">How to make it</h2>
              <button type="button" onClick={onCook} className="flex h-12 items-center gap-2.5 rounded-2xl bg-koi-forest px-5 text-[15px] font-bold text-koi-lime transition-transform hover:-translate-y-0.5">
                <svg className="size-[18px]" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>
                Start cook mode
              </button>
            </div>
            <ol className="m-0 flex list-none flex-col p-0">
              {recipe.steps.map((st, i) => (
                <li key={st.n} className="flex gap-[18px] border-t border-koi-forest/10 py-5">
                  <span aria-hidden="true" className={`grid size-10 shrink-0 place-items-center rounded-full font-koi-num text-[17px] font-bold ${i === recipe.steps.length - 1 ? "bg-koi-lime text-koi-forest" : "bg-koi-forest text-koi-lime"}`}>{st.n}</span>
                  <div className="flex min-w-0 flex-1 flex-col gap-2">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <h3 className="m-0 text-[19px] font-extrabold">{st.title}</h3>
                      {st.minutes ? <span className="rounded-full bg-koi-track px-2.5 py-0.5 font-koi-num text-xs font-semibold text-koi-ink2">{st.minutes} min</span> : null}
                    </div>
                    <p className="m-0 max-w-[62ch] text-[17px] leading-relaxed">{renderText(st.text, recipe, opts)}</p>
                    {st.uses.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {st.uses.map((u) => {
                          const t = lineText(recipe.lines[u], opts);
                          return <span key={u} className="rounded-lg bg-koi-lime-soft px-2.5 py-1 text-[12.5px] font-semibold text-koi-forest">{t.amount}{t.name ? ` ${t.name}` : ""}</span>;
                        })}
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </section>

          {multi ? (
            <section data-rise aria-labelledby="split-h" className="flex flex-col gap-3.5 rounded-[28px] bg-koi-forest p-6 text-koi-bg">
              <span className="font-koi-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-koi-lime">The only weighing you do</span>
              <h2 id="split-h" className="m-0 font-koi-display text-[28px] font-extrabold leading-tight">{plan.mode === "batch" ? `Split it into ${plan.servings} boxes` : `Split it into ${plan.servings} plates`}</h2>
              <p className="m-0 max-w-[62ch] text-base leading-relaxed text-koi-bg/85">
                Weigh the empty pot, then the full one{plan.cookedGrams ? `: about ${gramsText(plan.cookedGrams)} of food in all` : ""}. Fill each {plan.mode === "batch" ? "box" : "plate"} by weight, as below, and every one is on its plan — nothing is weighed at the plate.
              </p>
              <ul className="m-0 grid list-none grid-cols-1 gap-2.5 p-0 sm:grid-cols-2">
                {plan.boxes.map((b, i) => (
                  <li key={`${b.memberId}-${i}`} className="flex flex-col gap-0.5 rounded-[18px] bg-koi-bg/10 p-4">
                    <span className="font-koi-mono text-[10.5px] uppercase tracking-[0.14em] text-koi-bg/70">{b.label ?? "A serving"}{b.sized ? " · own numbers" : ""}</span>
                    <span className="text-[17px] font-bold">{b.count} × {b.servedGrams ? `about ${b.servedGrams} g` : "one serving"}</span>
                    {plan.mode === "batch" && <span className="text-[13px] text-koi-bg/75">{b.cells.map(dayOf).filter(Boolean).join(", ")}</span>}
                    <span className="font-koi-num text-[13px] text-koi-lime">{inr(b.nutrition.kcal)} kcal · P {Math.round(b.nutrition.protein)} · C {Math.round(b.nutrition.carbs)} · F {Math.round(b.nutrition.fat)}</span>
                  </li>
                ))}
              </ul>
              {plan.mode === "batch" && <p className="m-0 text-sm text-koi-bg/80">Cool, lids on, into the fridge. Reheat 2 minutes with a splash of water, or eat it cold.</p>}
            </section>
          ) : (
            <section data-rise className="flex flex-col gap-2 rounded-[28px] bg-koi-forest p-6 text-koi-bg">
              <span className="font-koi-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-koi-lime">No weighing at the plate</span>
              <p className="m-0 text-base leading-relaxed text-koi-bg/85">Cook it, plate all of it, eat it. The amounts above are already the plan&apos;s.</p>
            </section>
          )}

          <section data-rise aria-labelledby="in-h" className="flex flex-col gap-3.5 rounded-[28px] border border-koi-forest/10 bg-white p-6">
            <h2 id="in-h" className="m-0 text-lg font-extrabold">What&apos;s in each {plan.mode === "batch" ? "box" : "plate"}</h2>
            <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
              {[["Calories", inr(shown.nutrition.kcal), ""], ["Protein", Math.round(shown.nutrition.protein), " g"], ["Carbs", Math.round(shown.nutrition.carbs), " g"], ["Fat", Math.round(shown.nutrition.fat), " g"]].map(([label, value, u]) => (
                <div key={label} className="rounded-2xl bg-koi-paper p-3.5">
                  <div className="text-[13px] text-koi-ink2">{label}</div>
                  <div className="font-koi-num text-[26px] font-semibold text-koi-forest">{value}{u}</div>
                </div>
              ))}
            </div>
            <p className="m-0 text-[12.5px] leading-normal text-koi-muted">
              {sizedBox ? `${sizedBox.label === "Me" ? "Your" : `${sizedBox.label}'s`} box, sized to ${sizedBox.label === "Me" ? "your" : "their"} own numbers. ` : ""}From raw weights: IFCT 2017 values for the fresh things, the pack label for what comes from KOI where the plan has it. Typical home cooking; more oil in the pan changes it a little.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}

export { DAY_NAMES };
