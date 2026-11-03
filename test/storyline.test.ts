import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MOCK_STORY,
  NODE_H,
  NODE_W,
  addChild,
  axisTicks,
  buildPrompt,
  childrenOf,
  clampYear,
  deleteSubtree,
  formatYear,
  fromJson,
  keyframeSource,
  pathToRoot,
  planVideo,
  roundYear,
  tickLabel,
  toJson,
  xToYear,
  yearToX,
} from "../lib/storyline.ts";

const rootOf = (t: ReturnType<typeof fromJson>) => childrenOf(t, null)[0];

test("year <-> x is linear in the time scale and round-trips", () => {
  assert.equal(yearToX(0, 80), 0);
  assert.equal(yearToX(2, 80), 160);
  assert.equal(yearToX(2, 160), 320); // zooming time doubles the spacing
  assert.ok(Math.abs(xToYear(yearToX(3.5, 123), 123) - 3.5) < 1e-9);
});

test("roundYear snaps to months by default and to the visible grid when given a scale", () => {
  assert.equal(roundYear(0.52), 6 / 12);
  assert.equal(roundYear(-3), 0);
  assert.equal(roundYear(4.4, 80), 4.5); // 80 px/yr: quarter-year grid
  assert.equal(roundYear(338.17, 1), 340); // 1 px/yr: 10-year grid
});

test("axisTicks use finer labels as you zoom in and never overlap", () => {
  const coarse = axisTicks(1, 0, 600);
  assert.deepEqual(coarse.major.slice(0, 3), [0, 100, 200]);
  const fine = axisTicks(2000, 0, 1);
  assert.ok(Math.abs(fine.major[1] - 1 / 12) < 1e-9); // monthly major ticks
  const spacing = fine.major[1] - fine.major[0];
  assert.ok(spacing * 2000 >= 96);
  assert.ok(coarse.minor.every((t) => !coarse.major.includes(t)));
});

test("formatYear and tickLabel read in months below a year", () => {
  assert.equal(formatYear(8), "Year 8");
  assert.equal(formatYear(0.5), "Month 6");
  assert.equal(formatYear(1.25), "Year 1, month 3");
  assert.equal(tickLabel(0), "0");
  assert.equal(tickLabel(0.25), "3 mo");
  assert.equal(tickLabel(1.5), "1 yr 6 mo");
  assert.equal(tickLabel(1000), "1,000 yr");
});

test("fromJson/toJson round-trip the mock story", () => {
  const out = toJson(fromJson(MOCK_STORY));
  assert.deepEqual(out, MOCK_STORY);
});

test("layout gives every leaf its own row and centers parents", () => {
  const tree = fromJson(MOCK_STORY);
  const leaves = Object.values(tree).filter((n) => childrenOf(tree, n.id).length === 0);
  assert.equal(new Set(leaves.map((l) => l.y)).size, leaves.length);
  const root = rootOf(tree);
  const ys = childrenOf(tree, root.id).map((k) => k.y);
  assert.equal(root.y, (Math.min(...ys) + Math.max(...ys)) / 2);
});

test("deleteSubtree removes descendants, leaves siblings", () => {
  const tree = fromJson(MOCK_STORY);
  const branch = childrenOf(tree, rootOf(tree).id)[0];
  const after = deleteSubtree(tree, branch.id);
  assert.equal(after[branch.id], undefined);
  assert.ok(Object.keys(after).length < Object.keys(tree).length - 1);
  assert.ok(Object.values(after).every((n) => !n.parentId || after[n.parentId]));
});

test("clampYear keeps a beat between its parent and its children", () => {
  const tree = fromJson(MOCK_STORY);
  const mid = childrenOf(tree, rootOf(tree).id)[0]; // year 8
  const kidYear = Math.min(...childrenOf(tree, mid.id).map((k) => k.year));
  assert.equal(clampYear(tree, mid.id, 99_999), kidYear);
  assert.equal(clampYear(tree, mid.id, 0), 0);
});

test("addChild never precedes its parent and avoids overlapping siblings", () => {
  const tree = fromJson(MOCK_STORY);
  const mid = childrenOf(tree, rootOf(tree).id)[0];
  const ppy = 80;
  const { tree: next, id } = addChild(tree, mid.id, ppy);
  const added = next[id];
  assert.equal(added.year, mid.year + 1);
  const overlaps = Object.values(tree).filter(
    (n) =>
      Math.abs(yearToX(n.year, ppy) - yearToX(added.year, ppy)) < NODE_W &&
      Math.abs(n.y - added.y) < NODE_H,
  );
  assert.equal(overlaps.length, 0);
});

test("planVideo pairs keyframes along the root path and flags gaps", () => {
  const tree = fromJson(MOCK_STORY);
  let leaf = rootOf(tree);
  while (childrenOf(tree, leaf.id).length) leaf = childrenOf(tree, leaf.id)[0];
  const path = pathToRoot(tree, leaf.id);
  assert.equal(path[0].parentId, null);
  assert.equal(planVideo(tree, leaf.id).missing.length, path.length);
  for (const n of path) n.keyframe = { prompt: "p", image: `img-${n.id}`, generatedAt: 0 };
  const plan = planVideo(tree, leaf.id);
  assert.equal(plan.missing.length, 0);
  assert.equal(plan.segments.length, path.length - 1);
  assert.equal(plan.segments[0].fromImage, `img-${path[0].id}`);
});

test("buildPrompt includes the event and its history", () => {
  const tree = fromJson(MOCK_STORY);
  const mid = childrenOf(tree, rootOf(tree).id)[0];
  const p = buildPrompt(tree, mid.id, "a library");
  assert.match(p, /Year 8/);
  assert.match(p, /Preceding history: Year 0/);
});

test("keyframeSource picks the nearest ancestor keyframe, never the node itself", () => {
  const tree = fromJson(MOCK_STORY);
  const root = rootOf(tree);
  const mid = childrenOf(tree, root.id)[0];
  const leafish = childrenOf(tree, mid.id)[0];
  assert.equal(keyframeSource(tree, leafish.id), null);
  const f = (n: string) => ({ filename: n, subfolder: "", type: "output" });
  root.keyframe = { prompt: "", image: "", generatedAt: 0, file: f("root.png") };
  assert.equal(keyframeSource(tree, leafish.id)?.filename, "root.png");
  mid.keyframe = { prompt: "", image: "", generatedAt: 0, file: f("mid.png") };
  leafish.keyframe = { prompt: "", image: "", generatedAt: 0, file: f("self.png") };
  assert.equal(keyframeSource(tree, leafish.id)?.filename, "mid.png");
  assert.equal(keyframeSource(tree, root.id), null);
});
