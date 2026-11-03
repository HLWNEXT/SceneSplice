import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MAX_LOG,
  TIME_STAGES,
  formatOffset,
  nearestStage,
  posToYears,
  snapPos,
  timeHint,
  yearsToPos,
} from "../lib/timetravel.ts";

test("yearsToPos/posToYears round-trip, including the Today exact-zero point", () => {
  for (const years of [0, 1, 5, 10, 11, 50, 73, 200, -1, -10, -50, -200]) {
    const pos = yearsToPos(years);
    assert.equal(posToYears(pos), years, `years=${years}`);
  }
  assert.equal(yearsToPos(0), 0);
  assert.equal(posToYears(0), 0);
});

test("position is monotonic in years and symmetric past/future", () => {
  assert.ok(yearsToPos(10) > yearsToPos(5));
  assert.ok(yearsToPos(200) > yearsToPos(10));
  assert.equal(yearsToPos(-50), -yearsToPos(50));
  assert.equal(yearsToPos(200), MAX_LOG);
  assert.equal(yearsToPos(-200), -MAX_LOG);
});

test("snapPos pulls a nearby position onto an exact stage", () => {
  const near200Ahead = yearsToPos(200) - 0.01;
  assert.equal(snapPos(near200Ahead), yearsToPos(200));
  const farFromAnyStage = yearsToPos(80);
  assert.equal(snapPos(farFromAnyStage), farFromAnyStage);
});

test("nearestStage finds the closest labeled stop, each side of Today", () => {
  assert.equal(nearestStage(0).label, "TODAY");
  assert.equal(nearestStage(190).label, "200 YR\nAHEAD");
  assert.equal(nearestStage(-8).label, "10 YR\nAGO");
  assert.equal(TIME_STAGES.length, 7);
});

test("formatOffset and timeHint read naturally on both sides of Today", () => {
  assert.equal(formatOffset(0), "TODAY");
  assert.equal(formatOffset(150), "150 YR AHEAD");
  assert.equal(formatOffset(-150), "150 YR AGO");
  assert.match(timeHint(150), /150 years in the future/);
  assert.match(timeHint(-150), /150 years in the past/);
  assert.match(timeHint(0), /present day/);
});

test("offsets below a year read in months", () => {
  assert.equal(formatOffset(0.5), "6 MO AHEAD");
  assert.equal(formatOffset(-1.25), "1 YR 3 MO AGO");
  assert.equal(formatOffset(0.01), "TODAY");
  assert.match(timeHint(2.5), /2 years and 6 months in the future/);
  assert.match(timeHint(-0.25), /3 months in the past/);
});
