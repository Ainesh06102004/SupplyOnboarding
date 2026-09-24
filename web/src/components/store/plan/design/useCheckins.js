"use client";

// The signed-in person's own check-ins (00077): read, and one weight a day
// written. RLS decides whose rows these can be — only the member who is this
// account, and only an adult — so there is nothing to pass but the member id.

import { useCallback, useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";

/**
 * @param {string|null} memberId the account holder's household_member id
 * @returns {{ rows: Array, loading: boolean, error: string|null, save: (kg: number, date: string) => Promise<boolean> }}
 */
export function useCheckins(memberId) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(Boolean(memberId));
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!memberId) return;
    const { data, error: readError } = await getSupabaseClient()
      .from("member_checkin")
      .select("checked_on, weight_kg")
      .eq("member_id", memberId)
      .order("checked_on", { ascending: true })
      .limit(400);
    if (readError) setError("Your check-ins could not be loaded.");
    else { setRows(data ?? []); setError(null); }
    setLoading(false);
  }, [memberId]);

  useEffect(() => {
    let live = true;
    (async () => { if (live) await load(); })();
    return () => { live = false; };
  }, [load]);

  /** One weight for a day; a second the same day replaces it. */
  const save = useCallback(async (kg, date) => {
    if (!memberId) return false;
    const { error: writeError } = await getSupabaseClient()
      .from("member_checkin")
      .upsert({ member_id: memberId, checked_on: date, weight_kg: kg }, { onConflict: "member_id,checked_on" });
    if (writeError) {
      setError(writeError.message?.includes("row-level security") ? "Only an adult can log a check-in for themselves." : "That check-in could not be saved.");
      return false;
    }
    await load();
    return true;
  }, [memberId, load]);

  return { rows, loading, error, save };
}
