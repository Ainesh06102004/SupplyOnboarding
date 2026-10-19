import test from "node:test";
import assert from "node:assert/strict";
import { bez, bezTan, flightPoint, flightPlan, spotOf, perchOf, markPathOf, WIND_UP_MAX, OVERSHOOT_MAX } from "@/lib/motion/flight.js";

const A = { x: 100, y: 500 }, B = { x: 1100, y: 480 };

test("the curve starts and ends exactly on its points", () => {
  assert.deepEqual(bez(A, B, 0, 0.1), A);
  const end = bez(A, B, 1, 0.1);
  assert.ok(Math.abs(end.x - B.x) < 1e-9 && Math.abs(end.y - B.y) < 1e-9);
});

test("a sideways flight bows upward", () => {
  const { bend } = flightPlan(A, B, 1440);
  const mid = bez(A, B, 0.5, bend);
  assert.ok(mid.y < Math.min(A.y, B.y), `mid ${mid.y} should sit above the line`);
});

test("a vertical flight bows toward the middle of the frame", () => {
  const left = flightPlan({ x: 200, y: 100 }, { x: 200, y: 800 }, 1440);
  const mid = bez({ x: 200, y: 100 }, { x: 200, y: 800 }, 0.5, left.bend);
  assert.ok(mid.x > 200, "a flight down the left edge bows right, toward the centre");
});

test("the tangent is a unit vector pointing roughly at the target", () => {
  const t = bezTan(A, B, 0.5, 0.05);
  assert.ok(Math.abs(Math.hypot(t.x, t.y) - 1) < 1e-9);
  assert.ok(t.x > 0.9);
});

test("wind-up and overshoot stay within their pixel caps, however long the flight", () => {
  for (const dist of [20, 200, 2000]) {
    const b = { x: A.x + dist, y: A.y };
    const before = flightPoint(A, b, -0.035, 0, dist);
    const after = flightPoint(A, b, 1.04, 0, dist);
    assert.ok(Math.hypot(before.x - A.x, before.y - A.y) <= WIND_UP_MAX + 1e-9, `wind-up at ${dist}px`);
    assert.ok(Math.hypot(after.x - b.x, after.y - b.y) <= OVERSHOOT_MAX + 1e-9, `overshoot at ${dist}px`);
    assert.ok(before.x < A.x, "the wind-up pulls back before leaving");
    assert.ok(after.x > b.x, "the overshoot goes past the target");
  }
});

test("duration grows with distance and stays within 0.45–1.0 s; a tiny hop is instant", () => {
  const short = flightPlan(A, { x: A.x + 40, y: A.y }, 1440).duration;
  const long = flightPlan(A, { x: A.x + 1400, y: A.y }, 1440).duration;
  assert.ok(short >= 0.45 && long <= 1.0 && long > short);
  assert.equal(flightPlan(A, { x: A.x + 1, y: A.y }, 1440).duration, 0);
});

test("spots, perches and marks", () => {
  const r = { x: 10, y: 20, w: 100, h: 40 };
  assert.deepEqual(spotOf(r), { x: 60, y: 40 });
  assert.deepEqual(spotOf(r, { ax: 0, ay: 1, x: 2, y: 3 }), { x: 12, y: 63 });
  assert.deepEqual(perchOf(r, 8), { ax: 1, ay: 0, x: 8 - 22, y: -8 });
  assert.equal(markPathOf(r, "line"), "M10,64 L110,64");
  assert.match(markPathOf(r, "ring", 6), /^M.* Z$/);
});
