"use client";

// ============================================================================
// Everything the Plan page does, in one place: the household and its people,
// saving a profile, planning through the live stream, changing a plan (and
// taking a change back), "can't get this?", and the cart.
//
// Moved here from the old /store/plan page (Phase 3–4), with three changes the
// founder's design asks for:
//   * a plan runs through /api/plan/run, so the page can show KOI working;
//   * a change applies at once and can be undone (it was a proposal to take);
//   * profiles are edited on the page itself, saved as they change.
//
// Nothing here computes a nutrition figure. Every number on the page is the
// planner's (report), a label's, or goals.js's cited suggestion.
// ============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { fetchAllProducts } from "@/lib/data/productFetcher";
import { isTestSku } from "@/lib/data/testCatalogue";
import { useCartStore, hydrateCart } from "@/store/cartStore";
import { readFollowUp } from "@/lib/planner/followup";
import { suggestTargets } from "@/lib/planner/goals";
import { profileFromRow, memberPayload, avoidsPayload, blankProfile, profileProblems, profilesNamedIn, profilesNamed } from "@/lib/household/profile";
import { categoriesFrom, enrichBasket, noteLines } from "@/lib/plan/planView";
import { readNdjson } from "@/lib/plan/stream";
import { newRun, reduceRun } from "@/lib/plan/runSteps";
import { readFavourites, MAX_FAVOURITES } from "@/lib/plan/favourites";
import { avoidsFromWords } from "@/lib/plan/restrictions";
import { buildWeek, productsFor } from "@/lib/plan/schedule";

/** The shopper's own dish picks, kept in this browser, per household. */
const WEEK_KEY = "koi_plan_week_v1";
const readPicks = (householdId) => {
  try {
    return JSON.parse(window.localStorage.getItem(`${WEEK_KEY}:${householdId}`) ?? "{}") ?? {};
  } catch {
    return {};
  }
};
const writePicks = (householdId, picks) => {
  try {
    window.localStorage.setItem(`${WEEK_KEY}:${householdId}`, JSON.stringify(picks));
  } catch { /* private mode: picks last for this visit */ }
};
import { MEMBER_COLORS } from "./tokens";

const MEMBER_FIELDS = "id, label, relation, age_band, sex, activity_level, diet_type, energy_goal, eating_pattern, age_years, weight_kg, height_cm, target_weight_kg, appetite, spice_tolerance, meals_from_home, favourite_categories, target_kcal, target_protein_g, target_source, account_profile_id, version, created_at, household_member_avoid(avoid_key, severity)";
const SAVE_AFTER_MS = 700;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const num = (v) => (v === "" || v === null || v === undefined ? null : Number(v));
const keyOf = (p) => p.memberId ?? p.draftKey;

/** Targets that follow KOI's suggestion unless the shopper stated their own. */
function withSuggestedTargets(form) {
  if (form.target_source === "stated" && (form.target_kcal !== "" || form.target_protein_g !== "")) return form;
  const s = suggestTargets({
    ageBand: form.age_band,
    sex: form.sex || null,
    activity: form.activity_level || null,
    ageYears: num(form.age_years),
    weightKg: num(form.weight_kg),
    heightCm: num(form.height_cm),
    energyGoal: form.energy_goal || "maintain",
    eatingPattern: form.eating_pattern || "balanced",
  });
  // No suggestion to follow: the source must still be one the column allows.
  if (!s) return form.target_source === "stated" ? form : { ...form, target_source: "stated" };
  return { ...form, target_kcal: String(s.kcal), target_protein_g: String(s.protein), target_source: s.source };
}

async function readHousehold() {
  const supabase = getSupabaseClient();
  const { data: auth } = await supabase.auth.getUser();
  const user = auth?.user ?? null;
  if (!user) return { user: null, household: null, profiles: [], last: null };
  const { data: household, error } = await supabase
    .from("household")
    .select(`id, keep_out, repeat_tolerance, household_member(${MEMBER_FIELDS})`)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return { user, household: null, profiles: [], last: null, error: "Your household could not be loaded." };
  const profiles = [...(household?.household_member ?? [])]
    .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
    .map(profileFromRow);

  // The last plan: its days, budget and people open the form, and its basket
  // is what "your last plan → this plan" compares against.
  let last = null;
  if (household?.id) {
    const { data: plan } = await supabase
      .from("plan")
      .select("id, days, budget_rupees, constraints, achieved, created_at")
      .eq("household_id", household.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (plan) {
      last = {
        planId: plan.id,
        days: plan.days,
        budget: plan.budget_rupees === null ? "" : String(plan.budget_rupees),
        memberIds: (plan.constraints?.members ?? []).map((m) => String(m.id)),
        basket: plan.achieved?.basket ?? [],
        cost: plan.achieved?.cost ?? null,
        at: plan.created_at,
      };
    }
  }
  return { user, household: household ?? null, profiles, last };
}

export function usePlanSession() {
  const [session, setSession] = useState(undefined);
  const [householdId, setHouseholdId] = useState(null);
  const [profiles, setProfiles] = useState([]);
  const [activeKey, setActiveKey] = useState(null);
  const [error, setError] = useState(null);
  const [products, setProducts] = useState([]);
  const [last, setLast] = useState(null);
  // This week.
  const [picked, setPicked] = useState([]);
  const [thisWeek, setThisWeek] = useState({});
  const [days, setDays] = useState(7);
  const [budget, setBudget] = useState("");
  // The plan on screen, the one before it (for the pantry), and the live run.
  const [plan, setPlan] = useState(null);
  const [compareTo, setCompareTo] = useState(null);
  const [run, setRun] = useState(null);
  const [requests, setRequests] = useState([]);
  const [brief, setBrief] = useState(null);
  const [without, setWithout] = useState({});
  const [edges, setEdges] = useState([]);
  const [saveState, setSaveState] = useState({});
  const [toast, setToast] = useState(null);
  const [have, setHave] = useState(() => new Set());
  const [qty, setQty] = useState({});
  const [cartResult, setCartResult] = useState(null);
  const [repeat, setRepeat] = useState("usual");
  const [picks, setPicks] = useState({});
  const timers = useRef({});
  const draftSeq = useRef(1);
  const toastTimer = useRef(null);

  const notify = useCallback((text, tone = "info") => {
    setToast({ text, tone, at: Date.now() });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 4200);
  }, []);
  useEffect(() => () => {
    clearTimeout(toastTimer.current);
    Object.values(timers.current).forEach(clearTimeout);
  }, []);

  const load = useCallback(async () => {
    const read = await readHousehold();
    setSession(read.user);
    if (read.error) setError(read.error);
    setHouseholdId(read.household?.id ?? null);
    setRepeat(read.household?.repeat_tolerance ?? "usual");
    if (read.household?.id) setPicks(readPicks(read.household.id));
    setProfiles(read.profiles);
    setLast(read.last);
    setActiveKey((key) => (key && read.profiles.some((p) => p.memberId === key) ? key : read.profiles.find((p) => p.is_account_holder)?.memberId ?? read.profiles[0]?.memberId ?? null));
    const kept = (read.last?.memberIds ?? []).filter((id) => read.profiles.some((p) => p.memberId === id));
    setPicked(kept.length ? kept : read.profiles.map((p) => p.memberId));
    if (read.last?.days) setDays(read.last.days);
    if (read.last?.budget !== undefined && read.last?.budget !== null) setBudget(read.last.budget);
    return read;
  }, []);

  useEffect(() => {
    let live = true;
    (async () => {
      await load();
      const all = await fetchAllProducts().catch(() => []);
      if (live) setProducts(all);
    })();
    return () => { live = false; };
  }, [load]);

  const categories = useMemo(() => categoriesFrom(products), [products]);
  const stockedKeys = useMemo(() => categories.map((c) => c.key), [categories]);
  const active = profiles.find((p) => keyOf(p) === activeKey) ?? profiles[0] ?? null;
  const saved = profiles.filter((p) => p.memberId);
  const mode = saved.length === 0 ? "setup" : plan ? "plan" : "ready";
  // One order and one colour per person everywhere on the page: the household's.
  const orderOf = useCallback((memberId) => {
    const i = profiles.findIndex((p) => String(p.memberId) === String(memberId));
    return i < 0 ? profiles.length : i;
  }, [profiles]);
  const colourFor = useCallback((memberId) => MEMBER_COLORS[orderOf(memberId) % MEMBER_COLORS.length], [orderOf]);

  // ── People ────────────────────────────────────────────────────────────────
  const saveNow = useCallback(async (key, form) => {
    const problems = profileProblems(form);
    if (problems.length) {
      setSaveState((s) => ({ ...s, [key]: { state: "incomplete", problems } }));
      return;
    }
    setSaveState((s) => ({ ...s, [key]: { state: "saving" } }));
    const supabase = getSupabaseClient();
    try {
      let id = householdId;
      if (!id) {
        const { data, error: createError } = await supabase.from("household").insert({ label: "My household" }).select("id").single();
        if (createError) throw createError;
        id = data.id;
        setHouseholdId(id);
      }
      const { data, error: saveError } = await supabase.rpc("save_household_member", {
        p_household_id: id,
        p_member: memberPayload(form),
        p_avoids: avoidsPayload(form),
      });
      if (saveError) throw saveError;
      const memberId = data?.id ?? form.memberId;
      setProfiles((all) => all.map((p) => (keyOf(p) === key ? { ...p, memberId, draftKey: undefined, version: data?.version ?? p.version } : p)));
      if (!form.memberId && memberId) {
        setActiveKey((k) => (k === key ? memberId : k));
        setPicked((ids) => [...new Set([...ids, memberId])]);
      }
      setSaveState((s) => ({ ...s, [key]: undefined, [memberId]: { state: "saved", at: Date.now() } }));
    } catch (err) {
      setSaveState((s) => ({ ...s, [key]: { state: "error", message: err?.message ?? "It could not be saved." } }));
    }
  }, [householdId]);

  /** Change a person, and save it a moment later (after the last keystroke). */
  const editProfile = useCallback((key, patch) => {
    setProfiles((all) => all.map((p) => {
      if (keyOf(p) !== key) return p;
      const next = withSuggestedTargets({ ...p, ...patch });
      clearTimeout(timers.current[key]);
      timers.current[key] = setTimeout(() => saveNow(key, next), SAVE_AFTER_MS);
      return next;
    }));
  }, [saveNow]);

  /** Go back to KOI's suggestion for someone whose targets were stated. */
  const resetToSuggestion = useCallback((key) => editProfile(key, { target_source: "suggested", target_kcal: "", target_protein_g: "" }), [editProfile]);

  /** "Add member…": a draft, saved as soon as it is a whole profile. */
  const addMember = useCallback((label) => {
    const name = String(label ?? "").trim().slice(0, 40);
    if (!name) return;
    const draftKey = `draft-${draftSeq.current++}`;
    const form = withSuggestedTargets({ ...blankProfile(), draftKey, label: name, age_band: "adult_19_59", diet_type: "vegetarian" });
    setProfiles((all) => [...all, form]);
    setActiveKey(draftKey);
    saveNow(draftKey, form);
  }, [saveNow]);

  const addFavourites = useCallback((text, key = activeKey) => {
    const person = profiles.find((p) => keyOf(p) === key);
    if (!person) return null;
    const read = readFavourites(text, stockedKeys);
    const next = [...new Set([...(person.favourite_categories ?? []), ...read.matched.map((m) => m.key)])].slice(0, MAX_FAVOURITES);
    if (next.length !== (person.favourite_categories ?? []).length) editProfile(key, { favourite_categories: next });
    // What KOI does not stock is how it learns what to stock (engine.demand_queue).
    const missed = [...read.notStocked.map((m) => m.word), ...read.unknown];
    if (missed.length) {
      fetch("/api/demand", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ terms: missed.slice(0, 4).map((term) => ({ term, kind: "not_stocked" })) }),
      }).catch(() => {});
      notify(`KOI doesn't stock ${missed.join(", ")} yet — noted, so it can.`, "warn");
    }
    return read;
  }, [activeKey, profiles, stockedKeys, editProfile, notify]);

  const removeFavourite = useCallback((categoryKey, key = activeKey) => {
    const person = profiles.find((p) => keyOf(p) === key);
    if (!person) return;
    editProfile(key, { favourite_categories: (person.favourite_categories ?? []).filter((k) => k !== categoryKey) });
  }, [activeKey, profiles, editProfile]);

  const addAvoidWords = useCallback((text, key = activeKey) => {
    const person = profiles.find((p) => keyOf(p) === key);
    if (!person) return null;
    const read = avoidsFromWords(text);
    const held = person.avoids ?? [];
    const added = read.avoids.filter((a) => !held.some((h) => h.key === a.key));
    if (added.length) editProfile(key, { avoids: [...held, ...added.map(({ key: k, severity }) => ({ key: k, severity }))] });
    if (read.unknown.length) {
      fetch("/api/demand", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ terms: read.unknown.slice(0, 4).map((term) => ({ term, kind: "cannot_filter" })) }),
      }).catch(() => {});
      notify(`KOI can't check ${read.unknown.join(", ")} on a label yet, so it can't keep it out. Noted.`, "warn");
    }
    return read;
  }, [activeKey, profiles, editProfile, notify]);

  const removeAvoid = useCallback((avoidKey, key = activeKey) => {
    const person = profiles.find((p) => keyOf(p) === key);
    if (!person) return;
    editProfile(key, { avoids: (person.avoids ?? []).filter((a) => a.key !== avoidKey) });
  }, [activeKey, profiles, editProfile]);

  // ── The plan ──────────────────────────────────────────────────────────────
  const stream = useCallback(async (body, kind, lead = []) => {
    let current = { ...newRun(kind), lines: lead };
    setRun(current);
    const response = await fetch("/api/plan/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    await readNdjson(response, (message) => {
      current = reduceRun(current, message);
      setRun(current);
    });
    if (current.error) throw new Error(current.error);
    if (!current.result) throw new Error("The plan did not finish. Try again.");
    return current.result;
  }, []);

  const showPlan = useCallback((next, before) => {
    setPlan(next);
    setWithout({});
    setCartResult(null);
    setHave(new Set());
    setQty({});
    if (before !== undefined) setCompareTo(before);
  }, []);

  const choiceFor = useCallback((memberId) => thisWeek[memberId] ?? { dietType: null, prefer: [], skip: [] }, [thisWeek]);

  const makePlan = useCallback(async ({ daysNow = Number(days), budgetNow = num(budget), memberIds = picked, targets = {}, lead = [] } = {}) => {
    setError(null);
    const ids = memberIds.filter((id) => UUID.test(String(id)));
    if (!householdId || !ids.length) throw new Error("Add someone to the household first.");
    const before = plan
      ? { basket: plan.report?.basket ?? [], cost: plan.report?.cost ?? null, label: "Your last plan" }
      : last ? { basket: last.basket, cost: last.cost, label: "Your last plan" } : null;
    const made = await stream({
      action: "plan",
      householdId,
      days: daysNow,
      budget: budgetNow,
      memberIds: ids,
      thisWeek: Object.fromEntries(ids.map((id) => [id, { ...choiceFor(id), ...(targets[id] ? { targets: targets[id] } : {}) }])),
    }, "plan", lead);
    showPlan(made, before);
    setRequests([]);
    // A new plan is a new week: yesterday's dish picks don't carry over.
    setPicks({});
    writePicks(householdId, {});
    return made;
  }, [days, budget, picked, householdId, plan, last, stream, choiceFor, showPlan]);

  /** A change to the plan on screen. Applied at once; `undo` takes it back. */
  const followUp = useCallback(async (text, { reading = null, planId = plan?.planId, basePlan = plan } = {}) => {
    if (!planId) return null;
    const body = await stream({ action: "followup", planId, text, ...(reading ? { reading } : {}) }, "followup");
    if (!body.changed) {
      notify(body.notApplied?.length ? body.notApplied.join(" · ") : "Nothing in that could be applied.", "warn");
      return body;
    }
    showPlan(body);
    setRequests((all) => [...all, {
      id: body.planId,
      text,
      applied: body.applied ?? [],
      notApplied: body.notApplied ?? [],
      basketChange: body.basketChange ?? null,
      costAfter: body.report?.cost ?? null,
      householdChanges: body.householdChanges ?? [],
      kind: reading ? "upgrade" : "words",
      before: basePlan,
      undone: false,
    }]);
    return body;
  }, [plan, stream, showPlan, notify]);

  /** Take the latest change back: the plan before it returns, and the undone plan is deleted. */
  const undo = useCallback(async (requestId) => {
    const open = requests.filter((r) => !r.undone);
    const latest = open.at(-1);
    if (!latest || latest.id !== requestId || !latest.before) return;
    showPlan(latest.before);
    setRequests((all) => all.map((r) => (r.id === requestId ? { ...r, undone: true } : r)));
    // Nothing keeps a plan nobody chose (RLS plan_self).
    await getSupabaseClient().from("plan").delete().eq("id", requestId);
  }, [requests, showPlan]);

  // What the agent asked the page to do once its run is over (Phase 3).
  const [pendingCart, setPendingCart] = useState(false);
  const [nav, setNav] = useState(null);

  /**
   * KOI's agent (/api/plan/agent): the message read for what it means, done
   * as steps by KOI's own tools, streamed. Each plan it makes or changes lands
   * on the board as it arrives; the page's own tools (cart, show, explain) run
   * when the run is over, on the plan it ended with.
   */
  const agent = useCallback(async (text) => {
    const ids = picked.filter((id) => UUID.test(String(id)));
    let current = { ...newRun("agent"), lines: [] };
    setRun(current);
    let latest = plan;
    let first = true;
    const actions = [];
    const response = await fetch("/api/plan/agent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        planId: plan?.planId ?? null,
        householdId,
        days: Number(days),
        budget: num(budget),
        memberIds: ids,
        thisWeek: Object.fromEntries(ids.map((id) => [id, choiceFor(id)])),
      }),
    });
    await readNdjson(response, (message) => {
      current = reduceRun(current, message);
      setRun(current);
      if (message.type === "plan_result" && message.kind === "plan") {
        const before = latest
          ? { basket: latest.report?.basket ?? [], cost: latest.report?.cost ?? null, label: "Your last plan" }
          : last ? { basket: last.basket, cost: last.cost, label: "Your last plan" } : null;
        showPlan(message.payload, before);
        setRequests([]);
        if (first) { setPicks({}); writePicks(householdId, {}); }
        setDays(message.payload.days ?? days);
        latest = message.payload;
      } else if (message.type === "plan_result" && message.kind === "change" && message.payload.changed) {
        const body = message.payload;
        const basePlan = latest;
        showPlan(body);
        setRequests((all) => [...all, {
          id: body.planId, text: message.text, applied: body.applied ?? [], notApplied: body.notApplied ?? [],
          basketChange: body.basketChange ?? null, costAfter: body.report?.cost ?? null,
          householdChanges: body.householdChanges ?? [], kind: "words", before: basePlan, undone: false,
        }]);
        latest = body;
      } else if (message.type === "without_result") {
        setWithout((w) => ({ ...w, [message.skuId]: { result: message.payload } }));
      } else if (message.type === "action") {
        actions.push(message);
      }
      first = false;
    });
    if (current.error) throw new Error(current.error);
    for (const a of actions) {
      if (a.action === "cart") setPendingCart(true);
      else if (a.action === "show") setNav(a.args?.step ?? "plan");
      else if (a.action === "explain") setRun((r) => ({ ...r, explain: latest ? noteLines(latest) : [{ text: "There's no plan yet to explain." }] }));
    }
    return latest;
  }, [picked, plan, householdId, days, budget, choiceFor, last, showPlan]);

  /** The command bar: set up, plan, or change the plan, by what there is. */
  const command = useCallback(async (raw) => {
    const text = String(raw ?? "").trim();
    if (!text || (run && !run.done)) return;
    setError(null);
    try {
      if (mode === "setup") {
        setRun({ ...newRun("brief"), lines: [{ id: "brief", title: "Reading who's eating", detail: null, state: "running" }] });
        const response = await fetch("/api/plan/brief", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
        const read = await response.json();
        if (!response.ok) throw new Error(read?.error ?? "That could not be read.");
        setBrief(read.draft);
        setRun((r) => ({ ...r, done: true, lines: [{ id: "brief", title: "Drafted your household", detail: `${read.draft.members.length} ${read.draft.members.length === 1 ? "person" : "people"} — check them, then keep them`, state: "done" }] }));
        if (read.draft.days) setDays(read.draft.days);
        if (read.draft.budget) setBudget(String(read.draft.budget));
        return;
      }
      await agent(text);
    } catch (err) {
      setError(err?.message ?? "Something went wrong.");
      setRun((r) => (r ? { ...r, done: true, error: err?.message ?? "Something went wrong." } : r));
    }
  }, [mode, run, agent]);

  /** Keep the people a description drafted, creating the household if there is none. */
  const keepBrief = useCallback(async () => {
    if (!brief?.members?.length) return;
    const supabase = getSupabaseClient();
    try {
      let id = householdId;
      if (!id) {
        const { data, error: createError } = await supabase.from("household").insert({ label: "My household" }).select("id").single();
        if (createError) throw createError;
        id = data.id;
        setHouseholdId(id);
      }
      for (const member of brief.members) {
        const form = withSuggestedTargets({
          ...blankProfile(),
          label: member.label,
          age_band: member.age_band,
          diet_type: member.diet_type,
          target_kcal: member.target_kcal ?? "",
          target_protein_g: member.target_protein_g ?? "",
          target_source: member.target_kcal || member.target_protein_g ? "stated" : "suggested",
          avoids: (member.avoidKeys ?? []).map((key) => ({ key, severity: null })),
        });
        const { error: saveError } = await supabase.rpc("save_household_member", { p_household_id: id, p_member: memberPayload(form), p_avoids: avoidsPayload(form) });
        if (saveError) throw saveError;
      }
      setBrief(null);
      await load();
      notify("Kept. Your household is set up — plan the week when you're ready.");
    } catch (err) {
      setError(err?.message ?? "They could not be kept.");
    }
  }, [brief, householdId, load, notify]);

  /** A follow-up that changed a person changes this plan only, until the shopper saves it. */
  const saveHouseholdChanges = useCallback(async (requestId) => {
    const request = requests.find((r) => r.id === requestId);
    if (!request?.householdChanges?.length) return;
    const supabase = getSupabaseClient();
    try {
      for (const change of request.householdChanges) {
        const held = saved.find((p) => p.memberId === change.memberId)?.avoids ?? [];
        const { error: saveError } = await supabase.rpc("save_household_member", {
          p_household_id: householdId,
          p_member: { id: change.memberId, ...Object.fromEntries(Object.entries(change.targets).map(([k, v]) => [k, v === null ? null : String(Math.round(Number(v)))])), ...(Object.keys(change.targets).length ? { target_source: "stated" } : {}) },
          p_avoids: change.addAvoidKeys.length
            ? [...held.map((a) => ({ key: a.key, severity: a.severity })), ...change.addAvoidKeys.filter((key) => !held.some((a) => a.key === key)).map((key) => ({ key }))]
            : null,
        });
        if (saveError) throw saveError;
      }
      setRequests((all) => all.map((r) => (r.id === requestId ? { ...r, savedToHousehold: true } : r)));
      await load();
      notify("Saved to your household.");
    } catch (err) {
      notify(err?.message ?? "It could not be saved.", "error");
    }
  }, [requests, saved, householdId, load, notify]);

  // Swaps: the substitution edges out of what the basket holds (food.substitution_edge).
  useEffect(() => {
    const ids = (plan?.report?.basket ?? []).map((l) => String(l.skuId)).filter((id) => !isTestSku(id));
    if (!ids.length) {
      setEdges([]);
      return undefined;
    }
    let live = true;
    getSupabaseClient().schema("food").from("substitution_edge")
      .select("from_sku, to_sku, reason, comparability, basis")
      .in("from_sku", ids)
      .then(({ data }) => { if (live) setEdges(data ?? []); });
    return () => { live = false; };
  }, [plan?.planId, plan?.report?.basket]);

  const seeWithout = useCallback(async (skuId) => {
    if (!plan?.planId) return;
    setWithout((w) => ({ ...w, [skuId]: { busy: true } }));
    try {
      const response = await fetch("/api/plan/without", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ planId: plan.planId, skuId }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error ?? "The plan could not be re-solved.");
      setWithout((w) => ({ ...w, [skuId]: { result: body } }));
    } catch (err) {
      setWithout((w) => ({ ...w, [skuId]: { error: err?.message ?? "Something went wrong." } }));
    }
  }, [plan?.planId]);

  const lines = useMemo(() => enrichBasket(plan?.report?.basket ?? [], products), [plan?.report?.basket, products]);

  // The week of dishes over the basket (lib/plan/schedule.js): the people in
  // this plan, their own picks on top.
  const eating = useMemo(() => {
    const ids = new Set((plan?.report?.perMember ?? []).map((m) => String(m.id)));
    return profiles.filter((p) => p.memberId && ids.has(String(p.memberId)));
  }, [plan?.report?.perMember, profiles]);
  const week = useMemo(() => (plan ? buildWeek({ report: plan.report, lines, people: eating, days: plan.days, overrides: picks, repeat }) : null), [plan, lines, eating, picks, repeat]);

  /** Put these dishes in this cell (a swap from the menu). */
  const pickDishes = useCallback((cellKey, dishKeys) => setPicks((all) => {
    const next = { ...all, [cellKey]: { dishes: dishKeys } };
    if (householdId) writePicks(householdId, next);
    return next;
  }), [householdId]);

  /** Swap two cells' meals (drag and drop). */
  const swapCells = useCallback((a, b) => {
    if (!week || a === b) return;
    const dishesOf = (key) => week.cells[key]?.shared?.dishes?.map((x) => x.key) ?? null;
    const da = dishesOf(a);
    const db = dishesOf(b);
    if (!da || !db) return;
    setPicks((all) => {
      const next = { ...all, [a]: { dishes: db }, [b]: { dishes: da } };
      if (householdId) writePicks(householdId, next);
      return next;
    });
  }, [week, householdId]);

  /**
   * The menu drives the basket (slice 2b): add the products KOI stocks for
   * what the week's dishes need and the basket lacks, by SKU id, and re-solve.
   * The planner decides how many packs; the dish picks stay.
   */
  const buyForMenu = useCallback(async (needs) => {
    const found = productsFor(needs, products);
    const ids = found.filter((f) => f.product).map((f) => f.product.skuId);
    const none = found.filter((f) => !f.product).map((f) => f.need.ingredient);
    if (!ids.length) {
      notify(`KOI doesn't stock ${none.join(", ")} yet.`, "warn");
      return null;
    }
    const names = found.filter((f) => f.product).map((f) => f.need.ingredient.toLowerCase());
    const body = await followUp(`Add what my menu needs: ${names.join(", ")}`.slice(0, 200), { reading: { includeSkus: ids } });
    if (none.length) notify(`KOI doesn't stock ${none.join(", ")} yet — buy it fresh.`, "warn");
    return body;
  }, [products, followUp, notify]);

  /** What the menu needs from a shelf, split by whether KOI stocks it. */
  const menuNeeds = useMemo(() => {
    const found = productsFor(week?.alsoNeed?.shop ?? [], products);
    return {
      stocked: found.filter((f) => f.product).map((f) => ({ ...f.need, product: f.product })),
      notStocked: found.filter((f) => !f.product).map((f) => f.need),
    };
  }, [week, products]);

  const clearPicks = useCallback(() => {
    setPicks({});
    if (householdId) writePicks(householdId, {});
  }, [householdId]);

  /** Packs of a line going to the cart: the plan's, unless the shopper changed it here. */
  const packsFor = useCallback((line) => (have.has(String(line.skuId)) ? 0 : qty[String(line.skuId)] ?? line.packs), [have, qty]);

  const toggleHave = useCallback((skuId) => setHave((set) => {
    const next = new Set(set);
    const id = String(skuId);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  }), []);

  const setPacks = useCallback((skuId, packs) => setQty((q) => ({ ...q, [String(skuId)]: Math.max(0, Math.min(20, Math.round(packs))) })), []);

  /** "Keep in my pantry": the kitchen's standing stock, so later plans don't buy it (00052). */
  const keepInPantry = useCallback(async (skuId) => {
    if (!householdId || !UUID.test(String(skuId))) return;
    const { error: pantryError } = await getSupabaseClient().from("household_pantry").insert({ household_id: householdId, sku_id: skuId });
    notify(pantryError ? "It could not be kept." : "Kept in your pantry — later plans won't buy it.", pantryError ? "error" : "info");
  }, [householdId, notify]);

  const addToCart = useCallback(async () => {
    if (!plan) return;
    const planId = plan.planId;
    setCartResult({ planId, busy: true });
    try {
      // Restore the saved cart first: adding before it loads would write an empty cart over it.
      await hydrateCart();
      const all = products.length ? products : await fetchAllProducts();
      const bySku = new Map(all.map((p) => [String(p.skuId), p]));
      const { addToCart: add } = useCartStore.getState();
      let packs = 0;
      let count = 0;
      const missing = [];
      for (const line of lines) {
        const n = packsFor(line);
        if (!n) continue;
        const product = bySku.get(String(line.skuId));
        if (!product) {
          missing.push(line.name ?? "a product");
          continue;
        }
        for (let i = 0; i < n; i++) add(product);
        packs += n;
        count += 1;
      }
      setCartResult({ planId, packs, products: count, missing });
      notify(`Added ${packs} ${packs === 1 ? "pack" : "packs"} to your cart.`);
    } catch (err) {
      setCartResult({ planId, error: err?.message ?? "The basket could not be added to the cart." });
    }
  }, [plan, products, lines, packsFor, notify]);

  // "Put it in my cart" from the agent, once the plan it means is the one on screen.
  useEffect(() => {
    if (pendingCart && plan && lines.length) {
      setPendingCart(false);
      addToCart();
    }
  }, [pendingCart, plan, lines.length, addToCart]);

  const setChoice = useCallback((memberId, patch) => setThisWeek((all) => ({ ...all, [memberId]: { ...(all[memberId] ?? { dietType: null, prefer: [], skip: [] }), ...patch } })), []);

  return {
    // who
    session, householdId, profiles, saved, active, activeKey, setActiveKey, keyOf, saveState, error, setError, orderOf, colourFor,
    editProfile, resetToSuggestion, addMember, addFavourites, removeFavourite, addAvoidWords, removeAvoid,
    // catalogue
    products, categories, stockedKeys,
    // this week
    picked, setPicked, thisWeek, setChoice, choiceFor, days, setDays, budget, setBudget,
    // plan
    mode, plan, lines, compareTo, run, requests, brief, setBrief, command, makePlan, followUp, undo, keepBrief, saveHouseholdChanges,
    edges, without, seeWithout,
    // the week of dishes
    week, eating, picks, pickDishes, swapCells, clearPicks, buyForMenu, menuNeeds,
    // the agent's page actions
    nav, setNav,
    // pantry / cart
    have, toggleHave, qty, setPacks, packsFor, keepInPantry, addToCart, cartResult,
    toast, notify,
  };
}
