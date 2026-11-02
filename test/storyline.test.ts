import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MOCK_STORY,
  addChild,
  buildPrompt,
  childrenOf,
  clampYear,
  deleteSubtree,
  fromJson,
  pathToRoot,
  planVideo,
  roundYear,
  toJson,
  xToYear,
  yearToX,
} from "../lib/storyline.ts";

const rootOf = (t: ReturnType<typeof fromJson>) => childrenOf(t, null)[0];

test("year <-> x is a log scale that round-trips", () => {
  assert.equal(yearToX(0), 0);
  assert.ok(yearToX(10) < yearToX(100) && yearToX(100) < yearToX(10_000));
  assert.ok(Math.abs(xToYear(yearToX(340)) - 340) < 1e-6);
});

test("roundYear keeps two significant figures", () => {
  assert.equal(roundYear(338.17), 340);
  assert.equal(roundYear(4.4), 4);
  assert.equal(roundYear(-3), 0);
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
  const { tree: next, id } = addChild(tree, mid.id);
  assert.ok(next[id].year >= mid.year);
  assert.ok(Object.values(tree).every((n) => n.y !== next[id].y));
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
