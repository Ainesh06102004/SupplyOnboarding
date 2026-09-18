"use client";

// ============================================================================
// The kitchen's own rules (migration 00052, plan §9.10.3 Tier 1)
//
// Standing facts about a household rather than about this week: brands it will
// not buy and brands it likes, how much of a pack may go unfinished, how much
// of last week's shopping may come back, and what is already in the cupboard.
//
// Each one is saved on its own, the moment it is changed, because a settings
// page with a Save button at the bottom loses work when someone leaves. The
// plan reads them next time it solves; nothing here changes a plan already on
// screen.
// ============================================================================

import { useState } from "react";
import { Plus, X } from "lucide-react";

const LABEL = "text-[11px] font-semibold uppercase tracking-[0.08em] text-[#5A6B5A]";
const HINT = "mt-1 text-[11.5px] text-[#5A6B5A]";
const CARD = "mt-8 rounded-2xl border border-[#083D2D]/10 bg-white p-4";

/**
 * What to protect first (00054, model.js PRIORITY), as answers rather than
 * weights. A shopper ranks things by saying what kind of shopper they are; the
 * numbers underneath are KOI's business, and showing them would only invite
 * fiddling with a dial nobody can reason about.
 */
export const PRIORITY_PRESETS = Object.freeze([
  { key: "koi", label: "Let KOI decide", hint: "Targets first, then the budget", priorities: [] },
  { key: "budget", label: "Stay in budget", hint: "Rather go a little short than overspend", priorities: ["budget", "targets", "less_processed", "familiar", "variety"] },
  { key: "targets", label: "Hit the targets", hint: "Spend more before anyone goes short", priorities: ["targets", "budget", "less_processed", "familiar", "variety"] },
  { key: "quality", label: "The best food we can afford", hint: "Better-screened food comes first", priorities: ["less_processed", "targets", "budget", "familiar", "variety"] },
  { key: "familiar", label: "Keep it familiar", hint: "What we already buy, week to week", priorities: ["familiar", "targets", "budget", "less_processed", "variety"] },
  { key: "variety", label: "Something different", hint: "More products, fewer repeats of each", priorities: ["variety", "targets", "budget", "less_processed", "familiar"] },
]);

/** Which preset a stored order is, by its first answer. */
export const presetFor = (priorities = []) => {
  const first = (priorities ?? [])[0];
  return PRIORITY_PRESETS.find((p) => p.priorities[0] === first)?.key ?? "koi";
};

export const WASTE_TOLERANCES = Object.freeze([
  { key: "none", label: "Nothing left over", hint: "Packs sized by what you normally eat" },
  { key: "some", label: "A little", hint: "The usual" },
  { key: "any", label: "Doesn't matter", hint: "Buy what fits the targets" },
]);

export const REPEAT_TOLERANCES = Object.freeze([
  { key: "low", label: "Something different", hint: "Last week's packs cost more" },
  { key: "usual", label: "No preference", hint: "The usual" },
  { key: "high", label: "The same is fine", hint: "Last week's packs cost less" },
]);

/** One row of choices, where choosing the chosen one does nothing. */
function Choices({ name, options, value, onChange, busy }) {
  return (
    <div className="mt-1.5 flex flex-wrap gap-1.5" role="group" aria-label={name}>
      {options.map((option) => {
        const on = value === option.key;
        return (
          <button key={option.key} type="button" aria-pressed={on} disabled={busy} onClick={() => onChange(option.key)}
                  title={option.hint}
                  className={`rounded-full border px-2.5 py-1 text-[11.5px] disabled:opacity-50 ${on ? "border-[#16A06E] bg-[#16A06E]/10 font-semibold text-[#0E4032]" : "border-[#083D2D]/10 bg-white text-[#5A6B5A]"}`}>
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * A list of words the shopper adds to and takes from.
 *
 * `known` is what KOI can actually match the word against. It is offered as
 * suggestions, and a word that matches none of it is still saved — with a line
 * saying so, because a brand rule that quietly does nothing is worse than one
 * that says it is waiting for a shelf that carries it.
 */
function Words({ id, label, hint, words, placeholder, onAdd, onRemove, busy, known = null }) {
  const [typed, setTyped] = useState("");
  const add = () => {
    const word = typed.trim();
    if (!word) return;
    setTyped("");
    onAdd(word);
  };
  const same = (a, b) => String(a).toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim()
    === String(b).toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();
  const unknown = known ? words.filter((w) => !known.some((k) => same(k, w.label ?? w))) : [];
  return (
    <div className="mt-4">
      <span className={LABEL}>{label}</span>
      <p className={HINT}>{hint}</p>
      {words.length > 0 && (
        <ul className="mt-1.5 flex flex-wrap gap-1.5">
          {words.map((word) => (
            <li key={word.key ?? word}>
              <span className="inline-flex items-center gap-1 rounded-full border border-[#083D2D]/10 bg-[#083D2D]/[0.04] py-1 pl-2.5 pr-1 text-[11.5px] text-[#0E4032]">
                {word.label ?? word}
                <button type="button" aria-label={`Remove ${word.label ?? word}`} disabled={busy}
                        onClick={() => onRemove(word)} className="rounded-full p-0.5 text-[#5A6B5A] hover:text-[#B4453C] disabled:opacity-50">
                  <X className="h-3 w-3" />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
      {unknown.length > 0 && (
        <p className="mt-1 text-[11.5px] text-[#8A6D1F]">
          KOI doesn&apos;t stock {unknown.map((w) => w.label ?? w).join(", ")} yet. Saved, and it applies the day the shop does.
        </p>
      )}
      <div className="mt-1.5 flex items-center gap-1.5">
        <input id={id} value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={placeholder} maxLength={80}
               list={known ? `${id}-known` : undefined}
               onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
               className="min-w-0 flex-1 rounded-xl border border-[#083D2D]/15 bg-white px-3 py-1.5 text-[12.5px]" />
        {known && (
          <datalist id={`${id}-known`}>
            {known.map((brand) => <option key={brand} value={brand} />)}
          </datalist>
        )}
        <button type="button" onClick={add} disabled={busy || !typed.trim()}
                className="inline-flex items-center gap-1 rounded-xl border border-[#083D2D]/15 px-2.5 py-1.5 text-[12px] font-semibold text-[#0E4032] disabled:opacity-40">
          <Plus className="h-3.5 w-3.5" /> Add
        </button>
      </div>
    </div>
  );
}

/**
 * @param {object} props
 * @param {object} props.household the row: refused_brands, preferred_brands, waste_tolerance, repeat_tolerance
 * @param {Array} props.pantry rows of household_pantry: { id, label, sku_id }
 * @param {(patch: object) => Promise<void>} props.onSaveHousehold
 * @param {(label: string) => Promise<void>} props.onAddPantry
 * @param {(row: object) => Promise<void>} props.onRemovePantry
 * @param {string[]} props.brands the brand names KOI carries, for suggestions
 * @param {boolean} props.busy
 */
export default function KitchenRules({ household, pantry = [], brands = [], onSaveHousehold, onAddPantry, onRemovePantry, busy = false }) {
  if (!household) return null;
  const refused = household.refused_brands ?? [];
  const preferred = household.preferred_brands ?? [];

  const save = (patch) => onSaveHousehold(patch);
  const withoutBrand = (list, brand) => list.filter((b) => b !== brand);
  // A brand cannot be liked and refused at once: the newer answer wins.
  const addBrand = (which, brand) => {
    const other = which === "refused_brands" ? "preferred_brands" : "refused_brands";
    const lists = { refused_brands: refused, preferred_brands: preferred };
    if (lists[which].some((b) => b.toLowerCase() === brand.toLowerCase())) return Promise.resolve();
    return save({
      [which]: [...lists[which], brand],
      [other]: lists[other].filter((b) => b.toLowerCase() !== brand.toLowerCase()),
    });
  };

  return (
    <section className={CARD}>
      <p className="text-[12px] font-semibold text-[#0E4032]">Your kitchen</p>
      <p className="mt-0.5 text-[11.5px] text-[#5A6B5A]">
        How you shop, rather than what anyone eats. Every plan from here on follows these; the plan on screen is left alone.
      </p>

      <div className="mt-3">
        <span className={LABEL}>What matters most</span>
        <Choices name="What matters most" options={PRIORITY_PRESETS} busy={busy}
                 value={presetFor(household.priorities)}
                 onChange={(key) => save({ priorities: PRIORITY_PRESETS.find((p) => p.key === key)?.priorities ?? [] })} />
        <p className={HINT}>
          {PRIORITY_PRESETS.find((p) => p.key === presetFor(household.priorities))?.hint}. KOI solves for this first and
          fits everything else underneath it.
        </p>
      </div>

      <div className="mt-4">
        <span className={LABEL}>Leftovers</span>
        <Choices name="Leftovers" options={WASTE_TOLERANCES} busy={busy}
                 value={household.waste_tolerance ?? "some"} onChange={(waste_tolerance) => save({ waste_tolerance })} />
      </div>

      <div className="mt-4">
        <span className={LABEL}>Next week</span>
        <Choices name="Next week" options={REPEAT_TOLERANCES} busy={busy}
                 value={household.repeat_tolerance ?? "usual"} onChange={(repeat_tolerance) => save({ repeat_tolerance })} />
      </div>

      <Words id="refused-brands" label="Brands to skip" busy={busy} words={refused}
             hint="Nothing from these is ever planned for you."
             placeholder="A brand you won't buy" known={brands}
             onAdd={(brand) => addBrand("refused_brands", brand)}
             onRemove={(brand) => save({ refused_brands: withoutBrand(refused, brand) })} />

      <Words id="preferred-brands" label="Brands you like" busy={busy} words={preferred}
             hint="Chosen where the rest is equal. It never decides against a target."
             placeholder="A brand you reach for" known={brands}
             onAdd={(brand) => addBrand("preferred_brands", brand)}
             onRemove={(brand) => save({ preferred_brands: withoutBrand(preferred, brand) })} />

      <Words id="pantry" label="Already in the cupboard" busy={busy}
             words={pantry.map((row) => ({ key: row.id, label: row.label ?? row.name ?? "Something", row }))}
             hint="KOI plans around these instead of buying them again. Take one off when it runs out."
             placeholder="Rice, atta, oats…"
             onAdd={(label) => onAddPantry(label)}
             onRemove={(word) => onRemovePantry(word.row)} />
    </section>
  );
}
