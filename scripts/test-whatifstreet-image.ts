// Manual checkpoint for Task 3 (docs/plans/2026-11-01-whatifstreet.md). Run this against your own
// reachable ComfyUI server — it's unreachable from the environment that wrote this script.
//
// Fetches a real Street View photo, queues workflows/whatifstreet.image.api.json (Gemini -> FLUX),
// and saves the resulting image locally so you can eyeball it before Task 4 starts.
//
// Usage: node --experimental-strip-types scripts/test-whatifstreet-image.ts [lat] [lon]

import { readFileSync, writeFileSync } from "node:fs";
import { buildImageUrl, buildMetadataUrl } from "../lib/streetview.ts";
import { buildGeminiPrompt, buildImageWorkflow, IMAGE_NODE_PROGRESS, NODE_IMAGE } from "../lib/whatifstreet-workflow.ts";

const COMFY_URL = (process.env.COMFY_URL ?? "http://127.0.0.1:8188").replace(/\/$/, "");
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;
const [lat, lon] = [Number(process.argv[2] ?? 40.748817), Number(process.argv[3] ?? -73.985428)];

async function main() {
  if (!GOOGLE_MAPS_API_KEY) throw new Error("Set GOOGLE_MAPS_API_KEY in the environment running this script.");

  console.log(`Checking Street View coverage at ${lat},${lon}...`);
  const meta = await fetch(buildMetadataUrl({ lat, lon }, GOOGLE_MAPS_API_KEY)).then((r) => r.json());
  if (meta.status !== "OK") throw new Error(`No Street View imagery there (status: ${meta.status}).`);

  console.log("Fetching the photo...");
  const photo = await fetch(buildImageUrl({ lat, lon }, GOOGLE_MAPS_API_KEY));
  const photoBytes = Buffer.from(await photo.arrayBuffer());
  writeFileSync("scripts/.test-streetview-input.jpg", photoBytes);
  console.log("Saved input photo to scripts/.test-streetview-input.jpg");

  console.log(`Checking ComfyUI at ${COMFY_URL}...`);
  const stats = await fetch(`${COMFY_URL}/system_stats`).catch(() => null);
  if (!stats?.ok) throw new Error(`Cannot reach ComfyUI at ${COMFY_URL}. Set COMFY_URL and make sure it's running.`);

  console.log("Uploading the photo to ComfyUI...");
  const form = new FormData();
  form.append("image", new Blob([photoBytes], { type: "image/jpeg" }), `whatifstreet_test_${Date.now()}.jpg`);
  form.append("overwrite", "true");
  const uploaded = await (await fetch(`${COMFY_URL}/upload/image`, { method: "POST", body: form })).json();
  const imageName = uploaded.subfolder ? `${uploaded.subfolder}/${uploaded.name}` : uploaded.name;
  console.log(`Staged as ${imageName}`);

  const template = JSON.parse(readFileSync(new URL("../workflows/whatifstreet.image.api.json", import.meta.url), "utf8"));
  const geminiPrompt = buildGeminiPrompt({
    timeHint: "150 years in the future",
    butterflyPrompt: "solar power became the dominant source of energy worldwide",
    climatePrompt: "a clear sky and bright natural daylight",
  });
  console.log(`Gemini will be asked: ${geminiPrompt}`);
  const workflow = buildImageWorkflow(template, { imageName, geminiPrompt, seed: Math.floor(Math.random() * 2 ** 32) });

  console.log("Queueing the Image-stage workflow (Gemini -> FLUX)...");
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
    if (running && running !== lastNode && IMAGE_NODE_PROGRESS[running]) {
      console.log(`  ${IMAGE_NODE_PROGRESS[running].label}`);
      lastNode = running;
    }
    if (!entry.status?.completed) continue;

    const out = entry.outputs?.[NODE_IMAGE.outputImage]?.images?.[0];
    if (!out) throw new Error("Run finished but produced no SaveImage output.");
    const q = new URLSearchParams({ filename: out.filename, subfolder: out.subfolder, type: out.type });
    const imgBytes = Buffer.from(await (await fetch(`${COMFY_URL}/view?${q}`)).arrayBuffer());
    writeFileSync("scripts/.test-whatifstreet-output.png", imgBytes);
    console.log("\nSUCCESS. Saved result to scripts/.test-whatifstreet-output.png — open it and eyeball the edit.");
    return;
  }
}

main().catch((err) => {
  console.error("\nFAILED:", err.message);
  process.exit(1);
});
