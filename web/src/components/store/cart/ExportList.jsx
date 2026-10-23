"use client";

// ============================================================================
// Cart · "Export ingredient list" (approved canvas, 23 Oct 2026)
//
// The cart as a list to take shopping (lib/cart/exportList.js): the shelf
// products, from the plan and what you added, and the week's fresh food and
// kitchen basics by name. Copy it, send it on WhatsApp, download it, or print
// it (the print dialog also saves a PDF). Nothing leaves the device unless the
// shopper sends it.
// ============================================================================

import { useEffect, useRef, useState } from "react";
import { exportList } from "@/lib/cart/exportList";

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

/** A printable page for the list: the browser's print dialog prints it or saves it as a PDF. */
function printPage(list) {
  const body = list.sections.map((s) => `<h2>${esc(s.title)}</h2>${s.inline ? `<p>${s.items.map(esc).join(" · ")}</p>` : `<ul>${s.items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>`}`).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>KOI shopping list</title><style>body{font:15px/1.5 system-ui,sans-serif;color:#1c1e17;margin:32px;max-width:640px}h1{font-size:22px;margin:0 0 4px}h2{font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#3d4a43;margin:22px 0 6px}ul{list-style:none;padding:0;margin:0}li{padding:6px 0;border-bottom:1px solid #e5e2d8}li::before{content:"\\2610  "}</style></head><body><h1>${esc(list.text.split("\n")[0])}</h1>${body}</body></html>`;
}

/**
 * @param {{ groups: object, className?: string }} props the cart's groups (useCartGroups)
 */
export default function ExportList({ groups, className = "" }) {
  const [open, setOpen] = useState(false);
  const [shelf, setShelf] = useState(true);
  const [fresh, setFresh] = useState(true);
  const [done, setDone] = useState(null);
  const ref = useRef(null);
  const hasFresh = Boolean(groups.plan?.fresh?.length || groups.plan?.kitchen?.length);
  const list = exportList(groups, { shelf, fresh: fresh && hasFresh });

  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", away); document.removeEventListener("keydown", esc); };
  }, [open]);

  const finish = (what) => { setDone(what); setTimeout(() => setDone(null), 2200); };
  const copy = async () => {
    try { await navigator.clipboard.writeText(list.text); finish("Copied"); } catch { finish("Couldn't copy"); }
  };
  const whatsapp = () => window.open(`https://wa.me/?text=${encodeURIComponent(list.text)}`, "_blank", "noopener");
  const download = () => {
    const url = URL.createObjectURL(new Blob([list.text], { type: "text/plain;charset=utf-8" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: `koi-shopping-list-${new Date().toISOString().slice(0, 10)}.txt` });
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    finish("Downloaded");
  };
  const print = () => {
    const w = window.open("", "_blank");
    if (!w) { finish("Allow pop-ups to print"); return; }
    w.document.write(printPage(list));
    w.document.close();
    w.focus();
    w.print();
  };

  const item = "flex h-12 w-full items-center justify-between gap-3 rounded-2xl px-3 text-left text-[14px] font-semibold text-koi-ink hover:bg-koi-paper disabled:opacity-40";
  const empty = !list.count;
  return (
    <div ref={ref} className={`relative z-30 ${className}`}>
      <button type="button" aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen((o) => !o)}
              className="flex h-11 items-center gap-2 rounded-full border border-koi-forest/15 bg-white px-4 text-sm font-semibold text-koi-forest transition-colors hover:border-koi-forest/40">
        <svg aria-hidden="true" className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 21h14" /></svg>
        {done ?? "Export ingredient list"}
      </button>
      {open && (
        <div role="menu" aria-label="Export ingredient list" className="absolute right-0 top-[52px] z-30 flex w-[min(340px,calc(100vw-32px))] flex-col gap-1 rounded-[22px] border border-koi-forest/10 bg-white p-2.5 shadow-[0_24px_44px_-24px_rgba(15,61,46,.45)]">
          <div className="flex flex-col gap-2 px-2.5 pb-2 pt-1.5">
            <span className="font-koi-mono text-[10.5px] font-semibold uppercase tracking-[0.14em] text-koi-muted">What goes on the list</span>
            <label className="flex items-center gap-2.5 text-[13.5px] font-semibold"><input type="checkbox" checked={shelf} onChange={(e) => setShelf(e.target.checked)} className="size-[18px] accent-koi-forest" /> Shelf products ({groups.lines.length})</label>
            <label className={`flex items-center gap-2.5 text-[13.5px] font-semibold ${hasFresh ? "" : "text-koi-muted"}`}>
              <input type="checkbox" checked={fresh && hasFresh} disabled={!hasFresh} onChange={(e) => setFresh(e.target.checked)} className="size-[18px] accent-koi-forest" />
              Fresh food and kitchen basics{hasFresh ? ` (${groups.plan.fresh?.length ?? 0})` : ""}
            </label>
            {!hasFresh && <span className="text-[12px] text-koi-muted">Put this week&apos;s plan in the cart from the Pantry and its fresh list comes too.</span>}
          </div>
          <button type="button" role="menuitem" disabled={empty} onClick={copy} className={item}>Copy as text <span className="text-[12px] font-medium text-koi-muted">for any chat</span></button>
          <button type="button" role="menuitem" disabled={empty} onClick={whatsapp} className={item}>Send on WhatsApp <span className="text-[12px] font-medium text-koi-muted">opens WhatsApp</span></button>
          <button type="button" role="menuitem" disabled={empty} onClick={download} className={item}>Download <span className="text-[12px] font-medium text-koi-muted">a text file</span></button>
          <button type="button" role="menuitem" disabled={empty} onClick={print} className={item}>Print or save as PDF <span className="text-[12px] font-medium text-koi-muted">one page</span></button>
        </div>
      )}
    </div>
  );
}
