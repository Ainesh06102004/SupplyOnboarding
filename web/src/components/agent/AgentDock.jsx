"use client";
// ============================================================================
// KOI Agent Mode: the glass dock, on every store page.
//
// Collapsed: a composer pill, bottom centre, breathing green while KOI works
// and warm when it needs the shopper. Expanded: the conversation — the run's
// checklist, the shopper's messages, KOI's lines, each tool with its streaming
// lines, the questions and approvals, the results — in a glass sheet beside
// the page (a bottom sheet on phones), so the page stays the proof.
//
// A long conversation plays as Commentary instead (Commentary board): the
// lights go down on the page and the talk reads as a screenplay. It is the
// same conversation in a second view; "Lights down" / "Side panel" switch.
// ============================================================================

import { useEffect, useMemo, useRef, useState } from "react";
import { upcomingFasts, dayLabel } from "@/lib/calendar/festivals";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useCartUi } from "@/store/cartUiStore";
import { useAgent } from "./AgentProvider";
import { TaskChecklist, ToolCard, AskCard, ApprovalCard, ResultCard } from "./cards";
import Commentary from "./Commentary";
import { EmberSlot, useEmber } from "@/components/store/ember/Ember";
import KoiBar, { KoiSubtitle } from "@/components/store/shell/KoiBar";
import { useKoiVoice } from "@/store/koiVoiceStore";
import "./agent.css";

const LoginSheet = dynamic(() => import("@/components/auth/LoginSheet"), { ssr: false });

const PLACEHOLDERS = [
  "Tell KOI what you need this week…",
  "Plan this week for my family",
  "Make my plan cheaper",
  "Is this ok for my son?",
];

function SendIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 19V5" /><path d="m5 12 7-7 7 7" /></svg>;
}
function StopIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="5" width="14" height="14" rx="3" fill="currentColor" /></svg>;
}

export default function AgentDock() {
  const agent = useAgent();
  const pathname = usePathname() ?? "";
  // A phone cart surface shows its total bar on layer 2; the dock becomes a
  // round K beside it rather than stacking on top (app/store/koi.css).
  const compact = useCartUi((s) => s.totalBar);
  const [text, setText] = useState("");
  const [ph, setPh] = useState(0);
  // The shopper's choice of view, once made; until then a long conversation is Commentary.
  const [view, setView] = useState(null);
  const inputRef = useRef(null);
  const bodyRef = useRef(null);
  const state = agent?.state;
  // A fasting festival within three weeks gets a suggestion of its own (lib/calendar/festivals.js).
  const fasts = useMemo(() => upcomingFasts(), []);
  const running = state?.status === "running";
  const waiting = state?.status === "waiting";

  // The placeholder cycles through what KOI can do, while idle.
  useEffect(() => {
    if (running || text) return undefined;
    const t = setInterval(() => setPh((i) => (i + 1) % PLACEHOLDERS.length), 3800);
    return () => clearInterval(t);
  }, [running, text]);

  // "/" focuses the dock; Esc stops a run, or closes the sheet.
  useEffect(() => {
    const onKey = (e) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName) || e.target?.isContentEditable;
      if (e.key === "/" && !typing) {
        e.preventDefault();
        inputRef.current?.focus();
      } else if (e.key === "Escape" && agent) {
        if (agent.state.status === "running") agent.stop();
        else if (agent.state.open) agent.close();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [agent]);

  // The dock is the KOI bar: KOI's latest line is the subtitle, and its dot (the
  // ember) beats while KOI waits on the shopper and ticks when a run finishes.
  const ember = useEmber();
  const say = useKoiVoice((s) => s.say);
  const lastSay = useMemo(() => [...(state?.entries ?? [])].reverse().find((e) => e.kind === "say")?.text ?? "", [state?.entries]);
  useEffect(() => { if (lastSay) say(lastSay); }, [lastSay, say]);
  useEffect(() => { ember.heartbeat(waiting); }, [waiting, ember]);
  const wasRunning = useRef(false);
  useEffect(() => {
    if (wasRunning.current && !running && !waiting) ember.done();
    wasRunning.current = running;
  }, [running, waiting, ember]);

  // Keep the newest line in view.
  useEffect(() => {
    const el = bodyRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [state?.entries?.length, state?.pending]);

  // Checkout is the one page with nothing but the checkout on it: no agent runs
  // there, so the KOI bar's quiet strip (subtitle + the ember's home) stands in.
  if (pathname.startsWith("/store/checkout")) return <KoiBar />;
  if (!agent) return null;

  const submit = (e) => {
    e?.preventDefault?.();
    const t = text.trim();
    if (!t) return;
    agent.send(t);
    setText("");
  };
  const dockState = running ? "running" : waiting ? "waiting" : "idle";
  const sheet = state.open && agent.signedIn;
  const LONG = 8;
  const commentary = sheet && (view ?? (state.entries.length >= LONG ? "commentary" : "sheet")) === "commentary";
  const statusLine = state.statusLine;

  return (
    <div className="koi-agent" data-koi-bar>
      {/* Signed out, the conversation never opens beside the page; the dock stays the dock. */}
      {!sheet && (
        <div className="ka-subtitle" data-compact={compact ? "true" : undefined}><KoiSubtitle /></div>
      )}
      {!sheet && (
        <form className="ka-dock ka-glass" data-state={dockState} data-compact={compact ? "true" : undefined} onSubmit={submit} role="search" aria-label="Ask KOI">
          <button type="button" className="ka-k" onClick={agent.open} aria-label="Ask KOI">K</button>
          <EmberSlot />
          {running || waiting ? (
            <button type="button" onClick={agent.open} style={{ flex: 1, minWidth: 0, border: "none", background: "transparent", textAlign: "left", cursor: "pointer", padding: "10px 0" }} aria-label="Open KOI's conversation">
              <span className="ka-status" data-tone={waiting ? "warm" : undefined}>{waiting ? (state.pending?.kind === "approval" ? "KOI needs your OK" : "KOI needs you") : statusLine ?? "KOI is working"}</span>
            </button>
          ) : (
            <input
              ref={inputRef}
              className="ka-input"
              value={text}
              onChange={(e) => setText(e.target.value.slice(0, 600))}
              onFocus={() => { if (agent.signedIn && state.entries.length) agent.open(); }}
              placeholder={PLACEHOLDERS[ph]}
              aria-label="Tell KOI what you need"
            />
          )}
          {running ? (
            <button type="button" className="ka-pill" onClick={agent.stop} aria-label="Stop KOI"><StopIcon /> Stop</button>
          ) : waiting ? (
            <button type="button" className="ka-pill ka-pill-warm" onClick={agent.open}>{state.pending?.kind === "approval" ? "Review" : "Answer"}</button>
          ) : (
            <>
              {agent.signedIn && state.entries.length > 0 && <button type="button" className="ka-pill" onClick={agent.open}>Open</button>}
              <button type="submit" className="ka-round ka-send" disabled={!text.trim()} aria-label="Send to KOI"><SendIcon /></button>
            </>
          )}
        </form>
      )}

      {commentary && <Commentary agent={agent} onLightsUp={agent.close} onSheet={() => setView("sheet")} />}

      {sheet && !commentary && (
        <section className="ka-sheet ka-glass" aria-label="KOI">
          <div className="ka-grip" style={{ display: "none", alignSelf: "center", width: 40, height: 5, borderRadius: 99, background: "#d9d7cd", margin: "10px auto 0" }} aria-hidden="true" />
          <header className="ka-head">
            <div className="ka-head-row">
              <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                <span className="ka-dot" aria-hidden="true" />
                <span className="ka-status" data-tone={waiting ? "warm" : undefined}>{statusLine ?? "KOI"}</span>
              </div>
              <div style={{ display: "flex", gap: 2 }}>
                <button type="button" className="ka-icon-btn" onClick={() => agent.setFollow(!state.follow)} aria-pressed={state.follow} title="Move the page to where KOI is working">{state.follow ? "Following" : "Follow"}</button>
                <button type="button" className="ka-icon-btn" onClick={() => setView("commentary")} title="Read the conversation full screen, as a script">Lights down</button>
                <button type="button" className="ka-icon-btn" onClick={agent.newChat} disabled={running}>New chat</button>
                <button type="button" className="ka-icon-btn" onClick={agent.close} aria-label="Close KOI">Close</button>
              </div>
            </div>
            <TaskChecklist tasks={state.tasks} />
          </header>

          <div className="ka-body" ref={bodyRef} role="log" aria-live="polite" aria-relevant="additions">
            {state.entries.length === 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 10, paddingTop: 8 }}>
                <p className="ka-say" style={{ margin: 0 }}>{"Tell me who's eating and what you need. I'll set up your household, plan the week and fill the cart, and I'll check with you before saving anything."}</p>
                <div className="ka-chips">
                  {[...fasts.slice(0, 1).map((f) => `Plan ${f.name}${f.running ? "" : ` from ${dayLabel(f.start)}`} with someone fasting`), "Plan this week for my family", "Make my last plan cheaper", "What can my son eat from here?"].map((s) => (
                    <button key={s} type="button" className="ka-chip" onClick={() => agent.send(s)}>{s}</button>
                  ))}
                </div>
              </div>
            )}
            {state.entries.map((e) => {
              if (e.kind === "user") return <div key={e.id} className="ka-user">{e.text}</div>;
              if (e.kind === "say") return <p key={e.id} className="ka-say" style={{ margin: 0 }}>{e.text}</p>;
              if (e.kind === "tool") return <ToolCard key={e.id} entry={e} />;
              if (e.kind === "ask") return <AskCard key={e.id} entry={e} active={state.pending?.entryId === e.id} onAnswer={agent.answer} />;
              if (e.kind === "approval") return <ApprovalCard key={e.id} entry={e} active={state.pending?.entryId === e.id} onDecide={agent.decide} />;
              if (e.kind === "result") return <ResultCard key={e.id} data={e.data} canUndoRun={agent.canUndoRun()} onUndoRun={agent.undoRun} />;
              if (e.kind === "notice") return <div key={e.id} className="ka-card" style={{ fontSize: 12.5, color: e.tone === "warn" ? "#856404" : "#6b6f63", background: e.tone === "warn" ? "#fff8e1" : undefined }}>{e.text}</div>;
              if (e.kind === "error") return <div key={e.id} className="ka-card" style={{ fontSize: 13, color: "#b84535", background: "#fdf0ee" }}>{e.text}</div>;
              return null;
            })}
            {state.queue.map((q, i) => <div key={`q${i}`} className="ka-user" data-queued="true">{q}<div style={{ fontSize: 11, marginTop: 4, opacity: 0.8 }}>Sends when KOI finishes</div></div>)}
          </div>

          <footer className="ka-foot">
            <form className="ka-composer" onSubmit={submit}>
              <textarea
                ref={inputRef}
                rows={1}
                value={text}
                onChange={(e) => setText(e.target.value.slice(0, 600))}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) submit(e); }}
                placeholder={waiting ? "Answer above, or tell KOI something else…" : running ? "Add something — it sends when KOI finishes" : "Tell KOI what you need…"}
                aria-label="Message KOI"
              />
              {running && !text.trim() ? (
                <button type="button" className="ka-pill" onClick={agent.stop} aria-label="Stop KOI"><StopIcon /> Stop</button>
              ) : (
                <button type="submit" className="ka-round ka-send" disabled={!text.trim()} aria-label="Send to KOI"><SendIcon /></button>
              )}
            </form>
          </footer>
        </section>
      )}

      {agent.signIn && <LoginSheet open={agent.signIn} onOpenChange={agent.setSignIn} />}
    </div>
  );
}
