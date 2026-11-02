// Node IDs in workflows/whatifstreet.image.api.json and whatifstreet.video.api.json that the UI
// writes to. Same pattern as lib/workflow.ts, split into two templates (see docs/plans/2026-11-01-
// whatifstreet-design.md) so the generated image is a real, independently reviewable artifact.

export const NODE_IMAGE = {
  inputImage: "395",
  gemini: "1",
  fluxSampler: "407:31",
  outputImage: "500",
} as const;

export const IMAGE_NODE_PROGRESS: Record<string, { label: string; from: number; to: number }> = {
  "1": { label: "Asking Gemini to imagine the scene...", from: 0, to: 20 },
  "407:37": { label: "Loading FLUX...", from: 20, to: 25 },
  "407:124": { label: "Encoding street view photo...", from: 25, to: 30 },
  "407:31": { label: "Running FLUX edit...", from: 30, to: 90 },
  "407:8": { label: "Decoding reimagined keyframe...", from: 90, to: 97 },
  "500": { label: "Saving image...", from: 97, to: 100 },
};

type Workflow = Record<string, { class_type: string; inputs: Record<string, unknown> }>;

export type TimeTravelPromptParams = {
  timeHint: string;
  butterflyPrompt: string | null;
  climatePrompt: string | null;
  /** A specific story beat to depict at this moment, on top of the general butterfly event. */
  eventHint?: string | null;
};

/** Builds the per-run user message handed to the Gemini node's "prompt" input. */
export function buildGeminiPrompt(p: TimeTravelPromptParams): string {
  const parts = [
    "You are looking at a real street photo. Edit THIS photo — do not design a different place.",
    `Show what this exact street, with its existing buildings and camera framing unchanged, would plausibly look like ${p.timeHint}.`,
    p.butterflyPrompt ? `Assume the following has occurred in the lead-up to this point: ${p.butterflyPrompt}.` : null,
    p.eventHint ? `What this specific moment shows: ${p.eventHint}` : null,
    p.climatePrompt ? `Weather and light: ${p.climatePrompt}.` : null,
    "Start by naming what stays the same (the buildings' footprint and shape, the road and sidewalk layout, the camera angle), then describe in rich, concrete visual detail only what changes on top of that: materials, signage, vehicles, vegetation, people, added or removed fixtures.",
  ];
  return parts.filter(Boolean).join(" ");
}

export type ImageWorkflowParams = {
  imageName: string;
  geminiPrompt: string;
  seed: number;
};

/** Returns a copy of the image-stage template with the UI's values injected. */
export function buildImageWorkflow(template: Workflow, p: ImageWorkflowParams): Workflow {
  const wf = structuredClone(template);
  const set = (id: string, key: string, value: unknown) => {
    if (!wf[id]) throw new Error(`Workflow is missing node ${id}`);
    wf[id].inputs[key] = value;
  };
  set(NODE_IMAGE.inputImage, "image", p.imageName);
  set(NODE_IMAGE.gemini, "prompt", p.geminiPrompt);
  set(NODE_IMAGE.gemini, "seed", p.seed);
  set(NODE_IMAGE.fluxSampler, "seed", p.seed);
  return wf;
}

/** Default clip length for every video. Generation time grows steeply with length, so keep it short. */
export const VIDEO_SECONDS = 3;

export const NODE_VIDEO = {
  inputImage: "395",
  duration: "398_362",
  ltxPrompt: "398_376",
  ltxSamplerBase: "398_339",
  ltxSamplerRefine: "398_338",
  outputVideo: "75",
} as const;

/** Status text and overall-progress range (0-100), same shape as lib/workflow.ts's NODE_PROGRESS. */
export const VIDEO_NODE_PROGRESS: Record<string, { label: string; from: number; to: number }> = {
  "398_384": { label: "Loading LTX-2.5...", from: 0, to: 6 },
  "398_344": { label: "Generating base motion...", from: 6, to: 45 },
  "398_348": { label: "Upscaling latent...", from: 45, to: 52 },
  "398_368": { label: "Refining motion...", from: 52, to: 85 },
  "398_374": { label: "Decoding video frames...", from: 85, to: 95 },
  "398_358": { label: "Decoding audio...", from: 95, to: 98 },
  "398_370": { label: "Encoding MP4...", from: 98, to: 100 },
};

export type VideoWorkflowParams = {
  imageName: string;
  motionPrompt: string;
  seed: number;
  /** Clip length in seconds; VIDEO_SECONDS when omitted. */
  duration?: number;
};

/** Returns a copy of the video-stage template with the UI's values injected. */
export function buildVideoWorkflow(template: Workflow, p: VideoWorkflowParams): Workflow {
  const wf = structuredClone(template);
  const set = (id: string, key: string, value: unknown) => {
    if (!wf[id]) throw new Error(`Workflow is missing node ${id}`);
    wf[id].inputs[key] = value;
  };
  set(NODE_VIDEO.inputImage, "image", p.imageName);
  set(NODE_VIDEO.ltxPrompt, "value", p.motionPrompt);
  set(NODE_VIDEO.duration, "value", p.duration ?? VIDEO_SECONDS);
  set(NODE_VIDEO.ltxSamplerBase, "noise_seed", p.seed);
  set(NODE_VIDEO.ltxSamplerRefine, "noise_seed", p.seed);
  return wf;
}

// workflows/ltx-2-5-flf2v.json: LTX 2.5 first-frame / last-frame video, used when a beat has an earlier
// keyframe to start from. Exported from ComfyUI as-is; the UI only touches these nodes.
export const NODE_FLF2V = {
  firstFrame: "31",
  lastFrame: "39",
  prompt: "251:252",
  promptEnhance: "251:250",
  noise: "251:196",
  duration: "251:198",
  outputVideo: "68",
} as const;

export const FLF2V_NODE_PROGRESS: Record<string, { label: string; from: number; to: number }> = {
  "251:230": { label: "Loading LTX-2.5...", from: 0, to: 10 },
  "251:211": { label: "Generating video between the two keyframes...", from: 10, to: 85 },
  "251:219": { label: "Decoding video frames...", from: 85, to: 95 },
  "251:220": { label: "Decoding audio...", from: 95, to: 98 },
  "68": { label: "Encoding MP4...", from: 98, to: 100 },
};

export type Flf2vWorkflowParams = {
  firstImage: string;
  lastImage: string;
  prompt: string;
  seed: number;
  /** Clip length in seconds; VIDEO_SECONDS when omitted. */
  duration?: number;
};

/**
 * Returns a copy of the flf2v template with the UI's values injected. The template's built-in LTX prompt
 * enhancer is switched off: the prompt arriving here has already been written by the video-prompt LLM
 * layer from both frames, and rewriting it a second time only blurs it.
 */
export function buildFlf2vWorkflow(template: Workflow, p: Flf2vWorkflowParams): Workflow {
  const wf = structuredClone(template);
  const set = (id: string, key: string, value: unknown) => {
    if (!wf[id]) throw new Error(`Workflow is missing node ${id}`);
    wf[id].inputs[key] = value;
  };
  set(NODE_FLF2V.firstFrame, "image", p.firstImage);
  set(NODE_FLF2V.lastFrame, "image", p.lastImage);
  set(NODE_FLF2V.prompt, "value", p.prompt);
  set(NODE_FLF2V.promptEnhance, "value", false);
  set(NODE_FLF2V.noise, "noise_seed", p.seed);
  set(NODE_FLF2V.duration, "value", p.duration ?? VIDEO_SECONDS);
  return wf;
}
