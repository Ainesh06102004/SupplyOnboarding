"use client";
// ============================================================================
// KOI — one place that sets GSAP up for the store
//
// Registers the plugins the cinematic storefront uses and names its eases, once
// per page load. Everything that animates imports `gsap` and `E` from here, so
// no component registers a plugin twice or invents its own curve.
//
//   reveal  .16,1,.3,1   — things arriving (text, cards)
//   dolly   .65,0,.35,1  — the camera: panels, sheets, the plan's playhead
//   cut     .83,0,.17,1  — hard cuts
//   flight / flightGo    — the ember (lib/motion/flight.js caps what they do)
// ============================================================================

import { gsap } from "gsap";
import { CustomEase } from "gsap/CustomEase";
import { DrawSVGPlugin } from "gsap/DrawSVGPlugin";
import { SplitText } from "gsap/SplitText";
import { Flip } from "gsap/Flip";
import { ScrambleTextPlugin } from "gsap/ScrambleTextPlugin";
import { useGSAP } from "@gsap/react";

let ready = false;

export const E = Object.freeze({
  reveal: "koiReveal",
  dolly: "koiDolly",
  cut: "koiCut",
  flight: "koiFlight",
  flightGo: "koiFlightGo",
});

/** Registers plugins and eases. Safe to call any number of times; does nothing on the server. */
export function setupMotion() {
  if (ready || typeof window === "undefined") return gsap;
  gsap.registerPlugin(useGSAP, CustomEase, DrawSVGPlugin, SplitText, Flip, ScrambleTextPlugin);
  CustomEase.create(E.reveal, ".16,1,.3,1");
  CustomEase.create(E.dolly, ".65,0,.35,1");
  CustomEase.create(E.cut, ".83,0,.17,1");
  CustomEase.create(E.flight, "M0,0 C0.06,0 0.09,-0.035 0.14,-0.035 0.26,-0.035 0.36,0.45 0.5,0.7 0.6,0.88 0.66,1.04 0.78,1.04 0.88,1.04 0.94,1 1,1");
  CustomEase.create(E.flightGo, "M0,0 C0.2,0.3 0.38,0.62 0.5,0.75 0.6,0.86 0.66,1.04 0.78,1.04 0.88,1.04 0.94,1 1,1");
  ready = true;
  return gsap;
}

/** True when the shopper asked their device for less motion. */
export function prefersReducedMotion() {
  return typeof window !== "undefined" && Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
}

export { gsap, useGSAP, Flip, SplitText };
