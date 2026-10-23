// ============================================================================
// One run of the hourly auto-plan job, with its parts passed in (the route,
// /api/engine/autoplan, passes the real ones; the tests pass fakes).
//
//   runAutoplan   each job whose run has come: plan for that household as its
//                 owner would, keep the plan as a DRAFT starting on the day the
//                 rules say, tell the owner, set the next run. A plan the
//                 planner can't fit is discarded and the owner is told why.
//   runReminders  the Calendar's reminders, planning and shopping days whose
//                 time came in the hour just gone, sent once each.
//
// Every read and write names the household it is for: the database client may
// be the service role (00093), so the scoping is this code's job.
// ============================================================================

import { nextRunAt, startsOnFor, rulesOf } from "./autoplan";
import { datesOf } from "@/lib/calendar/events";

export const RUN_RULES = Object.freeze({
  /** Households a run: the planner takes seconds each; the next hour picks up the rest. */
  perRun: 3,
  /** A reminder with no time of its own goes at 9 am. */
  defaultMinutes: 9 * 60,
});
const IST = 330 * 60000;
const REMIND_KINDS = Object.freeze({ remind: "reminder", plan: "plan_day", shop: "shop_day" });

const dayLabel = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
/** Why a plan couldn't be drafted, in the household's words, never a stack trace. */
export function plainReason(err) {
  const m = String(err?.message ?? err ?? "");
  if (/no members/i.test(m)) return "Your household has nobody in it yet.";
  if (/budget|infeasible|no basket/i.test(m)) return "Nothing fitted the budget and rules you set.";
  return "Something went wrong while planning.";
}

/**
 * @param {object} deps
 * @param {object} deps.db Supabase client
 * @param {Date} deps.now
 * @param {(input) => Promise<object>} deps.planFor planForHousehold
 * @param {(db, input) => Promise<object>} deps.notify dispatch
 * @returns {Promise<Array<{ householdId, planId?, error? }>>}
 */
export async function runAutoplan({ db, now, planFor, notify }) {
  const { data: jobs, error } = await db
    .from("autoplan_job")
    .select("*, household:household_id(id, owner_id)")
    .eq("paused", false)
    .lte("next_run_at", now.toISOString())
    .order("next_run_at")
    .limit(RUN_RULES.perRun);
  if (error) throw error;
  const results = [];
  for (const job of jobs ?? []) {
    const householdId = job.household_id;
    const owner = job.household?.owner_id ?? null;
    const runAt = new Date(job.next_run_at);
    const rules = rulesOf(job);
    const next = nextRunAt(job, now).toISOString();
    const ref = `autoplan:${householdId}:${job.next_run_at}`;
    const stamp = { last_run_at: now.toISOString(), next_run_at: next, updated_at: now.toISOString() };
    try {
      const made = await planFor({ householdId, days: rules.days, budget: rules.budget, memberIds: rules.memberIds, db });
      if (made.status === "infeasible") {
        await db.from("plan").delete().eq("id", made.planId).eq("household_id", householdId);
        throw new Error("infeasible: no basket fits");
      }
      const startsOn = startsOnFor(runAt, rules);
      const { data: row } = await db.from("plan").select("constraints").eq("id", made.planId).eq("household_id", householdId).single();
      const { error: draftError } = await db
        .from("plan")
        .update({ status: "draft", constraints: { ...(row?.constraints ?? {}), starts_on: startsOn, auto: true } })
        .eq("id", made.planId)
        .eq("household_id", householdId);
      if (draftError) throw draftError;
      if (owner) {
        await notify(db, {
          recipientId: owner, householdId, kind: "autoplan_ready", channels: job.channels, ref,
          params: { days: made.days, startsLabel: dayLabel(startsOn), products: (made.report?.basket ?? []).length, cost: made.report?.cost ?? 0, planId: made.planId },
        });
      }
      await db.from("autoplan_job").update({ ...stamp, last_plan_id: made.planId, last_error: null }).eq("household_id", householdId);
      results.push({ householdId, planId: made.planId, startsOn });
    } catch (err) {
      const reason = plainReason(err);
      await db.from("autoplan_job").update({ ...stamp, last_error: reason }).eq("household_id", householdId);
      if (owner) await notify(db, { recipientId: owner, householdId, kind: "autoplan_failed", params: { reason }, channels: job.channels, ref });
      results.push({ householdId, error: reason });
    }
  }
  return results;
}

/**
 * @param {object} deps
 * @param {object} deps.db
 * @param {Date} deps.now
 * @param {(db, input) => Promise<object>} deps.notify
 * @returns {Promise<number>} reminders sent
 */
export async function runReminders({ db, now, notify }) {
  const local = new Date(now.getTime() + IST);
  const today = local.toISOString().slice(0, 10);
  const minutes = local.getUTCHours() * 60 + local.getUTCMinutes();
  const { data: events, error } = await db
    .from("calendar_event")
    .select("id, kind, title, starts_on, ends_on, repeat_days, until, at_time, household:household_id(id, owner_id)")
    .in("kind", Object.keys(REMIND_KINDS))
    .lte("starts_on", today);
  if (error) throw error;
  let sent = 0;
  for (const e of events ?? []) {
    if (!e.household?.owner_id || !datesOf(e, today, today).length) continue;
    const [h, m] = e.at_time ? String(e.at_time).split(":").map(Number) : [Math.floor(RUN_RULES.defaultMinutes / 60), RUN_RULES.defaultMinutes % 60];
    const at = h * 60 + m;
    // The hour just gone: an hourly run sends each once (and ref makes sure).
    if (!(at <= minutes && at > minutes - 60)) continue;
    const r = await notify(db, { recipientId: e.household.owner_id, householdId: e.household.id, kind: REMIND_KINDS[e.kind], params: { title: e.title }, ref: `event:${e.id}:${today}` });
    if (!r?.duplicate) sent += 1;
  }
  return sent;
}
