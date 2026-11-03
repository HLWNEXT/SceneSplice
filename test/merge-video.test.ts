import assert from "node:assert/strict";
import { test } from "node:test";
import { addChild, type StoryTree } from "../lib/storyline.ts";
import { buildMergeWorkflow, mergeOrder, mergeSignature } from "../lib/merge-video.ts";

const file = (n: string) => ({ filename: n, subfolder: "video", type: "output" });

test("clips are ordered by year and beats without a video are skipped", () => {
  let tree: StoryTree = { r: { id: "r", parentId: null, text: "root", year: 0, y: 0 } };
  for (const [id, year] of [["b", 30], ["a", 10], ["c", 20]] as const) {
    const added = addChild(tree, "r");
    tree = { ...added.tree, [id]: { ...added.tree[added.id], id, year } };
    delete tree[added.id];
  }
  tree.a.video = file("a.mp4");
  tree.b.video = file("b.mp4");
  assert.deepEqual(mergeOrder(tree).map((c) => c.id), ["a", "b"]);
  assert.notEqual(mergeSignature(mergeOrder(tree)), mergeSignature(mergeOrder({ ...tree, c: { ...tree.c, video: file("c.mp4") } })));
});

test("the merge graph chains every clip, in order, into one SaveVideo", () => {
  const wf = buildMergeWorkflow(["v/a.mp4 [output]", "v/b.mp4 [output]", "v/c.mp4 [output]"]);
  const types = Object.values(wf).map((n) => n.class_type);
  assert.equal(types.filter((t) => t === "LoadVideo").length, 3);
  assert.equal(types.filter((t) => t === "CreateVideo").length, 2);
  assert.equal(types.filter((t) => t === "SaveVideo").length, 1);
  assert.equal(wf["100"].inputs.file, "v/a.mp4 [output]");
  // every link points at a node that exists
  for (const n of Object.values(wf)) for (const v of Object.values(n.inputs)) if (Array.isArray(v)) assert.ok(wf[v[0] as string], `dangling link to ${v[0]}`);
  // the last CreateVideo extends the first one: clip 3 is appended to the result of clips 1+2
  const last = wf[(wf["900"].inputs.video as [string, number])[0]];
  const batch = wf[(last.inputs.images as [string, number])[0]];
  const head = wf[(batch.inputs["images.image0"] as [string, number])[0]];
  assert.equal(wf[(head.inputs.video as [string, number])[0]].class_type, "CreateVideo");
  assert.equal(wf[((wf[(batch.inputs["images.image1"] as [string, number])[0]]).inputs.video as [string, number])[0]].inputs.file, "v/c.mp4 [output]");
  assert.throws(() => buildMergeWorkflow(["x"]), /at least two/);
});
