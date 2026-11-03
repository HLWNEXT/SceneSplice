import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { addChild, previousKeyframeNode, type StoryTree } from "../lib/storyline.ts";
import {
  NODE_VPROMPT,
  buildVideoPromptWorkflow,
  cleanVideoPrompt,
  fallbackVideoPrompt,
  videoPromptRequest,
  type VideoPromptRequest,
} from "../lib/video-prompt.ts";
import { NODE_FLF2V, NODE_VIDEO, VIDEO_SECONDS, buildFlf2vWorkflow, buildVideoWorkflow } from "../lib/whatifstreet-workflow.ts";

const read = (p: string) => JSON.parse(readFileSync(new URL(p, import.meta.url), "utf8"));
const flf2v = read("../workflows/ltx-2-5-flf2v.json");
const vprompt = read("../workflows/videoprompt.text.api.json");

const single = read("../workflows/whatifstreet.video.api.json");

const links = (wf: Record<string, any>) => {
  for (const [id, node] of Object.entries<any>(wf)) {
    for (const v of Object.values<any>(node.inputs)) if (Array.isArray(v)) assert.ok(wf[v[0]], `node ${id} links to missing node ${v[0]}`);
  }
};

test("every flf2v node id the UI writes to exists with the expected type", () => {
  assert.equal(flf2v[NODE_FLF2V.firstFrame].class_type, "LoadImage");
  assert.equal(flf2v[NODE_FLF2V.lastFrame].class_type, "LoadImage");
  assert.equal(flf2v[NODE_FLF2V.prompt].class_type, "PrimitiveStringMultiline");
  assert.equal(flf2v[NODE_FLF2V.promptEnhance].class_type, "PrimitiveBoolean");
  assert.equal(flf2v[NODE_FLF2V.noise].class_type, "RandomNoise");
  assert.equal(flf2v[NODE_FLF2V.duration].class_type, "PrimitiveInt");
  assert.equal(flf2v[NODE_FLF2V.outputVideo].class_type, "SaveVideo");
});

test("buildFlf2vWorkflow injects both frames, the prompt and the seed, and turns the built-in enhancer off", () => {
  const wf = buildFlf2vWorkflow(flf2v, { firstImage: "a.png [output]", lastImage: "b.png [output]", prompt: "a tram glides past", seed: 7 });
  assert.equal(wf[NODE_FLF2V.firstFrame].inputs.image, "a.png [output]");
  assert.equal(wf[NODE_FLF2V.lastFrame].inputs.image, "b.png [output]");
  assert.equal(wf[NODE_FLF2V.prompt].inputs.value, "a tram glides past");
  assert.equal(wf[NODE_FLF2V.noise].inputs.noise_seed, 7);
  assert.equal(wf[NODE_FLF2V.promptEnhance].inputs.value, false);
  assert.equal(wf[NODE_FLF2V.duration].inputs.value, VIDEO_SECONDS, "defaults to the shared short clip length");
  assert.equal(buildFlf2vWorkflow(flf2v, { firstImage: "a", lastImage: "b", prompt: "p", seed: 1, duration: 8 })[NODE_FLF2V.duration].inputs.value, 8);
  assert.equal(flf2v[NODE_FLF2V.promptEnhance].inputs.value, true, "template must not be mutated");
  links(wf);
});

test("the video-prompt template is well linked and Gemini sees first-then-last through ImageBatch", () => {
  links(vprompt);
  assert.deepEqual(vprompt[NODE_VPROMPT.gemini].inputs.images, [NODE_VPROMPT.batch, 0]);
  assert.deepEqual(vprompt[NODE_VPROMPT.batch].inputs, { image1: [NODE_VPROMPT.first, 0], image2: [NODE_VPROMPT.last, 0] });
  assert.deepEqual(vprompt[NODE_VPROMPT.output].inputs.source, [NODE_VPROMPT.gemini, 0]);
});

test("with two keyframes the video-prompt workflow batches them in order", () => {
  const wf = buildVideoPromptWorkflow(vprompt, { lastImage: "last.png", firstImage: "first.png", prompt: "p", seed: 3 });
  assert.equal(wf[NODE_VPROMPT.last].inputs.image, "last.png");
  assert.equal(wf[NODE_VPROMPT.first].inputs.image, "first.png");
  assert.ok(wf[NODE_VPROMPT.batch]);
  links(wf);
});

test("with one keyframe the batch and first-frame nodes are removed and Gemini reads the keyframe directly", () => {
  const wf = buildVideoPromptWorkflow(vprompt, { lastImage: "last.png", firstImage: null, prompt: "p", seed: 3 });
  assert.equal(wf[NODE_VPROMPT.first], undefined);
  assert.equal(wf[NODE_VPROMPT.batch], undefined);
  assert.deepEqual(wf[NODE_VPROMPT.gemini].inputs.images, [NODE_VPROMPT.last, 0]);
  links(wf);
  assert.ok(vprompt[NODE_VPROMPT.batch], "template must not be mutated");
});

const base: VideoPromptRequest = { mode: "flf2v", beat: "Rooftop gardens spread.", previousBeat: "Solar panels appear.", fromOffset: 10, toOffset: 50, climatePrompt: null };

test("videoPromptRequest describes both frames and their times in flf2v mode", () => {
  const r = videoPromptRequest(base);
  assert.match(r, /First frame, 10 years in the future: Solar panels appear\./);
  assert.match(r, /Last frame, 50 years in the future: Rooftop gardens spread\./);
  assert.doesNotMatch(r, /weather/i);
});

test("videoPromptRequest describes a single frame, and includes weather when given", () => {
  const r = videoPromptRequest({ ...base, mode: "single", previousBeat: null, fromOffset: null, climatePrompt: "steady rain" });
  assert.match(r, /One frame/);
  assert.doesNotMatch(r, /First frame/);
  assert.match(r, /steady rain/);
});

test("fallbackVideoPrompt keeps the beat and always adds some motion", () => {
  assert.match(fallbackVideoPrompt(base), /Rooftop gardens spread\./);
  assert.match(fallbackVideoPrompt(base), /dramatic motion/);
  assert.match(fallbackVideoPrompt({ ...base, climatePrompt: "snowfall" }), /snowfall/);
});

test("cleanVideoPrompt strips fences, quotes and labels, and rejects empty replies", () => {
  assert.equal(cleanVideoPrompt('```\n"A tram glides past the shuttered cafe as pigeons scatter."\n```'), "A tram glides past the shuttered cafe as pigeons scatter.");
  assert.equal(cleanVideoPrompt("Prompt: A tram glides past the shuttered cafe."), "A tram glides past the shuttered cafe.");
  assert.throws(() => cleanVideoPrompt("  ok "), /usable/);
});

test("previousKeyframeNode finds the nearest ancestor that has a rendered keyframe", () => {
  const file = { filename: "k.png", subfolder: "", type: "output" };
  const kf = (image: string) => ({ prompt: "", image, generatedAt: 0, file });
  let tree: StoryTree = { r: { id: "r", parentId: null, text: "root", year: 0, y: 0, keyframe: kf("r") } };
  const a = addChild(tree, "r"); tree = a.tree;
  const b = addChild(tree, a.id); tree = b.tree;
  assert.equal(previousKeyframeNode(tree, b.id)?.id, "r", "skips the unrendered middle beat");
  assert.equal(previousKeyframeNode(tree, "r"), null, "the root has no previous keyframe");
  tree = { ...tree, [a.id]: { ...tree[a.id], keyframe: { prompt: "", image: "m", generatedAt: 0 } } };
  assert.equal(previousKeyframeNode(tree, b.id)?.id, "r", "a mock keyframe with no ComfyUI file doesn't count");
});

test("the default clip length is 3 seconds on both video paths, and either can be overridden", () => {
  assert.equal(VIDEO_SECONDS, 3);
  assert.equal(single[NODE_VIDEO.duration].class_type, "PrimitiveInt");
  assert.equal(buildVideoWorkflow(single, { imageName: "a", motionPrompt: "p", seed: 1 })[NODE_VIDEO.duration].inputs.value, 3);
  assert.equal(buildVideoWorkflow(single, { imageName: "a", motionPrompt: "p", seed: 1, duration: 6 })[NODE_VIDEO.duration].inputs.value, 6);
  assert.equal(single[NODE_VIDEO.duration].inputs.value, 7, "template must not be mutated");
});

test("API-model workflows: Nano Banana gets the photo and prompt, Seedance runs 5 s first -> last or from one frame", async () => {
  const { buildApiImageWorkflow, buildSeedanceWorkflow, API_VIDEO_SECONDS } = await import("../lib/whatifstreet-workflow.ts");
  const image = JSON.parse(readFileSync("workflows/api_nano_banana_pro.json", "utf8"));
  const video = JSON.parse(readFileSync("workflows/api_seedance2_5_flf2v.json", "utf8"));

  const img = buildApiImageWorkflow(image, { imageName: "street.png", geminiPrompt: "edit it", seed: 2 ** 40 + 5 });
  assert.equal(img["11"].inputs.image, "street.png");
  assert.equal(img["35"].inputs.prompt, "edit it");
  assert.ok((img["35"].inputs.seed as number) < 2 ** 31);

  const two = buildSeedanceWorkflow(video, { firstImage: "a.png", lastImage: "b.png", prompt: "go", seed: 7 });
  assert.equal(API_VIDEO_SECONDS, 5);
  assert.equal(two["38"].inputs["model.duration"], 5);
  assert.equal(two["38"].inputs["model.prompt"], "go");
  assert.equal(two["41"].inputs.image, "a.png");
  assert.equal(two["40"].inputs.image, "b.png");

  const one = buildSeedanceWorkflow(video, { firstImage: null, lastImage: "b.png", prompt: "go", seed: 7 });
  assert.equal(one["41"].inputs.image, "b.png");
  assert.equal(one["40"], undefined);
  assert.equal("last_frame" in one["38"].inputs, false);
});
