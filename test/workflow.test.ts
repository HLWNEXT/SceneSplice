import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { MAP_PROMPT_PREFIX, NODE, buildWorkflow } from "../lib/workflow.ts";

const template = JSON.parse(readFileSync(new URL("../workflows/decay.api.json", import.meta.url), "utf8"));

test("every node link points at an existing node", () => {
  for (const [id, node] of Object.entries<any>(template)) {
    for (const v of Object.values<any>(node.inputs)) {
      if (Array.isArray(v)) assert.ok(template[v[0]], `node ${id} links to missing node ${v[0]}`);
    }
  }
});

test("buildWorkflow injects values without mutating the template", () => {
  const wf = buildWorkflow(template, { imageName: "a.png", decayPrompt: "ruin", atmospherePrompt: "rain", seed: 7 });
  assert.equal(wf[NODE.inputImage].inputs.image, "a.png");
  assert.equal(wf[NODE.fluxPrompt].inputs.text, "ruin");
  assert.equal(wf[NODE.ltxPrompt].inputs.text, "rain");
  assert.equal(wf[NODE.fluxSampler].inputs.seed, 7);
  assert.equal(wf[NODE.ltxSampler].inputs.noise_seed, 7);
  assert.notEqual(template[NODE.fluxPrompt].inputs.text, "ruin");
});

test("upload mode removes the depth ControlNet branch", () => {
  const wf = buildWorkflow(template, { imageName: "a.png", decayPrompt: "ruin", atmospherePrompt: "rain", seed: 1 });
  for (const id of ["40", "41", "42", "43"]) assert.equal(wf[id], undefined);
  assert.deepEqual(wf[NODE.fluxSampler].inputs.positive, ["9", 0]);
  for (const node of Object.values<any>(wf)) {
    for (const v of Object.values<any>(node.inputs)) if (Array.isArray(v)) assert.ok(wf[v[0]], `dangling link to ${v[0]}`);
  }
});

test("map mode wires the depth guide into the sampler and prefixes the prompt", () => {
  const wf = buildWorkflow(template, {
    mode: "map", imageName: "wb.png", depthName: "depth.png", decayPrompt: "ruin", atmospherePrompt: "rain", seed: 1,
  });
  assert.equal(wf[NODE.depthImage].inputs.image, "depth.png");
  assert.deepEqual(wf[NODE.fluxSampler].inputs.positive, ["43", 0]);
  assert.deepEqual(wf[NODE.fluxSampler].inputs.negative, ["43", 1]);
  assert.equal(wf[NODE.fluxPrompt].inputs.text, MAP_PROMPT_PREFIX + "ruin");
});

test("map mode requires a depth image", () => {
  assert.throws(() => buildWorkflow(template, { mode: "map", imageName: "a.png", decayPrompt: "", atmospherePrompt: "", seed: 1 }));
});
