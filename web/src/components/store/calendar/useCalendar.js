"use client";

// The household's Calendar (00092): read, saved and deleted as the household's
// owner (RLS). Like the meal log (useMealLog), nothing is lost to a database
// that can't be reached: an event that can't be saved is kept in this browser,
// marked pending, shown like any other, and sent the next time the calendar
// loads. Ids are made here, so a held event and its saved row are the same one.

import { useCallback, useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";

export const CALENDAR_KEY = "koi_calendar_v1";
const FIELDS = ["id", "household_id", "member_id", "kind", "title", "starts_on", "ends_on", "at_time", "slot", "repeat_days", "until", "plan_effect", "source"];

const keyOf = (householdId) => `${CALENDAR_KEY}:${householdId}`;
const readLocal = (householdId) => {
  try {
    const list = JSON.parse(window.localStorage.getItem(keyOf(householdId)) ?? "[]");
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
};
const writeLocal = (householdId, list) => {
  try {
    if (list.length) window.localStorage.setItem(keyOf(householdId), JSON.stringify(list));
    else window.localStorage.removeItem(keyOf(householdId));
  } catch { /* private mode: pending events last for this visit */ }
};
const pick = (row) => Object.fromEntries(FIELDS.map((f) => [f, row[f] ?? (f === "plan_effect" ? {} : null)]));
const newId = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `00000000-0000-4000-8000-${String(Date.now()).padStart(12, "0").slice(-12)}`);

/**
 * @param {string|null} householdId
 * @returns {{ rows: Array, loading: boolean, error: string|null, pending: number, save: (event) => Promise<{ok: boolean, pending?: boolean, id?: string}>, remove: (id) => Promise<boolean> }}
 */
export function useCalendar(householdId) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(Boolean(householdId));
  const [error, setError] = useState(null);
  const [pending, setPending] = useState(0);

  const load = useCallback(async () => {
    if (!householdId) return;
    const supabase = getSupabaseClient();
    const held = readLocal(householdId);
    const still = [];
    for (const e of held) {
      const { error: e1 } = e.deleted
        ? await supabase.from("calendar_event").delete().eq("id", e.id)
        : await supabase.from("calendar_event").upsert({ ...pick(e), updated_at: new Date().toISOString() });
      if (e1) still.push(e);
    }
    writeLocal(householdId, still);
    setPending(still.length);
    const { data, error: readError } = await supabase.from("calendar_event").select("*").eq("household_id", householdId).order("starts_on");
    const saved = readError ? [] : data ?? [];
    const gone = new Set(still.filter((e) => e.deleted).map((e) => e.id));
    setRows([...saved.filter((r) => !still.some((e) => e.id === r.id) && !gone.has(r.id)), ...still.filter((e) => !e.deleted)]);
    setError(readError ? "Your calendar could not be loaded. New events are kept on this device until they can be saved." : null);
    setLoading(false);
  }, [householdId]);

  useEffect(() => {
    let live = true;
    (async () => { if (live) await load(); })();
    return () => { live = false; };
  }, [load]);

  /** Add an event, or change one (same id). */
  const save = useCallback(async (event) => {
    if (!householdId) return { ok: false };
    const row = pick({ ...event, id: event.id ?? newId(), household_id: householdId, source: event.source ?? "user" });
    const { error: writeError } = await getSupabaseClient().from("calendar_event").upsert({ ...row, updated_at: new Date().toISOString() });
    if (writeError?.message?.includes("row-level security")) {
      setError("Only the household's owner can change its calendar.");
      return { ok: false };
    }
    if (writeError) {
      const held = [...readLocal(householdId).filter((e) => e.id !== row.id), { ...row, pending: true }];
      writeLocal(householdId, held);
      setPending(held.length);
    }
    setRows((all) => [...all.filter((e) => e.id !== row.id), { ...row, ...(writeError ? { pending: true } : {}) }].sort((a, b) => a.starts_on.localeCompare(b.starts_on)));
    setError(null);
    return { ok: true, pending: Boolean(writeError), id: row.id };
  }, [householdId]);

  /** Delete an event. */
  const remove = useCallback(async (id) => {
    if (!householdId) return false;
    const { error: deleteError } = await getSupabaseClient().from("calendar_event").delete().eq("id", id);
    const held = readLocal(householdId).filter((e) => e.id !== id);
    const wasSaved = rows.some((e) => e.id === id && !e.pending);
    // A saved event that can't be deleted now is deleted the next time the calendar loads.
    writeLocal(householdId, deleteError && wasSaved ? [...held, { id, deleted: true }] : held);
    setPending(held.length + (deleteError && wasSaved ? 1 : 0));
    setRows((all) => all.filter((e) => e.id !== id));
    return true;
  }, [householdId, rows]);

  return { rows, loading, error, pending, save, remove };
}
