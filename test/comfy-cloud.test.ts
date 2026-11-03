import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { adaptWorkflowForCloud, jobToHistory } from "../lib/comfy-cloud.ts";

const videoTemplate = JSON.parse(readFileSync(new URL("../workflows/whatifstreet.video.api.json", import.meta.url), "utf8"));

test("in-flight cloud jobs read as 'no history yet' so the poller keeps waiting", () => {
  assert.deepEqual(jobToHistory("p1", { status: "pending" }), {});
  assert.deepEqual(jobToHistory("p1", { status: "in_progress" }), {});
});

test("a completed cloud job becomes a local-style history entry with its outputs", () => {
  const outputs = { "500": { images: [{ filename: "a.png", subfolder: "whatifstreet", type: "output" }] } };
  const h: any = jobToHistory("p1", { status: "completed", outputs });
  assert.equal(h.p1.status.completed, true);
  assert.equal(h.p1.status.status_str, "success");
  assert.deepEqual(h.p1.outputs, outputs);
});

test("a failed cloud job surfaces the failing node and message the way trackGraph reads them", () => {
  const h: any = jobToHistory("p1", { status: "failed", execution_error: { node_type: "KSampler", exception_message: "OOM" } });
  assert.equal(h.p1.status.status_str, "error");
  const [kind, detail] = h.p1.status.messages[0];
  assert.equal(kind, "execution_error");
  assert.deepEqual(detail, { node_type: "KSampler", exception_message: "OOM" });
});

test("cancelled or error-less failures still produce a readable error", () => {
  const h: any = jobToHistory("p1", { status: "cancelled" });
  assert.equal(h.p1.status.status_str, "error");
  assert.match(h.p1.status.messages[0][1].exception_message, /cancelled/);
});

test("adaptWorkflowForCloud replaces the easy-use scaler with a core node, keeping its links", () => {
  assert.equal(videoTemplate["406"].class_type, "easy imageScaleDownToSize");
  const wf = adaptWorkflowForCloud(videoTemplate);
  assert.equal(wf["406"].class_type, "ImageScaleToMaxDimension");
  assert.deepEqual(wf["406"].inputs, { image: ["395", 0], upscale_method: "lanczos", largest_size: 1280 });
  assert.equal(videoTemplate["406"].class_type, "easy imageScaleDownToSize", "template must not be mutated");
});

test("after adapting, no custom-node pack classes remain in the video graph", () => {
  const wf = adaptWorkflowForCloud(videoTemplate);
  assert.ok(!Object.values<any>(wf).some((n) => n.class_type.startsWith("easy ")));
});
