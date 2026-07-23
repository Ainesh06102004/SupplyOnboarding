"use client";

// ============================================================================
// KOI PRODUCT - The story
// Editorial sections that build confidence from top to bottom:
// Why it earned its place · The Verdict · Ingredient Intelligence ·
// Nutrition Explained · Health Comparison · Who it's for · How to use ·
// Scientific Insights · Transparency · Community · Related.
// ============================================================================

import React, { useEffect, useRef, useState } from "react";
import {
  Check, AlertTriangle, Info, Quote, Star, ChevronDown,
  Dumbbell, Flame, Baby, Heart, Sparkles, Briefcase, Plane, Activity, Leaf, Ban,
  FlaskConical, Clock, Coffee, ArrowUpRight,
} from "lucide-react";
import { C, HEADING, BODY } from "@/components/store/landing/tokens";
import { Reveal, Eyebrow } from "@/components/store/landing/primitives";
import ShopProductCard from "@/components/store/shop/ShopProductCard";

const PERSONA_ICONS = { Dumbbell, Flame, Baby, Heart, Sparkles, Briefcase, Plane, Activity, Leaf, Ban };

// Animated grow bar (fills on scroll into view).
function GrowBar({ pct, color = C.emerald, track = "#0000000f", height = 8, delay = 0 }) {
  const ref = useRef(null);
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return setOn(true);
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && (setOn(true), io.disconnect()), { threshold: 0.5 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} className="w-full overflow-hidden rounded-full" style={{ background: track, height }}>
      <div style={{ width: on ? `${pct}%` : "0%", height: "100%", background: color, borderRadius: 999, transition: `width 1.1s cubic-bezier(0.16,1,0.3,1) ${delay}ms` }} />
    </div>
  );
}

// Section shell for consistent editorial rhythm.
function Section({ id, index, eyebrow, title, subtitle, children, background = C.offwhite, dark = false }) {
  return (
    <section id={id} className="relative scroll-mt-20" style={{ background }}>
      <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6 lg:py-20">
        <Reveal>
          {eyebrow && <Eyebrow index={index} color={dark ? C.lime : C.emerald}>{dark ? <span className="text-white/70">{eyebrow}</span> : eyebrow}</Eyebrow>}
          {title && (
            <h2 className="mt-5 font-extrabold uppercase leading-[0.95] tracking-[-0.02em]" style={{ ...HEADING, color: dark ? "#fff" : C.forest, fontSize: "clamp(1.9rem, 4vw, 3rem)" }}>
              {title}
            </h2>
          )}
          {subtitle && <p className="mt-3 max-w-xl text-[15px] leading-relaxed" style={{ ...BODY, color: dark ? "rgba(255,255,255,0.6)" : "rgba(16,20,18,0.6)" }}>{subtitle}</p>}
        </Reveal>
        <div className="mt-10">{children}</div>
      </div>
    </section>
  );
}

const tone = { good: { fg: C.emerald, bg: "#EAF8F0" }, mid: { fg: "#9A7B10", bg: "#FBF6E3" }, warn: { fg: C.orange, bg: "#FDEDE2" } };

// ── 1. Why it earned its place ──────────────────────────────────────────────
export function WhyEarned({ reasons }) {
  const [open, setOpen] = useState(0);
  return (
    <Section id="why" index="01" eyebrow="Why KOI selected this" title="Why it earned its place" subtitle="Nothing gets listed by default. Here's exactly what tipped the balance - and where to stay mindful.">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {reasons.map((r, i) => {
          const isCon = r.type === "con";
          const t = isCon ? tone.warn : tone.good;
          const isOpen = open === i;
          return (
            <Reveal key={i} delay={(i % 2) * 60}>
              <button
                onClick={() => setOpen(isOpen ? -1 : i)}
                className="flex w-full flex-col rounded-3xl border border-[#083D2D]/8 bg-white p-5 text-left transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_18px_40px_rgba(8,61,45,0.08)]"
              >
                <div className="flex items-center gap-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full" style={{ background: t.bg }}>
                    {isCon ? <AlertTriangle className="h-4 w-4" style={{ color: t.fg }} /> : <Check className="h-4 w-4" style={{ color: t.fg }} strokeWidth={3} />}
                  </span>
                  <span className="flex-1 text-[15px] font-bold text-[#083D2D]" style={HEADING}>{r.title}</span>
                  <ChevronDown className="h-4 w-4 text-[#083D2D]/40 transition-transform duration-300" style={{ transform: isOpen ? "rotate(180deg)" : "none" }} />
                </div>
                <div className="grid transition-all duration-300" style={{ gridTemplateRows: isOpen ? "1fr" : "0fr" }}>
                  <div className="overflow-hidden">
                    <p className="pt-3 text-[13.5px] leading-relaxed text-[#101412]/60" style={BODY}>{r.detail}</p>
                  </div>
                </div>
              </button>
            </Reveal>
          );
        })}
      </div>
    </Section>
  );
}

// ── 2. The KOI Verdict ──────────────────────────────────────────────────────
export function Verdict({ verdict }) {
  return (
    <Section id="verdict" index="02" eyebrow="The KOI verdict" background={C.cream}>
      <figure className="max-w-3xl">
        <Quote className="h-10 w-10" style={{ color: C.emerald }} fill={C.emerald} />
        <blockquote className="mt-4 font-bold leading-[1.15] tracking-[-0.01em] text-[#083D2D]" style={{ ...HEADING, fontSize: "clamp(1.7rem, 3.6vw, 2.9rem)" }}>
          {verdict.quote}
        </blockquote>
        <div className="mt-9 max-w-sm">
          <div className="mb-2 flex items-baseline justify-between">
            <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#083D2D]/50">Confidence</span>
            <span className="text-[13px] font-bold text-[#083D2D]" style={HEADING}>{verdict.confidence}/100</span>
          </div>
          <GrowBar pct={verdict.confidence} color={C.forest} track="#083D2D14" />
        </div>
        <figcaption className="mt-7 flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#083D2D]/40">Reviewed against</span>
          {verdict.refs.map((r) => (
            <span key={r} className="rounded-full border border-[#083D2D]/12 bg-white px-3 py-1 text-[11.5px] font-semibold text-[#083D2D]/70">{r}</span>
          ))}
        </figcaption>
      </figure>
    </Section>
  );
}

// ── 3. Ingredient Intelligence ──────────────────────────────────────────────
export function IngredientIntelligence({ ingredients, timeline }) {
  const [sel, setSel] = useState(0);
  const active = ingredients[sel] || ingredients[0];
  return (
    <Section id="ingredients" index="03" eyebrow="Ingredient intelligence" title="What's actually inside" subtitle="Tap an ingredient to see why it's here and what it does.">
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_0.9fr] lg:gap-12">
        <div className="flex flex-wrap gap-2.5 self-start">
          {ingredients.map((ing, i) => {
            const on = sel === i;
            return (
              <button
                key={ing.name}
                onClick={() => setSel(i)}
                className="rounded-full border px-4 py-2.5 text-[14px] font-bold transition-all duration-200"
                style={{ background: on ? C.forest : "#fff", color: on ? "#fff" : C.forest, borderColor: on ? C.forest : "rgba(8,61,45,0.14)" }}
              >
                {ing.name}
              </button>
            );
          })}
        </div>

        {active && (
          <Reveal key={active.name}>
            <div className="rounded-[24px] border border-[#083D2D]/8 bg-white p-6 sm:p-7">
              <span className="inline-flex items-center gap-2 rounded-full bg-[#EAF8F0] px-3 py-1 text-[11px] font-bold uppercase tracking-[0.1em] text-[#0C6B4C]">
                <Leaf className="h-3.5 w-3.5" /> {active.role}
              </span>
              <h3 className="mt-4 text-[24px] font-extrabold text-[#083D2D]" style={HEADING}>{active.name}</h3>
              <p className="mt-3 text-[15px] leading-relaxed text-[#101412]/65" style={BODY}>{active.detail}</p>
            </div>
          </Reveal>
        )}
      </div>

      {/* quality timeline */}
      <div className="mt-12">
        <div className="mb-5 text-[11px] font-bold uppercase tracking-[0.16em] text-[#083D2D]/40">Ingredient quality, step by step</div>
        <div className="hide-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          {timeline.map((step, i) => (
            <div key={i} className="flex items-center gap-3 shrink-0">
              <div className="w-[150px] rounded-2xl border border-[#083D2D]/8 bg-white p-4">
                <span className="text-[11px] font-bold tabular-nums text-[#16A06E]">0{i + 1}</span>
                <div className="mt-2 text-[14px] font-bold leading-tight text-[#083D2D]" style={HEADING}>{step.label}</div>
                <div className="mt-1 text-[11.5px] font-medium text-[#083D2D]/50">{step.sub}</div>
              </div>
              {i < timeline.length - 1 && <ArrowUpRight className="h-4 w-4 shrink-0 rotate-45 text-[#083D2D]/25" />}
            </div>
          ))}
        </div>
      </div>
    </Section>
  );
}

// ── 4. Nutrition, explained ─────────────────────────────────────────────────
function SegmentMeter({ fill, toneKey }) {
  const total = 8;
  const filled = Math.max(1, Math.round(fill * total));
  const color = toneKey === "warn" ? C.orange : toneKey === "mid" ? "#C9A227" : C.emerald;
  return (
    <div className="flex gap-1">
      {Array.from({ length: total }).map((_, i) => (
        <span key={i} className="h-4 flex-1 rounded-[3px]" style={{ background: i < filled ? color : "#0000000d" }} />
      ))}
    </div>
  );
}

export function NutritionExplained({ nutrition }) {
  return (
    <Section id="nutrition" index="04" eyebrow="Nutrition explained" title="The numbers, in plain English" subtitle="Not a nutrition panel - what each number actually means for you.">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {nutrition.meters.map((m, i) => (
          <Reveal key={m.key} delay={(i % 2) * 60}>
            <div className="h-full rounded-[22px] border border-[#083D2D]/8 bg-white p-6">
              <div className="flex items-baseline justify-between">
                <span className="text-[13px] font-bold uppercase tracking-[0.12em] text-[#083D2D]/60">{m.label}</span>
                <span className="flex items-baseline gap-1">
                  <span className="text-[15px] font-extrabold" style={{ ...HEADING, color: tone[m.tone]?.fg || C.emerald }}>{m.rating}</span>
                  {m.value != null && <span className="text-[12px] font-semibold text-[#083D2D]/45">· {m.value}{m.unit}</span>}
                </span>
              </div>
              <div className="my-4"><SegmentMeter fill={m.fill} toneKey={m.tone} /></div>
              <p className="text-[13px] leading-relaxed text-[#101412]/60" style={BODY}>{m.context}</p>
            </div>
          </Reveal>
        ))}
      </div>
      {nutrition.calories > 0 && (
        <p className="mt-6 text-[13px] font-medium text-[#083D2D]/50" style={BODY}>
          Around <span className="font-bold text-[#083D2D]">{nutrition.calories} kcal</span> per serving - a context number, not the headline. What&apos;s in those calories matters more than the count.
        </p>
      )}
    </Section>
  );
}

// ── 5. Health comparison ────────────────────────────────────────────────────
export function HealthComparison({ comparison, name }) {
  return (
    <Section id="compare" index="05" eyebrow="Health comparison" title="How it stacks up" subtitle={`${name} versus the category average.`} background={C.mint}>
      <div className="space-y-8">
        {comparison.map((c, i) => {
          const max = Math.max(c.product, c.market, 1);
          const wins = c.better === "high" ? c.product >= c.market : c.product <= c.market;
          return (
            <Reveal key={c.label} delay={i * 60}>
              <div>
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-[15px] font-bold text-[#083D2D]" style={HEADING}>{c.label}</span>
                  <span className="text-[11px] font-bold uppercase tracking-[0.1em]" style={{ color: wins ? C.emerald : "#9A7B10" }}>
                    {wins ? "Better than average" : "Around average"}
                  </span>
                </div>
                <div className="space-y-2.5">
                  <div className="flex items-center gap-3">
                    <span className="w-24 shrink-0 text-[12px] font-bold text-[#083D2D]">This product</span>
                    <div className="flex-1"><GrowBar pct={(c.product / max) * 100} color={C.forest} track="#083D2D12" height={10} /></div>
                    <span className="w-12 shrink-0 text-right text-[12px] font-bold text-[#083D2D]" style={HEADING}>{c.product}{c.unit}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="w-24 shrink-0 text-[12px] font-semibold text-[#083D2D]/50">Category avg</span>
                    <div className="flex-1"><GrowBar pct={(c.market / max) * 100} color="#083D2D40" track="#083D2D12" height={10} delay={120} /></div>
                    <span className="w-12 shrink-0 text-right text-[12px] font-semibold text-[#083D2D]/50" style={HEADING}>{c.market}{c.unit}</span>
                  </div>
                </div>
              </div>
            </Reveal>
          );
        })}
      </div>
    </Section>
  );
}

// ── 6. Who it's for ─────────────────────────────────────────────────────────
export function Personas({ personas }) {
  return (
    <Section id="who" index="06" eyebrow="Who it's for" title="Is this for you?" subtitle="Honest fit - including where it isn't the right pick.">
      <div className="grid grid-cols-1 gap-5 md:grid-cols-[1.3fr_1fr]">
        <div className="rounded-[24px] border border-[#083D2D]/8 bg-white p-6 sm:p-8">
          <div className="mb-5 text-[11px] font-bold uppercase tracking-[0.16em] text-[#0C6B4C]">Great for</div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {personas.for.map((x, i) => {
              const Icon = PERSONA_ICONS[x.icon] || Leaf;
              return (
                <Reveal key={x.label} delay={i * 50}>
                  <div className="flex flex-col items-start gap-3 rounded-2xl bg-[#F9F8F4] p-4">
                    <span className="grid h-10 w-10 place-items-center rounded-xl" style={{ background: C.mint }}>
                      <Icon className="h-5 w-5" style={{ color: C.emerald }} strokeWidth={2.2} />
                    </span>
                    <span className="text-[13px] font-bold leading-tight text-[#083D2D]" style={HEADING}>{x.label}</span>
                  </div>
                </Reveal>
              );
            })}
          </div>
        </div>

        <div className="rounded-[24px] border border-[#F36A1D]/20 bg-[#FDEDE2]/50 p-6 sm:p-8">
          <div className="mb-5 text-[11px] font-bold uppercase tracking-[0.16em] text-[#F36A1D]">Maybe not for</div>
          <ul className="space-y-3">
            {personas.not.map((x) => (
              <li key={x.label} className="flex items-center gap-3 text-[14px] font-semibold text-[#083D2D]/75">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-[#F36A1D]/25">
                  <Ban className="h-3.5 w-3.5" style={{ color: C.orange }} />
                </span>
                {x.label}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Section>
  );
}

// ── 7. How to use ───────────────────────────────────────────────────────────
export function UsageTimeline({ usage, pairings }) {
  return (
    <Section id="usage" index="07" eyebrow="How to use it" title="Works best when…" background={C.cream}>
      <div className="hide-scrollbar -mx-4 flex gap-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
        {usage.map((u, i) => (
          <Reveal key={i} delay={i * 50}>
            <div className="relative w-[210px] shrink-0 rounded-3xl border border-[#083D2D]/8 bg-white p-5">
              <div className="flex items-center gap-2">
                <span className="grid h-8 w-8 place-items-center rounded-full" style={{ background: C.mint }}>
                  <Clock className="h-4 w-4" style={{ color: C.emerald }} />
                </span>
                <span className="text-[13px] font-extrabold uppercase tracking-[0.06em] text-[#083D2D]" style={HEADING}>{u.time}</span>
              </div>
              <p className="mt-3 text-[13px] leading-relaxed text-[#101412]/60" style={BODY}>{u.note}</p>
            </div>
          </Reveal>
        ))}
      </div>

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <span className="inline-flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.12em] text-[#083D2D]/45">
          <Coffee className="h-4 w-4" /> Pairs well with
        </span>
        {pairings.map((p) => (
          <span key={p} className="rounded-full border border-[#083D2D]/12 bg-white px-3.5 py-1.5 text-[13px] font-bold text-[#083D2D]">{p}</span>
        ))}
      </div>
    </Section>
  );
}

// ── 8. Scientific insights ──────────────────────────────────────────────────
export function ScientificInsights({ science }) {
  return (
    <Section id="science" index="08" eyebrow="Scientific insights" title="The reasoning, not the jargon" background={C.forest} dark>
      <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
        {science.map((s, i) => (
          <Reveal key={i} delay={i * 70}>
            <div className="h-full rounded-3xl border border-white/10 bg-white/[0.04] p-6">
              <span className="grid h-10 w-10 place-items-center rounded-xl" style={{ background: "rgba(221,242,71,0.14)" }}>
                <FlaskConical className="h-5 w-5" style={{ color: C.lime }} />
              </span>
              <h3 className="mt-4 text-[16px] font-bold leading-snug text-white" style={HEADING}>{s.title}</h3>
              <p className="mt-2.5 text-[13.5px] leading-relaxed text-white/60" style={BODY}>{s.body}</p>
            </div>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}

// ── 9. Transparency ─────────────────────────────────────────────────────────
const STATUS = {
  pass: { icon: Check, fg: C.emerald, bg: "#EAF8F0", word: "Clear" },
  limited: { icon: Info, fg: "#9A7B10", bg: "#FBF6E3", word: "Limited" },
  none: { icon: Ban, fg: C.orange, bg: "#FDEDE2", word: "Present" },
};

export function Transparency({ items }) {
  const [open, setOpen] = useState(-1);
  return (
    <Section id="transparency" index="09" eyebrow="Full transparency" title="Everything we checked" subtitle="The exact checklist KOI runs on every product - tap any line for the detail.">
      <div className="overflow-hidden rounded-[24px] border border-[#083D2D]/8 bg-white">
        {items.map((it, i) => {
          const s = STATUS[it.status] || STATUS.limited;
          const Icon = s.icon;
          const isOpen = open === i;
          return (
            <div key={it.label} className="border-b border-[#083D2D]/8 last:border-b-0">
              <button onClick={() => setOpen(isOpen ? -1 : i)} className="flex w-full items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-[#F9F8F4] sm:px-6">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full" style={{ background: s.bg }}>
                  <Icon className="h-4 w-4" style={{ color: s.fg }} strokeWidth={2.6} />
                </span>
                <span className="flex-1 text-[14.5px] font-bold text-[#083D2D]" style={HEADING}>{it.label}</span>
                <span className="hidden text-[11px] font-bold uppercase tracking-[0.1em] sm:block" style={{ color: s.fg }}>{s.word}</span>
                <ChevronDown className="h-4 w-4 text-[#083D2D]/35 transition-transform duration-300" style={{ transform: isOpen ? "rotate(180deg)" : "none" }} />
              </button>
              <div className="grid transition-all duration-300" style={{ gridTemplateRows: isOpen ? "1fr" : "0fr" }}>
                <div className="overflow-hidden">
                  <p className="px-5 pb-4 pl-[68px] text-[13px] leading-relaxed text-[#101412]/60 sm:px-6 sm:pl-[76px]" style={BODY}>{it.note}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Section>
  );
}

// ── 10. Community ───────────────────────────────────────────────────────────
export function Community({ community }) {
  return (
    <Section id="community" index="10" eyebrow="Community notes" title="What buyers actually say" background={C.cream}>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_0.8fr]">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {community.notes.map((n, i) => (
            <Reveal key={i} delay={i * 60}>
              <figure className="flex h-full flex-col rounded-3xl border border-[#083D2D]/8 bg-white p-6">
                <div className="mb-3 flex">
                  {Array.from({ length: 5 }).map((_, j) => (
                    <Star key={j} className="h-3.5 w-3.5" style={{ color: C.orange }} fill={j < n.rating ? C.orange : "none"} />
                  ))}
                </div>
                <blockquote className="flex-1 text-[15px] font-semibold leading-snug text-[#083D2D]" style={HEADING}>“{n.text}”</blockquote>
                <figcaption className="mt-4 flex items-center gap-2.5">
                  <span className="grid h-8 w-8 place-items-center rounded-full text-[12px] font-extrabold text-[#083D2D]" style={{ background: C.mint, ...HEADING }}>{n.name[0]}</span>
                  <span className="text-[12.5px] font-bold text-[#083D2D]">{n.name}</span>
                  <span className="rounded-full bg-[#F9F8F4] px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide text-[#083D2D]/55">{n.tag}</span>
                </figcaption>
              </figure>
            </Reveal>
          ))}
        </div>

        <Reveal delay={80}>
          <div className="flex h-full flex-col justify-center rounded-3xl p-7" style={{ background: C.forest }}>
            <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#DDF247]">Nutritionist note</span>
            <p className="mt-4 text-[16px] leading-relaxed text-white/85" style={BODY}>{community.nutritionist.text}</p>
          </div>
        </Reveal>
      </div>
    </Section>
  );
}

// ── 11. Related ─────────────────────────────────────────────────────────────
export function RelatedShelf({ products, onSelect }) {
  if (!products?.length) return null;
  return (
    <Section id="related" index="11" eyebrow="Keep exploring" title="If this matches your goals" subtitle="More products that cleared the same standard.">
      <div className="hide-scrollbar -mx-4 flex gap-4 overflow-x-auto px-4 pb-4 sm:mx-0 sm:px-0">
        {products.map((p) => (
          <div key={p.id} className="w-[240px] shrink-0 sm:w-[270px]">
            <ShopProductCard product={p} onSelect={onSelect} className="h-full" />
          </div>
        ))}
      </div>
    </Section>
  );
}
