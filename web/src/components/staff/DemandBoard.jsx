"use client";

// The two demand tables from the StaffDemand board, side by side on night:
// each term's searches drawn as a bar against the busiest term in its table,
// sortable by searches or by when it was last seen. Rows arrive with their
// dates already formatted on the server (no locale drift on hydration).

import { useMemo, useRef, useState } from "react";
import { setupMotion, prefersReducedMotion, useGSAP, Flip, E } from "@/lib/motion/koiMotion";

const SORTS = [
  { key: "searches", label: "Most searched" },
  { key: "recent", label: "Most recent" },
];

export default function DemandBoard({ sections, terms, publishAt }) {
  const [sort, setSort] = useState("searches");
  const root = useRef(null);
  const flip = useRef(null);

  const sorted = useMemo(() => {
    const list = [...terms];
    if (sort === "recent") list.sort((a, b) => (b.last_seen || "").localeCompare(a.last_seen || ""));
    else list.sort((a, b) => b.occurrences - a.occurrences);
    return list;
  }, [terms, sort]);

  const pick = (key) => {
    if (root.current && !prefersReducedMotion()) flip.current = Flip.getState(root.current.querySelectorAll("[data-term]"));
    setSort(key);
  };

  useGSAP(() => {
    const state = flip.current;
    flip.current = null;
    if (!state) return;
    Flip.from(state, { targets: root.current.querySelectorAll("[data-term]"), duration: 0.55, ease: E.reveal });
  }, { scope: root, dependencies: [sort] });

  useGSAP(() => {
    const gsap = setupMotion();
    const reduced = prefersReducedMotion();
    root.current.querySelectorAll("[data-demand-bar]").forEach((bar, i) => {
      gsap.fromTo(bar, { width: 0 }, { width: `${bar.dataset.w}%`, duration: reduced ? 0 : 1, delay: reduced ? 0 : 0.35 + i * 0.03, ease: E.dolly });
    });
  }, { scope: root });

  return (
    <div ref={root}>
      <div className="flex justify-end px-5 md:px-8">
        <div role="group" aria-label="Sort" className="flex gap-1 rounded-full bg-white/5 p-1">
          {SORTS.map((o) => (
            <button key={o.key} type="button" aria-pressed={sort === o.key} onClick={() => pick(o.key)}
              className={`h-9 rounded-full px-3.5 text-[12.5px] font-semibold transition-colors ${sort === o.key ? "bg-koi-lime text-koi-forest" : "text-koi-bg/70 hover:text-koi-bg"}`}>
              {o.label}
            </button>
          ))}
        </div>
      </div>
      <div className="relative z-10 grid grid-cols-1 gap-5 px-5 py-6 md:px-8 xl:grid-cols-2">
        {sections.map((section) => {
          const rows = sorted.filter((t) => t.kind === section.kind);
          const max = Math.max(1, ...rows.map((r) => r.occurrences));
          return (
            <section key={section.kind} data-section className="flex flex-col gap-3 rounded-[26px] bg-white/5 p-5 md:p-6">
              <span className="flex flex-col gap-1">
                <span className="font-koi-display text-[26px] font-extrabold tracking-[-0.01em]">{section.title}</span>
                <span className="text-[13.5px] text-koi-bg/65">{section.blurb}</span>
              </span>
              {rows.length === 0 ? (
                <p className="m-0 rounded-2xl border border-dashed border-koi-bg/15 px-4 py-6 text-[14px] text-koi-bg/60">Nothing has reached {publishAt} searches yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[520px] border-collapse text-left text-[14px]">
                    <thead>
                      <tr className="whitespace-nowrap border-b border-koi-bg/10 font-koi-mono text-[10.5px] uppercase tracking-[0.12em] text-koi-bg/55">
                        <th scope="col" className="py-2.5 font-medium">Term</th>
                        <th scope="col" className="py-2.5 font-medium">Searches</th>
                        <th scope="col" className="py-2.5 font-medium">First seen</th>
                        <th scope="col" className="py-2.5 font-medium">Last seen</th>
                        <th scope="col" className="py-2.5"><span className="sr-only">Status</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => (
                        <tr key={row.term} data-term={row.term} data-flip-id={`${section.kind}-${row.term}`} className="border-b border-koi-bg/10 last:border-b-0">
                          <td className="py-3 pr-3">
                            <span className="font-semibold">{row.term}</span>
                            {row.makers?.length > 0 && (
                              <span className="mt-0.5 block text-[12px] text-koi-bg/55">Made in India by {row.makers.map((m) => `${m.brand} (${m.products})`).join(", ")}</span>
                            )}
                          </td>
                          <td className="w-[34%] py-3 pr-3">
                            <span className="flex items-center gap-2.5">
                              <span className="font-koi-num text-[15px] font-semibold">{row.occurrences}</span>
                              <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-koi-bg/10">
                                <span data-demand-bar data-w={Math.round((row.occurrences / max) * 100)} className={`block h-full w-0 rounded-full ${row.answeredNow ? "bg-koi-mint" : "bg-koi-lime"}`} />
                              </span>
                            </span>
                          </td>
                          <td className="py-3 font-koi-num text-koi-bg/65">{row.firstLabel}</td>
                          <td className="py-3 font-koi-num text-koi-bg/65">{row.lastLabel}</td>
                          <td className="py-3 text-right">
                            {row.answeredNow && <span className="whitespace-nowrap rounded-full bg-koi-lime px-2.5 py-0.5 text-[11.5px] font-bold text-koi-forest">{section.answered}</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
