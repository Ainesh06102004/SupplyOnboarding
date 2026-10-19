// ============================================================================
// KOI — the ember's flight, as plain arithmetic
//
// The ember (KOI's orange dot) never slides in a straight line. It flies a
// cubic path that bows upward on sideways moves and toward the middle of the
// screen on vertical ones, winds up a little before it leaves and overshoots a
// little when it lands. Everything here is pure so it can be tested without a
// browser; components/store/ember/EmberEngine.js drives it with GSAP.
//
// Settled in the cinematic-storefront design (19 Oct 2026, canvas v3):
//   • wind-up capped at 7 px, overshoot at 9 px, whatever the distance;
//   • duration 0.45–1.0 s, growing with the square root of the distance;
//   • the bend never exceeds 22% of the distance, nor ~140 px of bow.
// ============================================================================

/** @typedef {{ x: number, y: number }} Point */

const controls = (a, b, bend) => {
  const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
  const k = bend * len, nx = -dy / len, ny = dx / len;
  return {
    c1: { x: a.x + dx * 0.25 + nx * k, y: a.y + dy * 0.25 + ny * k },
    c2: { x: a.x + dx * 0.8 + nx * k * 0.55, y: a.y + dy * 0.8 + ny * k * 0.55 },
  };
};

/**
 * A point on the flight's cubic curve.
 * @param {Point} a start
 * @param {Point} b end
 * @param {number} t 0..1
 * @param {number} bend signed share of the distance the curve bows by
 * @returns {Point}
 */
export function bez(a, b, t, bend) {
  const { c1, c2 } = controls(a, b, bend);
  const u = 1 - t;
  return {
    x: u * u * u * a.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * b.x,
    y: u * u * u * a.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * b.y,
  };
}

/**
 * The unit tangent of the curve at t: which way the dot is heading.
 * @returns {Point}
 */
export function bezTan(a, b, t, bend) {
  const { c1, c2 } = controls(a, b, bend);
  const u = 1 - t;
  const x = 3 * u * u * (c1.x - a.x) + 6 * u * t * (c2.x - c1.x) + 3 * t * t * (b.x - c2.x);
  const y = 3 * u * u * (c1.y - a.y) + 6 * u * t * (c2.y - c1.y) + 3 * t * t * (b.y - c2.y);
  const m = Math.hypot(x, y) || 1;
  return { x: x / m, y: y / m };
}

export const WIND_UP_MAX = 7;
export const OVERSHOOT_MAX = 9;

/**
 * Where the dot is at eased progress t, which runs slightly below 0 (the
 * wind-up) and above 1 (the overshoot). Outside 0..1 the dot moves along the
 * tangent, by a distance capped in pixels so a long flight never lurches.
 * @param {Point} a
 * @param {Point} b
 * @param {number} t eased progress, roughly -0.035..1.04
 * @param {number} bend
 * @param {number} dist straight-line distance a→b
 * @returns {Point}
 */
export function flightPoint(a, b, t, bend, dist) {
  if (t >= 0 && t <= 1) return bez(a, b, t, bend);
  const end = t > 1, d = bezTan(a, b, end ? 1 : 0, bend);
  const amp = end
    ? Math.min(OVERSHOOT_MAX, 2 + dist * 0.025) * (t - 1) / 0.04
    : -Math.min(WIND_UP_MAX, 2 + dist * 0.02) * (-t) / 0.035;
  const base = end ? b : a;
  return { x: base.x + d.x * amp, y: base.y + d.y * amp };
}

/**
 * How a flight from `from` to `to` should go on a stage `width` px wide.
 * @param {Point} from
 * @param {Point} to
 * @param {number} width
 * @returns {{ dist: number, bend: number, duration: number }}
 */
export function flightPlan(from, to, width) {
  const dx = to.x - from.x, dy = to.y - from.y, dist = Math.hypot(dx, dy);
  if (dist < 3) return { dist, bend: 0, duration: 0 };
  const W = width || 1440, nx = -dy / dist, ny = dx / dist;
  // Bow upward for sideways moves, toward the middle of the frame for vertical ones.
  const side = Math.abs(dx) >= Math.abs(dy) * 0.6 ? (ny < 0 ? 1 : -1) : (nx * (W / 2 - (from.x + to.x) / 2) > 0 ? 1 : -1);
  const bend = side * Math.min(0.22, Math.min(140, W * 0.12) / dist);
  const duration = Math.min(1.0, Math.max(0.45, 0.4 + Math.sqrt(dist) * 0.022));
  return { dist, bend, duration };
}

/** The point an anchor offset names on a rectangle: `ax`/`ay` are 0..1 across it, `x`/`y` px nudges. */
export function spotOf(rect, off = {}) {
  return {
    x: rect.x + rect.w * (off.ax == null ? 0.5 : off.ax) + (off.x || 0),
    y: rect.y + rect.h * (off.ay == null ? 0.5 : off.ay) + (off.y || 0),
  };
}

/** The perch on an element's top-right corner, tucked in for small elements. */
export function perchOf(rect, pad = 8) {
  return { ax: 1, ay: 0, x: pad - Math.min(22, (rect.h + 2 * pad) / 2), y: -pad };
}

/** The SVG path of a ring (rounded rect) or underline around a rectangle. */
export function markPathOf(rect, kind = "ring", pad = 8) {
  if (kind === "line") {
    const y = rect.y + rect.h + 4;
    return `M${rect.x},${y} L${rect.x + rect.w},${y}`;
  }
  const x = rect.x - pad, y = rect.y - pad, w = rect.w + 2 * pad, h = rect.h + 2 * pad, k = Math.min(22, h / 2, w / 2);
  return `M${x + w - k},${y} A${k},${k} 0 0 1 ${x + w},${y + k} V${y + h - k} A${k},${k} 0 0 1 ${x + w - k},${y + h} H${x + k} A${k},${k} 0 0 1 ${x},${y + h - k} V${y + k} A${k},${k} 0 0 1 ${x + k},${y} Z`;
}
