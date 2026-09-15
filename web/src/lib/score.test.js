// ============================================================================
// KOI — tests for score arithmetic and which screening report stands
// Run with `npm test`.
// ============================================================================

import test from "node:test";
import assert from "node:assert/strict";

import { latestReport, averageScore } from "@/lib/score.js";

test("the standing report is the one marked latest, not the first row returned", () => {
  // Golden Milk Mix, as the database returns it: the hand-typed June score first.
  const versions = [
    { final_score: 95, is_latest: false, created_at: "2026-06-24T11:06:16Z" },
    { final_score: 45, is_latest: false, created_at: "2026-09-15T07:59:10Z" },
    { final_score: 22, is_latest: true, created_at: "2026-09-15T08:01:14Z" },
  ];
  assert.equal(latestReport(versions).final_score, 22);
  assert.equal(latestReport([...versions].reverse()).final_score, 22);
});

test("without a latest mark the newest stands; with nothing, nothing does", () => {
  assert.equal(latestReport([
    { final_score: 60, created_at: "2026-09-15T08:00:00Z" },
    { final_score: 70, created_at: "2026-09-16T08:00:00Z" },
  ]).final_score, 70);
  assert.equal(latestReport([]), null);
  assert.equal(latestReport(null), null);
  assert.equal(latestReport({ final_score: 50, is_latest: true }).final_score, 50, "a single embedded row");
});

test("an unscored product is not averaged in as a zero", () => {
  assert.equal(averageScore([{ score: 90 }, { score: null }]), 90);
  assert.equal(averageScore([]), null);
});
