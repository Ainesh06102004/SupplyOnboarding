"use client";

// An auto-plan draft on screen (00093): what KOI drafted, and the three things
// the owner can do with it. Approving makes it the household's plan from its
// first day; the cart is filled only on "Approve and add to cart"; discarding
// deletes it and brings this week's plan back. Changes come after approval, so
// a draft is never half-adopted.

import { inr } from "./tokens";

const shortDate = (iso) => (iso ? new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }) : null);

/** @param {{ s: object }} props the plan session, with a draft plan on screen */
export default function DraftBanner({ s }) {
  const p = s.plan;
  const products = (p.report?.basket ?? []).length;
  const starts = shortDate(p.startsOn);
  return (
    <section aria-label="A draft from KOI" className="mb-5 flex flex-col gap-4 rounded-[28px] bg-koi-forest p-6 font-koi-sans text-koi-bg md:flex-row md:items-center md:justify-between">
      <span className="flex max-w-[640px] flex-col gap-1.5">
        <span className="font-koi-mono text-[10.5px] font-semibold uppercase tracking-[0.14em] text-koi-lime">Auto-plan · a draft</span>
        <span className="font-koi-display text-2xl font-extrabold leading-tight">KOI drafted your next plan</span>
        <span className="text-[14px] leading-snug text-koi-bg/85">
          {p.days} days{starts ? ` from ${starts}` : ""} · {products} {products === 1 ? "product" : "products"}{p.report?.cost ? ` · about ₹${inr(Math.round(p.report.cost))}` : ""}. Look it over below. Approve it to make it your plan (you can still change it after), or discard it. Nothing goes in your cart until you say so.
        </span>
      </span>
      <span className="flex flex-wrap gap-2">
        <button type="button" onClick={() => s.approveDraft({ toCart: true })} className="h-12 rounded-full bg-koi-lime px-5 text-[14px] font-bold text-koi-forest">Approve and add to cart</button>
        <button type="button" onClick={() => s.approveDraft()} className="h-12 rounded-full border border-koi-bg/30 px-5 text-[14px] font-semibold">Approve</button>
        <button type="button" onClick={s.discardDraft} className="h-12 rounded-full px-4 text-[14px] font-semibold text-koi-bg/80 hover:bg-koi-bg/10">Discard</button>
      </span>
    </section>
  );
}
