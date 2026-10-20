"use client";

// ============================================================================
// /store/profile — You (cinematic storefront, Oct 2026)
//
// The canvas's bento: the active goal as the forest tile (what the goal store
// holds — current, target, what's left, the daily targets; no percentage,
// because a starting weight is not recorded), the four places that are the
// shopper's, preferences, addresses, Swiggy and payment, notifications and
// support. Every figure is the signed-in shopper's own; nothing is invented.
// ============================================================================

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AddressManager from "@/components/store/AddressManager";
import ConnectSwiggy from "@/components/store/marketplace/ConnectSwiggy";
import { signOutUser } from "@/lib/auth/supabaseAuth";
import { useAuth } from "@/contexts/AuthContext";
import { useGoalStore, GOAL_DEFS } from "@/store/goalStore";
import { profileService } from "@/lib/supabase/profileService";
import { DIET_TYPES, FOODS_AVOID } from "@/lib/recommendation/config";
import { setupMotion, prefersReducedMotion, useGSAP, E } from "@/lib/motion/koiMotion";
import { useKoiVoice } from "@/store/koiVoiceStore";

const tile = "rounded-[24px] border border-koi-forest/10 bg-white p-6";
const NAV = [
  { href: "/store/orders", label: "Orders", hint: "Baskets you sent" },
  { href: "/store/plan", label: "Plan", hint: "This week" },
  { href: "/store/household", label: "Household", hint: "Everyone you shop for" },
  { href: "/store/profile/data", label: "What KOI keeps", hint: "See it, or delete it" },
];

export default function ProfilePage() {
  const router = useRouter();
  const root = useRef(null);
  const say = useKoiVoice((s) => s.say);

  const handleLogout = async () => {
    try {
      await signOutUser();
      router.push("/store/shop");
    } catch (e) {
      console.error("Logout failed:", e);
    }
  };

  // ── Real identity and goal profile ──
  // This page used to display a hardcoded "Anshuman Das", a 65→72 kg goal and
  // a 42% progress ring for every visitor, none of it connected to the signed-in
  // user or to goalStore, which already holds exactly this data.
  const { user } = useAuth();
  const profile = useGoalStore((s) => s.profile);
  const hydrateGoal = useGoalStore((s) => s.hydrate);
  const [account, setAccount] = useState(null);

  useEffect(() => { hydrateGoal(); }, [hydrateGoal]);

  useEffect(() => {
    if (!user?.uid) return;
    let alive = true;
    profileService
      .getProfile(user.uid)
      .then((p) => { if (alive) setAccount(p); })
      .catch((err) => console.error("Could not load profile:", err));
    return () => { alive = false; };
  }, [user?.uid]);

  const displayName = account?.display_name || user?.displayName || null;
  const contact = account?.email || user?.email || account?.phone || user?.phone || null;
  const memberSince = account?.created_at ? new Date(account.created_at).getFullYear() : null;

  const activeGoal = profile?.goal ? (GOAL_DEFS[profile.goal]?.label ?? profile.goal) : null;
  const currentWeight = profile?.weightNow ?? null;
  const goalWeight = profile?.weightTarget ?? null;
  // How far there is still to go. A percentage would need a starting weight,
  // which is not recorded — so the remaining delta is the honest number.
  const weightDelta =
    currentWeight !== null && goalWeight !== null
      ? Math.round(Math.abs(Number(goalWeight) - Number(currentWeight)) * 10) / 10
      : null;

  const dietType = profile?.dietType || null;
  const avoided = profile?.foodsAvoid || [];

  const [toggles, setToggles] = useState({ orderUpdates: true, priceDrops: false, newProducts: true });

  useGSAP(() => {
    say(activeGoal ? "Everything that’s yours, in one place. I’ll ask before I change any of it." : "Set a goal and every shelf re-ranks around it.");
    if (prefersReducedMotion()) return;
    const gsap = setupMotion();
    const q = (s) => root.current.querySelectorAll(s);
    gsap.from(q("[data-line]"), { yPercent: 115, duration: 1, ease: E.reveal, delay: 0.05 });
    gsap.from(q("[data-rise]"), { autoAlpha: 0, y: 14, duration: 0.7, stagger: 0.08, ease: E.reveal, delay: 0.1 });
    gsap.from(q("[data-tile]"), { autoAlpha: 0, y: 30, scale: 0.98, duration: 0.85, stagger: 0.06, ease: E.dolly, delay: 0.2, clearProps: "opacity,visibility,transform" });
  }, { scope: root });

  return (
    <main ref={root} className="ks-page-pad mx-auto flex w-full max-w-[1440px] flex-col bg-koi-bg px-[clamp(16px,4vw,52px)] pt-8 font-koi-sans text-koi-ink">
      <section className="flex flex-wrap items-end justify-between gap-x-10 gap-y-3">
        <div className="flex flex-col gap-2.5">
          <div data-rise className="flex items-center gap-3">
            <span className="font-koi-mono text-xs font-semibold text-koi-primary">(08)</span>
            <span className="font-koi-mono text-xs font-medium uppercase tracking-[0.22em] text-koi-muted">Your account{memberSince ? ` · since ${memberSince}` : ""}</span>
          </div>
          <h1 className="koi-condensed m-0 font-koi-display text-[clamp(44px,5.2vw,78px)] font-extrabold leading-[0.92] tracking-[-0.03em] text-koi-forest">
            <span className="-mb-[0.06em] block overflow-hidden pb-[0.06em]"><span data-line className="block">{displayName || "You"}</span></span>
          </h1>
        </div>
        <div data-rise className="flex flex-wrap items-center gap-2">
          {contact && <span className="flex h-11 items-center gap-2 rounded-full border border-koi-forest/15 bg-white px-4 font-koi-mono text-xs text-koi-ink2"><span aria-hidden="true" className="size-2 rounded-full bg-koi-green" />Signed in · {contact}</span>}
          <button type="button" onClick={handleLogout} className="h-11 rounded-full px-4 text-sm font-semibold text-koi-ink2 transition-colors hover:bg-white">Log out</button>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 pb-10 pt-7 lg:grid-cols-12">
        {/* The active goal. Read-only: the goal wizard on the shop is the
            single editor for it (one goal list, the engine's own). */}
        <article data-tile aria-label="Active goal" className="relative overflow-hidden rounded-[28px] bg-koi-forest p-7 text-koi-bg lg:col-span-7 lg:row-span-2">
          {activeGoal ? (
            <>
              <div className="flex flex-col gap-1.5">
                <span className="font-koi-mono text-[11px] font-medium uppercase tracking-[0.18em] text-koi-lime">Active goal</span>
                <span className="koi-condensed font-koi-display text-[40px] font-extrabold leading-none">{activeGoal}</span>
              </div>
              {(currentWeight !== null || goalWeight !== null) && (
                <div className="mt-6 grid grid-cols-3 gap-3">
                  <div className="flex flex-col gap-1 rounded-2xl bg-koi-bg/10 p-4"><span className="font-koi-mono text-[10px] uppercase tracking-[0.14em] text-koi-bg/70">Current</span><span className="font-koi-num text-[28px] font-semibold leading-none">{currentWeight ?? "—"}<span className="ml-1 text-sm font-medium">kg</span></span></div>
                  <div className="flex flex-col gap-1 rounded-2xl bg-koi-bg/10 p-4"><span className="font-koi-mono text-[10px] uppercase tracking-[0.14em] text-koi-bg/70">Target</span><span className="font-koi-num text-[28px] font-semibold leading-none">{goalWeight ?? "—"}<span className="ml-1 text-sm font-medium">kg</span></span></div>
                  <div className="flex flex-col gap-1 rounded-2xl bg-koi-lime p-4 text-koi-forest"><span className="font-koi-mono text-[10px] uppercase tracking-[0.14em] text-koi-forest/80">To go</span><span className="font-koi-num text-[28px] font-semibold leading-none">{weightDelta ?? "—"}<span className="ml-1 text-sm font-medium">kg</span></span></div>
                </div>
              )}
              <p className="m-0 mt-6 text-[14px] leading-relaxed text-koi-bg/75">Your weigh-ins, and how they sit against the plan’s arithmetic, live in Track. KOI only ever suggests a change there.</p>
              <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-koi-bg/15 pt-5">
                <span className="text-sm text-koi-bg/80">
                  {profile?.targets?.kcal ? <>Plans to <strong className="font-koi-num text-koi-bg">{profile.targets.kcal} kcal</strong>{profile.targets.protein ? <> and <strong className="font-koi-num text-koi-bg">{profile.targets.protein} g protein</strong></> : null} a day</> : "No daily targets set yet"}
                </span>
                <div className="flex gap-2">
                  <Link href="/store/track" className="flex h-11 items-center rounded-full bg-koi-lime px-4 text-sm font-bold text-koi-forest no-underline">Open Track</Link>
                  <Link href="/store/shop#goals" className="flex h-11 items-center rounded-full border border-koi-bg/30 px-4 text-sm font-semibold text-koi-bg no-underline transition-colors hover:bg-koi-bg/10">Edit goal</Link>
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-col gap-4">
              <span className="font-koi-mono text-[11px] font-medium uppercase tracking-[0.18em] text-koi-lime">Active goal</span>
              <span className="koi-condensed font-koi-display text-[40px] font-extrabold leading-none">Not set yet</span>
              <p className="m-0 max-w-[460px] text-[15px] leading-relaxed text-koi-bg/80">Tell KOI what you’re optimising for and every shelf re-ranks around it.</p>
              <Link href="/store/shop#goals" className="flex h-12 w-fit items-center rounded-full bg-koi-lime px-5 text-sm font-bold text-koi-forest no-underline">Set your goal</Link>
            </div>
          )}
        </article>

        {/* Everything that is the shopper's. On a phone the tab bar's "You"
            lands here, so Orders has to be reachable from it. */}
        <nav data-tile aria-label="Your KOI" className="grid grid-cols-2 gap-3 lg:col-span-5">
          {NAV.map((l) => (
            <Link key={l.href} href={l.href} className="group flex flex-col justify-between gap-6 rounded-[24px] border border-koi-forest/10 bg-white p-5 no-underline transition-transform hover:-translate-y-1">
              <span className="font-koi-mono text-[10.5px] uppercase tracking-[0.14em] text-koi-muted">{l.hint}</span>
              <span className="flex items-center justify-between text-lg font-bold text-koi-forest">{l.label}<span aria-hidden="true">→</span></span>
            </Link>
          ))}
        </nav>

        <article data-tile aria-label="Your preferences" className={`${tile} flex flex-col gap-4 lg:col-span-5`}>
          <div className="flex items-center justify-between"><span className="text-lg font-bold">Your preferences</span><Link href="/store/household" className="text-sm font-semibold text-koi-primary hover:underline">Edit</Link></div>
          {dietType || avoided.length ? (
            <dl className="m-0 grid grid-cols-[100px_minmax(0,1fr)] gap-x-4 gap-y-3 text-sm">
              {dietType && <><dt className="font-koi-mono text-[11px] uppercase tracking-[0.14em] text-koi-muted">Diet</dt><dd className="m-0 font-semibold">{DIET_TYPES.find((d) => d.key === dietType)?.label || dietType}</dd></>}
              {avoided.length > 0 && (
                <>
                  <dt className="font-koi-mono text-[11px] uppercase tracking-[0.14em] text-koi-muted">Avoiding</dt>
                  <dd className="m-0 flex flex-wrap gap-1.5">{avoided.map((key) => <span key={key} className="rounded-full bg-koi-warm-bg px-2.5 py-0.5 text-xs font-semibold text-koi-warm-ink">{FOODS_AVOID.find((a) => a.key === key)?.label || key}</span>)}</dd>
                </>
              )}
            </dl>
          ) : (
            <p className="m-0 text-sm text-koi-ink2">No diet or avoids saved yet. Household settings is where they live.</p>
          )}
        </article>

        <article data-tile aria-label="Delivery addresses" className={`${tile} lg:col-span-6`}>
          <AddressManager />
        </article>

        <article data-tile aria-label="Swiggy and payment" className={`${tile} flex flex-col gap-4 lg:col-span-6`}>
          {/* The Swiggy link that makes availability answerable and the hand-off possible at all. */}
          <ConnectSwiggy next="/store/profile" />
          {/* This card used to list "•••• 4242 / Expires 12/28" and
              "anshuman@upi" for every visitor — invented payment methods for a
              store that takes no payment. */}
          <div className="flex items-start gap-3 rounded-2xl bg-koi-paper p-4">
            <svg className="mt-0.5 size-5 shrink-0 text-koi-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>
            <span className="flex flex-col gap-0.5"><span className="text-sm font-bold">Payment</span><span className="text-sm leading-normal text-koi-ink2">You pay on Swiggy at hand-off. KOI never stores a card or UPI ID.</span></span>
          </div>
        </article>

        <article data-tile aria-label="Notifications" className={`${tile} flex flex-col gap-2 lg:col-span-6`}>
          <span className="mb-2 text-lg font-bold">Notifications</span>
          {[
            { key: "orderUpdates", label: "Order updates", desc: "When a basket is handed to Swiggy" },
            { key: "priceDrops", label: "Price drops", desc: "Alerts for saved products" },
            { key: "newProducts", label: "New KOI products", desc: "Products passing KOI’s standards" },
          ].map((t) => (
            <div key={t.key} className="flex items-center justify-between gap-4 border-b border-koi-forest/10 py-3 last:border-b-0">
              <span className="flex flex-col"><span className="text-sm font-bold">{t.label}</span><span className="text-[13px] text-koi-ink2">{t.desc}</span></span>
              <button type="button" role="switch" aria-checked={toggles[t.key]} aria-label={t.label} onClick={() => setToggles((p) => ({ ...p, [t.key]: !p[t.key] }))} className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${toggles[t.key] ? "bg-koi-forest" : "bg-koi-track"}`}>
                <span className={`absolute left-1 top-1 size-5 rounded-full bg-white shadow-[0_2px_6px_rgba(4,20,15,.3)] transition-transform ${toggles[t.key] ? "translate-x-5" : ""}`} />
              </button>
            </div>
          ))}
        </article>

        <article data-tile aria-label="Support" className={`${tile} flex flex-col gap-1 lg:col-span-6`}>
          <span className="mb-2 text-lg font-bold">Support</span>
          {["Help Center & FAQs", "Contact Support", "Report an Issue"].map((l) => (
            <button key={l} type="button" className="flex h-12 items-center justify-between rounded-xl px-2 text-left text-sm font-semibold hover:bg-koi-paper">{l} <span aria-hidden="true" className="text-koi-muted">›</span></button>
          ))}
          <button type="button" onClick={handleLogout} className="mt-2 flex h-12 items-center justify-center rounded-xl text-sm font-bold text-koi-red transition-colors hover:bg-koi-red-bg">Log out</button>
        </article>
      </div>
    </main>
  );
}
