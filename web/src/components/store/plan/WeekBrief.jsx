"use client";

// ============================================================================
// The brief — who is eating, for how long, on what
//
// Everything a plan is asked for, in a rail that stays beside the plan instead
// of above it. Before, the form ran the full width and the basket began below
// the fold of the fold: four screens of page, and the thing the shopper came
// for was the last of it.
//
// A person is one line until they are opened. Their profile is not editable
// here and never was, so showing it as a form was showing work that could not
// be done — what belongs to this week is behind "This week", closed, because
// most weeks it is not touched at all.
// ============================================================================

import { ChevronDown, Loader2, Pencil, ShoppingBasket } from "lucide-react";
import Link from "next/link";
import ThisWeekChips from "./ThisWeekChips";

const FIELD = "w-full rounded-xl bg-white px-3 py-2 text-[13px] text-[#0E4032] ring-1 ring-inset ring-[#083D2D]/12 focus:outline-none focus:ring-[1.5px] focus:ring-[#0E4032]";
const EYEBROW = "text-[10.5px] font-semibold uppercase tracking-[0.09em] text-[#5A6B5A]";

/** What this person's week already says, in a few words, so a closed row still tells. */
function saysThisWeek(choice, dietLabel) {
  const bits = [];
  if (choice.dietType) bits.push(dietLabel);
  if (choice.prefer.length) bits.push(`${choice.prefer.length} more of`);
  if (choice.skip.length) bits.push(`${choice.skip.length} skipped`);
  return bits.join(" · ");
}

/**
 * @param {object} props
 * @param {Array} props.profiles every saved member
 * @param {string[]} props.picked who is eating this week
 * @param {(ids: string[]) => void} props.onPicked
 * @param {(id: string) => object} props.choiceFor
 * @param {(id: string, patch: object) => void} props.setChoice
 * @param {string|null} props.openMember whose week is open
 * @param {(id: string|null) => void} props.onOpenMember
 * @param {Array} props.categories
 * @param {Array} props.dietTypes
 * @param {(list: Array, key: string) => string} props.labelOf
 * @param {(profile: object) => string} props.profileSummary
 */
export default function WeekBrief({
  profiles, picked, onPicked, choiceFor, setChoice, openMember, onOpenMember,
  categories, dietTypes, labelOf, profileSummary, avoidWords,
  days, onDays, budget, onBudget, onPlan, busy, ready, chosenCount,
}) {
  const toggle = (id) => onPicked(picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id]);

  return (
    <div className="rounded-3xl bg-white/70 p-5 ring-1 ring-inset ring-[#083D2D]/8">
      <div className="flex items-baseline justify-between gap-2">
        <span className={EYEBROW}>Who&apos;s eating</span>
        <Link href="/store/household" className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-[#16A06E] hover:underline">
          <Pencil className="h-3 w-3" /> Profiles
        </Link>
      </div>

      <ul className="mt-2 -mx-1.5">
        {profiles.map((profile) => {
          const on = picked.includes(profile.memberId);
          const open = openMember === profile.memberId;
          const choice = choiceFor(profile.memberId);
          const said = saysThisWeek(choice, labelOf(dietTypes, choice.dietType));
          return (
            <li key={profile.memberId} className="rounded-xl px-1.5">
              <div className={`flex items-start gap-2.5 py-2.5 ${on ? "" : "opacity-45"}`}>
                <input type="checkbox" checked={on} onChange={() => toggle(profile.memberId)}
                       aria-label={`${profile.label} is eating this week`}
                       className="mt-[3px] h-3.5 w-3.5 shrink-0 accent-[#0E4032]" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-semibold leading-tight text-[#0E4032]">
                    {profile.label}
                    {profile.is_account_holder && <span className="ml-1.5 text-[10.5px] font-medium text-[#16A06E]">You</span>}
                  </p>
                  <p className="mt-0.5 truncate text-[11.5px] leading-tight text-[#5A6B5A]">{profileSummary(profile)}</p>
                  {avoidWords(profile) && (
                    <p className="mt-0.5 truncate text-[11.5px] leading-tight text-[#B4453C]/80">{avoidWords(profile)}</p>
                  )}
                </div>
                {on && (
                  <button type="button" onClick={() => onOpenMember(open ? null : profile.memberId)}
                          aria-expanded={open}
                          className="shrink-0 rounded-lg px-1.5 py-1 text-[11px] text-[#5A6B5A] hover:bg-[#083D2D]/[0.04] hover:text-[#0E4032]">
                    <span className="mr-1">{said || "This week"}</span>
                    <ChevronDown className={`inline h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`} />
                  </button>
                )}
              </div>

              {on && open && (
                <div className="space-y-3 pb-3 pl-6">
                  <label className="block">
                    <span className={EYEBROW}>Diet, this week only</span>
                    <select value={choice.dietType ?? ""} onChange={(e) => setChoice(profile.memberId, { dietType: e.target.value || null })}
                            className={`mt-1 ${FIELD}`}>
                      <option value="">As on their profile ({labelOf(dietTypes, profile.diet_type)})</option>
                      {dietTypes.map((d) => <option key={d.key} value={d.key}>{d.label} for this plan</option>)}
                    </select>
                  </label>
                  {categories.length > 0 && (
                    <ThisWeekChips
                      categories={categories}
                      prefer={choice.prefer}
                      skip={choice.skip}
                      onChange={(key, state) => setChoice(profile.memberId, {
                        prefer: state === "want" ? [...choice.prefer, key] : choice.prefer.filter((k) => k !== key),
                        skip: state === "skip" ? [...choice.skip, key] : choice.skip.filter((k) => k !== key),
                      })}
                    />
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <div className="mt-4 grid grid-cols-[5rem_1fr] gap-2 border-t border-[#083D2D]/8 pt-4">
        <label className="block">
          <span className={EYEBROW}>Days</span>
          <input value={days} onChange={(e) => onDays(e.target.value)} inputMode="numeric" className={`mt-1 ${FIELD}`} />
        </label>
        <label className="block">
          <span className={EYEBROW}>Budget ₹</span>
          <input value={budget} onChange={(e) => onBudget(e.target.value)} inputMode="numeric" placeholder="No limit" className={`mt-1 ${FIELD}`} />
        </label>
      </div>

      <button type="button" onClick={onPlan} disabled={!ready || busy}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#0E4032] px-4 py-2.5 text-[13px] font-bold text-white transition-opacity disabled:opacity-40">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShoppingBasket className="h-4 w-4" />}
        {busy ? "Working it out…" : `Plan for ${chosenCount || "nobody"}`}
      </button>
      {!ready && <p className="mt-2 text-center text-[11.5px] text-[#5A6B5A]">Choose at least one person.</p>}
    </div>
  );
}
