import assert from "node:assert/strict";
import { test } from "node:test";
import { parseRipple, ripplePrompt } from "../lib/scenario.ts";
import {
  addChild,
  attachOrigin,
  canConnect,
  childrenOf,
  connect,
  descendantIds,
  fromJson,
  insertOnEdge,
  pathToRoot,
  replaceDescendants,
  storyRoot,
  toOutline,
  type StoryTree,
} from "../lib/storyline.ts";

const file = { filename: "k.png", subfolder: "", type: "output" };
const byText = (t: StoryTree, text: string) => Object.values(t).find((n) => n.text === text)!;

// origin -> a(0) -> b(10) -> c(20) -> d(40)
//                 \-> e(15)
function sample() {
  const tree = fromJson({
    text: "a",
    year: 0,
    children: [
      { text: "b", year: 10, children: [{ text: "c", year: 20, children: [{ text: "d", year: 40 }] }] },
      { text: "e", year: 15 },
    ],
  });
  return attachOrigin(tree, { prompt: "", image: "x", generatedAt: 0 }, "orig");
}

test("a beat can connect to any later beat, but not to earlier beats, itself, the origin, or back into a loop", () => {
  const t = sample();
  const [a, b, c, d, e] = ["a", "b", "c", "d", "e"].map((x) => byText(t, x).id);
  assert.ok(canConnect(t, b, d), "b -> d skips c");
  assert.ok(!canConnect(t, a, a));
  assert.ok(canConnect(t, e, d), "a leaf can reach a later beat on another branch");
  assert.ok(!canConnect(t, d, b), "not backwards in time");
  assert.ok(!canConnect(t, b, b));
  assert.ok(!canConnect(t, a, "origin"));
  assert.ok(!canConnect(t, b, c), "already its child");
  assert.ok(!canConnect(t, c, a), "a beat can't cause its own ancestor");
});

test("connecting re-parents the target and never leaves a loop", () => {
  const t = sample();
  const [b, c, d, e] = ["b", "c", "d", "e"].map((x) => byText(t, x).id);
  const linked = connect(t, e, d);
  assert.equal(linked[d].parentId, e);
  assert.deepEqual(pathToRoot(linked, d).map((n) => n.text), ["orig", "a", "e", "d"]);
  assert.equal(descendantIds(linked, c).length, 1, "c lost d");
  assert.equal(connect(t, d, b), t, "an invalid link changes nothing");
  assert.equal(connect(t, c, b), t, "a descendant can't become its ancestor's parent");
});

test("a new leaf beat can be connected onward to a later beat", () => {
  const t = sample();
  const { tree, id } = addChild(t, byText(t, "b").id);
  const d = byText(tree, "d").id;
  assert.equal(tree[id].year, 11);
  assert.ok(canConnect(tree, id, d));
  assert.equal(connect(tree, id, d)[d].parentId, id);
});

test("inserting on a link joins the new beat to both neighbours", () => {
  const t = sample();
  const [b, c] = [byText(t, "b").id, byText(t, "c").id];
  const made = insertOnEdge(t, c)!;
  const n = made.tree[made.id];
  assert.equal(n.parentId, b);
  assert.equal(made.tree[c].parentId, made.id);
  assert.ok(n.year >= t[b].year && n.year <= t[c].year);
  assert.equal(n.year, 15);
  assert.deepEqual(childrenOf(made.tree, b).map((k) => k.id), [made.id]);
});

test("there is no link to insert on before the first beat or on the origin", () => {
  const t = sample();
  assert.equal(insertOnEdge(t, byText(t, "a").id), null, "origin -> first beat is locked");
  assert.equal(insertOnEdge(t, "origin"), null);
});

test("the outline flags the edited beat and starts after the origin", () => {
  const t = sample();
  assert.equal(storyRoot(t)!.text, "a");
  const o = toOutline(t, byText(t, "c").id)!;
  assert.equal(o.text, "a");
  assert.equal(o.children![0].children![0].changed, true);
  assert.equal(JSON.stringify(o).match(/changed/g)!.length, 1);
});

test("the butterfly effect swaps only what comes after the beat", () => {
  const t = sample();
  const b = byText(t, "b").id;
  const before = Object.fromEntries(Object.entries(t).filter(([k]) => !descendantIds(t, b).includes(k) || k === b));
  const out = replaceDescendants({ ...t, [byText(t, "c").id]: { ...byText(t, "c"), keyframe: { prompt: "", image: "", file, generatedAt: 1 } } }, b, [
    { text: "x", year: 12, children: [{ text: "y", year: 30 }] },
    { text: "z", year: 25 },
  ]);
  for (const [k, n] of Object.entries(before)) assert.deepEqual(out[k], n, `${n.text} is untouched`);
  assert.ok(!Object.values(out).some((n) => n.text === "c" || n.text === "d"), "old consequences are gone");
  assert.deepEqual(childrenOf(out, b).map((n) => n.text).sort(), ["x", "z"]);
  assert.equal(byText(out, "y").parentId, byText(out, "x").id);
  assert.equal(byText(out, "e").parentId, byText(out, "a").id, "other branches survive");
  const ys = Object.values(out).filter((n) => !n.origin).map((n) => `${n.year}|${n.y}`);
  assert.equal(new Set(ys).size, ys.length, "no two beats share a spot");
});

test("a leaf gets a continuation", () => {
  const t = sample();
  const d = byText(t, "d").id;
  const out = replaceDescendants(t, d, [{ text: "after", year: 50 }]);
  assert.equal(out[byText(out, "after").id].parentId, d);
  assert.equal(Object.keys(out).length, Object.keys(t).length + 1);
});

test("the ripple prompt carries the edited storyline and the starting points", () => {
  const t = sample();
  const p = ripplePrompt({ locationLabel: "Main St", years: 50, butterflyPrompt: "solar power", climatePrompt: null, outline: toOutline(t, byText(t, "b").id)! });
  assert.match(p, /Main St/);
  assert.match(p, /solar power/);
  assert.match(p, /"changed":true/);
  assert.match(p, /Horizon: no beat may have a year greater than 50/);
});

test("ripple replies are read leniently and clamped to the changed beat's year and the horizon", () => {
  const reply = 'Sure!\n```json\n{"text":"b","year":10,"children":[{"text":"x","year":2,"children":[{"text":"y","year":999}]}]}\n```';
  const kids = parseRipple(reply, 10, 50);
  assert.equal(kids[0].year, 10, "never before the changed beat");
  assert.equal(kids[0].children![0].year, 50, "never past the horizon");
  assert.throws(() => parseRipple('{"text":"b","year":10}', 10, 50), /any later beats/);
  assert.throws(() => parseRipple("nope", 10, 50), /didn't return/);
  assert.throws(() => parseRipple('{"children":[{"text":"","year":1}]}', 0, 50), /no text/);
});
