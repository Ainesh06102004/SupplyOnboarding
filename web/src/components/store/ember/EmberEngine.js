// ============================================================================
// KOI — the ember: KOI's presence on every store page
//
// One orange dot (the wordmark's dot, come alive) that shows what KOI is
// doing. It has seven forms, and nothing else on the page borrows them:
//
//   rest        blinks now and then, in its home slot (the KOI bar)
//   listening   a small bump on each keystroke
//   working     grows into a capsule that says what it is doing ("Reading")
//   travelling  flies (lib/motion/flight.js) with a comet trail, lands with a ripple
//   marking     rings or underlines the thing KOI means
//   done        a check, then back to a dot
//   asking      a heartbeat, while KOI waits on the shopper
//
// The engine is plain JS over DOM nodes the EmberLayer renders; GSAP owns every
// transform on those nodes. Coordinates are relative to the store root, so the
// dot scrolls with the page; pin() keeps it on an anchor that moves (a sticky
// bar, a resize) and sends it home when its anchor leaves the page.
// ============================================================================

import { flightPlan, flightPoint, bezTan, spotOf, perchOf, markPathOf } from "@/lib/motion/flight";

export class EmberEngine {
  /**
   * @param {object} o
   * @param {HTMLElement} o.root  the stage: coordinates are relative to it
   * @param {object} o.nodes      { ember, body, pip, label, check, tick, trails, ripple, mark }
   * @param {import("gsap").gsap} o.gsap
   * @param {Record<string,string>} o.E eases
   * @param {boolean} o.reduce    reduced motion: jump, never fly
   */
  constructor({ root, nodes, gsap, E, reduce }) {
    this.root = root;
    this.n = nodes;
    this.g = gsap;
    this.E = E;
    this.reduce = reduce;
    this.ctx = gsap.context(() => {}, root);
    this.anchor = null;
    this.off = {};
    this.homeEl = null;
    this.homeOff = {};
    this.markState = null;
    this.flying = false;
    this.statusText = null;
    this.trail = [];
    this.trailAt = 0;
    this.goTl = null;
    this.hb = null;
    this.blink = null;
    this.visible = false;
    gsap.set(nodes.ember, { autoAlpha: 0 });
  }

  // ── geometry ──
  rect(el) {
    const R = this.root.getBoundingClientRect(), e = el.getBoundingClientRect();
    return { x: e.left - R.left, y: e.top - R.top, w: e.width, h: e.height };
  }
  spot(el, off) { return spotOf(this.rect(el), off); }
  perch(el, pad) { return el ? perchOf(this.rect(el), pad == null ? 8 : pad) : {}; }

  // ── home: the KOI bar's slot ──
  setHome(el, off) {
    this.homeEl = el;
    this.homeOff = off || {};
    if (el && !this.anchor) this.at(el, this.homeOff);
  }
  clearHome(el) {
    if (this.homeEl !== el) return;
    this.homeEl = null;
    if (this.anchor === el) { this.anchor = null; this.g.set(this.n.ember, { autoAlpha: 0 }); this.visible = false; }
  }
  home() { if (this.homeEl) this.go(this.homeEl, this.homeOff); }

  at(el, off) {
    if (!el) return;
    this.anchor = el;
    this.off = off || {};
    this.g.set(this.n.ember, { autoAlpha: 1, rotation: 0, ...this.spot(el, this.off) });
    if (!this.visible) { this.visible = true; this.idle(); }
  }

  /** Keeps the dot on its anchor while the page moves; an anchor that left the page sends it home. */
  pin() {
    if (this.anchor && !this.anchor.isConnected) {
      this.anchor = null;
      this.mark(null);
      this.heartbeat(false);
      if (this.homeEl?.isConnected) this.at(this.homeEl, this.homeOff);
      return;
    }
    if (this.anchor && !this.flying) this.g.set(this.n.ember, this.spot(this.anchor, this.off));
    if (this.markState && !this.marking) {
      if (!this.markState.el.isConnected) { this.mark(null); return; }
      this.drawMark();
      this.g.set(this.n.mark, { drawSVG: "0% 100%" });
    }
  }

  // ── travelling ──
  go(el, off, onLand) {
    const { g, n } = this;
    if (!el) return;
    this.heartbeat(false);
    const moving = Boolean(this.goTl);
    if (this.goTl) { this.goTl.kill(); this.goTl = null; }
    this.anchor = el;
    this.off = off || {};
    const from = { x: g.getProperty(n.ember, "x"), y: g.getProperty(n.ember, "y") };
    const to0 = this.spot(el, this.off);
    const wait = this.statusText && !this.reduce ? 0.22 : 0;
    if (this.statusText) this.status(null);
    g.set(n.ember, { autoAlpha: 1 });
    if (!this.visible) { this.visible = true; g.set(n.ember, { rotation: 0, ...to0 }); this.idle(); if (onLand) onLand(); return; }
    const plan = flightPlan(from, to0, this.root.offsetWidth);
    if (this.reduce || plan.duration === 0) {
      this.flying = false;
      g.set(n.ember, { rotation: 0, ...to0 });
      g.set(n.body, { scaleX: 1, scaleY: 1 });
      if (onLand) onLand();
      return;
    }
    this.flying = true;
    this.blink?.pause(0);
    this.ctx.add(() => {
      const st = { t: 0 };
      let last = { ...from }, sm = 1, landed = false;
      const tl = g.timeline({
        onComplete: () => {
          this.goTl = null;
          this.flying = false;
          g.set(n.ember, { rotation: 0 });
          this.pin();
          this.trailFade();
          if (!this.statusText) this.blink?.play();
        },
      });
      this.goTl = tl;
      tl.to(st, {
        t: 1,
        duration: plan.duration,
        ease: moving ? this.E.flightGo : this.E.flight,
        onUpdate: () => {
          // Re-aims every frame, so it lands on a target that moved while it flew.
          const to = this.spot(el, this.off);
          const p = flightPoint(from, to, st.t, plan.bend, plan.dist);
          this.trailPush(p);
          if (landed) { g.set(n.ember, { x: p.x, y: p.y }); last = p; return; }
          const tan = bezTan(from, to, Math.min(1, Math.max(0, st.t)), plan.bend);
          const vx = p.x - last.x, vy = p.y - last.y, v = Math.hypot(vx, vy);
          const ahead = vx * tan.x + vy * tan.y >= 0;
          const aim = ahead ? 1 + Math.min(0.7, v * 0.045) : 1 - Math.min(0.3, v * 0.06);
          sm += (aim - sm) * 0.45;
          g.set(n.ember, { x: p.x, y: p.y, rotation: (Math.atan2(tan.y, tan.x) * 180) / Math.PI });
          g.set(n.body, { scaleX: sm, scaleY: 1 / Math.sqrt(Math.max(0.5, sm)) });
          last = p;
        },
      }, wait);
      // Touchdown: squash along the line it arrived on, spring back, ripple.
      tl.addLabel("land", wait + plan.duration * 0.8);
      tl.call(() => { landed = true; this.ripple(); }, null, "land");
      tl.to(n.body, { scaleX: 0.74, scaleY: 1.22, duration: 0.08, ease: "power2.out" }, "land");
      tl.to(n.body, { scaleX: 1, scaleY: 1, duration: 0.35, ease: "back.out(3)" }, "land+=0.08");
      tl.set(n.ember, { rotation: 0 }, "land+=0.43");
      tl.call(() => onLand?.(), null, "land+=0.1");
    });
  }

  trailPush(p) {
    const now = performance.now();
    if (this.trail.length && now - this.trailAt < 12) this.trail[this.trail.length - 1] = { x: p.x, y: p.y };
    else { this.trail.push({ x: p.x, y: p.y }); this.trailAt = now; }
    if (this.trail.length > 16) this.trail.shift();
    this.trailDraw();
  }
  trailDraw() {
    for (const path of this.n.trails) {
      const pts = this.trail.slice(-Number(path.getAttribute("data-n") || 10));
      let d = "";
      if (pts.length > 1) d = "M" + pts.map((q) => `${q.x.toFixed(1)},${q.y.toFixed(1)}`).join(" L");
      path.setAttribute("d", d);
    }
  }
  trailFade() {
    const { g, n } = this;
    this.ctx.add(() => {
      g.to({ k: 0 }, {
        k: 1, duration: 0.3, ease: "none",
        onUpdate: () => { if (!this.flying) this.trailPush({ x: g.getProperty(n.ember, "x"), y: g.getProperty(n.ember, "y") }); },
        onComplete: () => { if (!this.flying) { this.trail = []; this.trailDraw(); } },
      });
    });
  }
  ripple() {
    if (this.reduce) return;
    this.g.fromTo(this.n.ripple, { scale: 0.4, autoAlpha: 0.7 }, { scale: 2.6, autoAlpha: 0, duration: 0.6, ease: "power2.out" });
  }

  // ── working: the capsule ──
  status(text) {
    const { g, n } = this;
    const prev = this.statusText;
    this.statusText = text || null;
    g.killTweensOf(n.body, "width,height,left,top");
    g.killTweensOf([n.label, n.pip]);
    if (text) {
      this.blink?.pause(0);
      g.killTweensOf(n.body, "scaleX,scaleY,scale");
      g.set(n.body, { scaleX: 1, scaleY: 1 });
      g.set(n.ember, { rotation: 0 });
      n.label.textContent = text;
      const w = Math.ceil(n.label.scrollWidth) + 1;
      const ax = g.getProperty(n.ember, "x");
      const left = ax + w - 13 > this.root.offsetWidth - 12 ? -(w - 13) : -13;
      if (prev && !this.reduce) { n.label.textContent = prev; g.to(n.label, { duration: 0.45, scrambleText: { text, chars: "upperCase", speed: 1 } }); }
      if (this.reduce) { g.set(n.body, { width: w, height: 26, left, top: -13 }); g.set([n.label, n.pip], { opacity: 1 }); return; }
      g.to(n.body, { width: w, height: 26, left, top: -13, duration: 0.5, ease: this.E.reveal });
      g.to([n.label, n.pip], { opacity: 1, duration: 0.22, delay: prev ? 0 : 0.14 });
    } else {
      g.to([n.label, n.pip], { opacity: 0, duration: 0.12 });
      g.to(n.body, {
        width: 10, height: 10, left: -5, top: -5, duration: this.reduce ? 0 : 0.4, ease: "back.out(2)", delay: 0.05,
        onComplete: () => { if (!this.statusText && !this.flying) this.blink?.play(); },
      });
    }
  }

  // ── done: the check ──
  done(after) {
    const { g, n } = this;
    if (this.statusText) this.status(null);
    g.killTweensOf(n.body, "scaleX,scaleY");
    g.set(n.body, { scaleX: 1, scaleY: 1 });
    g.set(n.ember, { rotation: 0 });
    if (this.reduce) { after?.(); return; }
    this.ctx.add(() => {
      const tl = g.timeline({ delay: 0.1, onComplete: () => after?.() });
      tl.to(n.body, { width: 24, height: 24, left: -12, top: -12, duration: 0.32, ease: "back.out(2.4)" });
      tl.set(n.check, { opacity: 1 }, "<0.08");
      tl.fromTo(n.tick, { drawSVG: "0% 0%" }, { drawSVG: "0% 100%", duration: 0.3, ease: "power2.out" }, "<");
      tl.to(n.check, { opacity: 0, duration: 0.16 }, "+=0.85");
      tl.to(n.body, { width: 10, height: 10, left: -5, top: -5, duration: 0.42, ease: "back.out(2)" }, "<");
    });
  }

  // ── marking ──
  mark(el, kind = "ring", pad) {
    const { g, n } = this;
    if (!el) {
      if (!this.markState) return;
      this.markState = null;
      if (this.reduce) g.set(n.mark, { opacity: 0 });
      else g.to(n.mark, { drawSVG: "100% 100%", duration: 0.35, ease: "power2.in", onComplete: () => { if (!this.markState) g.set(n.mark, { opacity: 0 }); } });
      return;
    }
    this.markState = { el, kind, pad: pad == null ? 8 : pad };
    this.drawMark();
    if (this.reduce) { g.set(n.mark, { opacity: 1, drawSVG: "0% 100%" }); return; }
    this.marking = true;
    g.fromTo(n.mark, { opacity: 1, drawSVG: "0% 0%" }, { drawSVG: "0% 100%", duration: kind === "line" ? 0.45 : 0.8, ease: this.E.dolly, onComplete: () => { this.marking = false; } });
  }
  drawMark() {
    const m = this.markState;
    if (m) this.n.mark.setAttribute("d", markPathOf(this.rect(m.el), m.kind, m.pad));
  }

  // ── asking, listening, resting ──
  heartbeat(on) {
    const { g, n } = this;
    if (this.hb) { this.hb.kill(); this.hb = null; g.set(n.body, { scale: 1 }); }
    if (!on || this.reduce) return;
    this.ctx.add(() => {
      this.hb = g.timeline({ repeat: -1, repeatDelay: 1.1 })
        .to(n.body, { scale: 1.45, duration: 0.12, ease: "power2.out" })
        .to(n.body, { scale: 1, duration: 0.2 })
        .to(n.body, { scale: 1.25, duration: 0.1 })
        .to(n.body, { scale: 1, duration: 0.3, ease: "power2.out" });
    });
  }
  bump() {
    if (this.reduce || this.flying || this.statusText) return;
    this.g.fromTo(this.n.body, { scale: 1.5 }, { scale: 1, duration: 0.35, ease: "power2.out", overwrite: "auto" });
  }
  idle() {
    if (this.reduce || this.blink) return;
    this.ctx.add(() => {
      this.blink = this.g.timeline({ repeat: -1, repeatDelay: 4.6, delay: 2.4 })
        .to(this.n.body, { scaleY: 0.22, duration: 0.07, ease: "power2.in" })
        .to(this.n.body, { scaleY: 1, duration: 0.24, ease: "back.out(3)" });
    });
  }

  /** Lets go of whatever it was pointing at, before that thing unmounts. */
  letGo() {
    this.heartbeat(false);
    this.mark(null);
    this.anchor = null;
  }

  destroy() {
    this.goTl?.kill();
    this.ctx.revert();
  }
}
