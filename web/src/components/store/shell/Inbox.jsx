"use client";

// ============================================================================
// KOI's inbox: the bell in the header (00093).
//
// What KOI has to tell the signed-in person: an auto-plan draft ready to
// review, one that couldn't be made, a reminder or a planning day from their
// calendar. Notifications are written by KOI's server only; here they are read,
// opened (which marks them read) and dismissed. Signed out, there is no bell.
// The list refreshes when the page regains focus and every few minutes.
// ============================================================================

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import Sheet from "@/components/store/system/Sheet";

const REFRESH_MS = 5 * 60 * 1000;
const ago = (iso) => {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
};

/** The person's notifications: read leniently, so before 00093 the inbox is simply empty. */
export function useNotifications(enabled) {
  const [rows, setRows] = useState([]);
  const load = useCallback(async () => {
    if (!enabled) return;
    const { data, error } = await getSupabaseClient()
      .from("notification")
      .select("id, kind, title, body, href, read_at, created_at")
      .order("created_at", { ascending: false })
      .limit(30);
    setRows(error ? [] : data ?? []);
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return undefined;
    let live = true;
    (async () => { if (live) await load(); })();
    const again = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", again);
    const timer = setInterval(load, REFRESH_MS);
    return () => { live = false; document.removeEventListener("visibilitychange", again); clearInterval(timer); };
  }, [enabled, load]);

  const markRead = useCallback(async (ids) => {
    const list = [].concat(ids).filter(Boolean);
    if (!list.length) return;
    const at = new Date().toISOString();
    setRows((all) => all.map((r) => (list.includes(r.id) && !r.read_at ? { ...r, read_at: at } : r)));
    await getSupabaseClient().from("notification").update({ read_at: at }).in("id", list);
  }, []);
  const dismiss = useCallback(async (id) => {
    setRows((all) => all.filter((r) => r.id !== id));
    await getSupabaseClient().from("notification").delete().eq("id", id);
  }, []);

  return { rows, unread: rows.filter((r) => !r.read_at).length, markRead, dismiss };
}

/** @param {{ lightInk?: boolean }} props */
export default function Inbox({ lightInk = false }) {
  const { user } = useAuth();
  const inbox = useNotifications(Boolean(user));
  const [open, setOpen] = useState(false);
  if (!user) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={inbox.unread ? `Notifications, ${inbox.unread} new` : "Notifications"}
        className={`relative grid size-10 shrink-0 place-items-center rounded-full border transition-colors ${lightInk ? "border-white/30 text-white" : "border-koi-forest/15 bg-white text-koi-forest hover:border-koi-forest/40"}`}
      >
        <svg className="size-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {inbox.unread > 0 && <span className="absolute -right-1 -top-1 grid min-w-[18px] place-items-center rounded-full bg-koi-lime px-1 font-koi-num text-[10.5px] font-bold leading-[18px] text-koi-forest">{inbox.unread}</span>}
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} label="Notifications">
        <div className="flex min-h-0 flex-1 flex-col bg-koi-bg font-koi-sans text-koi-ink">
          <div className="flex items-start justify-between gap-3 px-6 pb-3 pt-6">
            <span className="flex flex-col gap-1">
              <span className="font-koi-mono text-[10.5px] font-semibold uppercase tracking-[0.14em] text-koi-muted">From KOI</span>
              <span className="font-koi-display text-2xl font-extrabold leading-tight text-koi-forest">Notifications</span>
            </span>
            <span className="flex items-center gap-2">
              {inbox.unread > 0 && <button type="button" onClick={() => inbox.markRead(inbox.rows.filter((r) => !r.read_at).map((r) => r.id))} className="h-10 rounded-full px-3 text-[13px] font-semibold text-koi-primary">Mark all read</button>}
              <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="grid size-11 place-items-center rounded-full border border-koi-forest/15 text-koi-forest">
                <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12" /><path d="M18 6 6 18" /></svg>
              </button>
            </span>
          </div>
          <ul className="m-0 flex min-h-0 flex-1 list-none flex-col gap-2 overflow-y-auto px-6 pb-6">
            {!inbox.rows.length && (
              <li className="rounded-2xl bg-white p-5 text-[14px] text-koi-ink2">Nothing yet. KOI tells you here when it has drafted your next plan, or a reminder from your calendar is due.</li>
            )}
            {inbox.rows.map((n) => (
              <li key={n.id} className={`flex items-start gap-3 rounded-2xl p-4 ${n.read_at ? "bg-white" : "bg-koi-lime-soft"}`}>
                <span aria-hidden="true" className={`mt-1.5 size-2 shrink-0 rounded-full ${n.read_at ? "bg-transparent" : n.kind === "autoplan_failed" ? "bg-koi-ember" : "bg-koi-forest"}`} />
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  {n.href ? (
                    <Link href={n.href} onClick={() => { inbox.markRead(n.id); setOpen(false); }} className="text-[15px] font-bold text-koi-ink no-underline hover:underline">{n.title}</Link>
                  ) : <span className="text-[15px] font-bold">{n.title}</span>}
                  <span className="text-[13px] leading-snug text-koi-ink2">{n.body}</span>
                  <span className="font-koi-mono text-[10.5px] uppercase tracking-[0.1em] text-koi-muted">{ago(n.created_at)}</span>
                </span>
                <button type="button" onClick={() => inbox.dismiss(n.id)} aria-label={`Dismiss: ${n.title}`} className="grid size-9 shrink-0 place-items-center rounded-full text-koi-muted hover:bg-koi-paper">
                  <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12" /><path d="M18 6 6 18" /></svg>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </Sheet>
    </>
  );
}
