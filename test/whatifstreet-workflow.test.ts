import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  NODE_IMAGE,
  NODE_VIDEO,
  buildGeminiPrompt,
  buildImageWorkflow,
  buildVideoWorkflow,
} from "../lib/whatifstreet-workflow.ts";

const imageTemplate = JSON.parse(readFileSync(new URL("../workflows/whatifstreet.image.api.json", import.meta.url), "utf8"));
const videoTemplate = JSON.parse(readFileSync(new URL("../workflows/whatifstreet.video.api.json", import.meta.url), "utf8"));

test("every node link in the image-stage template points at an existing node", () => {
  for (const [id, node] of Object.entries<any>(imageTemplate)) {
    for (const v of Object.values<any>(node.inputs)) {
      if (Array.isArray(v)) assert.ok(imageTemplate[v[0]], `node ${id} links to missing node ${v[0]}`);
    }
  }
});

test("the FLUX prompt node reads from the Gemini node's output, not a literal string", () => {
  assert.deepEqual(imageTemplate["407:6"].inputs.text, [NODE_IMAGE.gemini, 0]);
});

test("the Gemini node sees the same photo FLUX will edit", () => {
  assert.deepEqual(imageTemplate[NODE_IMAGE.gemini].inputs.images, [NODE_IMAGE.inputImage, 0]);
});

test("buildGeminiPrompt weaves in time, butterfly action, and climate, and omits absent ones", () => {
  const full = buildGeminiPrompt({ timeHint: "150 years in the future", butterflyPrompt: "solar power won", climatePrompt: "rain" });
  assert.match(full, /150 years in the future/);
  assert.match(full, /solar power won/);
  assert.match(full, /rain/);

  const bare = buildGeminiPrompt({ timeHint: "today, the present day, unchanged in time", butterflyPrompt: null, climatePrompt: null });
  assert.doesNotMatch(bare, /occurred/);
  assert.doesNotMatch(bare, /Weather/);
});

test("buildImageWorkflow injects values without mutating the template", () => {
  const wf = buildImageWorkflow(imageTemplate, { imageName: "sv.png", geminiPrompt: "reimagine it", seed: 42 });
  assert.equal(wf[NODE_IMAGE.inputImage].inputs.image, "sv.png");
  assert.equal(wf[NODE_IMAGE.gemini].inputs.prompt, "reimagine it");
  assert.equal(wf[NODE_IMAGE.gemini].inputs.seed, 42);
  assert.equal(wf[NODE_IMAGE.fluxSampler].inputs.seed, 42);
  assert.notEqual(imageTemplate[NODE_IMAGE.gemini].inputs.prompt, "reimagine it");

  for (const node of Object.values<any>(wf)) {
    for (const v of Object.values<any>(node.inputs)) if (Array.isArray(v)) assert.ok(wf[v[0]], `dangling link to ${v[0]}`);
  }
});

test("every node link in the video-stage template points at an existing node", () => {
  for (const [id, node] of Object.entries<any>(videoTemplate)) {
    for (const v of Object.values<any>(node.inputs)) {
      if (Array.isArray(v)) assert.ok(videoTemplate[v[0]], `node ${id} links to missing node ${v[0]}`);
    }
  }
});

test("the keyframe loader feeds both LTX preprocessing branches, not a leftover FLUX node", () => {
  assert.deepEqual(videoTemplate["406"].inputs.images, [NODE_VIDEO.inputImage, 0]);
  assert.deepEqual(videoTemplate["398_351"].inputs.input, [NODE_VIDEO.inputImage, 0]);
});

test("buildVideoWorkflow injects values without mutating the template", () => {
  const wf = buildVideoWorkflow(videoTemplate, { imageName: "edited.png", motionPrompt: "gentle breeze", seed: 99 });
  assert.equal(wf[NODE_VIDEO.inputImage].inputs.image, "edited.png");
  assert.equal(wf[NODE_VIDEO.ltxPrompt].inputs.value, "gentle breeze");
  assert.equal(wf[NODE_VIDEO.ltxSamplerBase].inputs.noise_seed, 99);
  assert.equal(wf[NODE_VIDEO.ltxSamplerRefine].inputs.noise_seed, 99);
  assert.notEqual(videoTemplate[NODE_VIDEO.inputImage].inputs.image, "edited.png");

  for (const node of Object.values<any>(wf)) {
    for (const v of Object.values<any>(node.inputs)) if (Array.isArray(v)) assert.ok(wf[v[0]], `dangling link to ${v[0]}`);
  }
});
