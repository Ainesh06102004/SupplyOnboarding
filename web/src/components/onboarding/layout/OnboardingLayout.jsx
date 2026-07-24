"use client";

// ============================================================================
// KOI ONBOARDING — Premium split layout
// A confident, editorial frame for the brand application. Left: a sticky,
// dark editorial panel with a vertical progress timeline + reassurance. Right:
// the current step's form. Presentation only — steps keep all their own logic.
// ============================================================================

import React from "react";
import { motion } from "framer-motion";
import {
  Building2, Package, ShieldCheck, FileText, Check, Clock, Cpu, UserCheck,
  Loader2, CheckCircle2,
} from "lucide-react";

const C = {
  forest: "#0E4032",
  deep: "#0A2E24",
  bg: "#F2F6EC",
  panelRight: "#F7FAF2",
  border: "#E2E8D8",
  muted: "#5A6B5A",
  lime: "#C8F23E",
};

const NODES = [
  { n: 1, label: "Company details", hint: "Brand & business", icon: Building2 },
  { n: 2, label: "Product portfolio", hint: "Your range", icon: Package },
  { n: 3, label: "Compliance", hint: "Certifications", icon: ShieldCheck },
  { n: 4, label: "Review & submit", hint: "Final check", icon: FileText },
];

const WHAT_NEXT = [
  { icon: Cpu, text: "AI verification of your brand & product claims" },
  { icon: UserCheck, text: "Expert review by the KOI health team" },
];

function SaveIndicator({ status }) {
  if (status === "saving") return <span className="flex items-center gap-1.5 text-[12px] font-semibold text-[#5A6B5A]"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…</span>;
  if (status === "saved") return <span className="flex items-center gap-1.5 text-[12px] font-semibold text-[#2D7A5E]"><CheckCircle2 className="h-3.5 w-3.5" /> Saved</span>;
  if (status === "error") return <span className="text-[12px] font-semibold text-[#C94B40]">Save failed</span>;
  return null;
}

function Timeline({ step }) {
  return (
    <ol className="relative space-y-1">
      {NODES.map((node, i) => {
        const Icon = node.icon;
        const done = step > node.n;
        const active = step === node.n;
        return (
          <motion.li
            key={node.n}
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.4, delay: 0.08 * i }}
            className="flex gap-4"
          >
            <div className="flex flex-col items-center">
              <span
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full transition-all duration-300"
                style={{
                  background: done ? C.lime : active ? "rgba(200,242,62,0.14)" : "rgba(255,255,255,0.06)",
                  border: active ? `1.5px solid ${C.lime}` : "1.5px solid transparent",
                }}
              >
                {done ? <Check className="h-4 w-4" style={{ color: C.forest }} strokeWidth={3} /> : <Icon className="h-4 w-4" style={{ color: active ? C.lime : "rgba(255,255,255,0.45)" }} strokeWidth={2} />}
              </span>
              {i < NODES.length - 1 && (
                <span className="my-1 w-px flex-1 min-h-[26px]" style={{ background: done ? C.lime : "rgba(255,255,255,0.12)" }} />
              )}
            </div>
            <div className="pb-4">
              <div className="text-[14px] font-bold" style={{ color: done || active ? "#fff" : "rgba(255,255,255,0.5)", fontFamily: "var(--font-koi-heading)" }}>
                {node.label}
              </div>
              <div className="mt-0.5 text-[12px]" style={{ color: active ? "rgba(200,242,62,0.9)" : "rgba(255,255,255,0.4)" }}>
                {active ? "In progress" : node.hint}
              </div>
            </div>
          </motion.li>
        );
      })}
    </ol>
  );
}

/**
 * @param {number} step  1-based current step (drives the timeline)
 * @param {string} title / subtitle  header copy for the right column
 * @param {string} saveStatus  idle | saving | saved | error
 * @param {ReactNode} children  the step's <main> + <StepActionBar>
 */
export default function OnboardingLayout({ step = 1, title, subtitle, saveStatus = "idle", children }) {
  const pct = Math.round((step / NODES.length) * 100);

  return (
    <div className="min-h-screen lg:flex" style={{ background: C.bg, fontFamily: "var(--font-koi-body), sans-serif", color: C.forest }}>
      {/* ── Left editorial panel ── */}
      <aside className="relative hidden overflow-hidden lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-[38%] lg:flex-col lg:justify-between lg:p-11 xl:p-14" style={{ background: C.forest }}>
        <div className="pointer-events-none absolute inset-0 opacity-[0.10]" style={{ backgroundImage: "radial-gradient(circle at 2px 2px, #fff 1px, transparent 0)", backgroundSize: "34px 34px" }} />
        <div className="pointer-events-none absolute -right-20 top-1/3 h-72 w-72 rounded-full" style={{ background: "#16A06E", opacity: 0.3, filter: "blur(90px)" }} />

        {/* top */}
        <div className="relative">
          <div className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-xl text-[15px] font-extrabold text-[#0E4032]" style={{ background: C.lime, fontFamily: "var(--font-koi-heading)" }}>K</span>
            <span className="text-[19px] font-bold text-white" style={{ fontFamily: "var(--font-koi-heading)" }}>KOI</span>
            <span className="ml-1 rounded-full border border-white/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-white/70">For Brands</span>
          </div>
          <h2 className="mt-9 text-[30px] font-bold leading-[1.05] tracking-tight text-white xl:text-[34px]" style={{ fontFamily: "var(--font-koi-heading)" }}>
            Become a<br />verified brand.
          </h2>
        </div>

        {/* timeline */}
        <div className="relative my-8">
          <Timeline step={step} />
        </div>

        {/* bottom reassurance */}
        <div className="relative space-y-5">
          <div className="flex items-center gap-2.5 text-[13px] font-semibold text-white/70">
            <Clock className="h-4 w-4" style={{ color: C.lime }} /> Around 10–15 minutes · saved as you go
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-4">
            <div className="mb-3 text-[10px] font-bold uppercase tracking-[0.16em] text-white/40">What happens next</div>
            <ul className="space-y-2.5">
              {WHAT_NEXT.map(({ icon: Icon, text }) => (
                <li key={text} className="flex items-start gap-2.5 text-[12.5px] font-medium leading-snug text-white/70">
                  <Icon className="mt-0.5 h-4 w-4 shrink-0" style={{ color: C.lime }} /> {text}
                </li>
              ))}
            </ul>
          </div>
          <p className="text-[11px] font-medium italic text-white/35">“We curate for trust, not volume.”</p>
        </div>
      </aside>

      {/* ── Right form column ── */}
      <div className="flex min-h-screen flex-1 flex-col" style={{ background: C.panelRight }}>
        {/* mobile progress bar */}
        <div className="sticky top-0 z-20 border-b border-[#E2E8D8] bg-white/85 px-5 py-3 backdrop-blur-md lg:hidden">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#5A6B5A]">Step {step} of {NODES.length}</span>
            <SaveIndicator status={saveStatus} />
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[#E2E8D8]">
            <div className="h-full rounded-full bg-[#0E4032] transition-all duration-500" style={{ width: `${pct}%` }} />
          </div>
        </div>

        {/* header */}
        <motion.header
          key={title}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="px-6 pb-2 pt-7 md:px-10 md:pt-10"
        >
          <div className="mx-auto flex max-w-[1100px] items-start justify-between gap-4">
            <div>
              <div className="mb-2 hidden text-[11px] font-bold uppercase tracking-[0.16em] text-[#16A06E] lg:block">
                Step {step} of {NODES.length} · {NODES[step - 1]?.label || "Application"}
              </div>
              <h1 className="text-[28px] font-bold leading-tight tracking-tight text-[#0E4032] md:text-[34px]" style={{ fontFamily: "var(--font-koi-heading)" }}>
                {title}
              </h1>
              {subtitle && <p className="mt-1.5 max-w-xl text-[14px] leading-relaxed text-[#5A6B5A]">{subtitle}</p>}
            </div>
            <div className="hidden shrink-0 pt-1 lg:block"><SaveIndicator status={saveStatus} /></div>
          </div>
        </motion.header>

        {children}
      </div>
    </div>
  );
}
