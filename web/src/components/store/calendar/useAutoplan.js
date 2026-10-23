"use client";

// The household's auto-plan job (00093), read and set as its owner (RLS). The
// next run is worked out here when the job is saved (lib/plan/autoplan.js);
// after that the hourly job keeps it. Unlike meals and calendar events, a job
// is not held on the device when it can't be saved: only the server runs it,
// so a job saved nowhere would be a promise KOI can't keep.

import { useCallback, useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { nextRunAt } from "@/lib/plan/autoplan";

/**
 * @param {string|null} householdId
 * @returns {{ job: object|null, loading: boolean, error: string|null, save: (patch) => Promise<boolean>, remove: () => Promise<boolean> }}
 */
export function useAutoplan(householdId) {
  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(Boolean(householdId));
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!householdId) return;
    const { data, error: readError } = await getSupabaseClient().from("autoplan_job").select("*").eq("household_id", householdId).maybeSingle();
    setJob(readError ? null : data ?? null);
    setError(readError ? "Auto-plan can't be reached right now." : null);
    setLoading(false);
  }, [householdId]);

  useEffect(() => {
    let live = true;
    (async () => { if (live) await load(); })();
    return () => { live = false; };
  }, [load]);

  /** Turn it on, or change it. */
  const save = useCallback(async (patch) => {
    if (!householdId) return false;
    const next = { ...(job ?? {}), ...patch, household_id: householdId };
    const row = {
      household_id: householdId,
      weekday: next.weekday,
      local_time: next.local_time,
      rules: next.rules ?? {},
      channels: next.channels?.length ? next.channels : ["in_app"],
      paused: Boolean(next.paused),
      next_run_at: next.paused ? job?.next_run_at ?? null : nextRunAt(next).toISOString(),
      updated_at: new Date().toISOString(),
    };
    const { error: writeError } = await getSupabaseClient().from("autoplan_job").upsert(row);
    if (writeError) { setError("Auto-plan couldn't be saved just now. Try again in a moment."); return false; }
    setJob({ ...(job ?? {}), ...row });
    setError(null);
    return true;
  }, [householdId, job]);

  /** Turn it off. */
  const remove = useCallback(async () => {
    if (!householdId) return false;
    const { error: deleteError } = await getSupabaseClient().from("autoplan_job").delete().eq("household_id", householdId);
    if (deleteError) { setError("Auto-plan couldn't be turned off just now."); return false; }
    setJob(null);
    return true;
  }, [householdId]);

  return { job, loading, error, save, remove };
}
