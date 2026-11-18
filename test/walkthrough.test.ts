import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { NEW_BEAT_TEXT, addChild, axisTicks, clampYear, connect, deleteSubtree, insertOnEdge, roundYear, snapStep, type StoryTree } from "../lib/storyline.ts";
import { NODE_VPROMPT, buildVideoPromptWorkflow } from "../lib/video-prompt.ts";
import { exportWalkthroughFile, parseWalkthroughFile } from "../lib/walkthrough-file.ts";
import {
  CLIP_LIMITS,
  EMPTY_SCENE_TEXT,
  MAX_FILM_SECONDS,
  MAX_SCENES,
  SECONDS_AXIS,
  blankScene,
  canGenerate,
  clipSeconds,
  displayTree,
  fallbackWalkthroughPrompt,
  finalFrame,
  formatClock,
  gapSeconds,
  inbetweenPrompt,
  newWalkthrough,
  promptOf,
  pruneScenes,
  renderPrompt,
  route,
  routeClips,
  routeSeconds,
  sceneBlocker,
  sceneLabel,
  setMode,
  singleBlocker,
  singleClipSeconds,
  singleKey,
  transitionKey,
  uploadedFile,
  videoBlocker,
  videoStale,
  walkthroughVideoRequest,
  type ComfyFile,
  type SceneData,
  type SceneMap,
} from "../lib/walkthrough.ts";
import { MAX_IMAGE_INPUTS, buildWalkthroughImageWorkflow } from "../lib/walkthrough-workflow.ts";
import { buildMergeWorkflow } from "../lib/merge-video.ts";

const read = (p: string) => JSON.parse(readFileSync(new URL(p, import.meta.url), "utf8"));
const nano = read("../workflows/api_nano_banana_pro.json");
const vprompt = read("../workflows/walkthrough.videoprompt.text.api.json");

const f = (name: string, type = "input"): ComfyFile => ({ filename: name, subfolder: "", type });
const up = (name: string) => ({ file: f(name), label: name });
const rendered = (name: string): SceneData => ({ ...blankScene("rendered"), drawing: up(name) });
const whitebox = (name: string): SceneData => ({ ...blankScene("whitebox"), drawing: up(name) });
const withText = (t: StoryTree, id: string, text: string): StoryTree => ({ ...t, [id]: { ...t[id], text } });

/** start -> a -> b, a straight walk. */
function line() {
  const first = addChild(newWalkthrough(), "start");
  const second = addChild(first.tree, first.id);
  return { tree: second.tree, ids: ["start", first.id, second.id] as const };
}

test("a rendered scene's frame is its upload; a white-box scene's is its render", () => {
  assert.deepEqual(finalFrame(rendered("a.png")), f("a.png"));
  const w = whitebox("w.png");
  assert.equal(finalFrame(w), null);
  assert.deepEqual(finalFrame({ ...w, render: { file: f("out.png", "output"), prompt: "p", generatedAt: 1 } }), f("out.png", "output"));
  assert.equal(finalFrame(blankScene("rendered")), null);
});

test("placeholders from the canvas don't count as a prompt", () => {
  const { tree, ids } = line();
  assert.equal(promptOf(tree[ids[1]]), "", "new beat text");
  assert.equal(promptOf({ ...tree[ids[1]], text: EMPTY_SCENE_TEXT }), "");
  assert.equal(promptOf({ ...tree[ids[1]], text: NEW_BEAT_TEXT }), "");
  assert.equal(promptOf({ ...tree[ids[1]], text: "  oak stair  " }), "oak stair");
  assert.equal(promptOf(undefined), "");
});

test("blockers say what is missing", () => {
  const { tree: bare, ids } = line();
  const [s0, s1, s2] = ids;
  const tree = bare;
  const map: SceneMap = { [s0]: blankScene(), [s1]: { ...whitebox("w.png"), imagePrompt: "a reading nook" }, [s2]: rendered("r.png") };
  assert.match(sceneBlocker(tree, map, s0)!, /Upload a white-box/);
  assert.equal(sceneBlocker(tree, map, s1), null);
  assert.equal(canGenerate(tree, map, s1), true);
  assert.equal(canGenerate(tree, map, s2), false, "rendered scenes are never generated");
  assert.match(sceneBlocker(tree, { ...map, [s1]: { ...map[s1], imagePrompt: " " } }, s1)!, /Describe/);
  // The animation prompt (node text) is not needed to render an image.
  assert.equal(sceneBlocker(withText(tree, s1, ""), map, s1), null);
  assert.match(sceneBlocker(tree, { [s2]: blankScene("rendered") }, s2)!, /rendered view/);
});

test("an in-between scene needs a finished scene before it and after it", () => {
  const { tree, ids } = line();
  const [a, mid, b] = ids;
  const map: SceneMap = { [a]: rendered("a.png"), [mid]: blankScene("inbetween"), [b]: rendered("b.png") };
  assert.equal(sceneBlocker(tree, map, mid), null);
  assert.equal(canGenerate(tree, map, mid), true);
  assert.match(sceneBlocker(tree, { ...map, [b]: blankScene("rendered") }, mid)!, /before it and after it/);
  assert.match(sceneBlocker(tree, { ...map, [a]: whitebox("w.png") }, mid)!, /before it and after it/);
  // The first scene has nothing before it; the last has nothing after it.
  assert.match(sceneBlocker(tree, { ...map, [a]: blankScene("inbetween") }, a)!, /before it and after it/);
  assert.match(sceneBlocker(tree, { ...map, [b]: blankScene("inbetween") }, b)!, /before it and after it/);
});

test("inserting on a link puts a scene between two, and an in-between scene can fill it", () => {
  const { tree, ids } = line();
  const [a, , b] = ids;
  const direct = connect(tree, a, b); // a -> b, skipping the middle scene
  const out = insertOnEdge(direct, b)!;
  assert.equal(out.tree[b].parentId, out.id);
  assert.equal(out.tree[out.id].parentId, a);
  const map: SceneMap = { [a]: rendered("a.png"), [out.id]: blankScene("inbetween"), [b]: rendered("b.png") };
  assert.equal(sceneBlocker(out.tree, map, out.id), null);
});

test("a clip needs both frames, and goes stale when either changes or the link does", () => {
  const { tree, ids } = line();
  const [a, b] = ids;
  const map: SceneMap = { [a]: rendered("a.png"), [b]: rendered("b.png") };
  assert.match(videoBlocker(tree, map, a)!, /first scene/);
  assert.equal(videoBlocker(tree, map, b), null);
  assert.match(videoBlocker(tree, { ...map, [b]: blankScene("rendered") }, b)!, /finished frame/);

  const from = transitionKey(tree, map, b)!;
  const clipped: SceneMap = { ...map, [b]: { ...map[b], video: f("clip.mp4", "output"), videoMeta: { prompt: "p", from } } };
  assert.equal(videoStale(tree, clipped, b), false);
  assert.equal(videoStale(tree, { ...clipped, [a]: rendered("other.png") }, b), true, "parent frame replaced");
  assert.equal(videoStale(tree, { ...clipped, [b]: { ...clipped[b], drawing: up("new.png") } }, b), true, "own frame replaced");
  assert.equal(videoStale(tree, map, b), false, "no clip, nothing to be stale");
});

test("re-linking a scene changes what its clip joins", () => {
  const { tree, ids } = line();
  const [s, a, b] = ids;
  const map: SceneMap = { [s]: rendered("s.png"), [a]: rendered("a.png"), [b]: rendered("b.png") };
  const from = transitionKey(tree, map, b)!;
  const clipped: SceneMap = { ...map, [b]: { ...map[b], video: f("clip.mp4", "output"), videoMeta: { prompt: "p", from } } };
  assert.equal(videoStale(connect(tree, s, b), clipped, b), true);
});

test("the route runs to the selected scene, then on along the first branch", () => {
  const { tree, ids } = line();
  const [s, a, b] = ids;
  assert.deepEqual(route(tree, null).map((n) => n.id), [s, a, b]);
  assert.deepEqual(route(tree, a).map((n) => n.id), [s, a, b], "selecting the middle still goes on to the end");
  const alt = addChild(tree, a); // a second branch off a, placed below the first
  assert.deepEqual(route(alt.tree, alt.id).map((n) => n.id), [s, a, alt.id]);
  assert.deepEqual(route(alt.tree, b).map((n) => n.id), [s, a, b]);
  assert.deepEqual(route({}, null), []);
});

test("routeClips lists clips along a route in order", () => {
  const { tree, ids } = line();
  const map: SceneMap = {
    [ids[1]]: { ...blankScene(), video: f("1.mp4", "output") },
    [ids[2]]: { ...blankScene(), video: f("2.mp4", "output") },
  };
  assert.deepEqual(routeClips(map, route(tree, null)).map((c) => c.file.filename), ["1.mp4", "2.mp4"]);
  assert.deepEqual(routeClips(map, route(tree, null).slice(0, 2)).map((c) => c.file.filename), ["1.mp4"]);
});

test("labels fall back to depth along the route", () => {
  const { tree, ids } = line();
  assert.equal(sceneLabel(tree, {}, ids[0]), "Scene 1");
  assert.equal(sceneLabel(tree, {}, ids[2]), "Scene 3");
  assert.equal(sceneLabel(tree, { [ids[2]]: { ...blankScene(), name: " Lobby " } }, ids[2]), "Lobby");
  assert.equal(sceneLabel(tree, {}, "nope"), "");
});

test("deleting scenes prunes their data", () => {
  const { tree, ids } = line();
  const map: SceneMap = { [ids[0]]: blankScene(), [ids[1]]: rendered("a.png"), [ids[2]]: rendered("b.png") };
  assert.deepEqual(Object.keys(pruneScenes(deleteSubtree(tree, ids[1]), map)), [ids[0]]);
  assert.equal(pruneScenes(tree, map), map, "same map when nothing is dropped");
});

test("the canvas tree shows each scene's frame as its keyframe and none otherwise", () => {
  const { tree, ids } = line();
  const shown = displayTree(tree, { [ids[1]]: rendered("a.png") }, (file) => `/img/${file.filename}`);
  assert.equal(shown[ids[1]].keyframe?.image, "/img/a.png");
  assert.deepEqual(shown[ids[1]].keyframe?.file, f("a.png"));
  assert.equal(shown[ids[0]].keyframe, undefined);
  // A stale keyframe baked into the stored tree is overwritten.
  const baked = { ...tree, [ids[0]]: { ...tree[ids[0]], keyframe: { prompt: "x", image: "old", generatedAt: 1 } } };
  assert.equal(displayTree(baked, {}, () => "")[ids[0]].keyframe, undefined);
});

test("switching mode keeps the drawing but drops the render and, away from white-box, the references", () => {
  const w: SceneData = { ...whitebox("w.png"), references: [up("r.png")], render: { file: f("o.png", "output"), prompt: "p", generatedAt: 1 } };
  const r = setMode(w, "rendered");
  assert.equal(r.drawing?.label, "w.png");
  assert.equal(r.render, undefined);
  assert.deepEqual(r.references, []);
  assert.equal(setMode(w, "whitebox"), w);
});

test("uploadedFile splits a subfolder out of the upload name", () => {
  assert.deepEqual(uploadedFile("a.png"), f("a.png"));
  assert.deepEqual(uploadedFile("sub/dir/a.png"), { filename: "a.png", subfolder: "sub/dir", type: "input" });
});

test("prompts carry the scene text, style and how many references there are", () => {
  const p = renderPrompt({ style: "warm minimal", prompt: "a reading nook", referenceCount: 2 });
  assert.match(p, /Image 1 is a white-box/);
  assert.match(p, /Images 2 to 3/);
  assert.match(p, /warm minimal/);
  assert.match(p, /a reading nook/);
  assert.doesNotMatch(renderPrompt({ style: "", prompt: "x", referenceCount: 0 }), /references for materials/);
  assert.doesNotMatch(renderPrompt({ style: " ", prompt: "x", referenceCount: 0 }), /design intent/);

  assert.match(inbetweenPrompt({ style: "", prompt: "" }), /halfway viewpoint/);
  assert.match(inbetweenPrompt({ style: "", prompt: "the stair landing" }), /stair landing/);
});

test("the video request leads with the user's animation prompt, for one frame or two", () => {
  const two = walkthroughVideoRequest({ motion: "slow dolly toward the window, curtain stirs", style: "warm", mode: "flf2v", seconds: 8 });
  assert.match(two, /Two frames[\s\S]*first then last/);
  assert.match(two, /slow dolly toward the window, curtain stirs/);
  assert.match(two, /about 8 seconds/);
  assert.match(two, /warm/);
  const one = walkthroughVideoRequest({ motion: "  orbit the table  ", style: "", mode: "single" });
  assert.match(one, /One frame of an interior/);
  assert.match(one, /orbit the table/);
  assert.doesNotMatch(one, /Two frames|design intent|seconds long/);
  assert.match(walkthroughVideoRequest({ motion: "", style: "", mode: "single" }), /No direction was given/);

  assert.match(fallbackWalkthroughPrompt({ motion: "orbit the table", mode: "single" }), /^orbit the table[\s\S]*starting on the given view/);
  assert.match(fallbackWalkthroughPrompt({ motion: "", mode: "flf2v" }), /first view to the second/);
});

test("the interior video-prompt workflow handles one frame as well as two", () => {
  const sys = vprompt["1"].inputs.system_prompt as string;
  assert.match(sys, /single frame/);
  assert.match(sys, /direction comes first/);
  const single = buildVideoPromptWorkflow(vprompt, { firstImage: null, lastImage: "a.png", prompt: "p", seed: 1, seconds: 8 });
  assert.equal(single[NODE_VPROMPT.first], undefined);
  assert.match(single[NODE_VPROMPT.gemini].inputs.system_prompt as string, /about 8 seconds/);
});

test("a single-frame clip is made from the scene's own frame and goes stale with it", () => {
  const { tree, ids } = line();
  const [a, b] = ids;
  const map: SceneMap = { [a]: rendered("a.png"), [b]: rendered("b.png") };
  assert.equal(singleBlocker(map, a), null);
  assert.match(singleBlocker({ [a]: blankScene("rendered") }, a)!, /finished frame/);
  const from = singleKey(map, a)!;
  const clipped: SceneMap = { ...map, [a]: { ...map[a], video: f("one.mp4", "output"), videoMeta: { prompt: "p", from, mode: "single" } } };
  assert.equal(videoStale(tree, clipped, a), false);
  assert.equal(videoStale(tree, { ...clipped, [a]: { ...clipped[a], drawing: up("new.png") } }, a), true);
  // Changing another scene's frame doesn't touch it, unlike a first/last clip.
  assert.equal(videoStale(tree, { ...clipped, [b]: rendered("other.png") }, a), false);
});

test("the timeline is in seconds and stops at five minutes", () => {
  assert.equal(MAX_FILM_SECONDS, 300);
  assert.equal(formatClock(0), "0:00");
  assert.equal(formatClock(75), "1:15");
  assert.equal(formatClock(300), "5:00");
  assert.equal(roundYear(999, 1, SECONDS_AXIS), 300, "snapping never passes 5:00");
  assert.equal(roundYear(-5, 1, SECONDS_AXIS), 0);
  assert.equal(roundYear(7.4, 40, SECONDS_AXIS), 7, "whole seconds at close zoom");
  assert.equal(snapStep(1, SECONDS_AXIS), 15, "the finest gridline at least 12 px apart");
  assert.equal(snapStep(undefined, SECONDS_AXIS), 1);

  const first = addChild(newWalkthrough(), "start", 80, SECONDS_AXIS);
  assert.equal(first.tree[first.id].year, SECONDS_AXIS.gap, "a new scene is a few seconds after its parent");
  assert.equal(clampYear(first.tree, first.id, 9999, 80, SECONDS_AXIS), 300);
  const atEnd = { ...first.tree, [first.id]: { ...first.tree[first.id], year: 300 } };
  const end = addChild(atEnd, first.id, 80, SECONDS_AXIS);
  assert.equal(end.tree[end.id].year, 300, "a scene added at the end has no room: callers see it did not move on");

  const ticks = axisTicks(10, 0, 60, SECONDS_AXIS);
  assert.deepEqual(ticks.major.slice(0, 3), [0, 10, 20]);
  assert.equal(insertOnEdge(first.tree, first.id, 80, SECONDS_AXIS)!.tree[first.id].parentId !== "start", true);
});

test("a clip is as long as the gap between its scenes, kept within what the model can make", () => {
  const first = addChild(newWalkthrough(), "start", 80, SECONDS_AXIS);
  const tree = { ...first.tree, [first.id]: { ...first.tree[first.id], year: 12 } };
  assert.equal(gapSeconds(tree, "start"), 0);
  assert.equal(gapSeconds(tree, first.id), 12);
  assert.equal(clipSeconds(12, false), 12);
  assert.equal(clipSeconds(0.2, false), CLIP_LIMITS.local.min);
  assert.equal(clipSeconds(90, false), CLIP_LIMITS.local.max);
  assert.equal(clipSeconds(2, true), CLIP_LIMITS.api.min);
  assert.equal(clipSeconds(90, true), CLIP_LIMITS.api.max);
  assert.equal(singleClipSeconds(tree, first.id, false), 12, "a later scene's single clip fills its gap");
  assert.equal(singleClipSeconds(tree, "start", false), CLIP_LIMITS.local.standard);
  assert.equal(singleClipSeconds(tree, "start", true), CLIP_LIMITS.api.standard);

  const map: SceneMap = {
    start: { ...blankScene(), video: f("0.mp4", "output"), videoMeta: { prompt: "p", from: "x", mode: "single" } },
    [first.id]: { ...blankScene(), video: f("1.mp4", "output") },
  };
  assert.equal(routeSeconds(tree, map, route(tree, null), false), 3 + 12);
  assert.equal(routeSeconds(tree, {}, route(tree, null), false), 0, "no clips, no running time");

  // A clip made for a 12 s gap is out of date once the scenes move apart or together.
  const rendered2: SceneMap = { start: rendered("a.png"), [first.id]: rendered("b.png") };
  const from = transitionKey(tree, rendered2, first.id)!;
  const clipped: SceneMap = { ...rendered2, [first.id]: { ...rendered2[first.id], video: f("c.mp4", "output"), videoMeta: { prompt: "p", from, mode: "flf2v", gap: 12 } } };
  assert.equal(videoStale(tree, clipped, first.id), false);
  assert.equal(videoStale({ ...tree, [first.id]: { ...tree[first.id], year: 20 } }, clipped, first.id), true);
});

test("a walkthrough file round-trips, and a bad one says why", () => {
  const { tree, ids } = line();
  const [a, b, c] = ids;
  const timed = { ...tree, [b]: { ...tree[b], year: 5, text: "dolly in" }, [c]: { ...tree[c], year: 20 } };
  const scenes: SceneMap = {
    [a]: { ...whitebox("w.png"), imagePrompt: "oak floors", references: [up("r.png")], render: { file: f("o.png", "output"), prompt: "p", generatedAt: 3 } },
    [b]: { ...rendered("b.png"), video: f("v.mp4", "output"), videoMeta: { prompt: "pp", from: "k", mode: "single", gap: 5 } },
  };
  const text = exportWalkthroughFile({ style: "calm", tree: { ...timed, [b]: { ...timed[b], keyframe: { prompt: "x", image: "/view?x", generatedAt: 1 } } }, scenes, film: f("film.mp4", "output") });
  assert.doesNotMatch(text, /\/view\?x/, "session URLs are not exported");
  const back = parseWalkthroughFile(text);
  assert.equal(back.style, "calm");
  assert.deepEqual(Object.keys(back.tree).sort(), [a, b, c].sort());
  assert.equal(back.tree[b].text, "dolly in");
  assert.equal(back.tree[b].year, 5);
  assert.equal(back.tree[b].keyframe, undefined);
  assert.deepEqual(back.scenes, scenes);
  assert.deepEqual(back.film, f("film.mp4", "output"));

  const bad = (mutate: (o: Record<string, unknown>) => void) => {
    const o = JSON.parse(text);
    mutate(o);
    return JSON.stringify(o);
  };
  assert.throws(() => parseWalkthroughFile("nope"), /valid JSON/);
  assert.throws(() => parseWalkthroughFile(JSON.stringify({ app: "other" })), /isn't a walkthrough file/);
  assert.throws(() => parseWalkthroughFile(bad((o) => (o.version = 9))), /version/);
  assert.throws(() => parseWalkthroughFile(bad((o) => (o.nodes = []))), /no scenes/);
  assert.throws(() => parseWalkthroughFile(bad((o) => ((o.nodes as { year: number }[])[1].year = 301))), /5-minute limit/);
  assert.throws(() => parseWalkthroughFile(bad((o) => ((o.nodes as { parentId: string }[])[1].parentId = "ghost"))), /missing parent/);
  assert.throws(() => parseWalkthroughFile(bad((o) => ((o.nodes as { parentId: string | null }[])[0].parentId = c))), /loop|exactly one/);
  assert.throws(() => parseWalkthroughFile(bad((o) => ((o.scenes as Record<string, { mode: string }>)[a].mode = "weird"))), /invalid type/);
  assert.throws(() => parseWalkthroughFile(bad((o) => (o.nodes = Array.from({ length: MAX_SCENES + 1 }, (_, i) => ({ id: `n${i}`, parentId: null, text: "", year: 0, y: 0 }))))), /most allowed/);
  // Data for a scene that isn't in the tree is dropped; older files without prompts or scene data still load.
  const dropped = parseWalkthroughFile(bad((o) => ((o.scenes as Record<string, unknown>).ghost = { mode: "rendered" })));
  assert.equal(dropped.scenes.ghost, undefined);
  const lean = parseWalkthroughFile(bad((o) => (delete o.scenes, delete o.style, delete o.film)));
  assert.deepEqual(lean.scenes, {});
  assert.equal(lean.style, "");
  assert.equal(lean.film, null);
});

test("image workflow: image 1 is the one being edited, the rest batch in as references", () => {
  const wf = buildWalkthroughImageWorkflow(nano, { imageNames: ["wb.png", "ref a.png", "ref b.png"], prompt: "render it", seed: 2 ** 40 + 5 });
  assert.equal(wf["11"].inputs.image, "wb.png");
  assert.deepEqual(wf["36"].inputs, {
    "images.image0": ["11", 0],
    "images.image1": ["ref1", 0],
    "images.image2": ["ref2", 0],
  });
  assert.equal(wf.ref2.inputs.image, "ref b.png");
  assert.equal(wf["35"].inputs.prompt, "render it");
  assert.ok((wf["35"].inputs.seed as number) < 2 ** 31);
  for (const node of Object.values<any>(wf)) {
    for (const v of Object.values<any>(node.inputs)) if (Array.isArray(v)) assert.ok(wf[v[0]], `dangling link to ${v[0]}`);
  }
  assert.equal(nano["36"].inputs["images.image1"], undefined, "template is not mutated");
  assert.throws(() => buildWalkthroughImageWorkflow(nano, { imageNames: [], prompt: "", seed: 1 }));
  assert.throws(() => buildWalkthroughImageWorkflow(nano, { imageNames: Array(MAX_IMAGE_INPUTS + 1).fill("x.png"), prompt: "", seed: 1 }));
});

test("the interior video-prompt workflow drops into the street one's injector", () => {
  assert.equal(vprompt[NODE_VPROMPT.gemini].class_type, "GeminiNode");
  assert.match(vprompt[NODE_VPROMPT.gemini].inputs.system_prompt, /interior/);
  const wf = buildVideoPromptWorkflow(vprompt, { firstImage: "a.png [input]", lastImage: "b.png [input]", prompt: "go", seed: 1 });
  assert.equal(wf[NODE_VPROMPT.first].inputs.image, "a.png [input]");
  assert.equal(wf[NODE_VPROMPT.gemini].inputs.prompt, "go");
});

test("the merge graph takes its own filename prefix", () => {
  const wf = buildMergeWorkflow(["a.mp4", "b.mp4"], "walkthrough/film");
  assert.equal(wf["900"].inputs.filename_prefix, "walkthrough/film");
});
