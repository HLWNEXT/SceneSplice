// Manual checkpoint for Task 4 (docs/plans/2026-11-01-whatifstreet.md). Run this against your own
// reachable ComfyUI server after test-whatifstreet-image.ts has produced scripts/.test-whatifstreet-output.png.
//
// Uploads that edited image, queues workflows/whatifstreet.video.api.json (LTX), and saves the
// resulting MP4 locally so you can eyeball it before Task 5 starts.
//
// Usage: node --experimental-strip-types scripts/test-whatifstreet-video.ts [path/to/image.png]

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { buildVideoWorkflow, VIDEO_NODE_PROGRESS, NODE_VIDEO } from "../lib/whatifstreet-workflow.ts";

const COMFY_URL = (process.env.COMFY_URL ?? "http://127.0.0.1:8188").replace(/\/$/, "");
const imagePath = process.argv[2] ?? "scripts/.test-whatifstreet-output.png";

async function main() {
  if (!existsSync(imagePath)) {
    throw new Error(`No image at ${imagePath}. Run test-whatifstreet-image.ts first, or pass a path.`);
  }

  console.log(`Checking ComfyUI at ${COMFY_URL}...`);
  const stats = await fetch(`${COMFY_URL}/system_stats`).catch(() => null);
  if (!stats?.ok) throw new Error(`Cannot reach ComfyUI at ${COMFY_URL}. Set COMFY_URL and make sure it's running.`);

  console.log(`Uploading ${imagePath} to ComfyUI...`);
  const imgBytes = readFileSync(imagePath);
  const form = new FormData();
  form.append("image", new Blob([imgBytes], { type: "image/png" }), `whatifstreet_video_test_${Date.now()}.png`);
  form.append("overwrite", "true");
  const uploaded = await (await fetch(`${COMFY_URL}/upload/image`, { method: "POST", body: form })).json();
  const imageName = uploaded.subfolder ? `${uploaded.subfolder}/${uploaded.name}` : uploaded.name;
  console.log(`Staged as ${imageName}`);

  const template = JSON.parse(readFileSync(new URL("../workflows/whatifstreet.video.api.json", import.meta.url), "utf8"));
  const motionPrompt = "subtle camera drift forward, pedestrians walking naturally, gentle ambient motion, leaves rustling";
  const workflow = buildVideoWorkflow(template, { imageName, motionPrompt, seed: Math.floor(Math.random() * 2 ** 32) });

  console.log("Queueing the Video-stage workflow (LTX)...");
  const clientId = crypto.randomUUID();
  const queued = await fetch(`${COMFY_URL}/prompt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: workflow, client_id: clientId }),
  }).then((r) => r.json());
  if (queued.error) {
    const nodeErrors = Object.entries<any>(queued.node_errors ?? {})
      .map(([id, e]) => `node ${id} (${e.class_type}): ${e.errors?.[0]?.message ?? "error"}`)
      .join("; ");
    throw new Error(`Workflow rejected: ${queued.error.message}${nodeErrors ? ` — ${nodeErrors}` : ""}`);
  }
  const promptId = queued.prompt_id;
  console.log(`Queued ${promptId}. Polling /history...`);

  let lastNode = "";
  for (;;) {
    await new Promise((r) => setTimeout(r, 1500));
    const history = await (await fetch(`${COMFY_URL}/history/${promptId}`)).json();
    const entry = history[promptId];
    if (!entry) continue;
    if (entry.status?.status_str === "error") {
      const err = entry.status.messages?.find((m: any[]) => m[0] === "execution_error")?.[1];
      throw new Error(`Execution failed at ${err?.node_type}: ${err?.exception_message}`);
    }
    const running = entry.status?.messages?.filter((m: any[]) => m[0] === "executing").at(-1)?.[1]?.node;
    if (running && running !== lastNode && VIDEO_NODE_PROGRESS[running]) {
      console.log(`  ${VIDEO_NODE_PROGRESS[running].label}`);
      lastNode = running;
    }
    if (!entry.status?.completed) continue;

    const out = [
      ...(entry.outputs?.[NODE_VIDEO.outputVideo]?.videos ?? []),
      ...(entry.outputs?.[NODE_VIDEO.outputVideo]?.gifs ?? []),
      ...(entry.outputs?.[NODE_VIDEO.outputVideo]?.images ?? []),
    ][0];
    if (!out) throw new Error("Run finished but produced no video output.");
    const q = new URLSearchParams({ filename: out.filename, subfolder: out.subfolder, type: out.type });
    const videoBytes = Buffer.from(await (await fetch(`${COMFY_URL}/view?${q}`)).arrayBuffer());
    writeFileSync("scripts/.test-whatifstreet-output.mp4", videoBytes);
    console.log("\nSUCCESS. Saved result to scripts/.test-whatifstreet-output.mp4 — open it and eyeball the motion.");
    return;
  }
}

main().catch((err) => {
  console.error("\nFAILED:", err.message);
  process.exit(1);
});
