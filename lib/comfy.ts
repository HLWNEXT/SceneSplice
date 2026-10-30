// ComfyUI client. Requests go through the Next.js rewrite at /comfy (see next.config.ts),
// so the browser never needs CORS access to the ComfyUI server.

import template from "../workflows/decay.api.json";
import { NODE, NODE_PROGRESS, buildWorkflow, type WorkflowParams } from "./workflow";

const API = "/comfy";
/** Optional direct WebSocket URL for live step progress, e.g. ws://host:8188/ws. Falls back to polling. */
const WS_URL = process.env.NEXT_PUBLIC_COMFY_WS_URL;

export type ProgressEvent = { percent: number; message: string };
export type OutputFile = { filename: string; subfolder: string; type: string };

export class ComfyError extends Error {}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      reject(new DOMException("Cancelled", "AbortError"));
    });
  });

async function request(path: string, init?: RequestInit): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(`${API}${path}`, init);
  } catch {
    throw new ComfyError("Cannot reach the ComfyUI server.");
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new ComfyError(`ComfyUI ${path} failed (${res.status}): ${body.slice(0, 300)}`);
  }
  return res;
}

export async function checkServer(signal?: AbortSignal): Promise<boolean> {
  try {
    const res = await fetch(`${API}/system_stats`, { signal });
    return res.ok;
  } catch {
    return false;
  }
}

/** POST /upload/image (multipart). Returns the name to put in the LoadImage node. */
export async function uploadImage(file: File): Promise<{ name: string }> {
  const form = new FormData();
  const safe = file.name.replace(/[^\w.-]+/g, "_");
  form.append("image", file, `decayui_${Date.now()}_${safe}`);
  form.append("overwrite", "true");
  const data = await (await request("/upload/image", { method: "POST", body: form })).json();
  return { name: data.subfolder ? `${data.subfolder}/${data.name}` : data.name };
}

/** POST /prompt with the injected workflow. */
export async function queuePrompt(
  params: WorkflowParams,
  clientId: string,
): Promise<{ promptId: string }> {
  const workflow = buildWorkflow(template as Parameters<typeof buildWorkflow>[0], params);
  const res = await fetch(`${API}/prompt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: workflow, client_id: clientId }),
  }).catch(() => {
    throw new ComfyError("Cannot reach the ComfyUI server.");
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const nodeErrors = Object.entries<any>(data.node_errors ?? {})
      .map(([id, e]) => `node ${id} (${e.class_type}): ${e.errors?.[0]?.message ?? "error"}`)
      .join("; ");
    throw new ComfyError(`Workflow rejected: ${data.error?.message ?? res.status}${nodeErrors ? ` — ${nodeErrors}` : ""}`);
  }
  return { promptId: data.prompt_id };
}

/** Best-effort live progress over /ws. Resolves silently if the socket is unavailable. */
function watchSocket(
  promptId: string,
  clientId: string,
  onProgress: (e: ProgressEvent) => void,
  signal?: AbortSignal,
): () => void {
  if (!WS_URL || typeof WebSocket === "undefined") return () => {};
  let ws: WebSocket;
  try {
    ws = new WebSocket(`${WS_URL}?clientId=${clientId}`);
  } catch {
    return () => {};
  }
  let current = "";
  ws.onmessage = (ev) => {
    if (typeof ev.data !== "string") return;
    const msg = JSON.parse(ev.data);
    const d = msg.data ?? {};
    if (d.prompt_id && d.prompt_id !== promptId) return;
    if (msg.type === "executing" && d.node && NODE_PROGRESS[d.node]) {
      current = d.node;
      const s = NODE_PROGRESS[d.node];
      onProgress({ percent: s.from, message: s.label });
    } else if (msg.type === "progress" && NODE_PROGRESS[d.node ?? current]) {
      const s = NODE_PROGRESS[d.node ?? current];
      const pct = s.from + (s.to - s.from) * (d.value / d.max);
      onProgress({ percent: Math.round(pct), message: `${s.label} step ${d.value}/${d.max}` });
    }
  };
  const close = () => ws.close();
  signal?.addEventListener("abort", close);
  return close;
}

/** Polls GET /history/{id} until the run finishes; returns the output video file. */
export async function trackProgress(
  promptId: string,
  clientId: string,
  onProgress: (e: ProgressEvent) => void,
  signal?: AbortSignal,
): Promise<OutputFile> {
  const closeSocket = watchSocket(promptId, clientId, onProgress, signal);
  const started = Date.now();
  try {
    for (;;) {
      await sleep(1500, signal);
      const history = await (await request(`/history/${promptId}`, { signal })).json();
      const entry = history[promptId];
      if (!entry) {
        if (!WS_URL) onProgress({ percent: 0, message: `Running... ${Math.round((Date.now() - started) / 1000)}s` });
        continue;
      }
      const status = entry.status;
      if (status?.status_str === "error") {
        const err = status.messages?.find((m: any[]) => m[0] === "execution_error")?.[1];
        throw new ComfyError(`Execution failed${err ? ` at ${err.node_type}: ${err.exception_message}` : ""}`);
      }
      if (!status?.completed) continue;
      const out = entry.outputs?.[NODE.outputVideo];
      const file: OutputFile | undefined = [...(out?.images ?? []), ...(out?.videos ?? []), ...(out?.gifs ?? [])][0];
      if (!file) throw new ComfyError("Run finished but produced no video.");
      onProgress({ percent: 100, message: "Done." });
      return file;
    }
  } finally {
    closeSocket();
  }
}

/** URL of a generated file, served by GET /view. */
export function viewUrl(f: OutputFile): string {
  const q = new URLSearchParams({ filename: f.filename, subfolder: f.subfolder, type: f.type });
  return `${API}/view?${q}`;
}

/** Remove from queue and interrupt if running. */
export async function cancelPrompt(promptId: string): Promise<void> {
  await fetch(`${API}/queue`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ delete: [promptId] }),
  }).catch(() => {});
  await fetch(`${API}/interrupt`, { method: "POST" }).catch(() => {});
}
