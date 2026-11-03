import assert from "node:assert/strict";
import { test } from "node:test";
import { attachOrigin, fromJson } from "../lib/storyline.ts";
import { exportStoryFile, parseStoryFile, type StoryInputs } from "../lib/storyline-file.ts";

const file = (n: string) => ({ filename: n, subfolder: "v", type: "output" });
const url = (f: { filename: string }) => `/comfy/view?${f.filename}`;
const inputs: StoryInputs = { location: "Times Square", years: 50, butterfly: { id: "solar" }, climate: { custom: "storm" }, climateSet: true };

function sample() {
  const tree = attachOrigin(fromJson({ text: "first", year: 0, children: [{ text: "second", year: 5 }] }), { prompt: "", image: "x", file: file("p.png"), generatedAt: 1 }, "orig");
  const second = Object.values(tree).find((n) => n.text === "second")!;
  tree[second.id] = { ...second, keyframe: { prompt: "pp", image: "x", file: file("k.png"), generatedAt: 2 }, video: file("v.mp4"), videoMeta: { prompt: "go", mode: "flf2v" } };
  return tree;
}

test("a storyline survives export and import, with image URLs rebuilt from the files", () => {
  const tree = sample();
  const text = exportStoryFile({ inputs, tree, film: file("film.mp4") });
  assert.ok(!text.includes('"image"'), "image URLs are session-specific and not exported");
  const back = parseStoryFile(text, url);
  assert.deepEqual(back.inputs, inputs);
  assert.deepEqual(back.film, file("film.mp4"));
  assert.equal(Object.keys(back.tree).length, Object.keys(tree).length);
  const second = Object.values(back.tree).find((n) => n.text === "second")!;
  assert.equal(second.keyframe?.image, "/comfy/view?k.png");
  assert.deepEqual(second.video, file("v.mp4"));
  assert.equal(second.videoMeta?.mode, "flf2v");
  assert.equal(Object.values(back.tree).filter((n) => n.origin).length, 1);
});

test("files that aren't a storyline are rejected with a readable reason", () => {
  assert.throws(() => parseStoryFile("not json", url), /valid JSON/);
  assert.throws(() => parseStoryFile('{"app":"other"}', url), /isn't a WhatIfStreet/);
  assert.throws(() => parseStoryFile('{"app":"whatifstreet-storyline","version":9,"nodes":[{}]}', url), /version/);
  const good = JSON.parse(exportStoryFile({ inputs, tree: sample(), film: null }));
  const orphan = { ...good, nodes: good.nodes.map((n: { id: string }, i: number) => (i === 1 ? { ...n, parentId: "ghost" } : n)) };
  assert.throws(() => parseStoryFile(JSON.stringify(orphan), url), /missing parent|exactly one/);
  const last = good.nodes[good.nodes.length - 1].id;
  const loop = { ...good, nodes: good.nodes.map((n: { parentId: string | null }) => (n.parentId === null ? { ...n, parentId: last } : n)) };
  assert.throws(() => parseStoryFile(JSON.stringify(loop), url), /exactly one|loop/);
});
