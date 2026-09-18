"use client";

// ============================================================================
// /store/plan — plan the week for the people who are eating it
//
// Phase 3, reworked at §9.10.2: this page no longer edits people. Everyone
// comes from their saved profile (/store/household), shown as it stands, and
// the only things editable here are the ones that belong to this week:
//
//   * who is eating (a profile can sit this one out);
//   * the diet they want for this plan alone;
//   * what they feel like eating, and what to leave out for them;
//   * how many days, and the budget.
//
// Nothing typed here changes a profile. A follow-up in the copilot changes the
// plan; it reaches a profile only when the shopper says so.
//
// Every figure comes from the planner (/api/plan), computed from declared label
// figures and the solver's own allocation. Nothing here invents a number, and
// nothing calls a food good or bad.
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Loader2, ShoppingBasket, TriangleAlert, UserRoundPlus, Pencil } from "lucide-react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { DIET_TYPES, FOODS_AVOID } from "@/lib/recommendation/config";
import { isTestSku } from "@/lib/data/testCatalogue";
import { fetchAllProducts } from "@/lib/data/productFetcher";
import { nodeInfo } from "@/lib/food/taxonomy";
import { useCartStore, hydrateCart } from "@/store/cartStore";
import { AGE_BANDS, MAX_BRIEF_CHARS } from "@/lib/planner/brief";
import { followUpExamples } from "@/lib/planner/followup";
import { goalsAllowed, ENERGY_GOALS, EATING_PATTERNS } from "@/lib/planner/goals";
import { readFollowUp } from "@/lib/planner/followup";
import { profileFromRow, profileSummary, memberPayload, avoidsPayload, blankProfile, profilesNamedIn, profilesNamed, SEVERITIES } from "@/lib/household/profile";
import PlanCopilot from "@/components/store/plan/PlanCopilot";
import WeekBrief from "@/components/store/plan/WeekBrief";
import PlanResult from "@/components/store/plan/PlanResult";

/** The chat is kept in the shopper's own browser, per household, most recent last. */
const CHAT_KEY = "koi_plan_chat_v1";
const CHAT_TURNS = 40;

const MEMBER_FIELDS = "id, label, relation, age_band, sex, activity_level, diet_type, energy_goal, eating_pattern, age_years, weight_kg, height_cm, appetite, meals_from_home, target_kcal, target_protein_g, target_source, account_profile_id, version, created_at, household_member_avoid(avoid_key, severity)";

const num = (v) => (v === "" || v === null || v === undefined ? null : Number(v));
const dayCount = (days) => `${days} ${Number(days) === 1 ? "day" : "days"}`;
const labelOf = (list, key) => list.find((x) => x.key === key)?.label ?? key;

/** A person's share of a product: "1.4 kg", "350 g", or packs when KOI cannot measure the pack. */
const shareOf = ({ amount, unit, packs }) => {
  if (amount === null || amount === undefined || !unit) return `${packs} ${packs === 1 ? "pack" : "packs"}`;
  const big = { g: "kg", ml: "L" }[unit];
  return big && amount >= 1000 ? `${Math.round(amount / 100) / 10} ${big}` : `${amount} ${unit}`;
};

/** "Rice (Me 180 g, Partner 162 g)" — what the portion ceiling held, a day. */
const describeLimit = (limit) =>
  `${limit.name ?? "A product"} (${limit.members.map((m) => `${m.label ?? "someone"} ${m.perDay ?? "?"} ${m.unit ?? ""}`.trim()).join(", ")})`;

/** The kinds of food KOI actually stocks, as things a person can feel like eating. */
function categoriesFrom(products) {
  const byKey = new Map();
  for (const product of products) {
    const key = product?.categoryKey;
    if (!key || byKey.has(key)) continue;
    const info = nodeInfo(key);
    const label = info?.subcategory ?? info?.label ?? key;
    byKey.set(key, { key, label: String(label) });
  }
  return [...byKey.values()].sort((a, b) => a.label.localeCompare(b.label));
}

/** What this person must never be given, short enough for one line. */
const avoidWords = (profile) => (profile.avoids ?? [])
  .map((a) => `${labelOf(FOODS_AVOID, a.key)} (${(SEVERITIES.find((x) => x.key === a.severity)?.label ?? a.severity).toLowerCase()})`)
  .join(", ");

/** Goals in words: "Lose weight, high protein", or null when there is no goal. */
const goalWords = (profile) => {
  if (!goalsAllowed(profile.age_band)) return null;
  const words = [
    profile.energy_goal !== "maintain" ? labelOf(ENERGY_GOALS, profile.energy_goal) : null,
    profile.eating_pattern !== "balanced" ? labelOf(EATING_PATTERNS, profile.eating_pattern).toLowerCase() : null,
  ].filter(Boolean);
  return words.length ? words.join(", ") : null;
};

/** Everything a plan needs to know about this shopper's household. */
async function readHousehold() {
  const supabase = getSupabaseClient();
  const { data: auth } = await supabase.auth.getUser();
  const user = auth?.user ?? null;
  if (!user) return { user: null, household: null, profiles: [] };
  const { data: household, error } = await supabase
    .from("household")
    .select(`id, keep_out, household_member(${MEMBER_FIELDS})`)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return { user, household: null, profiles: [], error: "Your household could not be loaded." };
  const profiles = [...(household?.household_member ?? [])]
    .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
    .map(profileFromRow);

  // What the last plan was asked for. "Replan with 75 g protein for my wife,
  // rest all same params" means the days, the budget and the people from last
  // time — so the form opens on them rather than on 7 days and no budget.
  let last = null;
  if (household?.id) {
    const { data: plan } = await supabase
      .from("plan")
      .select("days, budget_rupees, constraints")
      .eq("household_id", household.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (plan) {
      last = {
        days: plan.days,
        budget: plan.budget_rupees === null ? "" : String(plan.budget_rupees),
        memberIds: (plan.constraints?.members ?? []).map((m) => String(m.id)),
      };
    }
  }
  return { user, household: household ?? null, profiles, last };
}

export default function PlanPage() {
  const [session, setSession] = useState(undefined);
  const [householdId, setHouseholdId] = useState(null);
  const [keepOut, setKeepOut] = useState([]);
  const [profiles, setProfiles] = useState([]);
  // This week: who is eating, and what each of them chose for this plan alone.
  const [picked, setPicked] = useState([]);
  const [thisWeek, setThisWeek] = useState({});
  const [categories, setCategories] = useState([]);
  const [days, setDays] = useState(7);
  const [budget, setBudget] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [plan, setPlan] = useState(null);
  // skuId -> { busy, result, error }: "what if I can't get this?"
  const [without, setWithout] = useState({});
  const [cartResult, setCartResult] = useState(null);
  // Whose week is open. One at a time: a rail of open forms is the page this
  // replaced.
  const [openMember, setOpenMember] = useState(null);

  const load = useCallback(async () => {
    const { user, household, profiles: saved, last, error: loadError } = await readHousehold();
    setSession(user);
    if (loadError) setError(loadError);
    setHouseholdId(household?.id ?? null);
    setKeepOut(household?.keep_out ?? []);
    setProfiles(saved);
    // The last plan's people, days and budget, so planning again keeps them.
    const kept = (last?.memberIds ?? []).filter((id) => saved.some((p) => p.memberId === id));
    setPicked(kept.length ? kept : saved.map((p) => p.memberId));
    if (last?.days) setDays(last.days);
    if (last?.budget !== undefined && last?.budget !== null) setBudget(last.budget);
    return saved;
  }, []);

  useEffect(() => {
    let live = true;
    (async () => {
      await load();
      const products = await fetchAllProducts().catch(() => []);
      if (live) setCategories(categoriesFrom(products));
    })();
    return () => { live = false; };
  }, [load]);

  const chosen = useMemo(() => profiles.filter((p) => picked.includes(p.memberId)), [profiles, picked]);
  const ready = chosen.length > 0;

  const choiceFor = (memberId) => thisWeek[memberId] ?? { dietType: null, prefer: [], skip: [] };
  const setChoice = (memberId, patch) => setThisWeek((all) => ({ ...all, [memberId]: { ...choiceFor(memberId), ...patch } }));
  const toggleCategory = (memberId, field, key) => {
    const choice = choiceFor(memberId);
    const other = field === "prefer" ? "skip" : "prefer";
    setChoice(memberId, {
      [field]: choice[field].includes(key) ? choice[field].filter((k) => k !== key) : [...choice[field], key],
      // A person cannot both feel like something and skip it.
      [other]: choice[other].filter((k) => k !== key),
    });
  };

  /**
   * Plan for the people ticked above. Days and budget are passed in, because
   * the copilot can read them out of a sentence and plan in the same breath,
   * before React has re-rendered the form.
   */
  async function makePlan({ daysNow = Number(days), budgetNow = num(budget), memberIds = picked, targets = {} } = {}) {
    setBusy(true);
    setError(null);
    setPlan(null);
    setWithout({});
    try {
      const response = await fetch("/api/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          householdId,
          days: daysNow,
          budget: budgetNow,
          memberIds,
          thisWeek: Object.fromEntries(memberIds.map((id) => [id, { ...choiceFor(id), ...(targets[id] ? { targets: targets[id] } : {}) }])),
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error ?? "The plan could not be built.");
      setPlan(body);
      setCopilotOpen(true);
      return body;
    } catch (err) {
      setError(err?.message ?? "Something went wrong.");
      throw err;
    } finally {
      setBusy(false);
    }
  }

  async function addPlanToCart() {
    const planId = plan.planId;
    setCartResult({ planId, busy: true });
    try {
      // Restore the saved cart first: adding before it loads would write an
      // empty cart over it (see store/cartStore.js).
      await hydrateCart();
      const products = await fetchAllProducts();
      const bySku = new Map(products.map((p) => [String(p.skuId), p]));
      const { addToCart } = useCartStore.getState();
      let packs = 0;
      const missing = [];
      for (const line of plan.report.basket) {
        const product = bySku.get(String(line.skuId));
        if (!product) {
          missing.push(line.name ?? "a product");
          continue;
        }
        for (let i = 0; i < line.packs; i++) addToCart(product);
        packs += line.packs;
      }
      setCartResult({ planId, packs, products: plan.report.basket.length - missing.length, missing });
    } catch (err) {
      setCartResult({ planId, error: err?.message ?? "The basket could not be added to the cart." });
    }
  }

  async function seeWithout(skuId) {
    setWithout((w) => ({ ...w, [skuId]: { busy: true } }));
    try {
      const response = await fetch("/api/plan/without", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId: plan.planId, skuId }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error ?? "The plan could not be re-solved.");
      setWithout((w) => ({ ...w, [skuId]: { result: body } }));
    } catch (err) {
      setWithout((w) => ({ ...w, [skuId]: { error: err?.message ?? "Something went wrong." } }));
    }
  }

  // ── The copilot: the chat that sets the household up, plans, then changes
  // the plan (Phase 4.2–4.3). The conversation is kept in this browser only:
  // KOI stores the plans it produces, never the words.
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [followText, setFollowText] = useState("");
  // "reading" | "planning" | "saving" | null — what the cue line says.
  const [stage, setStage] = useState(null);
  const [conversation, setConversation] = useState([]);
  const [chatLoaded, setChatLoaded] = useState(false);

  const chatKey = `${CHAT_KEY}:${householdId ?? "new"}`;
  const mode = profiles.length === 0 ? "setup" : plan ? "plan" : "ready";

  // Read the kept conversation once the household is known (its id is the key).
  useEffect(() => {
    if (session === undefined) return;
    try {
      const stored = JSON.parse(window.localStorage.getItem(chatKey) ?? "[]");
      if (Array.isArray(stored)) setConversation(stored);
    } catch {
      // A browser that refuses storage, or a half-written entry: start empty.
    }
    setChatLoaded(true);
  }, [chatKey, session]);

  // And keep it, trimmed to what can be shown again: the words, the lines KOI
  // answered with, and the small objects a button still needs.
  useEffect(() => {
    if (!chatLoaded) return;
    try {
      const keepable = conversation.slice(-CHAT_TURNS).map(({ text, kind, at, lines, draft, householdChanges, kept, saved, proposal }) => ({
        text, kind, at, lines, draft, householdChanges, kept, saved,
        // A proposal nobody answered cannot be taken after a reload: the plan
        // it was solved against is no longer on screen.
        proposal: proposal === "open" ? undefined : proposal,
      }));
      window.localStorage.setItem(chatKey, JSON.stringify(keepable));
    } catch {
      // Not being able to keep the chat is not a reason to break the page.
    }
  }, [conversation, chatKey, chatLoaded]);

  const say = (turn) => setConversation((turns) => [...turns, { at: Date.now(), ...turn }]);
  const markTurn = (index, patch) => setConversation((turns) => turns.map((t, i) => (i === index ? { ...t, ...patch } : t)));
  const clearChat = () => {
    setConversation([]);
    try {
      window.localStorage.removeItem(chatKey);
    } catch { /* nothing to clear */ }
  };

  /** One message. What it does depends on what the shopper has (see PlanCopilot). */
  async function send() {
    const text = followText.trim();
    if (!text || stage) return;
    setFollowText("");
    // On screen before KOI starts: a message that vanishes while it thinks
    // reads as a message that was lost.
    say({ kind: mode, text, pending: true, lines: [] });
    if (mode === "plan") return followUp(text);
    if (mode === "setup") return setUpFromChat(text);
    return planFromChat(text);
  }

  /** Fill in the turn the message is already sitting on. */
  const answer = (patch) => setConversation((turns) => turns.map((t, i) => (i === turns.length - 1 ? { ...t, pending: false, ...patch } : t)));

  /**
   * A change is a proposal until the shopper takes it (Phase 4.3): the basket
   * on screen is the one they agreed to. Taking it makes the new plan current;
   * leaving it deletes the plan KOI solved and asks what to do instead.
   */
  async function decide(turnIndex, take) {
    const turn = conversation[turnIndex];
    if (!turn?.proposed) return;
    if (take) {
      setPlan(turn.proposed);
      setWithout({});
      markTurn(turnIndex, { proposal: "taken" });
      return;
    }
    markTurn(turnIndex, { proposal: "dropped" });
    // Nothing keeps a plan nobody chose.
    await getSupabaseClient().from("plan").delete().eq("id", turn.proposed.planId);
  }

  /** No profiles yet: read the message as a household and offer to keep it. */
  async function setUpFromChat(text) {
    setStage("reading");
    try {
      const draft = await draftHousehold(text);
      const people = draft.members.map((m) => `${m.label}: ${labelOf(AGE_BANDS, m.age_band)} · ${labelOf(DIET_TYPES, m.diet_type)}${m.target_protein_g ? ` · ${m.target_protein_g} g protein` : ""}${m.target_kcal ? ` · ${m.target_kcal} kcal` : ""}${(m.avoidKeys ?? []).length ? ` · avoids ${m.avoidKeys.map((k) => labelOf(FOODS_AVOID, k)).join(", ")}` : ""}`);
      answer({
        draft,
        lines: [
          draft.members.length
            ? `Drafted ${draft.members.length} ${draft.members.length === 1 ? "person" : "people"}. Check them, then keep them.`
            : "Nothing was drafted from that.",
          ...people,
          ...draft.notes,
          ...(draft.unresolved.length ? [`Not applied: ${draft.unresolved.join(", ")}.`] : []),
        ],
      });
    } catch (err) {
      answer({ lines: [err?.message ?? "That could not be read."] });
    } finally {
      setStage(null);
    }
  }

  /**
   * Profiles, no plan on screen: read who it is for, the days, the budget and
   * any target written as a number, plan, and then apply anything left that
   * only a plan can answer (a product to add, leave out or swap).
   */
  async function planFromChat(text) {
    setStage("reading");
    try {
      const draft = await draftHousehold(text);
      const asked = readFollowUp(text);
      const daysNow = draft.days ?? asked.days ?? Number(days);
      const budgetNow = draft.budget ?? (asked.budget.change === "set" ? asked.budget.rupees : null) ?? num(budget);
      if (daysNow !== Number(days)) setDays(daysNow);
      if (budgetNow !== num(budget)) setBudget(budgetNow === null ? "" : String(budgetNow));

      // "for me and the wife only": the people the message names, if it names any.
      const named = profilesNamedIn(text, profiles);
      const planFor = named.length ? named.map((p) => p.memberId) : picked;
      if (named.length) setPicked(planFor);

      // "75 g protein for my wife": for this plan, not for her profile.
      const targets = {};
      for (const t of asked.targets) {
        for (const profile of profilesNamed(t.who, profiles).filter((p) => planFor.includes(p.memberId))) {
          targets[profile.memberId] = { ...(targets[profile.memberId] ?? {}), [t.nutrient]: t.perDay };
        }
      }

      setStage("planning");
      const made = await makePlan({ daysNow, budgetNow, memberIds: planFor, targets });
      const people = profiles.filter((p) => planFor.includes(p.memberId));
      const saidTargets = Object.entries(targets).map(([id, t]) => {
        const who = profiles.find((p) => p.memberId === id)?.label ?? "them";
        return `${who}: ${[t.protein && `${t.protein} g protein`, t.kcal && `${t.kcal} kcal`].filter(Boolean).join(", ")} a day, this plan only`;
      });
      answer({
        lines: [
          `Planned ${dayCount(daysNow)}${budgetNow ? ` on ₹${budgetNow.toLocaleString("en-IN")}` : " with no budget"} for ${people.map((p) => p.label).join(", ")}.`,
          ...saidTargets,
          `${made.report.summary.packs} packs · ₹${made.report.cost}`,
          // The household ranked its targets above its budget, so KOI spent
          // what it took. Saying so is the whole point: money was spent that
          // the shopper did not name.
          ...(made.explanation?.budget_raised_for_targets
            ? [`₹${Math.round(made.explanation.budget_raised_for_targets.extra).toLocaleString("en-IN")} over the ₹${Number(made.explanation.budget_raised_for_targets.from).toLocaleString("en-IN")} you said, because you asked KOI to hit the targets first. Say "stay in budget" on your household page to keep the ceiling instead.`]
            : []),
          made.report.unmet.length
            ? `Short: ${made.report.unmet.map((u) => `${u.label} ${u.short} ${u.nutrient}`).join(", ")}`
            : "Every target met.",
        ],
      });
      // Anything about the products themselves needs a plan to change, so it
      // runs now that there is one.
      if (asked.leaveOut.length || asked.include.length || asked.swaps.length) await followUp(text, made.planId);
    } catch (err) {
      answer({ lines: [err?.message ?? "That could not be planned."] });
    } finally {
      setStage(null);
    }
  }

  /** A plan on screen: change it. `planId` is passed when a plan was just made. */
  async function followUp(text, planId = plan?.planId) {
    if (!planId) return;
    setStage("reading");
    try {
      const response = await fetch("/api/plan/followup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId, text }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error ?? "The plan could not be changed.");
      const change = body.basketChange;
      answer({
        householdChanges: body.householdChanges ?? [],
        // Solved, and shown as a proposal: the basket on screen stays the one
        // the shopper agreed to until they take this one.
        ...(body.changed ? { proposal: "open", proposed: body } : {}),
        lines: [
          body.applied?.length ? `Changed: ${body.applied.join(" · ")}` : "Nothing in that could be applied.",
          ...(change?.added ?? []).map((s) => `Adds ${s.packs} × ${s.name}`),
          ...(change?.changed ?? []).map((c) => `${c.name}: ${c.from} → ${c.to} packs`),
          ...(change?.dropped ?? []).map((s) => `No longer ${s.name}`),
          ...(body.changed && change ? [`₹${change.costBefore} → ₹${body.report.cost}${body.report.unmet.length ? ` · short: ${body.report.unmet.map((u) => `${u.label} ${u.short} ${u.nutrient}`).join(", ")}` : " · every target met"}`] : []),
          ...(body.notApplied ?? []),
        ].filter(Boolean),
      });
    } catch (err) {
      answer({ lines: [err?.message ?? "Something went wrong."] });
    } finally {
      setStage(null);
    }
  }

  // Phase 4.4: a follow-up that changes a person changes this plan only. It
  // reaches their saved profile when the shopper says so, as a new version.
  async function saveToHousehold(turnIndex) {
    const turn = conversation[turnIndex];
    if (!turn?.householdChanges?.length) return;
    const mark = (patch) => markTurn(turnIndex, patch);
    mark({ saving: true, saveError: null });
    setStage("saving");
    try {
      const supabase = getSupabaseClient();
      for (const change of turn.householdChanges) {
        const held = profiles.find((p) => p.memberId === change.memberId)?.avoids ?? [];
        const { error: saveError } = await supabase.rpc("save_household_member", {
          p_household_id: householdId,
          p_member: {
            id: change.memberId,
            ...Object.fromEntries(Object.entries(change.targets).map(([k, v]) => [k, v === null ? null : String(Math.round(Number(v)))])),
          },
          p_avoids: change.addAvoidKeys.length
            ? [...held.map((a) => ({ key: a.key, severity: a.severity })), ...change.addAvoidKeys.filter((key) => !held.some((a) => a.key === key)).map((key) => ({ key }))]
            : null,
        });
        if (saveError) throw saveError;
      }
      await load();
      mark({ saving: false, saved: true });
    } catch (err) {
      mark({ saving: false, saveError: err?.message ?? "It could not be saved." });
    } finally {
      setStage(null);
    }
  }

  // ── A household in words becomes profiles, once confirmed ────────────────
  // Shared by the panel below and the copilot: one reading, one save.
  const [brief, setBrief] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [drafted, setDrafted] = useState(null);
  const [savingDraft, setSavingDraft] = useState(false);

  /** Read a description of a household. Nothing is saved. */
  async function draftHousehold(text) {
    const response = await fetch("/api/plan/brief", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body?.error ?? "The description could not be read.");
    return body.draft;
  }

  async function draftFromBrief() {
    setDrafting(true);
    setError(null);
    try {
      const draft = await draftHousehold(brief);
      setDrafted(draft);
      if (draft.days) setDays(draft.days);
      if (draft.budget) setBudget(String(draft.budget));
    } catch (err) {
      setError(err?.message ?? "Something went wrong.");
    } finally {
      setDrafting(false);
    }
  }

  /** Save drafted people as profiles, creating the household if there is none. */
  async function keepProfiles(draft) {
    if (!draft?.members?.length) return;
    const supabase = getSupabaseClient();
    let id = householdId;
    if (!id) {
      const { data, error: createError } = await supabase.from("household").insert({ label: "My household" }).select("id").single();
      if (createError) throw createError;
      id = data.id;
      setHouseholdId(id);
    }
    for (const member of draft.members) {
      const form = {
        ...blankProfile(),
        label: member.label,
        age_band: member.age_band,
        diet_type: member.diet_type,
        target_kcal: member.target_kcal ?? "",
        target_protein_g: member.target_protein_g ?? "",
        avoids: (member.avoidKeys ?? []).map((key) => ({ key, severity: null })),
      };
      const { error: saveError } = await supabase.rpc("save_household_member", {
        p_household_id: id,
        p_member: memberPayload(form),
        p_avoids: avoidsPayload(form),
      });
      if (saveError) throw saveError;
    }
    await load();
  }

  /** The panel's own "keep these" button. */
  async function saveDraftedPeople() {
    setSavingDraft(true);
    setError(null);
    try {
      await keepProfiles(drafted);
      setDrafted(null);
      setBrief("");
    } catch (err) {
      setError(err?.message ?? "They could not be saved.");
    } finally {
      setSavingDraft(false);
    }
  }

  /** The copilot's "keep these profiles", on one of its turns. */
  async function keepDraft(turnIndex) {
    const turn = conversation[turnIndex];
    if (!turn?.draft?.members?.length) return;
    markTurn(turnIndex, { keeping: true });
    setStage("saving");
    try {
      await keepProfiles(turn.draft);
      markTurn(turnIndex, { keeping: false, kept: true });
    } catch (err) {
      markTurn(turnIndex, { keeping: false, saveError: err?.message ?? "They could not be saved." });
    } finally {
      setStage(null);
    }
  }

  if (session === undefined) {
    return <main className="mx-auto max-w-3xl px-5 py-16 text-[#5A6B5A]"><Loader2 className="inline h-4 w-4 animate-spin" /> Loading…</main>;
  }

  if (!session) {
    return (
      <main className="mx-auto max-w-3xl px-5 py-16">
        <h1 className="text-2xl font-bold text-[#0E4032]">Plan the week</h1>
        <p className="mt-2 text-[13px] text-[#5A6B5A]">
          Sign in to plan for a household. Your household and its targets are yours alone — nobody else can read them.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl px-5 py-10 pb-28">
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div>
          <h1 className="text-[26px] font-bold leading-none tracking-tight text-[#0E4032]" style={{ fontFamily: "var(--font-koi-heading)" }}>Plan the week</h1>
          <p className="mt-2 max-w-xl text-[12.5px] leading-relaxed text-[#5A6B5A]">
            Whole packs from KOI&apos;s own screened shelf, for the people you pick — nothing anyone avoids, nothing
            unsafe at their age, and a plain account of whatever it could not manage.
          </p>
        </div>
        <p className="text-[11.5px] text-[#5A6B5A]">
          <Link href="/store/household" className="font-semibold text-[#16A06E] hover:underline">Your household</Link>
          <span> · </span>
          <Link href="/store/profile/data" className="font-semibold text-[#16A06E] hover:underline">What KOI keeps</Link>
          {keepOut.length > 0 && <span className="block">Kept out of the house: {keepOut.map((k) => labelOf(FOODS_AVOID, k)).join(", ")}</span>}
        </p>
      </header>
      {error && <p className="mt-3 text-[12.5px] text-[#B4453C]">{error}</p>}

      {profiles.length === 0 ? (
        <section className="mt-8 rounded-2xl border border-[#083D2D]/10 bg-[#083D2D]/[0.02] p-4">
          <h2 className="text-[15px] font-bold text-[#0E4032]">Who are you shopping for?</h2>
          <p className="mt-1 text-[12px] text-[#5A6B5A]">
            Describe your household and KOI drafts a profile for each person, for you to check and keep. Or{" "}
            <Link href="/store/household" className="font-semibold text-[#16A06E] underline">add them one at a time</Link>.
          </p>
          <textarea id="household-brief" value={brief} onChange={(e) => setBrief(e.target.value)} maxLength={MAX_BRIEF_CHARS} rows={2}
                    placeholder="We're four, two adults and two kids, 120 g protein each for the adults, ₹4,000 for a week"
                    className="mt-2 w-full rounded-xl border border-[#083D2D]/15 bg-white px-3 py-2 text-[13px]" />
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <button type="button" onClick={draftFromBrief} disabled={!brief.trim() || drafting}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-[#0E4032] px-3 py-1.5 text-[12.5px] font-semibold text-[#0E4032] disabled:opacity-40">
              {drafting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              {drafting ? "Reading it…" : "Draft their profiles"}
            </button>
            <span className="text-[11px] text-[#5A6B5A]">Nothing is saved until you keep them.</span>
          </div>
          {drafted && (
            <div className="mt-3 space-y-2 text-[12px] text-[#5A6B5A]">
              {drafted.members.map((m, i) => (
                <p key={`${m.label}-${i}`} className="text-[#0E4032]">
                  <span className="font-semibold">{m.label}</span>: {labelOf(AGE_BANDS, m.age_band)} · {labelOf(DIET_TYPES, m.diet_type)}
                  {m.target_protein_g ? ` · ${m.target_protein_g} g protein` : ""}{m.target_kcal ? ` · ${m.target_kcal} kcal` : ""}
                  {(m.avoidKeys ?? []).length ? ` · avoids ${m.avoidKeys.map((k) => labelOf(FOODS_AVOID, k)).join(", ")}` : ""}
                </p>
              ))}
              {drafted.notes.map((note) => <p key={note}>{note}</p>)}
              {drafted.unresolved.length > 0 && <p>Not applied: {drafted.unresolved.join(", ")}.</p>}
              {drafted.members.length > 0 && (
                <button type="button" onClick={saveDraftedPeople} disabled={savingDraft}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-[#0E4032] px-3 py-1.5 text-[12.5px] font-bold text-white disabled:opacity-40">
                  {savingDraft ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserRoundPlus className="h-3.5 w-3.5" />}
                  {savingDraft ? "Saving…" : `Keep ${drafted.members.length === 1 ? "this profile" : "these profiles"}`}
                </button>
              )}
            </div>
          )}
        </section>
      ) : (
        <div className="mt-8 grid items-start gap-6 lg:grid-cols-[minmax(0,21rem)_minmax(0,1fr)]">
          {/* The brief stays beside the plan, not above it. */}
          <div className="lg:sticky lg:top-6">
            <WeekBrief
              profiles={profiles}
              picked={picked}
              onPicked={setPicked}
              choiceFor={choiceFor}
              setChoice={setChoice}
              openMember={openMember}
              onOpenMember={setOpenMember}
              categories={categories}
              dietTypes={DIET_TYPES}
              labelOf={labelOf}
              profileSummary={profileSummary}
              avoidWords={avoidWords}
              days={days}
              onDays={setDays}
              budget={budget}
              onBudget={setBudget}
              onPlan={() => makePlan().catch(() => {})}
              busy={busy}
              ready={ready}
              chosenCount={chosen.length}
            />
          </div>

          <div>
            {plan ? (
              <PlanResult plan={plan} without={without} onSeeWithout={seeWithout} onAddToCart={addPlanToCart} cartResult={cartResult} />
            ) : (
              <div className="rounded-3xl bg-white/50 p-8 ring-1 ring-inset ring-[#083D2D]/8">
                <p className="text-[10.5px] font-semibold uppercase tracking-[0.09em] text-[#5A6B5A]">Nothing planned yet</p>
                <p className="mt-2 max-w-md text-[13.5px] leading-relaxed text-[#0E4032]">
                  Pick who is eating, say how many days and what you want to spend, and KOI works out the whole packs to
                  buy — then shows you what each person gets and anything it could not manage.
                </p>
                <ul className="mt-4 space-y-1.5 text-[12px] text-[#5A6B5A]">
                  <li>Nothing anyone avoids, and nothing unsafe at their age.</li>
                  <li>Nobody is planned more of one food than a day&apos;s servings.</li>
                  <li>Ask KOI to change it in words once it is on screen.</li>
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      {/* There from the first visit: with no profiles it sets the household up,
          with profiles it plans, and with a plan it changes it. */}
      <PlanCopilot open={copilotOpen} onOpenChange={setCopilotOpen} mode={mode} conversation={conversation}
                   text={followText} onText={setFollowText} onSend={send} stage={stage}
                   examples={plan ? followUpExamples({ basket: plan.report.basket, days: plan.days }) : []}
                   onSaveToHousehold={saveToHousehold} onKeepDraft={keepDraft} onClear={clearChat} onDecide={decide} />
    </main>
  );
}
