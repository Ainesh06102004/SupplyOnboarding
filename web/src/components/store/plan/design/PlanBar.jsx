"use client";

// ============================================================================
// PlanBar — the Plan's chapters and household, under the store's one header.
//
// The founder's design gave the Plan its own sticky header: the KOI mark, the
// steps, the household. The mark and the account now live in the shared
// StoreHeader, so this keeps only what is the Plan's: the numbered steps and
// whose plan it is. It sticks just under the store header.
//
// Cinematic storefront (Oct 2026): the steps are chapters on one track. The
// forest fill runs up to the chapter you are on and KOI's playhead (the ember
// orange) sits at its edge; moving between chapters dollies both (GSAP).
//
// Step five was "Shop" and is "Cart" now — it IS the store's cart. Its key stays
// `shop`, because ?step=shop and the agent's tools, router and eval all say so.
//
// Track was a sixth chapter; it is its own page now (/store/track), so the
// Plan ends at the Cart.
// ============================================================================

import { useRef, useState } from "react";
import Link from "next/link";
import { goalShortLabel } from "@/lib/plan/goalCards";
import { MEMBER_COLORS, initialsOf, inr } from "./tokens";
import { useGlowing } from "@/components/agent/AgentProvider";
import { setupMotion, prefersReducedMotion, useGSAP, E } from "@/lib/motion/koiMotion";

export const STEPS = Object.freeze([
  { key: "define", label: "Define" },
  { key: "you", label: "You" },
  { key: "plan", label: "Plan" },
  { key: "pantry", label: "Pantry" },
  { key: "shop", label: "Cart" },
]);

export default function PlanBar({ step, onStep, profiles, activeKey, onActive, keyOf, onAddMember, saveState, weekLabel }) {
  const [name, setName] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const placed = useRef(false);
  // KOI Agent Mode: someone KOI just saved glows for a moment.
  const glowing = useGlowing();
  const index = Math.max(0, STEPS.findIndex((s) => s.key === step));
  const active = profiles.find((p) => keyOf(p) === activeKey) ?? profiles[0] ?? null;
  const colourOf = (p) => MEMBER_COLORS[Math.max(0, profiles.indexOf(p)) % MEMBER_COLORS.length];
  const needsDetails = profiles.some((p) => !p.memberId);
  const commit = () => {
    if (!name.trim()) return;
    onAddMember(name);
    setName("");
  };

  // The camera moves along the track: the fill and the playhead travel to the chapter.
  useGSAP(() => {
    const gsap = setupMotion();
    const share = `${((index + 1) / STEPS.length) * 100}%`;
    const fill = ref.current.querySelector("[data-fill]");
    const head = ref.current.querySelector("[data-playhead]");
    // GSAP alone owns these two properties: placed on arrival, dollied after.
    if (!placed.current || prefersReducedMotion()) { placed.current = true; gsap.set(fill, { width: share }); gsap.set(head, { left: share }); return; }
    gsap.to(fill, { width: share, duration: 0.9, ease: E.dolly });
    gsap.to(head, { left: share, duration: 0.9, ease: E.dolly });
  }, { scope: ref, dependencies: [index] });

  return (
    <div ref={ref} className="sticky top-[var(--koi-header-h)] z-40 border-b border-koi-forest/10 bg-koi-bg/90 font-koi-sans backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1440px] items-center gap-4 px-[clamp(16px,4vw,52px)] py-2.5 md:gap-6">
        <span className="hidden w-[170px] shrink-0 font-koi-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-koi-primary lg:block">{weekLabel ?? "Plan"}</span>

        <nav aria-label="Plan steps" className="relative min-w-0 flex-1">
          <ol className="relative m-0 grid h-11 list-none grid-cols-5 overflow-hidden rounded-xl bg-koi-track p-0">
            {STEPS.map((s, i) => (
              <li key={s.key} className="relative z-10 flex">
                <button
                  type="button"
                  onClick={() => onStep(s.key)}
                  aria-current={i === index ? "step" : undefined}
                  aria-label={`${String(i + 1).padStart(2, "0")} ${s.label}`}
                  className={`flex flex-1 items-center justify-center gap-1.5 font-koi-mono text-[11px] font-semibold uppercase tracking-[0.1em] transition-colors md:text-xs md:tracking-[0.12em] ${i <= index ? "text-koi-lime" : "text-koi-muted hover:text-koi-forest"}`}
                >
                  <span>{String(i + 1).padStart(2, "0")}</span>
                  <span className={i === index ? "max-sm:hidden" : "max-md:hidden"}>{s.label}</span>
                </button>
              </li>
            ))}
            <li data-fill aria-hidden="true" className="absolute inset-y-0 left-0 z-0 w-0 bg-koi-forest" />
          </ol>
          <div data-playhead aria-hidden="true" className="absolute -top-1.5 left-0 z-20 -ml-px h-14 w-0.5 rounded-sm bg-koi-ember">
            <span className="absolute -left-[5px] -top-1 h-2 w-3 rounded-[2px] bg-koi-ember" />
          </div>
        </nav>

        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-label={`Household: ${profiles.length} ${profiles.length === 1 ? "person" : "people"}`}
          className="flex h-11 shrink-0 items-center gap-2 rounded-full px-1.5 text-[13px] font-semibold text-koi-primary transition-colors hover:bg-white md:pr-3.5"
        >
          <span className="flex -space-x-2" aria-hidden="true">
            {profiles.slice(0, 4).map((p) => (
              <span key={keyOf(p)} className={`grid size-8 place-items-center rounded-full border-2 border-koi-bg font-koi-num text-[10px] font-bold text-white ${glowing("member", p.label) ? "koi-glow" : ""}`} style={{ background: colourOf(p) }}>{initialsOf(p.label)}</span>
            ))}
          </span>
          <span className="max-md:hidden">Household</span>
          {needsDetails && <span aria-hidden="true" className="size-[7px] rounded-full bg-koi-warm" />}
        </button>
      </div>

      {open && (
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-2 px-[clamp(16px,4vw,52px)] pb-3">
          {profiles.map((p) => {
            const on = keyOf(p) === keyOf(active ?? {});
            const status = saveState[keyOf(p)]?.state;
            return (
              <button
                key={keyOf(p)}
                type="button"
                onClick={() => onActive(keyOf(p))}
                aria-pressed={on}
                className={`flex shrink-0 items-center gap-2 rounded-full border py-1 pl-1.5 pr-3 transition-colors ${on ? "border-koi-forest bg-white shadow-[0_1px_3px_rgba(20,22,15,.08)]" : "border-koi-forest/10 bg-white/55 hover:bg-white"} ${glowing("member", p.label) ? "koi-glow" : ""}`}
              >
                <span className="grid size-7 place-items-center rounded-full font-koi-num text-[10px] font-bold text-white" style={{ background: colourOf(p) }}>{initialsOf(p.label)}</span>
                <span className="text-left leading-tight">
                  <span className={`block text-xs font-semibold ${on ? "text-koi-ink" : "text-koi-ink2"}`}>{p.label || "New member"}</span>
                  <span className={`block font-koi-mono text-[10px] font-medium ${status === "incomplete" || !p.memberId ? "text-koi-warm" : "text-koi-ink2"}`}>
                    {!p.memberId ? (status === "saving" ? "saving…" : "needs details") : `${goalShortLabel(p)} · ${p.target_kcal ? `${inr(p.target_kcal)} kcal` : p.target_protein_g ? `${p.target_protein_g} g protein` : "no target"}`}
                  </span>
                </span>
              </button>
            );
          })}
          <div className="flex shrink-0 items-center gap-1.5 rounded-full border border-dashed border-koi-forest/25 bg-white py-1 pl-3 pr-1.5">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") commit(); }}
              placeholder="Add member…"
              aria-label="Add a member"
              maxLength={40}
              className="w-24 border-0 bg-transparent text-xs font-medium text-koi-ink outline-none"
            />
            <button type="button" onClick={commit} aria-label="Add member" className="grid size-7 place-items-center rounded-full bg-koi-tint text-[15px] font-semibold text-koi-primary">+</button>
          </div>
          <Link href="/store/household" className="ml-1 whitespace-nowrap text-xs font-semibold text-koi-green no-underline hover:underline">Household settings</Link>
        </div>
      )}
    </div>
  );
}
