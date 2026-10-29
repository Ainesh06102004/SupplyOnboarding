"use client";

// The signed-in person's meals (00091): read for a span of days, and one entry
// a meal written. RLS decides whose rows these can be (only the member who is
// this account, and only an adult), as for the weigh-ins (useCheckins).
//
// A meal is never lost to a bad connection or a database that can't be reached:
// an entry that can't be saved is kept in this browser, marked pending, shown
// like any other, and sent the next time the log loads. Deleting your data
// (/store/profile/data) clears this browser's copy too.

import { useCallback, useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";

export const MEAL_LOG_KEY = "koi_meal_log_v1";
const FIELDS = ["eaten_on", "slot", "status", "planned", "other", "estimate", "source"];

const readLocal = (memberId) => {
  try {
    const all = JSON.parse(window.localStorage.getItem(MEAL_LOG_KEY) ?? "{}") ?? {};
    return Array.isArray(all[memberId]) ? all[memberId] : [];
  } catch {
    return [];
  }
};
const writeLocal = (memberId, rows) => {
  try {
    const all = JSON.parse(window.localStorage.getItem(MEAL_LOG_KEY) ?? "{}") ?? {};
    if (rows.length) all[memberId] = rows;
    else delete all[memberId];
    window.localStorage.setItem(MEAL_LOG_KEY, JSON.stringify(all));
  } catch { /* private mode: pending meals last for this visit */ }
};
const same = (a, b) => a.eaten_on === b.eaten_on && a.slot === b.slot;
const pick = (row) => Object.fromEntries(FIELDS.map((f) => [f, row[f] ?? null]));

/**
 * @param {string|null} memberId the account holder's household_member id (null: nothing to load)
 * @param {{ from: string, to: string }} span dates, inclusive
 * @returns {{ rows: Array, loading: boolean, error: string|null, pending: number, save: (row) => Promise<{ok: boolean, pending?: boolean}>, remove: (date, slot) => Promise<boolean>, reload: () => Promise<void> }}
 */
export function useMealLog(memberId, { from, to }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(Boolean(memberId));
  const [error, setError] = useState(null);
  const [pending, setPending] = useState(0);

  const load = useCallback(async () => {
    if (!memberId) return;
    const supabase = getSupabaseClient();
    // Send what this browser is holding first.
    const held = readLocal(memberId);
    const still = [];
    for (const row of held) {
      const { error: e } = await supabase.from("member_meal_log").upsert({ member_id: memberId, ...pick(row), updated_at: new Date().toISOString() }, { onConflict: "member_id,eaten_on,slot" });
      if (e) still.push(row);
    }
    writeLocal(memberId, still);
    setPending(still.length);
    const { data, error: readError } = await supabase
      .from("member_meal_log")
      .select("*")
      .eq("member_id", memberId)
      .gte("eaten_on", from)
      .lte("eaten_on", to)
      .order("eaten_on", { ascending: true });
    const saved = readError ? [] : data ?? [];
    setRows([...saved.filter((r) => !still.some((p) => same(p, r))), ...still.filter((p) => p.eaten_on >= from && p.eaten_on <= to)]);
    setError(readError ? "Your saved meals could not be loaded. New ones are kept on this device until they can be." : null);
    setLoading(false);
  }, [memberId, from, to]);

  useEffect(() => {
    let live = true;
    (async () => { if (live) await load(); })();
    return () => { live = false; };
  }, [load]);

  /** One entry for a meal; a second for the same meal replaces it. */
  const save = useCallback(async (row) => {
    if (!memberId) return { ok: false };
    const entry = pick(row);
    const { error: writeError } = await getSupabaseClient()
      .from("member_meal_log")
      .upsert({ member_id: memberId, ...entry, updated_at: new Date().toISOString() }, { onConflict: "member_id,eaten_on,slot" });
    if (writeError?.message?.includes("row-level security")) {
      setError("Only an adult can log meals for themselves.");
      return { ok: false };
    }
    if (writeError) {
      const held = [...readLocal(memberId).filter((p) => !same(p, entry)), { ...entry, pending: true }];
      writeLocal(memberId, held);
      setPending(held.length);
    }
    setRows((all) => [...all.filter((r) => !same(r, entry)), { ...entry, member_id: memberId, ...(writeError ? { pending: true } : {}) }]);
    setError(null);
    return { ok: true, pending: Boolean(writeError) };
  }, [memberId]);

  /** Take a meal's entry back. */
  const remove = useCallback(async (date, slot) => {
    if (!memberId) return false;
    const held = readLocal(memberId).filter((p) => !(p.eaten_on === date && p.slot === slot));
    writeLocal(memberId, held);
    setPending(held.length);
    const { error: deleteError } = await getSupabaseClient().from("member_meal_log").delete().eq("member_id", memberId).eq("eaten_on", date).eq("slot", slot);
    const wasSaved = rows.some((r) => r.eaten_on === date && r.slot === slot && !r.pending);
    if (deleteError && wasSaved) {
      setError("That meal could not be taken back. Try again in a moment.");
      return false;
    }
    setRows((all) => all.filter((r) => !(r.eaten_on === date && r.slot === slot)));
    return true;
  }, [memberId, rows]);

  // reload: read the saved meals again (KOI's agent logged one while the page was open).
  return { rows, loading, error, pending, save, remove, reload: load };
}
