// ComfyUI client. Every function is a placeholder that simulates the real call;
// the real endpoint each one will use is noted above it.
// TODO: swap for fetch/WebSocket calls against NEXT_PUBLIC_COMFY_URL (tunnel URL).

export const COMFY_URL = process.env.NEXT_PUBLIC_COMFY_URL ?? "http://127.0.0.1:8188";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type ProgressEvent = { percent: number; message: string };

export type SimulateInput = {
  imageName: string;
  years: number;
  /** Text for the FLUX positive prompt node. */
  decayPrompt: string;
  /** Text for the LTX motion prompt node. */
  atmospherePrompt: string;
};

/** POST {COMFY_URL}/upload/image (multipart, field "image") -> { name, subfolder, type } */
export async function uploadImage(file: File): Promise<{ name: string }> {
  await sleep(600);
  return { name: file.name };
}

/** POST {COMFY_URL}/prompt { prompt: workflow, client_id } -> { prompt_id } */
export async function queuePrompt(input: SimulateInput): Promise<{ promptId: string }> {
  void input;
  await sleep(300);
  return { promptId: crypto.randomUUID() };
}

const MOCK_STEPS: ProgressEvent[] = [
  { percent: 8, message: "Initializing ControlNet..." },
  { percent: 22, message: "Extracting depth + edge maps..." },
  { percent: 45, message: "Running FLUX 3 pass..." },
  { percent: 70, message: "Generating LTX motion..." },
  { percent: 92, message: "Encoding MP4..." },
  { percent: 100, message: "Done." },
];

/** Live: WebSocket {COMFY_URL}/ws?clientId=... ("progress", "executing") or poll GET /history/{promptId}. */
export async function trackProgress(
  promptId: string,
  onProgress: (e: ProgressEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  void promptId;
  for (const step of MOCK_STEPS) {
    await sleep(1100);
    if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
    onProgress(step);
  }
}

/** GET {COMFY_URL}/view?filename=...&subfolder=...&type=output -> video bytes. Returns a playable URL. */
export async function fetchResult(promptId: string): Promise<string> {
  void promptId;
  await sleep(200);
  return "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4";
}
