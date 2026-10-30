import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { NODE, buildWorkflow } from "../lib/workflow.ts";

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
