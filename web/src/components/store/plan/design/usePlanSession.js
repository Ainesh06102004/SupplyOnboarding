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
import { useAuth } from "@/contexts/AuthContext";
import { fetchAllProducts } from "@/lib/data/productFetcher";
import { isTestSku } from "@/lib/data/testCatalogue";
import { useCartStore, hydrateCart } from "@/store/cartStore";
import { readFollowUp } from "@/lib/planner/followup";
import { withSuggestedTargets } from "@/lib/household/save";
import { profileFromRow, memberPayload, avoidsPayload, blankProfile, profileProblems, profilesNamedIn, profilesNamed } from "@/lib/household/profile";
import { categoriesFrom, enrichBasket, noteLines, peopleOf } from "@/lib/plan/planView";
import { putPlanInCart } from "@/lib/cart/client";
import { readNdjson } from "@/lib/plan/stream";
import { newRun, reduceRun } from "@/lib/plan/runSteps";
import { readFavourites, MAX_FAVOURITES } from "@/lib/plan/favourites";
import { avoidsFromWords } from "@/lib/plan/restrictions";
import { buildWeek, productsFor, alternativesFor } from "@/lib/plan/schedule";
import { sizePortions, labelPer100 } from "@/lib/plan/portions";
import { reconcileWeek } from "@/lib/plan/reconcile";
import { planBatches, COOKING_STYLES, DEFAULT_PREP_DAYS } from "@/lib/plan/batch";
import { parseAmount } from "@/lib/nutrition/basis";
import { hasExactMacros } from "@/lib/household/profile";
import { restoreFrom, chainOf, planFromRow, weekStartOf, MAX_RESTORED_CHANGES } from "@/lib/plan/restore";
import { takeTwo, applyAdjustments, adjustmentFrom } from "@/lib/plan/rebalance";
import { goalsAllowed } from "@/lib/planner/goals";
import { weekFromCalendar } from "@/lib/calendar/events";
import { useMealLog } from "./useMealLog";
import { useCalendar } from "@/components/store/calendar/useCalendar";

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
/** A week's Take 2s, kept in this browser too, until plan_week.adjustments (00091) can hold them. */
const ADJUST_KEY = "koi_week_adjustments_v1";
const readAdjustments = (rootId) => {
  try {
    const list = JSON.parse(window.localStorage.getItem(`${ADJUST_KEY}:${rootId}`) ?? "[]");
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
};
const writeAdjustments = (rootId, list) => {
  try {
    window.localStorage.setItem(`${ADJUST_KEY}:${rootId}`, JSON.stringify(list));
  } catch { /* private mode: Take 2s last for this visit */ }
};
/** The local calendar day, n days from this one. */
const dayFromToday = (n = 0) => {
  const d = new Date(Date.now() + n * 86400000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
/** How far back Track reads meals: enough weeks to see a habit. */
const MEAL_HISTORY_DAYS = 56;
const localIso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
/** The plan's dates, first to last: from the day its week started (a week made now starts today). */
const spanOf = (plan, startedAt) => {
  if (!plan) return null;
  const start = startedAt ? new Date(startedAt) : new Date();
  return { from: localIso(start), to: localIso(new Date(start.getTime() + (Math.max(1, Number(plan.days) || 7) - 1) * 86400000)) };
};
import { MEMBER_COLORS } from "./tokens";

// Every member column, whatever the schema has: exact macros added carbs and fat
// (00044) and the tolerance and carb cycling (00089), and naming a column the
// database does not have yet would fail the whole read.
const MEMBER_FIELDS = "*, household_member_avoid(avoid_key, severity)";
/** Training days for carb cycling when the person has none on the Calendar: four a week. */
const DEFAULT_TRAINING_DAYS = Object.freeze(["Mon", "Tue", "Thu", "Fri"]);
const SAVE_AFTER_MS = 700;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const num = (v) => (v === "" || v === null || v === undefined ? null : Number(v));
const keyOf = (p) => p.memberId ?? p.draftKey;

async function readHousehold() {
  const supabase = getSupabaseClient();
  const { data: auth } = await supabase.auth.getUser();
  const user = auth?.user ?? null;
  if (!user) return { user: null, household: null, profiles: [], last: null };
  const { data: household, error } = await supabase
    .from("household")
    // Every household column (cooking_style and prep_days arrive with 00090; naming them first would fail the read).
    .select(`*, household_member(${MEMBER_FIELDS})`)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return { user, household: null, profiles: [], last: null, error: "Your household could not be loaded." };
  const profiles = [...(household?.household_member ?? [])]
    .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
    .map(profileFromRow);

  // The last plan: its days, budget and people open the form, and its basket
  // is what "your last plan → this plan" compares against. It, and the changes
  // that led to it, reopen on the page (lib/plan/restore.js).
  let last = null;
  let restore = null;
  if (household?.id) {
    // An auto-plan draft (00093) isn't the week until it's approved: it opens from its notification.
    const { data: rows } = await supabase
      .from("plan")
      .select("id, days, budget_rupees, status, created_at, follows:constraints->>follows, change:constraints->change, members:constraints->members, cost:achieved->cost, basket:achieved->basket, starts_on:constraints->>starts_on")
      .eq("household_id", household.id)
      .neq("status", "draft")
      .order("created_at", { ascending: false })
      .limit(MAX_RESTORED_CHANGES + 2);
    const plan = rows?.[0];
    if (plan) {
      last = {
        planId: plan.id,
        days: plan.days,
        budget: plan.budget_rupees === null ? "" : String(plan.budget_rupees),
        memberIds: (plan.members ?? []).map((m) => String(m.id)),
        basket: plan.basket ?? [],
        cost: plan.cost ?? null,
        at: plan.created_at,
      };
      const ids = chainOf(rows).map((r) => r.id);
      const { data: full } = await supabase.from("plan").select("id, report, explanation").in("id", ids);
      restore = restoreFrom(rows, new Map((full ?? []).map((r) => [String(r.id), r])));
      // The week's dish picks, kept with its first plan (00078), and its Take 2s (00091;
      // every column, so the read holds before that migration too).
      if (restore?.weekRootId) {
        const { data: week } = await supabase.from("plan_week").select("*").eq("plan_id", restore.weekRootId).maybeSingle();
        if (week?.picks) restore.picks = week.picks;
        if (Array.isArray(week?.adjustments)) restore.adjustments = week.adjustments;
      }
    }
  }
  return { user, household: household ?? null, profiles, last, restore };
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
  // How the household cooks (00090): fresh each day, or batches on prep days.
  const [cooking, setCookingState] = useState({ style: "fresh", prepDays: DEFAULT_PREP_DAYS });
  const [picks, setPicks] = useState({});
  // The week's first plan: its picks are the week's, saved against it (00078).
  const [weekRootId, setWeekRootId] = useState(null);
  // When that week started (the day its first plan was made), so its days are real dates.
  const [weekStart, setWeekStart] = useState(null);
  // The week's Take 2s (00091): choices made after a meal off the plan.
  const [adjustments, setAdjustments] = useState([]);
  const savedPicks = useRef({ root: null, json: "{}" });
  const savedAdjustments = useRef({ root: null, json: "[]" });
  const timers = useRef({});
  const draftSeq = useRef(1);
  const toastTimer = useRef(null);
  const reopened = useRef(false);

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
    setCookingState({
      style: COOKING_STYLES.some((c) => c.key === read.household?.cooking_style) ? read.household.cooking_style : "fresh",
      prepDays: Array.isArray(read.household?.prep_days) && read.household.prep_days.length ? read.household.prep_days.map(Number) : DEFAULT_PREP_DAYS,
    });
    if (read.household?.id) setPicks(readPicks(read.household.id));
    setProfiles(read.profiles);
    setLast(read.last);
    setActiveKey((key) => (key && read.profiles.some((p) => p.memberId === key) ? key : read.profiles.find((p) => p.is_account_holder)?.memberId ?? read.profiles[0]?.memberId ?? null));
    const kept = (read.last?.memberIds ?? []).filter((id) => read.profiles.some((p) => p.memberId === id));
    setPicked(kept.length ? kept : read.profiles.map((p) => p.memberId));
    if (read.last?.days) setDays(read.last.days);
    if (read.last?.budget !== undefined && read.last?.budget !== null) setBudget(read.last.budget);
    // The plan on screen comes back once, when the page opens; later reloads of
    // the household (after saving someone) leave the plan being worked on alone.
    if (!reopened.current) {
      reopened.current = true;
      if (read.restore) {
        setPlan(read.restore.plan);
        setRequests(read.restore.requests);
        setCompareTo(read.restore.compareTo);
        setWeekRootId(read.restore.weekRootId);
        setWeekStart(read.restore.weekStart ? { root: read.restore.weekRootId, at: read.restore.weekStart } : null);
        // Saved Take 2s win; before 00091 they live in this browser.
        const kept = read.restore.adjustments ?? readAdjustments(read.restore.weekRootId);
        setAdjustments(kept);
        savedAdjustments.current = { root: read.restore.weekRootId, json: JSON.stringify(read.restore.adjustments ?? []) };
        // Saved picks win over this browser's copy; a week saved nowhere keeps it.
        if (read.restore.picks) {
          setPicks(read.restore.picks);
          savedPicks.current = { root: read.restore.weekRootId, json: JSON.stringify(read.restore.picks) };
        }
      }
    }
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

  // Signing in (or out) on this page reloads the household. It used to read
  // the session once, when the page opened, so a shopper who signed in from
  // the Plan's own sign-in card stayed looking at it.
  const { user: authUser, loading: authLoading } = useAuth();
  const authUid = authLoading ? undefined : authUser?.uid ?? null;
  const seenUid = useRef(undefined);
  useEffect(() => {
    if (authUid === undefined) return undefined;
    if (seenUid.current === undefined) {
      seenUid.current = authUid;
      return undefined;
    }
    if (seenUid.current === authUid) return undefined;
    seenUid.current = authUid;
    const t = setTimeout(() => { load(); }, 0);
    return () => clearTimeout(t);
  }, [authUid, load]);

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
    setWeekRootId(made.planId);
    setRequests([]);
    // A new plan is a new week: yesterday's dish picks and Take 2s don't carry over.
    setPicks({});
    setAdjustments([]);
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
  // The page as it was before the latest agent run, and the plans the run made,
  // so the whole run can be taken back at once (`undoRun`).
  const [lastRun, setLastRun] = useState(null);

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
    const snapshot = { plan, compareTo, requests, picks, days, weekRootId, created: [] };
    setLastRun(null);
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
        setWeekRootId(message.payload.planId);
        setRequests([]);
        if (first) { setPicks({}); writePicks(householdId, {}); setAdjustments([]); }
        setDays(message.payload.days ?? days);
        latest = message.payload;
        snapshot.created.push(message.payload.planId);
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
        snapshot.created.push(body.planId);
      } else if (message.type === "without_result") {
        setWithout((w) => ({ ...w, [message.skuId]: { result: message.payload } }));
      } else if (message.type === "action") {
        actions.push(message);
      }
      first = false;
    });
    // Even a run that stopped part-way can be taken back: what it made is on screen.
    const created = snapshot.created.filter((id) => UUID.test(String(id)));
    if (created.length) setLastRun({ ...snapshot, created, endPlanId: latest?.planId ?? null, carted: actions.some((a) => a.action === "cart") });
    if (current.error) throw new Error(current.error);
    for (const a of actions) {
      if (a.action === "cart") setPendingCart(true);
      else if (a.action === "show") setNav(a.args?.step ?? "plan");
      else if (a.action === "explain") setRun((r) => ({ ...r, explain: latest ? noteLines(latest) : [{ text: "There's no plan yet to explain." }] }));
    }
    return latest;
  }, [picked, plan, compareTo, requests, picks, weekRootId, householdId, days, budget, choiceFor, last, showPlan]);

  // Only while the plan on screen is still the one the run ended with: once
  // anything else changes it, single-change undo is the way back.
  const canUndoRun = Boolean(lastRun && plan?.planId === lastRun.endPlanId && !(run && !run.done));

  /** Take the latest agent run back as a whole: the page as it was before it, and every plan it made deleted. */
  const undoRun = useCallback(async () => {
    if (!canUndoRun) return;
    const r = lastRun;
    setLastRun(null);
    showPlan(r.plan, r.compareTo);
    setWeekRootId(r.weekRootId);
    setRequests(r.requests);
    setPicks(r.picks);
    writePicks(householdId, r.picks);
    setDays(r.days);
    setRun((cur) => (cur ? { ...cur, undone: true, explain: null } : cur));
    if (r.carted) notify("Taken back. What was put in your cart is still there.", "warn");
    const { error: deleteError } = await getSupabaseClient().from("plan").delete().in("id", r.created);
    if (deleteError) console.error("[plan] undo run", deleteError.message);
  }, [canUndoRun, lastRun, householdId, showPlan, notify]);

  // ── KOI Agent Mode (components/agent): the dock drives this page ──────────
  // The dock runs on every store page; here it hands each plan it makes or
  // changes to the page, which takes it exactly as it takes its own: the
  // board, the request chips with their undo, and "Undo all of this".
  const agentRunRef = useRef(null);
  const latestRef = useRef({});
  latestRef.current = { plan, compareTo, requests, picks, days, weekRootId, last, householdId, profiles, canUndoRun, undoRun, week: null, eating: [], pickDishes: null, swapCells: null, clearPicks: null };
  const agentBridge = useMemo(() => {
    const bridge = {
      get planId() { return latestRef.current.plan?.planId ?? null; },
      get canUndoRun() { return latestRef.current.canUndoRun; },
      beginRun() {
        const b = latestRef.current;
        agentRunRef.current = { plan: b.plan, compareTo: b.compareTo, requests: b.requests, picks: b.picks, days: b.days, weekRootId: b.weekRootId, created: [], latest: b.plan, first: true, carted: false };
        setLastRun(null);
      },
      toolResult(event) {
        if (!agentRunRef.current) bridge.beginRun();
        const r = agentRunRef.current;
        const data = event.data;
        if (event.tool === "add_to_cart" && event.ok) r.carted = true;
        if (!data || !event.ok) return;
        if (data.kind === "plan") {
          const b = latestRef.current;
          const prior = r.latest ?? b.plan;
          const before = prior
            ? { basket: prior.report?.basket ?? [], cost: prior.report?.cost ?? null, label: "Your last plan" }
            : b.last ? { basket: b.last.basket, cost: b.last.cost, label: "Your last plan" } : null;
          showPlan(data.payload, before);
          setWeekRootId(data.payload.planId);
          setRequests([]);
          if (r.first) { setPicks({}); writePicks(b.householdId, {}); setAdjustments([]); }
          setDays(data.payload.days ?? b.days);
          r.latest = data.payload;
          r.created.push(data.payload.planId);
          r.first = false;
        } else if (data.kind === "change" && data.payload?.changed) {
          const body = data.payload;
          const basePlan = r.latest ?? latestRef.current.plan;
          showPlan(body);
          setRequests((all) => [...all, {
            id: body.planId, text: data.text ?? "", applied: body.applied ?? [], notApplied: body.notApplied ?? [],
            basketChange: body.basketChange ?? null, costAfter: body.report?.cost ?? null,
            householdChanges: body.householdChanges ?? [], kind: "words", before: basePlan, undone: false,
          }]);
          r.latest = body;
          r.created.push(body.planId);
        } else if (data.kind === "without") {
          setWithout((w) => ({ ...w, [data.skuId]: { result: data.payload } }));
        }
      },
      endRun() {
        const r = agentRunRef.current;
        agentRunRef.current = null;
        const created = (r?.created ?? []).filter((id) => UUID.test(String(id)));
        if (created.length) setLastRun({ ...r, created, endPlanId: r.latest?.planId ?? null });
      },
      reload: () => load(),
      /** Save what the shopper was typing before KOI reads the household. */
      async flushAutosaves() {
        const pending = Object.keys(timers.current);
        for (const key of pending) {
          clearTimeout(timers.current[key]);
          delete timers.current[key];
          const person = latestRef.current.profiles.find((p) => keyOf(p) === key);
          if (person) await saveNow(key, person);
        }
      },
      explainLines() {
        const p = latestRef.current.plan;
        return p ? noteLines(p) : null;
      },
      undoRun: () => latestRef.current.undoRun(),
      /** The week's dishes, by day and meal, in KOI's own dish names: what the agent may read. */
      weekSummary() {
        const w = latestRef.current.week;
        if (!w) return null;
        const labelOf = (id) => latestRef.current.profiles.find((p) => String(p.memberId) === String(id))?.label ?? "someone";
        return w.days.map((d) => ({
          day: d.label,
          date: d.date,
          slots: Object.fromEntries(w.slots.map((s) => {
            const cell = w.cells[`${d.index}:${s}`];
            const shared = cell?.shared?.dishes?.map((x) => x.name).join(" + ") ?? "";
            const own = Object.entries(cell?.own ?? {}).map(([id, o]) => `${labelOf(id)}: ${o.dishes.map((x) => x.name).join(" + ")}`);
            return [s, [shared, ...own.map((o) => `(${o})`)].filter(Boolean).join(" ") || "nothing planned"];
          })),
        }));
      },
      /** Change the week's dishes as the agent asked, with the page's own actions. */
      menu({ action, slot = null, day = null, otherDay = null, person = null } = {}) {
        const b = latestRef.current;
        if (!b.plan || !b.week || !b.pickDishes) return { notReady: true };
        const w = b.week;
        const SHORT = { sun: "sun", mon: "mon", tue: "tue", wed: "wed", thu: "thu", fri: "fri", sat: "sat" };
        const dayIndex = (d) => {
          if (!d) return null;
          if (d === "today") return 0;
          if (d === "tomorrow") return w.days.length > 1 ? 1 : -1;
          return w.days.find((x) => String(x.label).toLowerCase().startsWith(SHORT[d] ?? d))?.index ?? -1;
        };
        const dayName = (i) => w.days[i]?.label ?? `day ${i + 1}`;
        if (action === "reset") {
          b.clearPicks();
          return { changed: 1, text: "The week's dishes are back to KOI's own picks." };
        }
        const slots = slot ? [slot] : w.slots;
        if (action === "swap_days") {
          const a = dayIndex(day);
          const c = dayIndex(otherDay);
          if (a < 0 || c < 0 || a === null || c === null) return { changed: 0, text: "Those days aren't in this plan's week." };
          for (const s of slots) b.swapCells(`${a}:${s}`, `${c}:${s}`);
          return { changed: slots.length, cells: slots.flatMap((s) => [`${a}:${s}`, `${c}:${s}`]), text: `Swapped ${dayName(a)} and ${dayName(c)}${slot ? ` (${slot})` : ""}.` };
        }
        // Reshuffle: each dish for another of its kind that everyone at that meal can have, none repeated.
        const who = person ? b.profiles.find((p) => p.label?.toLowerCase() === String(person).toLowerCase()) : null;
        const di = dayIndex(day);
        if (di === -1) return { changed: 0, text: "That day isn't in this plan's week." };
        const cells = Object.values(w.cells).filter((c) => slots.includes(c.slot) && (di === null || c.day === di) && c.shared && (!who || c.shared.eaters.includes(String(who.memberId))));
        const used = new Set();
        const changed = [];
        let stuck = 0;
        for (const cell of cells.sort((x, y) => x.day - y.day)) {
          const alts = alternativesFor(cell, b.eating);
          const next = cell.shared.dishes.map((d) => alts.find((a) => a.kind === d.kind && a.key !== d.key && !used.has(a.key)) ?? null);
          if (next.every((n) => !n)) { stuck += 1; continue; }
          const keys = cell.shared.dishes.map((d, i) => next[i]?.key ?? d.key);
          keys.forEach((k) => used.add(k));
          b.pickDishes(cell.key, keys);
          changed.push({ key: cell.key, day: dayName(cell.day), to: cell.shared.dishes.map((d, i) => next[i]?.name ?? d.name).join(" + ") });
        }
        const what = slot ? ({ breakfast: "breakfasts", lunch: "lunches", snack: "snacks", dinner: "dinners", drinks: "drinks" }[slot]) : "meals";
        if (!changed.length) return { changed: 0, text: `KOI found no other ${what} that everyone eating them can have from this basket.` };
        const shared = who ? ` Meals are shared, so this is for everyone eating with ${who.label}.` : "";
        return {
          changed: changed.length,
          cells: changed.map((c) => c.key),
          text: `Reshuffled ${changed.length} ${what}: ${changed.slice(0, 4).map((c) => `${c.day} ${c.to}`).join(" · ")}${changed.length > 4 ? " …" : ""}.${stuck ? ` ${stuck} had nothing else everyone there can have.` : ""}${shared}`,
        };
      },
    };
    return bridge;
  }, [showPlan, load, saveNow]);

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

  /** Fill in what a drafted person is missing (an age group, a diet) before keeping them. */
  const editBrief = useCallback((index, patch) => {
    setBrief((b) => (b ? { ...b, members: b.members.map((m, i) => (i === index ? { ...m, ...patch } : m)) } : b));
  }, []);

  /** Keep the people a description drafted, creating the household if there is none. */
  const keepBrief = useCallback(async () => {
    if (!brief?.members?.length) return;
    const forms = brief.members.map((member) => withSuggestedTargets({
      ...blankProfile(),
      label: member.label,
      age_band: member.age_band,
      diet_type: member.diet_type,
      target_kcal: member.target_kcal ?? "",
      target_protein_g: member.target_protein_g ?? "",
      target_source: member.target_kcal || member.target_protein_g ? "stated" : "suggested",
      avoids: (member.avoidKeys ?? []).map((key) => ({ key, severity: null })),
    }));
    // The same test as a hand-made profile. A draft with no age group used to be
    // kept anyway, and the database filled the blank with "Adult": every "kid"
    // a description mentioned was planned for as an adult.
    const unfinished = forms.map((f) => ({ label: f.label, problems: profileProblems(f) })).filter((f) => f.problems.length);
    if (unfinished.length) {
      setError(`Before keeping them: ${unfinished.map((f) => `${f.label || "someone"}: ${f.problems[0].replace(/\.$/, "").toLowerCase()}`).join("; ")}.`);
      return;
    }
    const supabase = getSupabaseClient();
    try {
      let id = householdId;
      if (!id) {
        const { data, error: createError } = await supabase.from("household").insert({ label: "My household" }).select("id").single();
        if (createError) throw createError;
        id = data.id;
        setHouseholdId(id);
      }
      for (const form of forms) {
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
    const perMember = new Map((plan?.report?.perMember ?? []).map((m) => [String(m.id), m]));
    // A diet chosen for this plan alone (a Navratri fast) shapes this week's dishes, not the profile.
    return profiles
      .filter((p) => p.memberId && perMember.has(String(p.memberId)))
      .map((p) => {
        const diet = perMember.get(String(p.memberId))?.diet;
        return diet && diet !== p.diet_type ? { ...p, diet_type: diet } : p;
      });
  }, [plan?.report?.perMember, profiles]);
  // Exact macros: whoever plans to their own numbers needs protein-dense plates
  // (the menu leans that way for them alone) and plates sized in grams.
  const macroNeeds = useMemo(() => Object.fromEntries(eating.filter(hasExactMacros).map((p) => [
    String(p.memberId), { proteinPer100kcal: (Number(p.target_protein_g) / Number(p.target_kcal)) * 100 },
  ])), [eating]);
  // The week, then its batches (lib/plan/batch.js): a batching household gets the
  // same meal boxed across the days after each prep day, and the week is built
  // again with those meals in place. The shopper's own picks win over a batch.
  // The week starts the day its first plan was made, so "Tuesday lunch" is a real
  // Tuesday: picks saved one day mean the same meal the next, and Track can log
  // a meal against its day. A week made in this visit starts today.
  const startedAt = weekStart?.root && weekStart.root === weekRootId ? weekStart.at : null;
  // The Calendar (00092), read for this week's dates: who is out or away for a
  // meal, training days, and the days the household batch-cooks.
  const calendar = useCalendar(householdId);
  const weekSpan = useMemo(() => spanOf(plan, startedAt), [plan, startedAt]);
  const fromCalendar = useMemo(() => (weekSpan ? weekFromCalendar(calendar.rows, weekSpan) : null), [calendar.rows, weekSpan]);
  const { week, batches } = useMemo(() => {
    if (!plan) return { week: null, batches: planBatches({ week: null }) };
    const input = {
      report: plan.report, lines, people: eating, days: plan.days, repeat, atHome: plan.explanation?.products_at_home ?? [], macroNeeds,
      away: fromCalendar?.away ?? {}, ...(startedAt ? { start: new Date(startedAt) } : {}),
    };
    const first = buildWeek({ ...input, overrides: picks });
    const batching = planBatches({ week: first, style: cooking.style, prepDays: fromCalendar?.prepDays ?? cooking.prepDays, picks });
    if (!batching.batches.length) return { week: first, batches: batching };
    return { week: buildWeek({ ...input, overrides: { ...batching.overrides, ...picks } }), batches: batching };
  }, [plan, lines, eating, picks, repeat, macroNeeds, cooking, startedAt, fromCalendar]);
  /** Each person's meals out this week, by cell ("2:lunch"): a typical meal out, until they log what it was. */
  const outsByMember = useMemo(() => {
    if (!week || !fromCalendar) return {};
    const index = new Map(week.days.map((d) => [d.date, d.index]));
    const out = {};
    for (const [id, meals] of Object.entries(fromCalendar.outs)) {
      for (const [at, meal] of Object.entries(meals)) {
        const [date, slot] = at.split(":");
        if (index.has(date)) (out[id] ??= {})[`${index.get(date)}:${slot}`] = meal;
      }
    }
    return out;
  }, [week, fromCalendar]);

  // Track (00091): the account holder's own meals, as an adult, for this week and
  // the weeks before it (enough to notice a habit).
  const me = useMemo(() => profiles.find((p) => p.is_account_holder && p.memberId) ?? null, [profiles]);
  const meTracks = Boolean(me && goalsAllowed(me.age_band));
  const firstDay = week?.days?.[0]?.date ?? null;
  const lastDay = week?.days?.at(-1)?.date ?? null;
  const mealSpan = useMemo(() => {
    const from = [dayFromToday(-MEAL_HISTORY_DAYS), firstDay].filter(Boolean).sort()[0];
    const to = [dayFromToday(0), lastDay].filter(Boolean).sort().at(-1);
    return { from, to };
  }, [firstDay, lastDay]);
  const mealLog = useMealLog(meTracks ? String(me.memberId) : null, mealSpan);
  const logsByDate = useMemo(() => {
    const by = {};
    for (const r of mealLog.rows) (by[r.eaten_on] ??= []).push(r);
    return by;
  }, [mealLog.rows]);

  /** How the household cooks: kept on the household (00090), so the next plan batches the same way. */
  const setCooking = useCallback(async (patch) => {
    const next = { ...cooking, ...patch };
    setCookingState(next);
    if (!householdId) return;
    const { error: saveError } = await getSupabaseClient().from("household").update({ cooking_style: next.style, prep_days: next.prepDays }).eq("id", householdId);
    if (saveError) notify("Your cooking style is set for this plan. It couldn't be saved for next time yet.", "warn");
  }, [cooking, householdId, notify]);

  /**
   * Each exact-macros person's week in grams (lib/plan/portions.js), and what it
   * uses of the basket. The account holder's week is as their Take 2s leave it
   * (lib/plan/rebalance.js); what it buys is still the week as planned.
   */
  const { portions, sizingOf } = useMemo(() => {
    if (!week) return { portions: {}, sizingOf: {} };
    const labels = new Map(lines.map((l) => [String(l.skuId), labelPer100(l.product)]).filter(([, v]) => v));
    const shares = new Map((plan?.report?.whoEatsWhat ?? []).map((w) => [String(w.member), w.allowed ?? []]));
    const basket = lines.map((l) => ({ skuId: String(l.skuId), name: l.name, packAmount: parseAmount(l.weight)?.value ?? null }));
    // Training days: the person's own from the Calendar, else four a week until they add them.
    const usual = new Set(week.days.filter((d) => DEFAULT_TRAINING_DAYS.includes(d.label)).map((d) => d.index));
    const out = {};
    const sizing = {};
    for (const p of eating.filter(hasExactMacros)) {
      const id = String(p.memberId);
      const trained = fromCalendar?.training?.[id];
      const trainingDays = !p.carb_cycling ? null : trained?.size ? new Set(week.days.filter((d) => trained.has(d.date)).map((d) => d.index)) : usual;
      // A meal out on the Calendar holds a typical meal out, and the rest of the day is sized around it.
      const outs = outsByMember[id] ?? {};
      sizing[id] = { labels, basket, trainingDays, fixed: Object.fromEntries(Object.entries(outs).map(([cell, o]) => [cell, { name: "Out", nutrition: o.nutrition }])) };
      const base = sizePortions({ week, person: p, ...sizing[id], ties: batches.ties(id) });
      const sized = meTracks && id === String(me.memberId) && adjustments.length
        ? applyAdjustments({ week, person: p, base, adjustments, logsByDate, sizing: sizing[id], outs }).sized
        : base;
      out[id] = { ...sized, reconcile: reconcileWeek({ week, portions: base, share: shares.get(id) ?? [], basket }) };
    }
    return { portions: out, sizingOf: sizing };
  }, [week, batches, lines, eating, plan?.report?.whoEatsWhat, meTracks, me, adjustments, logsByDate, fromCalendar, outsByMember]);

  // ── Take 2: the week's answer to a meal that wasn't the plan ──────────────
  /** The account holder as this week plans them (a diet chosen for the week included). */
  const meEating = useMemo(() => (me ? eating.find((p) => String(p.memberId) === String(me.memberId)) ?? me : null), [me, eating]);
  /** What the account holder's Take 2s do: swapped plates, plate scales, what moved to next week, the freezer. */
  const myTake2 = useMemo(() => (meTracks && meEating ? applyAdjustments({ week, person: meEating, base: null, adjustments }) : null), [meTracks, meEating, week, adjustments]);

  /** KOI's options after this meal (lib/plan/rebalance.js): figures from the engines, nothing applied. */
  const takeTwoFor = useCallback((entry) => {
    if (!meTracks || !meEating) return null;
    const id = String(meEating.memberId);
    return takeTwo({
      week, batches: batches.batches, person: meEating, sized: portions[id] ?? null, entry, logsByDate,
      swaps: myTake2?.swaps ?? [], shift: myTake2?.shift ?? {}, sizing: sizingOf[id] ?? {}, outs: outsByMember[id] ?? {},
    });
  }, [meTracks, meEating, week, batches, portions, logsByDate, myTake2, sizingOf, outsByMember]);

  /** Keep the options the person picked: a dish moved is a pick, the rest is the week's adjustment. */
  const applyTakeTwo = useCallback(({ entry, numbers = null, meal = null }) => {
    const changes = (numbers && numbers.id !== "leave") || (meal && meal.id !== "drop");
    if (!changes) return null;
    const moved = meal?.effect?.picks ?? {};
    // A dish moved into a day would make the scheduler choose every later meal
    // again, and the dish it displaced could come straight back. So the week's
    // other meals from that day on are kept as they are (not batch boxes, which
    // batch.js owns), and undo lets them go again.
    const from = week?.days?.find((d) => d.date === entry.eaten_on)?.index ?? 0;
    const kept = {};
    if (Object.keys(moved).length && week) {
      for (const cell of Object.values(week.cells)) {
        if (cell.day < from || picks[cell.key] || moved[cell.key] || cell.shared?.batch || !cell.shared?.dishes?.length) continue;
        kept[cell.key] = { dishes: cell.shared.dishes.map((d) => d.key), kept: true };
      }
    }
    const patch = { ...kept, ...moved };
    const adjustment = adjustmentFrom({ entry, numbers, meal, picksBefore: Object.fromEntries(Object.keys(patch).map((k) => [k, picks[k] ?? null])) });
    adjustment.effect.picks = patch;
    if (Object.keys(patch).length) {
      setPicks((all) => {
        const next = { ...all, ...patch };
        if (householdId) writePicks(householdId, next);
        return next;
      });
    }
    setAdjustments((all) => [...all, adjustment]);
    return adjustment;
  }, [picks, householdId, week]);

  // ── Auto-plan drafts (00093) ──────────────────────────────────────────────
  /** Open a draft KOI made on schedule, beside this week's plan, for the owner to approve or discard. */
  const reviewDraft = useCallback(async (planId) => {
    const { data: row, error: readError } = await getSupabaseClient()
      .from("plan")
      .select("id, days, budget_rupees, status, created_at, report, explanation, starts_on:constraints->>starts_on")
      .eq("id", planId)
      .maybeSingle();
    if (readError || !row) { notify("That draft isn't there any more.", "warn"); return false; }
    if (row.status !== "draft") { notify("That plan is already approved: it's on screen.", "info"); return false; }
    setCompareTo(plan?.report ? { basket: plan.report.basket ?? [], cost: plan.report.cost ?? null, label: "This week's plan" } : null);
    setPlan({ ...planFromRow(row, row), draft: true, startsOn: row.starts_on ?? null });
    setWeekRootId(row.id);
    setWeekStart({ root: row.id, at: weekStartOf(row) });
    setRequests([]);
    setPicks({});
    setAdjustments([]);
    return true;
  }, [plan, notify]);

  /** The draft becomes the household's plan; the cart only if they asked. */
  const approveDraft = useCallback(async ({ toCart = false } = {}) => {
    if (!plan?.draft) return false;
    const { error: approveError } = await getSupabaseClient().from("plan").update({ status: "solved" }).eq("id", plan.planId);
    if (approveError) { notify("It couldn't be approved just now. Try again in a moment.", "error"); return false; }
    setPlan((p) => ({ ...p, draft: false, status: "solved" }));
    notify(toCart ? "Approved. Putting it in your cart." : "Approved: it's your plan from its first day.", "info");
    if (toCart) setPendingCart(true);
    return true;
  }, [plan, notify]);

  /** Not this one: delete the draft and go back to this week's plan. */
  const discardDraft = useCallback(async () => {
    if (!plan?.draft) return;
    const { error: deleteError } = await getSupabaseClient().from("plan").delete().eq("id", plan.planId);
    if (deleteError) { notify("It couldn't be discarded just now.", "error"); return; }
    reopened.current = false;
    const read = await load();
    // No plan before it: the page goes back to having none.
    if (!read?.restore) { setPlan(null); setWeekRootId(null); setWeekStart(null); }
    notify(read?.restore ? "Discarded. This week's plan is back." : "Discarded.", "info");
  }, [plan, notify, load]);

  /** Take a Take 2 back: its picks return to what they were, unless changed since. */
  const undoAdjustment = useCallback((id) => {
    const a = adjustments.find((x) => x.id === id && !x.undone);
    if (!a) return;
    setAdjustments((all) => all.map((x) => (x.id === id ? { ...x, undone: true } : x)));
    const moved = a.effect?.picks ?? {};
    if (Object.keys(moved).length) {
      setPicks((all) => {
        const next = { ...all };
        for (const [cell, set] of Object.entries(moved)) {
          if (JSON.stringify(next[cell]) !== JSON.stringify(set)) continue;
          if (a.picksBefore?.[cell]) next[cell] = a.picksBefore[cell];
          else delete next[cell];
        }
        if (householdId) writePicks(householdId, next);
        return next;
      });
    }
  }, [adjustments, householdId]);

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
  // The agent's bridge reaches the week of dishes through the same ref (defined above, filled here).
  Object.assign(latestRef.current, { week, eating, pickDishes, swapCells, clearPicks });

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

  // What was ticked "have it" last time comes back with the cart's plan record,
  // so the Pantry opens as the shopper left it.
  const seededHave = useRef(false);
  useEffect(() => {
    if (seededHave.current || !plan) return undefined;
    seededHave.current = true;
    let alive = true;
    hydrateCart().then(() => {
      const atHome = useCartStore.getState().plan?.atHome;
      if (alive && atHome?.length) setHave(new Set(atHome.map(String)));
    });
    return () => { alive = false; };
  }, [plan]);

  /**
   * "Put this week in my cart": the one bridge (lib/cart/client.js). It
   * REPLACES the plan's share of the one cart — pressing it again, from the
   * Pantry, the Cart step or the agent, never doubles a pack — and keeps the
   * shopper's own items and extra packs.
   */
  const addToCart = useCallback(async () => {
    if (!plan) return null;
    const planId = plan.planId;
    setCartResult({ planId, busy: true });
    try {
      const members = peopleOf(plan.report ?? {}, plan.days ?? 7).length || null;
      // What the week's dishes need that the cart doesn't bring, by name, for the
      // cart's "Export ingredient list" (names only: amounts depend on the recipe).
      const fresh = [...new Set([...(week?.alsoNeed?.fresh ?? []), ...(menuNeeds?.notStocked ?? [])].map((i) => i.ingredient).filter(Boolean))];
      const kitchen = [...new Set((week?.alsoNeed?.kitchen ?? []).map((i) => i.ingredient).filter(Boolean))];
      const result = await putPlanInCart({ planId, basket: plan.report?.basket ?? [], atHome: have, members, products, fresh, kitchen });
      setCartResult({ planId, packs: result.packs, products: result.products, missing: result.missing });
      notify(`This week's plan is in your cart: ${result.products} ${result.products === 1 ? "product" : "products"}, ${result.packs} ${result.packs === 1 ? "pack" : "packs"}.`);
      return result;
    } catch (err) {
      setCartResult({ planId, error: err?.message ?? "The plan could not be put in the cart." });
      return null;
    }
  }, [plan, have, products, notify, week, menuNeeds]);

  // "Put it in my cart" from the agent, once the plan it means is the one on screen.
  useEffect(() => {
    if (pendingCart && plan && lines.length) {
      setPendingCart(false);
      addToCart();
    }
  }, [pendingCart, plan, lines.length, addToCart]);

  // The week's picks, saved against its first plan (00078) a moment after they
  // settle. A week with nothing picked writes nothing.
  useEffect(() => {
    if (!weekRootId) return undefined;
    const json = JSON.stringify(picks);
    const saved = savedPicks.current.root === weekRootId ? savedPicks.current.json : "{}";
    if (json === saved) return undefined;
    const timer = setTimeout(async () => {
      const { error: saveError } = await getSupabaseClient()
        .from("plan_week")
        .upsert({ plan_id: weekRootId, picks, updated_at: new Date().toISOString() });
      if (!saveError) savedPicks.current = { root: weekRootId, json };
    }, 600);
    return () => clearTimeout(timer);
  }, [picks, weekRootId]);

  // The week's Take 2s, saved beside its picks (00091). This browser keeps a copy
  // too, which is all there is until that migration runs.
  useEffect(() => {
    if (!weekRootId) return undefined;
    const json = JSON.stringify(adjustments);
    const saved = savedAdjustments.current.root === weekRootId ? savedAdjustments.current.json : "[]";
    if (json === saved) return undefined;
    writeAdjustments(weekRootId, adjustments);
    const timer = setTimeout(async () => {
      const { error: saveError } = await getSupabaseClient()
        .from("plan_week")
        .upsert({ plan_id: weekRootId, adjustments, updated_at: new Date().toISOString() });
      if (!saveError) savedAdjustments.current = { root: weekRootId, json };
    }, 600);
    return () => clearTimeout(timer);
  }, [adjustments, weekRootId]);

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
    mode, plan, lines, compareTo, run, requests, brief, setBrief, command, makePlan, followUp, undo, undoRun, canUndoRun, keepBrief, editBrief, saveHouseholdChanges,
    edges, without, seeWithout,
    // the week of dishes
    week, eating, picks, pickDishes, swapCells, clearPicks, buyForMenu, menuNeeds, portions,
    batches: batches.batches, cooking, setCooking,
    // Track: the account holder's meals and the week's Take 2s
    me: meEating, meTracks, mealLog, logsByDate, adjustments, myTake2, takeTwoFor, applyTakeTwo, undoAdjustment,
    // the Calendar
    calendar, fromCalendar, weekSpan, outsByMember, myOuts: outsByMember[String(meEating?.memberId)] ?? {},
    // auto-plan drafts
    reviewDraft, approveDraft, discardDraft,
    // the agent's page actions
    nav, setNav, agentBridge,
    // pantry / cart
    have, toggleHave, qty, setPacks, packsFor, keepInPantry, addToCart, cartResult,
    toast, notify,
  };
}
