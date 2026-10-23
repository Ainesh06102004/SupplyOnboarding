"use client";

// Demo mode's mark in the header (development only, lib/supabase/demo): says
// the store is running on the local demo database, and starts it again from its
// seed — the demo tables, and this browser's KOI copies (picks, meals and
// events held for saving, Take 2s) — after a second press.

import { useState } from "react";
import { isDemo } from "@/lib/supabase/demo/mode";

export default function DemoBadge() {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!isDemo()) return null;

  const reset = async () => {
    setBusy(true);
    await fetch("/api/demo/db", { method: "DELETE" }).catch(() => null);
    try {
      for (const key of Object.keys(window.localStorage)) if (key.startsWith("koi_")) window.localStorage.removeItem(key);
    } catch { /* nothing held */ }
    window.location.reload();
  };

  return asking ? (
    <span className="flex items-center gap-1 rounded-full bg-koi-lime px-1 py-1 font-koi-sans text-[12px] font-bold text-koi-forest">
      <button type="button" onClick={reset} disabled={busy} className="h-8 rounded-full bg-koi-forest px-3 text-koi-lime">{busy ? "Resetting…" : "Reset the demo"}</button>
      <button type="button" onClick={() => setAsking(false)} className="h-8 rounded-full px-2.5">Keep</button>
    </span>
  ) : (
    <button
      type="button"
      onClick={() => setAsking(true)}
      title="Demo mode: no Supabase. Everything is stored in web/.demo/db.json. Press to start again."
      className="h-8 shrink-0 rounded-full bg-koi-lime px-3 font-koi-mono text-[10.5px] font-bold uppercase tracking-[0.12em] text-koi-forest"
    >
      Demo · reset
    </button>
  );
}
